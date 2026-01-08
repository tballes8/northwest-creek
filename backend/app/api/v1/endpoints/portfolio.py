"""
Portfolio API Endpoints - Track stock positions and calculate P&L
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import List
from decimal import Decimal

from app.db.models import User, Portfolio
from app.schemas.portfolio import (
    PortfolioAdd,
    PortfolioUpdate,
    PortfolioPosition,
    PortfolioSummary
)
from app.api.dependencies import get_current_user
from app.db.session import get_db
from app.services.market_data import market_data_service

router = APIRouter()

# Subscription limits for portfolio POSITIONS (not unique tickers!)
PORTFOLIO_LIMITS = {
    "free": 5,        # 5 positions total (can be same ticker multiple times)
    "pro": 50,        # 50 positions
    "enterprise": 999999  # Unlimited
}


@router.post("/", response_model=PortfolioPosition, status_code=status.HTTP_201_CREATED)
async def add_position(
	position: PortfolioAdd,
	current_user: User = Depends(get_current_user),
	db: AsyncSession = Depends(get_db)
):
	"""
	Add a stock position to your portfolio
	
	**Track individual purchase lots:**
	- Same ticker can have multiple entries (different purchase dates/prices)
	- Each lot tracked separately for tax purposes
	- Useful for dollar-cost averaging
	
	**Limits by subscription tier:**
	- Free: 5 total positions
	- Pro: 50 total positions
	- Enterprise: Unlimited
	
	**Example:** You can add AAPL bought on 1/1/2024 @ $150 AND AAPL bought on 2/1/2024 @ $160
	"""
	# Check current count
	count_result = await db.execute(
		select(func.count(Portfolio.id)).where(Portfolio.user_id == current_user.id)
	)
	current_count = count_result.scalar()
	
	# Check limit
	limit = PORTFOLIO_LIMITS.get(current_user.subscription_tier, 5)
	if current_count >= limit:
		# Get upgrade info
		if current_user.subscription_tier == "free":
			upgrade_msg = "Upgrade to Pro for 50 entries ($29/month) or Enterprise for unlimited entries ($99/month)!"
		elif current_user.subscription_tier == "pro":
			upgrade_msg = "Upgrade to Enterprise for unlimited entries ($99/month)!"
		else:
			upgrade_msg = "Contact support for custom limits."
		
		raise HTTPException(
			status_code=status.HTTP_403_FORBIDDEN,
			detail=f"Portfolio limit reached! You have {current_count}/{limit} stock purchases tracked. {upgrade_msg}"
		)
	
	# Verify ticker exists
	try:
		await market_data_service.get_quote(position.ticker)
	except ValueError:
		raise HTTPException(
			status_code=status.HTTP_404_NOT_FOUND,
			detail=f"Ticker '{position.ticker.upper()}' not found"
		)
	
	# Create position
	portfolio_position = Portfolio(
		user_id=current_user.id,
		ticker=position.ticker.upper(),
		quantity=Decimal(str(position.quantity)),
		buy_price=Decimal(str(position.buy_price)),
		buy_date=position.buy_date,
		notes=position.notes
	)
	
	db.add(portfolio_position)
	await db.commit()
	await db.refresh(portfolio_position)
	
	# Get current price
	try:
		quote = await market_data_service.get_quote(position.ticker)
		current_price = quote["price"]
	except:
		current_price = None
	
	# Calculate values
	total_cost = float(portfolio_position.buy_price) * float(portfolio_position.quantity)
	current_value = current_price * float(portfolio_position.quantity) if current_price else None
	profit_loss = (current_value - total_cost) if current_value else None
	profit_loss_percent = ((profit_loss / total_cost) * 100) if profit_loss else None
	
	# Create response
	response = PortfolioPosition(
		id=str(portfolio_position.id),
		ticker=portfolio_position.ticker,
		quantity=float(portfolio_position.quantity),
		buy_price=float(portfolio_position.buy_price),
		buy_date=portfolio_position.buy_date,
		notes=portfolio_position.notes,
		created_at=portfolio_position.created_at,
		current_price=current_price,
		current_value=current_value,
		total_cost=total_cost,
		profit_loss=profit_loss,
		profit_loss_percent=profit_loss_percent
	)
	
	# Add warning if near limit
	new_count = current_count + 1
	remaining = limit - new_count
	
	if remaining > 0 and remaining <= 2:  # Warning at 2 or fewer remaining
		if current_user.subscription_tier == "free":
			warning = f"⚠️ Warning: Only {remaining} stock purchase{'s' if remaining != 1 else ''} remaining! Upgrade to Pro for 50 entries ($29/month)."
		elif current_user.subscription_tier == "pro":
			warning = f"⚠️ Warning: Only {remaining} stock purchase{'s' if remaining != 1 else ''} remaining! Upgrade to Enterprise for unlimited entries ($99/month)."
		else:
			warning = None
		
		# Add warning to response (we'll need to update the schema)
		response.warning = warning
	
	return response


@router.get("/", response_model=PortfolioSummary)
async def get_portfolio(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Get your complete portfolio with profit/loss calculations
    
    **Returns:**
    - All positions (including multiple lots of same ticker)
    - Each lot shown separately with individual P&L
    - Grouped summary by ticker
    - Total portfolio value
    - Best and worst performers
    
    **Example:** If you bought AAPL 3 times, you'll see 3 separate entries
    """
    # Get all positions
    result = await db.execute(
        select(Portfolio)
        .where(Portfolio.user_id == current_user.id)
        .order_by(Portfolio.ticker, Portfolio.buy_date.desc())  # Group by ticker, newest first
    )
    positions = result.scalars().all()
    
    limit = PORTFOLIO_LIMITS.get(current_user.subscription_tier, 5)
    
    if not positions:
        return PortfolioSummary(
            positions=[],
            total_positions=0,
            total_invested=0.0,
            total_current_value=0.0,
            total_profit_loss=0.0,
            total_profit_loss_percent=0.0,
            positions_used=0,
            positions_limit=limit
        )
    
    # Calculate portfolio metrics
    portfolio_positions = []
    total_invested = 0.0
    total_current_value = 0.0
    ticker_performance = {}  # Track performance by ticker
    
    for pos in positions:
        # Get current price (cache it per ticker to avoid duplicate calls)
        ticker_upper = pos.ticker.upper()
        if ticker_upper not in ticker_performance:
            try:
                quote = await market_data_service.get_quote(ticker_upper)
                ticker_performance[ticker_upper] = {"price": quote["price"], "lots": []}
            except:
                ticker_performance[ticker_upper] = {"price": None, "lots": []}
        
        current_price = ticker_performance[ticker_upper]["price"]
        
        # Calculate values for this lot
        quantity = float(pos.quantity)
        buy_price = float(pos.buy_price)
        total_cost = buy_price * quantity
        current_value = current_price * quantity if current_price else None
        profit_loss = (current_value - total_cost) if current_value else None
        profit_loss_percent = ((profit_loss / total_cost) * 100) if profit_loss else None
        
        # Track totals
        total_invested += total_cost
        if current_value:
            total_current_value += current_value
        
        # Track this lot
        ticker_performance[ticker_upper]["lots"].append({
            "profit_loss_percent": profit_loss_percent,
            "profit_loss": profit_loss
        })
        
        portfolio_positions.append(PortfolioPosition(
            id=str(pos.id),
            ticker=ticker_upper,
            quantity=quantity,
            buy_price=buy_price,
            buy_date=pos.buy_date,
            notes=pos.notes,
            created_at=pos.created_at,
            current_price=current_price,
            current_value=current_value,
            total_cost=total_cost,
            profit_loss=profit_loss,
            profit_loss_percent=profit_loss_percent
        ))
    
    # Calculate best/worst performers (by ticker, across all lots)
    best_performer = None
    worst_performer = None
    best_return = float('-inf')
    worst_return = float('inf')
    
    for ticker, data in ticker_performance.items():
        # Calculate average return across all lots
        valid_lots = [lot for lot in data["lots"] if lot["profit_loss_percent"] is not None]
        if valid_lots:
            avg_return = sum(lot["profit_loss_percent"] for lot in valid_lots) / len(valid_lots)
            total_pl = sum(lot["profit_loss"] for lot in valid_lots)
            
            if avg_return > best_return:
                best_return = avg_return
                best_performer = {
                    "ticker": ticker,
                    "return": round(avg_return, 2),
                    "profit": round(total_pl, 2),
                    "lots": len(data["lots"])
                }
            
            if avg_return < worst_return:
                worst_return = avg_return
                worst_performer = {
                    "ticker": ticker,
                    "return": round(avg_return, 2),
                    "loss": round(total_pl, 2),
                    "lots": len(data["lots"])
                }
    
    # Calculate total P&L
    total_profit_loss = total_current_value - total_invested
    total_profit_loss_percent = ((total_profit_loss / total_invested) * 100) if total_invested else 0.0
    
    return PortfolioSummary(
        positions=portfolio_positions,
        total_positions=len(positions),
        total_invested=round(total_invested, 2),
        total_current_value=round(total_current_value, 2),
        total_profit_loss=round(total_profit_loss, 2),
        total_profit_loss_percent=round(total_profit_loss_percent, 2),
        best_performer=best_performer,
        worst_performer=worst_performer,
        positions_used=len(positions),
        positions_limit=limit
    )


@router.delete("/{position_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_position(
    position_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Remove a specific position/lot from your portfolio
    
    **Note:** This removes ONE position entry, not all positions of a ticker
    """
    result = await db.execute(
        select(Portfolio).where(
            Portfolio.id == position_id,
            Portfolio.user_id == current_user.id
        )
    )
    position = result.scalar_one_or_none()
    
    if not position:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Position not found"
        )
    
    await db.delete(position)
    await db.commit()
    
    return None


@router.patch("/{position_id}", response_model=PortfolioPosition)
async def update_position(
    position_id: str,
    update_data: PortfolioUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Update a specific position/lot
    
    **Useful for:**
    - Correcting entry errors
    - Updating notes
    - Adjusting quantity after partial sale
    """
    result = await db.execute(
        select(Portfolio).where(
            Portfolio.id == position_id,
            Portfolio.user_id == current_user.id
        )
    )
    position = result.scalar_one_or_none()
    
    if not position:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Position not found"
        )
    
    # Update fields
    if update_data.quantity is not None:
        position.quantity = Decimal(str(update_data.quantity))
    if update_data.buy_price is not None:
        position.buy_price = Decimal(str(update_data.buy_price))
    if update_data.buy_date is not None:
        position.buy_date = update_data.buy_date
    if update_data.notes is not None:
        position.notes = update_data.notes
    
    await db.commit()
    await db.refresh(position)
    
    # Get current price and calculate
    try:
        quote = await market_data_service.get_quote(position.ticker)
        current_price = quote["price"]
    except:
        current_price = None
    
    total_cost = float(position.buy_price) * float(position.quantity)
    current_value = current_price * float(position.quantity) if current_price else None
    profit_loss = (current_value - total_cost) if current_value else None
    profit_loss_percent = ((profit_loss / total_cost) * 100) if profit_loss else None
    
    return PortfolioPosition(
        id=str(position.id),
        ticker=position.ticker,
        quantity=float(position.quantity),
        buy_price=float(position.buy_price),
        buy_date=position.buy_date,
        notes=position.notes,
        created_at=position.created_at,
        current_price=current_price,
        current_value=current_value,
        total_cost=total_cost,
        profit_loss=profit_loss,
        profit_loss_percent=profit_loss_percent
    )