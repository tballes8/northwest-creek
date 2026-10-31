"""
API Dependencies - Reusable dependencies for endpoints

The only auth dependencies in the app. get_current_user is the default for every
protected route and enforces the subscription; the paywall is here, not in the
browser (the frontend's SubscriptionGuard only decides where to send people).
"""
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.db.models import User
from app.core.entitlements import has_app_access
from app.core.security import decode_token
from app.db.session import get_db

security = HTTPBearer()


async def _authenticate(credentials: HTTPAuthorizationCredentials, db: AsyncSession) -> User:
    """Resolve the bearer token to an enabled User. 401 for a bad token or unknown
    user, 403 for a disabled account. Does not look at the subscription."""
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
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This account is disabled. Contact support@nwc-analytics.com."
        )
    return user


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncSession = Depends(get_db)
) -> User:
    """
    Get current authenticated user from JWT token, who must have access to the app:
    an active or trialing subscription, or an exempt account (core/entitlements.py).

    Used as a dependency in protected endpoints. No live subscription gets 402,
    not 401, which would bounce a logged-in user to /login instead of letting
    them subscribe. Reads the stored subscription state; never calls Stripe.
    """
    user = await _authenticate(credentials, db)
    if not has_app_access(user):
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail="An active subscription is required."
        )
    return user


async def get_current_user_any_subscription(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncSession = Depends(get_db)
) -> User:
    """
    Authenticated user whatever the state of their subscription.

    Only for the routes someone without a live subscription needs to get one:
    /auth/me, subscription status, (re)subscribe, the billing portal and cancelling.
    """
    return await _authenticate(credentials, db)
