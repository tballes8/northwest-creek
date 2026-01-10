from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime
from uuid import UUID
from decimal import Decimal


class WatchlistItemBase(BaseModel):
    """Base watchlist item schema"""
    ticker: str = Field(..., min_length=1, max_length=10, description="Stock ticker symbol")
    notes: Optional[str] = Field(None, max_length=500, description="Notes about the stock")
    target_price: Optional[float] = Field(None, ge=0, description="Price when started watching")


class WatchlistItemCreate(WatchlistItemBase):
    """Schema for creating a watchlist item"""
    pass


class WatchlistItemUpdate(BaseModel):
    """Schema for updating a watchlist item"""
    notes: Optional[str] = Field(None, max_length=500)
    target_price: Optional[float] = Field(None, ge=0)


class WatchlistItemInDB(WatchlistItemBase):
    """Watchlist item as stored in database"""
    id: UUID
    user_id: UUID
    added_at: datetime
    created_at: datetime
    
    class Config:
        from_attributes = True


class WatchlistItemResponse(WatchlistItemInDB):
    """Watchlist item with current market data"""
    price: Optional[float] = None
    change: Optional[float] = None
    change_percent: Optional[float] = None
    price_vs_target: Optional[float] = None
    price_vs_target_percent: Optional[float] = None


class WatchlistResponse(BaseModel):
    """Response containing all watchlist items"""
    items: list[WatchlistItemResponse]
    count: int