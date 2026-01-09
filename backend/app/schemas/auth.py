"""
Authentication and User schemas
"""
from pydantic import BaseModel, EmailStr, Field
from typing import Optional
from datetime import datetime
from uuid import UUID  # ← Add this import


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
    id: UUID  # ← Changed from int to UUID
    is_active: bool
    subscription_tier: str
    created_at: datetime
    
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
    user_id: Optional[UUID] = None  # ← Changed from int to UUID