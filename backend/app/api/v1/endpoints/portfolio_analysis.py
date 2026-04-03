"""
Portfolio AI analysis endpoint — on-demand plain-language summary of the user's portfolio.
Available to Casual, Active, and Professional tiers.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func as sa_func
from datetime import datetime, timezone, timedelta

from app.db.session import get_db
from app.api.dependencies import get_current_user
from app.db.models import User, Portfolio, FeatureUsage
from app.services.market_data import market_data_service
from app.services.portfolio_analyzer import analyze_portfolio
from app.core.tier_limits import get_tier_limit, get_review_period, get_upgrade_tier

router = APIRouter()


async def check_ai_analysis_access(user: User, db: AsyncSession) -> None:
    """Block Beginner tier and enforce per-period usage limits."""
    limit = get_tier_limit(user.subscription_tier, "ai_analysis")

    if limit == 0:
        next_tier = get_upgrade_tier(user.subscription_tier)
        upgrade_msg = f" Upgrade to {next_tier.capitalize()} to unlock AI portfolio analysis." if next_tier else ""
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"AI Portfolio Analysis is not available on the {user.subscription_tier.capitalize()} plan.{upgrade_msg}",
        )

    period = get_review_period(user.subscription_tier)
    now = datetime.now(timezone.utc)
    window_start = now - timedelta(days=1) if period == "day" else now - timedelta(weeks=1)

    result = await db.execute(
        select(sa_func.count(FeatureUsage.id)).where(
            FeatureUsage.user_id == user.id,
            FeatureUsage.feature == "ai_analysis",
            FeatureUsage.used_at >= window_start,
        )
    )
    current_count = result.scalar() or 0

    if current_count >= limit:
        next_tier = get_upgrade_tier(user.subscription_tier)
        if next_tier:
            next_limit = get_tier_limit(next_tier, "ai_analysis")
            upgrade_msg = f" Upgrade to {next_tier.capitalize()} for {next_limit} analyses per {get_review_period(next_tier)}."
        else:
            upgrade_msg = ""
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "message": f"AI analysis limit reached. {user.subscription_tier.capitalize()} tier allows {limit} per {period}.{upgrade_msg}",
                "current_usage": current_count,
                "max_usage": limit,
                "period": period,
            },
        )


@router.post("/analyze")
async def analyze_user_portfolio(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Generate an AI plain-language summary of the user's current portfolio."""

    await check_ai_analysis_access(current_user, db)

    # Fetch positions from DB
    result = await db.execute(
        select(Portfolio).where(Portfolio.user_id == current_user.id)
    )
    db_positions = result.scalars().all()

    if not db_positions:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="no_positions",
        )

    # Enrich with current prices (single batch call)
    tickers = [p.ticker for p in db_positions]
    quotes = await market_data_service.get_batch_quotes(tickers)

    positions = []
    total_value = 0.0
    total_cost = 0.0

    for p in db_positions:
        quote = quotes.get(p.ticker.upper(), {})
        buy_price = float(p.buy_price)
        quantity = float(p.quantity)
        cost = buy_price * quantity

        current_price = float(quote.get("price") or buy_price)
        tv = current_price * quantity
        pl = tv - cost
        pl_pct = (pl / cost * 100) if cost > 0 else 0.0

        total_value += tv
        total_cost += cost

        positions.append({
            "ticker": p.ticker,
            "quantity": quantity,
            "buy_price": buy_price,
            "current_price": current_price,
            "total_value": tv,
            "profit_loss": pl,
            "profit_loss_percent": pl_pct,
        })

    total_pl = total_value - total_cost
    total_pl_pct = (total_pl / total_cost * 100) if total_cost > 0 else 0.0

    # Fetch index quotes for market context (best-effort)
    index_context: list = []
    try:
        index_quotes = await market_data_service.get_batch_quotes(["^GSPC", "^IXIC", "^DJI"])
        name_map = {"^GSPC": "S&P 500", "^IXIC": "NASDAQ", "^DJI": "Dow Jones"}
        for symbol, label in name_map.items():
            q = index_quotes.get(symbol, {})
            if q.get("changesPercentage") is not None:
                index_context.append({
                    "name": label,
                    "changePercent": float(q["changesPercentage"]),
                })
    except Exception:
        pass

    summary = await analyze_portfolio(
        positions=positions,
        portfolio_totals={
            "total_value": total_value,
            "total_profit_loss": total_pl,
            "total_profit_loss_percent": total_pl_pct,
        },
        market_context={"indexes": index_context},
    )

    # Record usage after a successful call
    db.add(FeatureUsage(user_id=current_user.id, feature="ai_analysis"))
    await db.commit()

    return {
        "summary": summary,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }
