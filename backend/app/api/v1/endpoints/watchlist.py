"""
Watchlist API Endpoints
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import List

from app.models.database import User, Watchlist
from app.models.watchlist_schemas import (
    WatchlistAdd,
    WatchlistUpdate,
    WatchlistItem,
    WatchlistResponse,
    WatchlistWithQuote
)
from app.api.dependencies import get_current_user
from app.db.session import get_db
from app.services.market_data import market_data_service

router = APIRouter()

# Subscription limits
WATCHLIST_LIMITS = {
    "free": 5,
    "pro": 50,
    "enterprise": 999999  # Unlimited
}


@router.post("/", response_model=WatchlistItem, status_code=status.HTTP_201_CREATED)
async def add_to_watchlist(
    item: WatchlistAdd,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Add a stock to your watchlist
    
    **Limits by subscription tier:**
    - Free: 5 stocks
    - Pro: 50 stocks
    - Enterprise: Unlimited
    """
    # Check current count
    count_result = await db.execute(
        select(func.count(Watchlist.id)).where(Watchlist.user_id == current_user.id)
    )
    current_count = count_result.scalar()
    
    # Check limit
    limit = WATCHLIST_LIMITS.get(current_user.subscription_tier, 5)
    if current_count >= limit:
        # Get upgrade info
        if current_user.subscription_tier == "free":
            upgrade_msg = "Upgrade to Pro for 50 stocks ($29/month) or Enterprise for unlimited stocks ($99/month)!"
        elif current_user.subscription_tier == "pro":
            upgrade_msg = "Upgrade to Enterprise for unlimited stocks ($99/month)!"
        else:
            upgrade_msg = "Contact support for custom limits."
        
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Watchlist limit reached! You have {current_count}/{limit} stocks tracked. {upgrade_msg}"
        )
    
    # Check if ticker already exists for this user
    existing = await db.execute(
        select(Watchlist).where(
            Watchlist.user_id == current_user.id,
            Watchlist.ticker == item.ticker.upper()
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"{item.ticker.upper()} is already in your watchlist"
        )
    
    # Verify ticker exists (optional - call Massive API)
    try:
        await market_data_service.get_quote(item.ticker)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Ticker '{item.ticker.upper()}' not found"
        )
    
    # Create watchlist item
    watchlist_item = Watchlist(
        user_id=current_user.id,
        ticker=item.ticker.upper(),
        notes=item.notes
    )
    
    db.add(watchlist_item)
    await db.commit()
    await db.refresh(watchlist_item)
    
    # Create response
    response = WatchlistItem(
        id=str(watchlist_item.id),
        user_id=str(watchlist_item.user_id),
        ticker=watchlist_item.ticker,
        added_at=watchlist_item.added_at,
        notes=watchlist_item.notes
    )
    
    # Add warning if near limit
    new_count = current_count + 1
    remaining = limit - new_count
    
    if remaining > 0 and remaining <= 2:  # Warning at 2 or fewer remaining
        if current_user.subscription_tier == "free":
            warning = f"⚠️ Warning: Only {remaining} stock{'s' if remaining != 1 else ''} remaining in watchlist! Upgrade to Pro for 50 stocks ($29/month)."
        elif current_user.subscription_tier == "pro":
            warning = f"⚠️ Warning: Only {remaining} stock{'s' if remaining != 1 else ''} remaining in watchlist! Upgrade to Enterprise for unlimited stocks ($99/month)."
        else:
            warning = None
        
        response.warning = warning
    
    return response


@router.get("/", response_model=WatchlistResponse)
async def get_watchlist(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Get your complete watchlist with current prices
    """
    # Get all watchlist items
    result = await db.execute(
        select(Watchlist)
        .where(Watchlist.user_id == current_user.id)
        .order_by(Watchlist.added_at.desc())
    )
    items = result.scalars().all()
    
    # Fetch current quotes for all tickers
    watchlist_with_quotes = []
    for item in items:
        try:
            # Get current quote
            quote = await market_data_service.get_quote(item.ticker)
            company = await market_data_service.get_company_info(item.ticker)
            
            watchlist_with_quotes.append(WatchlistWithQuote(
                id=str(item.id),
                ticker=item.ticker,
                added_at=item.added_at,
                notes=item.notes,
                current_price=quote.get("price"),
                change_percent=quote.get("change_percent"),
                company_name=company.get("name")
            ))
        except Exception as e:
            # If quote fails, still show the watchlist item
            watchlist_with_quotes.append(WatchlistWithQuote(
                id=str(item.id),
                ticker=item.ticker,
                added_at=item.added_at,
                notes=item.notes,
                current_price=None,
                change_percent=None,
                company_name=None
            ))
    
    limit = WATCHLIST_LIMITS.get(current_user.subscription_tier, 5)
    
    return WatchlistResponse(
        items=watchlist_with_quotes,
        count=len(items),
        limit=limit,
        subscription_tier=current_user.subscription_tier
    )


@router.delete("/{ticker}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_from_watchlist(
    ticker: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Remove a stock from your watchlist
    """
    result = await db.execute(
        select(Watchlist).where(
            Watchlist.user_id == current_user.id,
            Watchlist.ticker == ticker.upper()
        )
    )
    item = result.scalar_one_or_none()
    
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"{ticker.upper()} not found in your watchlist"
        )
    
    await db.delete(item)
    await db.commit()
    
    return None


@router.patch("/{ticker}", response_model=WatchlistItem)
async def update_watchlist_item(
    ticker: str,
    update_data: WatchlistUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Update notes for a watchlist item
    """
    result = await db.execute(
        select(Watchlist).where(
            Watchlist.user_id == current_user.id,
            Watchlist.ticker == ticker.upper()
        )
    )
    item = result.scalar_one_or_none()
    
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"{ticker.upper()} not found in your watchlist"
        )
    
    # Update notes
    if update_data.notes is not None:
        item.notes = update_data.notes
    
    await db.commit()
    await db.refresh(item)
    
    return item