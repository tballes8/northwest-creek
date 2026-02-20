"""
Authentication and User schemas
"""
from pydantic import BaseModel, EmailStr, Field
from typing import Optional
from datetime import datetime
from uuid import UUID


class UserBase(BaseModel):
    """Base user schema"""
    email: EmailStr
    full_name: Optional[str] = None


class UserCreate(UserBase):
    """Schema for user registration"""
    password: str = Field(..., min_length=8, description="Password must be at least 8 characters")


class UserLogin(BaseModel):
    """Schema for user login"""
    email: EmailStr
    password: str


class UserUpdate(BaseModel):
    """Schema for updating user info"""
    full_name: Optional[str] = None
    email: Optional[EmailStr] = None


class UserInDB(UserBase):
    """User as stored in database"""
    id: UUID
    is_active: bool
    is_verified: bool = False
    is_admin: bool = False
    subscription_tier: str
    created_at: datetime
    
    # Phone / SMS fields (never expose raw number — mask in response)
    phone_verified: bool = False
    phone_last_four: Optional[str] = None
    
    class Config:
        from_attributes = True


class UserResponse(UserInDB):
    """User response (without password)"""
    pass


class Token(BaseModel):
    """JWT token response"""
    access_token: str
    token_type: str = "bearer"


class TokenData(BaseModel):
    """Token payload data"""
    user_id: Optional[UUID] = None


# --- Password Reset & Change ---

class ForgotPasswordRequest(BaseModel):
    """Schema for requesting a password reset link"""
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    """Schema for resetting password via emailed token"""
    token: str
    new_password: str = Field(..., min_length=8, description="Password must be at least 8 characters")


class ChangePasswordRequest(BaseModel):
    """Schema for authenticated password change (requires current password)"""
    current_password: str
    new_password: str = Field(..., min_length=8, description="Password must be at least 8 characters")


# --- Phone / SMS Verification ---

class PhoneSubmitRequest(BaseModel):
    """Submit a phone number to receive an OTP code"""
    phone_number: str = Field(
        ...,
        min_length=10,
        max_length=20,
        description="US phone number in any format — will be normalized to E.164"
    )


class PhoneVerifyRequest(BaseModel):
    """Verify phone ownership with the OTP code"""
    code: str = Field(..., min_length=6, max_length=6, description="6-digit verification code")


class PhoneStatusResponse(BaseModel):
    """Current phone verification status"""
    has_phone: bool
    phone_verified: bool
    phone_last_four: Optional[str] = None
    message: str