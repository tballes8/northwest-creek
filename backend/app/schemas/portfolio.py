from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime, date
from uuid import UUID
from decimal import Decimal


class PortfolioPositionBase(BaseModel):
    """Base portfolio position schema"""
    ticker: str = Field(..., min_length=1, max_length=10, description="Stock ticker symbol")
    quantity: float = Field(..., gt=0, description="Number of shares")
    buy_price: float = Field(..., gt=0, description="Purchase price per share")
    buy_date: date = Field(..., description="Date of purchase")
    notes: Optional[str] = Field(None, max_length=500, description="Notes about the position")


class PortfolioPositionCreate(PortfolioPositionBase):
    """Schema for creating a portfolio position"""
    pass


class PortfolioPositionUpdate(BaseModel):
    """Schema for updating a portfolio position"""
    quantity: Optional[float] = Field(None, gt=0)
    buy_price: Optional[float] = Field(None, gt=0)
    buy_date: Optional[date] = None
    notes: Optional[str] = Field(None, max_length=500)


class PortfolioPositionInDB(PortfolioPositionBase):
    """Portfolio position as stored in database"""
    id: UUID
    user_id: UUID
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True


class PortfolioPositionResponse(PortfolioPositionInDB):
    """Portfolio position with current market data"""
    current_price: Optional[float] = None
    total_value: Optional[float] = None
    profit_loss: Optional[float] = None
    profit_loss_percent: Optional[float] = None 


class PortfolioResponse(BaseModel):
    """Response containing all portfolio positions"""
    positions: list[PortfolioPositionResponse]
    total_current_value: float
    total_profit_loss: float
    total_profit_loss_percent: float