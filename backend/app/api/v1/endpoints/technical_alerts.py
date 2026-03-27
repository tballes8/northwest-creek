"""
Technical Alerts API Endpoints - Indicator-based alerts
Active and Professional tiers only
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.db.models import User, PriceAlert, TechnicalAlert
from app.schemas.technical_alert import (
    TechnicalAlertCreate,
    TechnicalAlertUpdate,
    TechnicalAlertResponse,
    TechnicalAlertsSummary,
    ALERT_TYPE_LABELS,
    _config_display,
)
from app.api.dependencies import get_current_user
from app.db.session import get_db
from app.services.market_data import market_data_service
from app.services.technical_alert_checker import technical_alert_checker
from app.core.tier_limits import (
    can_use_sms_alerts,
    get_tier_limit,
    get_upgrade_tier,
)

router = APIRouter()


def _build_response(alert: TechnicalAlert) -> TechnicalAlertResponse:
    """Convert a TechnicalAlert model to response schema with display fields."""
    return TechnicalAlertResponse(
        id=str(alert.id),
        ticker=alert.ticker,
        alert_type=alert.alert_type,
        config=alert.config,
        last_state=alert.last_state,
        is_active=alert.is_active,
        sms_enabled=alert.sms_enabled,
        triggered_at=alert.triggered_at,
        trigger_details=alert.trigger_details,
        notes=alert.notes,
        created_at=alert.created_at,
        alert_type_display=ALERT_TYPE_LABELS.get(alert.alert_type, alert.alert_type),
        config_display=_config_display(alert.alert_type, alert.config, alert.ticker),
    )


@router.post("/", response_model=TechnicalAlertResponse, status_code=status.HTTP_201_CREATED)
async def create_technical_alert(
    alert: TechnicalAlertCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Create a technical indicator alert.

    **Alert types:**
    - `sentiment_shift` — Alert when overall outlook transitions to a target
    - `ma_crossover` — Golden Cross or Death Cross
    - `rsi_extreme` — RSI crosses overbought/oversold threshold
    - `macd_cross` — MACD histogram flips sign
    - `bollinger_breach` — Price breaks above/below Bollinger Bands

    **Requires:** Active or Professional tier
    """
    tier = current_user.subscription_tier

    # ── Check indicator_alerts tier limit ──────────────────────────────
    indicator_limit = get_tier_limit(tier, "indicator_alerts")
    if indicator_limit == 0:
        next_tier = get_upgrade_tier(tier)
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Technical indicator alerts require an Active or Professional subscription."
            + (f" Upgrade to {next_tier.capitalize()} to unlock this feature!" if next_tier else ""),
        )

    indicator_count_result = await db.execute(
        select(func.count(TechnicalAlert.id)).where(TechnicalAlert.user_id == current_user.id)
    )
    indicator_count = indicator_count_result.scalar()

    if indicator_count >= indicator_limit:
        next_tier = get_upgrade_tier(tier)
        if next_tier:
            next_limit = get_tier_limit(next_tier, "indicator_alerts")
            upgrade_msg = f"Upgrade to {next_tier.capitalize()} for {next_limit} indicator alerts!"
        else:
            upgrade_msg = "Contact support for custom limits."
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Indicator alert limit reached! You have {indicator_count}/{indicator_limit}. {upgrade_msg}",
        )

    # ── Also check combined alerts quota ──────────────────────────────
    price_count_result = await db.execute(
        select(func.count(PriceAlert.id)).where(PriceAlert.user_id == current_user.id)
    )
    price_count = price_count_result.scalar()
    combined_limit = get_tier_limit(tier, "alerts")
    combined_count = price_count + indicator_count

    if combined_count >= combined_limit:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Total alert limit reached! You have {combined_count}/{combined_limit} alerts (price + technical).",
        )

    # ── Verify ticker exists ──────────────────────────────────────────
    try:
        await market_data_service.get_quote(alert.ticker)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Ticker '{alert.ticker.upper()}' not found",
        )

    # ── Validate SMS permissions ──────────────────────────────────────
    sms_enabled = alert.sms_enabled
    if sms_enabled:
        if not can_use_sms_alerts(tier):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="SMS text alerts require a Casual or higher subscription.",
            )
        if not current_user.phone_verified:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Phone verification required for text alerts. Please verify your phone first.",
            )

    # ── Seed initial state ────────────────────────────────────────────
    try:
        initial_state = await technical_alert_checker.seed_initial_state(
            ticker=alert.ticker.upper(),
            alert_type=alert.alert_type,
            config=alert.config,
        )
    except Exception as e:
        print(f"Warning: could not seed initial state for {alert.ticker}: {e}")
        initial_state = {}

    # ── Create alert ──────────────────────────────────────────────────
    tech_alert = TechnicalAlert(
        user_id=current_user.id,
        ticker=alert.ticker.upper(),
        alert_type=alert.alert_type,
        config=alert.config,
        last_state=initial_state,
        sms_enabled=sms_enabled,
        notes=alert.notes,
    )
    db.add(tech_alert)
    await db.commit()
    await db.refresh(tech_alert)

    return _build_response(tech_alert)


@router.get("/", response_model=TechnicalAlertsSummary)
async def get_technical_alerts(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get all technical alerts for the current user."""
    result = await db.execute(
        select(TechnicalAlert)
        .where(TechnicalAlert.user_id == current_user.id)
        .order_by(TechnicalAlert.created_at.desc())
    )
    alerts = result.scalars().all()

    tier = current_user.subscription_tier
    indicator_limit = get_tier_limit(tier, "indicator_alerts")

    active_count = sum(1 for a in alerts if a.is_active and not a.triggered_at)
    triggered_count = sum(1 for a in alerts if a.triggered_at)

    return TechnicalAlertsSummary(
        alerts=[_build_response(a) for a in alerts],
        total_alerts=len(alerts),
        active_alerts=active_count,
        triggered_alerts=triggered_count,
        indicator_alerts_used=len(alerts),
        indicator_alerts_limit=indicator_limit,
    )


@router.patch("/{alert_id}", response_model=TechnicalAlertResponse)
async def update_technical_alert(
    alert_id: str,
    update_data: TechnicalAlertUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update a technical alert (toggle active, SMS, notes)."""
    result = await db.execute(
        select(TechnicalAlert).where(
            TechnicalAlert.id == alert_id,
            TechnicalAlert.user_id == current_user.id,
        )
    )
    alert = result.scalar_one_or_none()
    if not alert:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Alert not found")

    if update_data.is_active is not None:
        alert.is_active = update_data.is_active
    if update_data.notes is not None:
        alert.notes = update_data.notes
    if update_data.sms_enabled is not None:
        if update_data.sms_enabled:
            if not can_use_sms_alerts(current_user.subscription_tier):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="SMS text alerts require a Casual or higher subscription.",
                )
            if not current_user.phone_verified:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Phone verification required for text alerts.",
                )
        alert.sms_enabled = update_data.sms_enabled

    await db.commit()
    await db.refresh(alert)
    return _build_response(alert)


@router.delete("/{alert_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_technical_alert(
    alert_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a technical alert."""
    result = await db.execute(
        select(TechnicalAlert).where(
            TechnicalAlert.id == alert_id,
            TechnicalAlert.user_id == current_user.id,
        )
    )
    alert = result.scalar_one_or_none()
    if not alert:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Alert not found")

    await db.delete(alert)
    await db.commit()
