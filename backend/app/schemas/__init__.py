"""
Pydantic schemas for request/response validation
"""
from app.schemas import (
    alert,
    auth,
    indicator,
    portfolio,
    stock,
    watchlist,
    daily_snapshot,
)

# Export commonly used schemas for convenience
from app.schemas.auth import (
    UserCreate,
    UserLogin,
    UserResponse,
    Token,
    TokenData,
    ForgotPasswordRequest,
    ResetPasswordRequest,
    ChangePasswordRequest
)

from app.schemas.daily_snapshot import (
    DailySnapshotItem,
    DailySnapshotResponse,
)

__all__ = [
    "alert",
    "auth",
    "indicator",
    "portfolio",
    "stock",
    "watchlist",
    "daily_snapshot",
    # Auth schemas
    "UserCreate",
    "UserLogin",
    "UserResponse",
    "ForgotPasswordRequest",
    "ResetPasswordRequest",
    "ChangePasswordRequest",
    "Token",
    "TokenData",
    # Daily snapshot schemas
    "DailySnapshotItem",
    "DailySnapshotResponse",
]
