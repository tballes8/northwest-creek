"""
API Dependencies - Reusable dependencies for endpoints
"""
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.db.models import User
from app.core.security import decode_token
from app.db.session import get_db

security = HTTPBearer()


async def _authenticate(credentials: HTTPAuthorizationCredentials, db: AsyncSession) -> User:
    """Resolve the bearer token to a User. Raises 401; does not look at is_active."""
    payload = decode_token(credentials.credentials)
    user_id = payload.get("sub") if payload else None
    if not user_id:
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
    return user


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncSession = Depends(get_db)
) -> User:
    """
    Get current authenticated user from JWT token

    Used as a dependency in protected endpoints. A locked account (is_active=False:
    its subscription ended) gets 403 — not 401, which would bounce it to /login
    in a loop instead of letting it resubscribe.
    """
    user = await _authenticate(credentials, db)
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Inactive user"
        )
    return user


async def get_current_user_allow_inactive(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncSession = Depends(get_db)
) -> User:
    """
    Authenticated user, including a locked one.

    Only for the routes a lapsed account needs to get back in: /auth/me,
    subscription status, (re)subscribe, and the billing portal.
    """
    return await _authenticate(credentials, db)
