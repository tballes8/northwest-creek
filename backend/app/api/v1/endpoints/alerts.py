"""
Price Alerts API Endpoints
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import List
from decimal import Decimal

from app.db.models import User, PriceAlert
from app.schemas.alert import (
    AlertCreate,
    AlertUpdate,
    AlertResponse,
    AlertsSummary
)
from app.api.dependencies import get_current_user
from app.db.session import get_db
from app.services.market_data import market_data_service

router = APIRouter()

# Subscription limits
ALERT_LIMITS = {
    "free": 0,
    "casual": 5,
    "active": 20,
    "unlimited": 999999
}


@router.post("/", response_model=AlertResponse, status_code=status.HTTP_201_CREATED)
async def create_alert(
    alert: AlertCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Create a price alert
    
    **Set alerts for price targets:**
    - Alert when price goes ABOVE target (breakout alert)
    - Alert when price goes BELOW target (dip alert)
    
    **Limits by subscription tier:**
    - Free: 0 alerts
    - Casual: 5 alerts
    - Active: 20 alerts
    - Unlimited: Unlimited
    
    **Examples:**
    - "Alert me when TSLA goes above $500"
    - "Alert me when AAPL drops below $250"
    """
    # Check current count
    count_result = await db.execute(
        select(func.count(PriceAlert.id)).where(PriceAlert.user_id == current_user.id)
    )
    current_count = count_result.scalar()
    
    # Check limit
    limit = ALERT_LIMITS.get(current_user.subscription_tier, 0)
    if current_count >= limit:
        # Get upgrade info
        if current_user.subscription_tier == "free":
            upgrade_msg = "Upgrade to Casual for 5 alerts ($20/month) or Active for 20 alerts ($40/month)!"
        elif current_user.subscription_tier == "casual":
            upgrade_msg = "Upgrade to Active for 20 alerts ($40/month) or Unlimited for unlimited alerts ($100/month)!"
        elif current_user.subscription_tier == "active":
            upgrade_msg = "Upgrade to Unlimited for unlimited alerts ($100/month)!"            
        else:
            upgrade_msg = "Contact support for custom limits."
        
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Alert limit reached! You have {current_count}/{limit} price alerts. {upgrade_msg}"
        )
    
    # Verify ticker exists and get current price
    try:
        quote = await market_data_service.get_quote(alert.ticker)
        current_price = quote["price"]
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Ticker '{alert.ticker.upper()}' not found"
        )
    
    # Validate condition makes sense
    if alert.condition == "above" and alert.target_price <= current_price:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Target price ${alert.target_price} is already below current price ${current_price:.2f}. Use 'below' condition or set a higher target."
        )
    elif alert.condition == "below" and alert.target_price >= current_price:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Target price ${alert.target_price} is already above current price ${current_price:.2f}. Use 'above' condition or set a lower target."
        )
    
    # Create alert
    price_alert = PriceAlert(
        user_id=current_user.id,
        ticker=alert.ticker.upper(),
        target_price=Decimal(str(alert.target_price)),
        condition=alert.condition,
        notes=alert.notes
    )
    
    db.add(price_alert)
    await db.commit()
    await db.refresh(price_alert)
    
    # Calculate distance
    distance = alert.target_price - current_price if alert.condition == "above" else current_price - alert.target_price
    distance_percent = (distance / current_price) * 100
    
    # Create response
    response = AlertResponse(
        id=str(price_alert.id),
        ticker=price_alert.ticker,
        target_price=float(price_alert.target_price),
        condition=price_alert.condition,
        is_active=price_alert.is_active,
        triggered_at=price_alert.triggered_at,
        notes=price_alert.notes,
        created_at=price_alert.created_at,
        current_price=current_price,
        distance_to_target=round(distance, 2),
        distance_percent=round(distance_percent, 2)
    )
    
    # Add warning if near limit
    new_count = current_count + 1
    remaining = limit - new_count
    
    if remaining > 0 and remaining <= 2:
        if current_user.subscription_tier == "casual":
            warning = f"⚠️ Warning: Only {remaining} alert{'s' if remaining != 1 else ''} remaining! Upgrade to Active for 20 alerts ($40/month)."
        elif current_user.subscription_tier == "active":
            warning = f"⚠️ Warning: Only {remaining} alert{'s' if remaining != 1 else ''} remaining! Upgrade to Unlimited for unlimited alerts ($100/month)."
        else:
            warning = None
        
        response.warning = warning
    
    return response


@router.get("/", response_model=AlertsSummary)
async def get_alerts(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Get all your price alerts
    
    **Returns:**
    - All alerts (active and triggered)
    - Current prices
    - Distance to target
    - Summary statistics
    """
    # Get all alerts
    result = await db.execute(
        select(PriceAlert)
        .where(PriceAlert.user_id == current_user.id)
        .order_by(PriceAlert.created_at.desc())
    )
    alerts = result.scalars().all()
    
    limit = ALERT_LIMITS.get(current_user.subscription_tier, 0)
    
    if not alerts:
        return AlertsSummary(
            alerts=[],
            total_alerts=0,
            active_alerts=0,
            triggered_alerts=0,
            alerts_used=0,
            alerts_limit=limit
        )
    
    # Build responses
    alert_responses = []
    active_count = 0
    triggered_count = 0
    
    for alert in alerts:
        # Get current price
        try:
            quote = await market_data_service.get_quote(alert.ticker)
            current_price = quote["price"]
        except:
            current_price = None
        
        # Calculate distance
        if current_price:
            if alert.condition == "above":
                distance = float(alert.target_price) - current_price
            else:  # below
                distance = current_price - float(alert.target_price)
            
            distance_percent = (distance / current_price) * 100
        else:
            distance = None
            distance_percent = None
        
        # Count active/triggered
        if alert.is_active:
            active_count += 1
        if alert.triggered_at:
            triggered_count += 1
        
        alert_responses.append(AlertResponse(
            id=str(alert.id),
            ticker=alert.ticker,
            target_price=float(alert.target_price),
            condition=alert.condition,
            is_active=alert.is_active,
            triggered_at=alert.triggered_at,
            notes=alert.notes,
            created_at=alert.created_at,
            current_price=current_price,
            distance_to_target=round(distance, 2) if distance else None,
            distance_percent=round(distance_percent, 2) if distance_percent else None
        ))
    
    return AlertsSummary(
        alerts=alert_responses,
        total_alerts=len(alerts),
        active_alerts=active_count,
        triggered_alerts=triggered_count,
        alerts_used=len(alerts),
        alerts_limit=limit
    )


@router.delete("/{alert_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_alert(
    alert_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Delete a price alert"""
    result = await db.execute(
        select(PriceAlert).where(
            PriceAlert.id == alert_id,
            PriceAlert.user_id == current_user.id
        )
    )
    alert = result.scalar_one_or_none()
    
    if not alert:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Alert not found"
        )
    
    await db.delete(alert)
    await db.commit()
    
    return None


@router.patch("/{alert_id}", response_model=AlertResponse)
async def update_alert(
    alert_id: str,
    update_data: AlertUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Update a price alert
    
    **You can update:**
    - Target price
    - Condition (above/below)
    - Notes
    - Active status (pause/resume alert)
    """
    result = await db.execute(
        select(PriceAlert).where(
            PriceAlert.id == alert_id,
            PriceAlert.user_id == current_user.id
        )
    )
    alert = result.scalar_one_or_none()
    
    if not alert:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Alert not found"
        )
    
    # Update fields
    if update_data.target_price is not None:
        alert.target_price = Decimal(str(update_data.target_price))
    if update_data.condition is not None:
        alert.condition = update_data.condition
    if update_data.notes is not None:
        alert.notes = update_data.notes
    if update_data.is_active is not None:
        alert.is_active = update_data.is_active
    
    await db.commit()
    await db.refresh(alert)
    
    # Get current price
    try:
        quote = await market_data_service.get_quote(alert.ticker)
        current_price = quote["price"]
    except:
        current_price = None
    
    # Calculate distance
    if current_price:
        if alert.condition == "above":
            distance = float(alert.target_price) - current_price
        else:
            distance = current_price - float(alert.target_price)
        distance_percent = (distance / current_price) * 100
    else:
        distance = None
        distance_percent = None
    
    return AlertResponse(
        id=str(alert.id),
        ticker=alert.ticker,
        target_price=float(alert.target_price),
        condition=alert.condition,
        is_active=alert.is_active,
        triggered_at=alert.triggered_at,
        notes=alert.notes,
        created_at=alert.created_at,
        current_price=current_price,
        distance_to_target=round(distance, 2) if distance else None,
        distance_percent=round(distance_percent, 2) if distance_percent else None
    )