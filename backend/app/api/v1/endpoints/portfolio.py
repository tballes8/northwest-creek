"""
Portfolio endpoints - Track your investments
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from typing import List
from uuid import UUID
from decimal import Decimal

from app.db.session import get_db
from app.core.security import get_current_user
from app.db.models import User, Portfolio
from app.schemas import portfolio as schemas
from app.services.market_data import market_data_service

router = APIRouter()


async def check_portfolio_limit(user: User, current_count: int) -> None:
    """Check if user has reached their portfolio limit"""
    limits = {
        "free": 3,
        "pro": 25,
        "enterprise": float('inf')
    }
    
    limit = limits.get(user.subscription_tier, 3)
    
    if current_count >= limit:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Portfolio limit reached. {user.subscription_tier.capitalize()} tier allows {int(limit)} positions."
        )


async def enrich_portfolio_with_prices(items: List[Portfolio]) -> List[schemas.PortfolioPositionResponse]:
    """Enrich portfolio positions with current market data"""
    enriched_items = []
    
    for item in items:
        # Default values
        current_price = None
        total_value = None
        profit_loss = None
        profit_loss_percent = None
        
        # Try to fetch current price
        try:
            quote = await market_data_service.get_quote(item.ticker)
            
            if quote and quote.get('price'):
                current_price = float(quote.get('price'))
                total_value = current_price * float(item.quantity)
                cost_basis = float(item.buy_price) * float(item.quantity)
                profit_loss = total_value - cost_basis
                profit_loss_percent = (profit_loss / cost_basis) * 100 if cost_basis > 0 else 0
        except Exception as e:
            print(f"Could not fetch data for {item.ticker}: {str(e)}")
        
        # Create response item
        enriched_items.append(schemas.PortfolioPositionResponse(
            id=item.id,
            user_id=item.user_id,
            ticker=item.ticker,
            quantity=float(item.quantity),
            buy_price=float(item.buy_price),
            buy_date=item.buy_date,
            notes=item.notes,
            created_at=item.created_at,
            updated_at=item.updated_at,
            current_price=current_price,
            total_value=total_value,
            profit_loss=profit_loss,
            profit_loss_percent=profit_loss_percent
        ))
    
    return enriched_items


@router.get("", response_model=schemas.PortfolioResponse)
async def get_portfolio(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get user's portfolio with current market data and totals"""
    # Get all positions from database
    result = await db.execute(
        select(Portfolio)
        .where(Portfolio.user_id == current_user.id)
        .order_by(Portfolio.created_at.desc())
    )
    positions = result.scalars().all()  # Extract list from Result
    
    # Enrich positions with current prices
    enriched_positions = await enrich_portfolio_with_prices(positions)  # Use your existing function
    
    # Calculate totals from enriched data
    total_current_value = 0.0
    total_cost_basis = 0.0
    
    for position in enriched_positions:
        if position.total_value is not None:
            total_current_value += position.total_value
        cost_basis = position.quantity * position.buy_price
        total_cost_basis += cost_basis
    
    # Calculate profit/loss
    total_profit_loss = total_current_value - total_cost_basis
    total_profit_loss_percent = (
        (total_profit_loss / total_cost_basis * 100) if total_cost_basis > 0 else 0
    )
    
    return schemas.PortfolioResponse(  # Return proper typed response
        positions=enriched_positions,
        total_current_value=total_current_value,
        total_profit_loss=total_profit_loss,
        total_profit_loss_percent=total_profit_loss_percent
    )


@router.post("/positions", response_model=schemas.PortfolioPositionResponse, status_code=status.HTTP_201_CREATED)
async def add_position(
    position_data: schemas.PortfolioPositionCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Add a position to portfolio"""
    # Check portfolio limit
    count_result = await db.execute(
        select(Portfolio)
        .where(Portfolio.user_id == current_user.id)
    )
    current_count = len(count_result.scalars().all())
    await check_portfolio_limit(current_user, current_count)
    
    # Verify ticker is valid by fetching quote
    try:
        quote = await market_data_service.get_quote(position_data.ticker)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid ticker symbol: {position_data.ticker}"
        )
    
    # Create portfolio position
    db_item = Portfolio(
        user_id=current_user.id,
        ticker=position_data.ticker.upper(),
        quantity=position_data.quantity,
        buy_price=position_data.buy_price,
        buy_date=position_data.buy_date,
        notes=position_data.notes
    )
    
    db.add(db_item)
    await db.commit()
    await db.refresh(db_item)
    
    # Return with current price data
    enriched = await enrich_portfolio_with_prices([db_item])
    return enriched[0]


@router.put("/positions/{position_id}", response_model=schemas.PortfolioPositionResponse)
async def update_position(
    position_id: UUID,
    position_data: schemas.PortfolioPositionUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Update portfolio position"""
    result = await db.execute(
        select(Portfolio).where(
            and_(
                Portfolio.id == position_id,
                Portfolio.user_id == current_user.id
            )
        )
    )
    db_item = result.scalar_one_or_none()
    
    if not db_item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Portfolio position not found"
        )
    
    # Update fields
    if position_data.quantity is not None:
        db_item.quantity = position_data.quantity
    if position_data.buy_price is not None:
        db_item.buy_price = position_data.buy_price
    if position_data.buy_date is not None:
        db_item.buy_date = position_data.buy_date
    if position_data.notes is not None:
        db_item.notes = position_data.notes
    
    await db.commit()
    await db.refresh(db_item)
    
    # Return with current price data
    enriched = await enrich_portfolio_with_prices([db_item])
    return enriched[0]


@router.delete("/positions/{position_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_position(
    position_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Remove a position from portfolio"""
    result = await db.execute(
        select(Portfolio).where(
            and_(
                Portfolio.id == position_id,
                Portfolio.user_id == current_user.id
            )
        )
    )
    db_item = result.scalar_one_or_none()
    
    if not db_item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Portfolio position not found"
        )
    
    await db.delete(db_item)
    await db.commit()
    
    return None