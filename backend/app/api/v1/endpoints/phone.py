"""
Phone Verification API Endpoints

Handles phone number submission, OTP verification, and phone removal.
These endpoints are used by the SMS alert feature so users can opt-in
to text notifications on a per-alert basis.

Mount in main.py:
    from app.api.routes.phone import router as phone_router
    app.include_router(phone_router, prefix="/api/v1/phone", tags=["Phone"])
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import update

from app.db.models import User, PriceAlert
from app.schemas.auth import PhoneSubmitRequest, PhoneVerifyRequest, PhoneStatusResponse
from app.api.dependencies import get_current_user
from app.db.session import get_db
from app.services.sms_service import (
    format_phone_e164,
    generate_otp,
    verify_otp,
    send_otp_sms,
)
from app.core.tier_limits import can_use_sms_alerts

router = APIRouter()


@router.get("/status", response_model=PhoneStatusResponse)
async def get_phone_status(
    current_user: User = Depends(get_current_user),
):
    """
    Get current phone verification status.
    Returns whether a phone is on file and if it's verified.
    """
    has_phone = bool(current_user.phone_number)
    last_four = current_user.phone_number[-4:] if current_user.phone_number else None

    return PhoneStatusResponse(
        has_phone=has_phone,
        phone_verified=current_user.phone_verified,
        phone_last_four=last_four,
        message=(
            f"Verified — texts go to •••-{last_four}"
            if current_user.phone_verified and last_four
            else "No verified phone on file"
        ),
    )


@router.post("/submit", response_model=PhoneStatusResponse)
async def submit_phone(
    body: PhoneSubmitRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Submit a phone number and receive an OTP via text.

    - Normalizes the number to E.164 (+1XXXXXXXXXX)
    - Generates a 6-digit OTP (hashed in DB, never stored plain)
    - Sends the code via Twilio SMS
    - OTP expires in 10 minutes

    **Tier requirement:** Active or Professional
    """
    # ── Tier gate ──────────────────────────────────────────────
    if not can_use_sms_alerts(current_user.subscription_tier):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="SMS text alerts require an Active or Professional subscription.",
        )

    # ── Normalize ──────────────────────────────────────────────
    phone_e164 = format_phone_e164(body.phone_number)
    if not phone_e164:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid phone number. Please enter a 10-digit US number.",
        )

    # ── Generate OTP ───────────────────────────────────────────
    plain_code, hashed_code, expires_at = generate_otp()

    # ── Store phone + OTP hash on user ─────────────────────────
    current_user.phone_number = phone_e164
    current_user.phone_verified = False  # reset until verified
    current_user.phone_otp_hash = hashed_code
    current_user.phone_otp_expires = expires_at
    await db.commit()
    await db.refresh(current_user)

    # ── Send SMS ───────────────────────────────────────────────
    sent = send_otp_sms(phone_e164, plain_code)
    if not sent:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Could not send verification text. Please try again.",
        )

    last_four = phone_e164[-4:]
    return PhoneStatusResponse(
        has_phone=True,
        phone_verified=False,
        phone_last_four=last_four,
        message=f"Verification code sent to •••-{last_four}. Check your texts.",
    )


@router.post("/verify", response_model=PhoneStatusResponse)
async def verify_phone(
    body: PhoneVerifyRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Verify phone ownership by submitting the 6-digit OTP code.
    """
    if not current_user.phone_number:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No phone number on file. Submit a number first.",
        )

    if not current_user.phone_otp_hash or not current_user.phone_otp_expires:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No pending verification. Please request a new code.",
        )

    # ── Check OTP ──────────────────────────────────────────────
    if not verify_otp(body.code, current_user.phone_otp_hash, current_user.phone_otp_expires):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired code. Please request a new one.",
        )

    # ── Mark verified, clear OTP ───────────────────────────────
    current_user.phone_verified = True
    current_user.phone_otp_hash = None
    current_user.phone_otp_expires = None
    await db.commit()
    await db.refresh(current_user)

    last_four = current_user.phone_number[-4:]
    return PhoneStatusResponse(
        has_phone=True,
        phone_verified=True,
        phone_last_four=last_four,
        message=f"Phone verified! Texts will go to •••-{last_four}.",
    )


@router.delete("/", response_model=PhoneStatusResponse)
async def remove_phone(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Remove phone number and disable ALL SMS alerts for this user.
    """
    # ── Clear phone fields ─────────────────────────────────────
    current_user.phone_number = None
    current_user.phone_verified = False
    current_user.phone_otp_hash = None
    current_user.phone_otp_expires = None

    # ── Disable sms_enabled on all user's alerts ───────────────
    await db.execute(
        update(PriceAlert)
        .where(PriceAlert.user_id == current_user.id)
        .values(sms_enabled=False)
    )

    await db.commit()
    await db.refresh(current_user)

    return PhoneStatusResponse(
        has_phone=False,
        phone_verified=False,
        phone_last_four=None,
        message="Phone removed. All SMS alerts have been disabled.",
    )