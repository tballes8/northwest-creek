"""
Per-period usage limits for metered features (DCF, relative valuation, technical
analysis, watchlist screens, AI analysis): the one quota check and the one usage write.

Limits and periods come from core/tier_limits.py. Usage is counted from FeatureUsage
rows over a rolling window: the last day for per-day tiers, the last week for per-week
tiers. Endpoints check before the metered work and record only after it succeeds, so an
upstream failure or a bad ticker never costs the user a run.
"""
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status
from sqlalchemy import func as sa_func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.tier_limits import get_review_period, get_tier_limit, get_upgrade_tier, weekly_equivalent
from app.db.models import FeatureUsage, User


async def check_feature_limit(
    user: User, db: AsyncSession, feature: str, label: str, unit: str | None = None,
) -> int:
    """Check a per-period quota and raise 403 if it is spent.

    Returns the current usage count. The 403 detail matches the shape every metered
    endpoint uses, so the frontend renders <UpgradeRequired/> straight from the
    response instead of counting in the browser. `label` starts the message ("DCF
    valuation limit reached."); `unit` names what the upgrade buys ("for 20 DCF
    valuations per day"), and without one the message reads "for 20 per day".

    The upgrade prompt compares weekly equivalents: Casual's 15 a week and Active's 10
    a day are not comparable as raw numbers, and Active's is the larger allowance.
    """
    tier = user.subscription_tier
    limit = get_tier_limit(tier, feature)
    period = get_review_period(tier)

    now = datetime.now(timezone.utc)
    window_start = now - timedelta(days=1) if period == "day" else now - timedelta(weeks=1)

    result = await db.execute(
        select(sa_func.count(FeatureUsage.id))
        .where(
            FeatureUsage.user_id == user.id,
            FeatureUsage.feature == feature,
            FeatureUsage.used_at >= window_start,
        )
    )
    current_count = result.scalar() or 0

    if current_count >= limit:
        next_tier = get_upgrade_tier(tier)
        if next_tier and weekly_equivalent(next_tier, feature) > weekly_equivalent(tier, feature):
            upgrade_msg = (
                f" Upgrade to {next_tier.capitalize()} for "
                f"{get_tier_limit(next_tier, feature)}{f' {unit}' if unit else ''} "
                f"per {get_review_period(next_tier)}."
            )
        else:
            upgrade_msg = ""

        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "message": f"{label} limit reached. {tier.capitalize()} tier allows {limit} per {period}.{upgrade_msg}",
                "current_usage": current_count,
                "max_usage": limit,
                "period": period,
            }
        )

    return current_count


async def record_feature_usage(user: User, db: AsyncSession, feature: str) -> None:
    """Record one usage event. Called only after the work succeeds."""
    db.add(FeatureUsage(user_id=user.id, feature=feature))
    await db.commit()
