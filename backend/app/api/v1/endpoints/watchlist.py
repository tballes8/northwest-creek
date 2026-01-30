"""
Watchlist endpoints - Track stocks you're interested in
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from typing import List
from app.db.session import get_db
from app.core.security import get_current_user
from app.db.models import User, Watchlist  # ← SQLAlchemy models
from app.schemas import watchlist as schemas  # ← Pydantic schemas
from app.services.market_data import market_data_service
from uuid import UUID

router = APIRouter()

async def check_watchlist_limit(user: User, current_count: int) -> None:
    """Check if user has reached their watchlist limit"""
    limits = {
        "free": 5,
        "casual": 20,
        "active": 45,
        "professional": 75
    }
    
    limit = limits.get(user.subscription_tier, 0)
    
    if current_count >= limit:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Watchlist limit reached. {user.subscription_tier.capitalize()} tier allows {int(limit)} stocks."
        )


async def enrich_watchlist_with_prices(items: List[Watchlist]) -> List[schemas.WatchlistItemResponse]:
    """Enrich watchlist items with current market data"""
    enriched_items = []
    
    for item in items:
        try:
            quote = await market_data_service.get_quote(item.ticker)
            
            # Calculate price vs target if target_price is set
            price_vs_target = None
            price_vs_target_percent = None
            
            if item.target_price and quote.get('price'):
                # Convert Decimal to float for calculation
                target_price_float = float(item.target_price) if item.target_price else None
                current_price = float(quote.get('price'))
                
                if target_price_float:
                    price_vs_target = current_price - target_price_float
                    price_vs_target_percent = (price_vs_target / target_price_float) * 100
            
            enriched_items.append(schemas.WatchlistItemResponse(
                id=item.id,
                user_id=item.user_id,
                ticker=item.ticker,
                notes=item.notes,
                target_price=float(item.target_price) if item.target_price else None,  # ← Convert to float
                added_at=item.added_at,
                # created_at=getattr(item, 'created_at', None),  # ← Include created_at if exists
                price=float(quote.get('price')) if quote.get('price') else None,
                change=float(quote.get('change')) if quote.get('change') else None,
                change_percent=float(quote.get('change_percent')) if quote.get('change_percent') else None,
                price_vs_target=price_vs_target,
                price_vs_target_percent=price_vs_target_percent
            ))
        except Exception as e:
            print(f"Error enriching {item.ticker}: {e}")
            # If quote fetch fails, return item without price data
            enriched_items.append(schemas.WatchlistItemResponse(
                id=item.id,
                user_id=item.user_id,
                ticker=item.ticker,
                notes=item.notes,
                target_price=float(item.target_price) if item.target_price else None,
                added_at=item.added_at,
                # created_at=getattr(item, 'created_at', None)
            ))
    
    return enriched_items


@router.get("", response_model=schemas.WatchlistResponse)
async def get_watchlist(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get user's watchlist with current prices"""
    result = await db.execute(
        select(Watchlist)
        .where(Watchlist.user_id == current_user.id)
        .order_by(Watchlist.added_at.desc())
    )
    items = result.scalars().all()
    
    enriched_items = await enrich_watchlist_with_prices(items)
    
    return schemas.WatchlistResponse(
        items=enriched_items,
        count=len(enriched_items)
    )


@router.post("", response_model=schemas.WatchlistItemResponse, status_code=status.HTTP_201_CREATED)
async def add_to_watchlist(
    item_data: schemas.WatchlistItemCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Add a stock to watchlist"""
    result = await db.execute(
        select(Watchlist).where(
            and_(
                Watchlist.user_id == current_user.id,
                Watchlist.ticker == item_data.ticker.upper()
            )
        )
    )
    existing = result.scalar_one_or_none()
    
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"{item_data.ticker} is already in your watchlist"
        )
    
    count_result = await db.execute(
        select(Watchlist)
        .where(Watchlist.user_id == current_user.id)
    )
    current_count = len(count_result.scalars().all())
    await check_watchlist_limit(current_user, current_count)
    
    try:
        quote = await market_data_service.get_quote(item_data.ticker)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid ticker symbol: {item_data.ticker}"
        )
    
    db_item = Watchlist(
        user_id=current_user.id,
        ticker=item_data.ticker.upper(),
        notes=item_data.notes,
        target_price=item_data.target_price
    )
    
    db.add(db_item)
    await db.commit()
    await db.refresh(db_item)
    
    enriched = await enrich_watchlist_with_prices([db_item])
    return enriched[0]


@router.put("/{item_id}", response_model=schemas.WatchlistItemResponse)
async def update_watchlist_item(
    item_id: int,
    item_data: schemas.WatchlistItemUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Update watchlist item (notes and/or target price)"""
    result = await db.execute(
        select(Watchlist).where(
            and_(
                Watchlist.id == item_id,
                Watchlist.user_id == current_user.id
            )
        )
    )
    db_item = result.scalar_one_or_none()
    
    if not db_item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Watchlist item not found"
        )
    
    if item_data.notes is not None:
        db_item.notes = item_data.notes
    if item_data.target_price is not None:
        db_item.target_price = item_data.target_price
    
    await db.commit()
    await db.refresh(db_item)
    
    enriched = await enrich_watchlist_with_prices([db_item])
    return enriched[0]


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_from_watchlist(
    item_id: UUID,  # ← Change from int to UUID
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Remove a stock from watchlist"""
    result = await db.execute(
        select(Watchlist).where(
            and_(
                Watchlist.id == item_id,
                Watchlist.user_id == current_user.id
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
