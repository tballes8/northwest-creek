"""
Portfolio Schemas - Pydantic models for portfolio tracking
"""
from pydantic import BaseModel, Field, field_serializer
from typing import List, Optional
from datetime import date, datetime
from decimal import Decimal
from uuid import UUID


class PortfolioAdd(BaseModel):
    """Add position to portfolio"""
    ticker: str = Field(..., min_length=1, max_length=10)
    quantity: float = Field(..., gt=0, description="Number of shares")
    buy_price: float = Field(..., gt=0, description="Price per share")
    buy_date: date = Field(..., description="Purchase date (YYYY-MM-DD)")
    notes: Optional[str] = Field(None, max_length=500)


class PortfolioUpdate(BaseModel):
    """Update portfolio position"""
    quantity: Optional[float] = Field(None, gt=0)
    buy_price: Optional[float] = Field(None, gt=0)
    buy_date: Optional[date] = None
    notes: Optional[str] = Field(None, max_length=500)


class PortfolioPosition(BaseModel):
    """Portfolio position response"""
    id: str
    ticker: str
    quantity: float
    buy_price: float
    buy_date: date
    notes: Optional[str] = None
    created_at: datetime
    
    # Calculated fields
    current_price: Optional[float] = None
    current_value: Optional[float] = None
    total_cost: float
    profit_loss: Optional[float] = None
    profit_loss_percent: Optional[float] = None
    
    # Warning message (optional)
    warning: Optional[str] = None
    
    class Config:
        from_attributes = True
        

class PortfolioSummary(BaseModel):
    """Complete portfolio summary"""
    positions: List[PortfolioPosition]
    total_positions: int
    total_invested: float
    total_current_value: float
    total_profit_loss: float
    total_profit_loss_percent: float
    best_performer: Optional[dict] = None
    worst_performer: Optional[dict] = None
    positions_used: int = Field(..., description="Number of positions used")
    positions_limit: int = Field(..., description="Maximum positions allowed")
