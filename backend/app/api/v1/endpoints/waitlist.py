"""Waitlist signup endpoints — public POST + count, admin-only GET list.

Mounted in main.py:
    from app.api.v1.endpoints.waitlist import router as waitlist_router
    app.include_router(waitlist_router, prefix="/api/v1/waitlist", tags=["waitlist"])
"""

from fastapi import APIRouter, Request, HTTPException, Depends, Query, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, EmailStr
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import IntegrityError

from app.db.session import async_session as AsyncSessionLocal, get_db
from app.db.models import User, WaitlistSignup
from app.core.security import decode_token

router = APIRouter()
security = HTTPBearer()


# ── Schemas ────────────────────────────────────────────────────
class WaitlistRequest(BaseModel):
    email: EmailStr
    source: str | None = None


class WaitlistResponse(BaseModel):
    message: str
    email: str


# ── Auth helper (mirrors auth.py pattern) ──────────────────────
async def get_admin_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Resolve JWT → User and enforce is_admin. Reusable dependency."""
    try:
        payload = decode_token(credentials.credentials)
        user_id = payload.get("sub")
        if not user_id:
            raise ValueError("Missing sub claim")
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
        )

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive",
        )

    if not user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )

    return user


# ── POST /api/v1/waitlist (public) ─────────────────────────────
@router.post("", response_model=WaitlistResponse, status_code=201)
async def create_waitlist_signup(body: WaitlistRequest, request: Request):
    """
    Public endpoint — accepts an email and optional source (utm_source, ref param,
    or document.referrer from the landing page JS).

    Returns 201 on new signup, 409 if the email already exists.
    """
    email = body.email.lower().strip()

    # Grab client IP for abuse tracking (respects Railway proxy headers)
    ip = request.headers.get("x-forwarded-for", request.client.host if request.client else None)
    if ip and "," in ip:
        ip = ip.split(",")[0].strip()

    async with AsyncSessionLocal() as db:
        try:
            signup = WaitlistSignup(
                email=email,
                source=body.source[:255] if body.source else None,
                ip_address=ip,
            )
            db.add(signup)
            await db.commit()
            return WaitlistResponse(message="You're on the list!", email=email)

        except IntegrityError:
            await db.rollback()
            raise HTTPException(status_code=409, detail="This email is already on the waitlist.")


# ── GET /api/v1/waitlist/count (public) ────────────────────────
@router.get("/count")
async def get_waitlist_count():
    """Public vanity counter — can be wired into the landing page for social proof."""
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(func.count(WaitlistSignup.id)))
        count = result.scalar() or 0
        return {"count": count}


# ── GET /api/v1/waitlist (admin only) ──────────────────────────
@router.get("")
async def list_waitlist_signups(
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
    converted: bool | None = Query(default=None, description="Filter by converted status"),
):
    """
    Admin-only: list all waitlist signups with pagination.
    Supports filtering by converted status.
    """
    query = select(WaitlistSignup).order_by(WaitlistSignup.created_at.desc())

    if converted is not None:
        query = query.where(WaitlistSignup.converted == converted)

    query = query.offset(skip).limit(limit)
    result = await db.execute(query)
    signups = result.scalars().all()

    # Total count for pagination metadata
    count_query = select(func.count(WaitlistSignup.id))
    if converted is not None:
        count_query = count_query.where(WaitlistSignup.converted == converted)
    total = (await db.execute(count_query)).scalar() or 0

    return {
        "signups": [
            {
                "id": str(s.id),
                "email": s.email,
                "source": s.source,
                "ip_address": s.ip_address,
                "converted": s.converted,
                "created_at": s.created_at.isoformat() if s.created_at else None,
            }
            for s in signups
        ],
        "total": total,
        "skip": skip,
        "limit": limit,
    }


# ── PATCH /api/v1/waitlist/{signup_id}/convert (admin only) ────
@router.patch("/{signup_id}/convert")
async def mark_converted(
    signup_id: str,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Admin-only: mark a waitlist signup as converted (they registered a real account)."""
    result = await db.execute(
        select(WaitlistSignup).where(WaitlistSignup.id == signup_id)
    )
    signup = result.scalar_one_or_none()

    if not signup:
        raise HTTPException(status_code=404, detail="Waitlist signup not found")

    signup.converted = True
    await db.commit()

    return {"message": f"{signup.email} marked as converted", "email": signup.email}