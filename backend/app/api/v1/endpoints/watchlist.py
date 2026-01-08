"""
Watchlist endpoints - Track stocks you're interested in
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from typing import List
from redis.asyncio import Redis

from app.db.session import get_db
from app.db.cache import get_cache
from app.core.security import get_current_user
from app.db import models
from app.schemas import watchlist as schemas
from app.services.market_data import market_data_service

router = APIRouter()


async def check_watchlist_limit(user: models.User, current_count: int) -> None:
    """Check if user has reached their watchlist limit"""
    limits = {
        "free": 5,
        "pro": 50,
        "enterprise": float('inf')
    }
    
    limit = limits.get(user.subscription_tier, 5)
    
    if current_count >= limit:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Watchlist limit reached. {user.subscription_tier.capitalize()} tier allows {int(limit)} stocks."
        )


async def enrich_watchlist_with_prices(items: List[models.WatchlistItem]) -> List[schemas.WatchlistItemResponse]:
    """Enrich watchlist items with current market data"""
    enriched_items = []
    
    for item in items:
        try:
            quote = await market_data_service.get_quote(item.ticker)
            
            # Calculate price vs target if target_price is set
            price_vs_target = None
            price_vs_target_percent = None
            if item.target_price and quote.get('price'):
                price_vs_target = quote['price'] - item.target_price
                price_vs_target_percent = (price_vs_target / item.target_price) * 100
            
            enriched_items.append(schemas.WatchlistItemResponse(
                id=item.id,
                user_id=item.user_id,
                ticker=item.ticker,
                notes=item.notes,
                target_price=item.target_price,
                created_at=item.created_at,
                price=quote.get('price'),
                change=quote.get('change'),
                change_percent=quote.get('change_percent'),
                price_vs_target=price_vs_target,
                price_vs_target_percent=price_vs_target_percent
            ))
        except Exception as e:
            print(f"Error fetching quote for {item.ticker}: {e}")
            # If quote fetch fails, return item without price data
            enriched_items.append(schemas.WatchlistItemResponse(
                id=item.id,
                user_id=item.user_id,
                ticker=item.ticker,
                notes=item.notes,
                target_price=item.target_price,
                created_at=item.created_at
            ))
    
    return enriched_items


@router.get("", response_model=schemas.WatchlistResponse)
async def get_watchlist(
    current_user: models.User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    cache: Redis = Depends(get_cache)
):
    """Get user's watchlist with current prices"""
    # Get watchlist items
    result = await db.execute(
        select(models.WatchlistItem)
        .where(models.WatchlistItem.user_id == current_user.id)
        .order_by(models.WatchlistItem.created_at.desc())
    )
    items = result.scalars().all()
    
    # Enrich with current prices
    enriched_items = await enrich_watchlist_with_prices(items)
    
    return schemas.WatchlistResponse(
        items=enriched_items,
        count=len(enriched_items)
    )


@router.post("", response_model=schemas.WatchlistItemResponse, status_code=status.HTTP_201_CREATED)
async def add_to_watchlist(
    item_data: schemas.WatchlistItemCreate,
    current_user: models.User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Add a stock to watchlist"""
    # Check if already in watchlist
    result = await db.execute(
        select(models.WatchlistItem).where(
            and_(
                models.WatchlistItem.user_id == current_user.id,
                models.WatchlistItem.ticker == item_data.ticker.upper()
            )
        )
    )
    existing = result.scalar_one_or_none()
    
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"{item_data.ticker} is already in your watchlist"
        )
    
    # Check watchlist limit
    count_result = await db.execute(
        select(models.WatchlistItem)
        .where(models.WatchlistItem.user_id == current_user.id)
    )
    current_count = len(count_result.scalars().all())
    await check_watchlist_limit(current_user, current_count)
    
    # Verify ticker is valid by fetching quote
    try:
        quote = await market_data_service.get_quote(item_data.ticker)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid ticker symbol: {item_data.ticker}"
        )
    
    # Create watchlist item
    db_item = models.WatchlistItem(
        user_id=current_user.id,
        ticker=item_data.ticker.upper(),
        notes=item_data.notes,
        target_price=item_data.target_price
    )
    
    db.add(db_item)
    await db.commit()
    await db.refresh(db_item)
    
    # Return with current price data
    enriched = await enrich_watchlist_with_prices([db_item])
    return enriched[0]


@router.put("/{item_id}", response_model=schemas.WatchlistItemResponse)
async def update_watchlist_item(
    item_id: int,
    item_data: schemas.WatchlistItemUpdate,
    current_user: models.User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Update watchlist item (notes and/or target price)"""
    result = await db.execute(
        select(models.WatchlistItem).where(
            and_(
                models.WatchlistItem.id == item_id,
                models.WatchlistItem.user_id == current_user.id
            )
        )
    )
    db_item = result.scalar_one_or_none()
    
    if not db_item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Watchlist item not found"
        )
    
    # Update fields
    if item_data.notes is not None:
        db_item.notes = item_data.notes
    if item_data.target_price is not None:
        db_item.target_price = item_data.target_price
    
    await db.commit()
    await db.refresh(db_item)
    
    # Return with current price data
    enriched = await enrich_watchlist_with_prices([db_item])
    return enriched[0]


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_from_watchlist(
    item_id: int,
    current_user: models.User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Remove a stock from watchlist"""
    result = await db.execute(
        select(models.WatchlistItem).where(
            and_(
                models.WatchlistItem.id == item_id,
                models.WatchlistItem.user_id == current_user.id
            )
        )
    )
    db_item = result.scalar_one_or_none()
    
    if not db_item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Watchlist item not found"
        )
    
    await db.delete(db_item)
    await db.commit()
    
    return None