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
)

# Export commonly used schemas for convenience
from app.schemas.auth import (
    UserCreate,
    UserLogin,
    UserResponse,
    Token,
    TokenData,
)

__all__ = [
    "alert",
    "auth",
    "indicator",
    "portfolio",
    "stock",
    "watchlist",
    # Auth schemas
    "UserCreate",
    "UserLogin",
    "UserResponse",
    "Token",
    "TokenData",
]