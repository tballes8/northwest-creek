from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from datetime import datetime, timedelta, timezone
import secrets

from app.db.models import User
from app.schemas import UserCreate, UserLogin, Token, UserResponse
from app.schemas.auth import ForgotPasswordRequest, ResetPasswordRequest, ChangePasswordRequest
from app.core.security import (
    get_password_hash,
    verify_password,
    create_access_token,
    decode_token
)
from app.db.session import get_db
from app.services.email_service import email_service

router = APIRouter()
security = HTTPBearer()


@router.post("/register", status_code=status.HTTP_201_CREATED)
async def register(
    user_data: UserCreate,
    db: AsyncSession = Depends(get_db),
    selected_tier: str = Query(default="free", description="Selected subscription tier")
):
    """Register a new user and send verification email"""
    # Check if email exists
    result = await db.execute(select(User).where(User.email == user_data.email))
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )
    
    # Generate verification token
    verification_token = secrets.token_urlsafe(32)
    token_expires = datetime.now(timezone.utc) + timedelta(hours=24)
    
    # Create user (not verified yet — starts as free, upgraded after Stripe payment)
    user = User(
        email=user_data.email,
        password_hash=get_password_hash(user_data.password),
        full_name=user_data.full_name,
        is_verified=False,
        is_active=True,
        verification_token=verification_token,
        verification_token_expires=token_expires
    )
    
    db.add(user)
    await db.commit()
    await db.refresh(user)
    
    # Send verification email (pass selected tier so it's embedded in the verification URL)
    email_sent = email_service.send_verification_email(
        to_email=user.email,
        verification_token=verification_token,
        user_name=user.full_name or user.email,
        selected_tier=selected_tier
    )
    
    if not email_sent:
        print(f"Warning: Verification email failed to send to {user.email}")
    
    return {
        "message": "Registration successful! Please check your email (and spam/junk folder) to verify your account.",
        "email": user.email
    }


@router.get("/verify-email")
async def verify_email(token: str, db: AsyncSession = Depends(get_db)):
    """Verify email with token"""
    # Find user with this token
    result = await db.execute(
        select(User).where(User.verification_token == token)
    )
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid verification token"
        )
    
    # Check if token expired
    if user.verification_token_expires < datetime.now(timezone.utc):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Verification token has expired. Please request a new one."
        )
    
    # Verify user
    user.is_verified = True
    user.verification_token = None
    user.verification_token_expires = None
    
    await db.commit()
    
    # Create access token so the frontend can auto-login the user
    access_token = create_access_token(data={"sub": str(user.id)})
    
    return {
        "message": "Email verified successfully! You can now log in.",
        "email": user.email,
        "access_token": access_token,
        "token_type": "bearer"
    }


@router.post("/resend-verification")
async def resend_verification(email: str, db: AsyncSession = Depends(get_db)):
    """Resend verification email"""
    # Find user
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    
    if not user:
        # Don't reveal if email exists
        return {"message": "If that email is registered, a verification email will be sent."}
    
    if user.is_verified:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already verified"
        )
    
    # Generate new token
    verification_token = secrets.token_urlsafe(32)
    token_expires = datetime.now(timezone.utc) + timedelta(hours=24)
    
    user.verification_token = verification_token
    user.verification_token_expires = token_expires
    
    await db.commit()
    
    # Send email
    email_service.send_verification_email(
        to_email=user.email,
        verification_token=verification_token,
        user_name=user.full_name or user.email
    )
    
    return {"message": "Verification email sent! Please check your inbox (and spam/junk folder)."}


@router.post("/login", response_model=Token)
async def login(credentials: UserLogin, db: AsyncSession = Depends(get_db)):
    """Login and get access token"""
    # Find user
    result = await db.execute(select(User).where(User.email == credentials.email))
    user = result.scalar_one_or_none()
    
    if not user or not verify_password(credentials.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password"
        )
    
    # Check if verified
    if not user.is_verified:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Please verify your email before logging in. Check your inbox (and spam/junk folder) for the verification link."
        )
    
    # Create token
    access_token = create_access_token(data={"sub": str(user.id)})
    
    return {"access_token": access_token, "token_type": "bearer"}


@router.get("/me", response_model=UserResponse)
async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncSession = Depends(get_db)
):
    """Get current authenticated user"""
    try:
        # Decode token
        token = credentials.credentials
        payload = decode_token(token)
        user_id = payload.get("sub")
        
        if not user_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token"
            )
        
        # Get user from database
        result = await db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        
        if not user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User not found"
            )
        
        if not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Inactive user"
            )
        
        return user
        
    except Exception as e:
        print(f"Error in /me endpoint: {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials"
        )


# ---------------------------------------------------------------------------
# Password Reset (unauthenticated — forgot password flow)
# ---------------------------------------------------------------------------

@router.post("/forgot-password")
async def forgot_password(
    request: ForgotPasswordRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Request a password reset link.
    Returns an error if the email is not registered.
    """
    result = await db.execute(select(User).where(User.email == request.email))
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No account found with that email address."
        )

    # Generate reset token — 1-hour expiry
    reset_token = secrets.token_urlsafe(32)
    user.password_reset_token = reset_token
    user.password_reset_token_expires = datetime.now(timezone.utc) + timedelta(hours=1)
    await db.commit()

    email_sent = email_service.send_password_reset_email(
        to_email=user.email,
        reset_token=reset_token,
        user_name=user.full_name or user.email
    )
    if not email_sent:
        print(f"Warning: Password reset email failed to send to {user.email}")

    return {
        "message": "A password reset link has been sent to your email. Please check your inbox and spam/junk folder."
    }


@router.post("/reset-password")
async def reset_password(
    request: ResetPasswordRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Reset password using the token from the emailed link.
    """
    result = await db.execute(
        select(User).where(User.password_reset_token == request.token)
    )
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired reset token."
        )

    if user.password_reset_token_expires < datetime.now(timezone.utc):
        # Clear expired token
        user.password_reset_token = None
        user.password_reset_token_expires = None
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Reset token has expired. Please request a new one."
        )

    # Update password and clear token
    user.password_hash = get_password_hash(request.new_password)
    user.password_reset_token = None
    user.password_reset_token_expires = None
    await db.commit()

    return {"message": "Password has been reset successfully. You can now sign in with your new password."}


# ---------------------------------------------------------------------------
# Change Password (authenticated — from Account Settings)
# ---------------------------------------------------------------------------

@router.post("/change-password")
async def change_password(
    request: ChangePasswordRequest,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncSession = Depends(get_db)
):
    """
    Change password for the currently authenticated user.
    Requires the current password for verification.
    """
    # Resolve current user from JWT
    try:
        payload = decode_token(credentials.credentials)
        user_id = payload.get("sub")
        if not user_id:
            raise ValueError("Missing sub claim")
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials"
        )

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found"
        )

    # Verify current password
    if not verify_password(request.current_password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect."
        )

    # Prevent setting the same password
    if verify_password(request.new_password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New password must be different from your current password."
        )

    user.password_hash = get_password_hash(request.new_password)
    await db.commit()

    return {"message": "Password changed successfully."}