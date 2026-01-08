"""
Watchlist Schemas - Pydantic models for watchlist endpoints
"""
from pydantic import BaseModel, Field, field_serializer
from typing import Optional, List
from datetime import datetime
from uuid import UUID


class WatchlistAdd(BaseModel):
    """Add stock to watchlist"""
    ticker: str = Field(..., min_length=1, max_length=10, description="Stock ticker symbol")
    notes: Optional[str] = Field(None, max_length=500, description="Optional notes about this stock")


class WatchlistUpdate(BaseModel):
    """Update watchlist item"""
    notes: Optional[str] = Field(None, max_length=500, description="Updated notes")


class WatchlistItem(BaseModel):
    """Watchlist item response"""
    id: UUID
    user_id: UUID
    ticker: str
    added_at: datetime
    notes: Optional[str] = None
    warning: Optional[str] = None
    target_price: Optional[float] = None  

    
    @field_serializer('id', 'user_id')
    def serialize_uuid(self, value: UUID) -> str:
        return str(value)
    
    class Config:
        from_attributes = True


class WatchlistWithQuote(BaseModel):
    """Watchlist item with current stock quote"""
    id: str
    ticker: str
    added_at: datetime
    notes: Optional[str] = None
    current_price: Optional[float] = None
    change_percent: Optional[float] = None
    company_name: Optional[str] = None


class WatchlistResponse(BaseModel):
    """Complete watchlist response"""
    items: List[WatchlistWithQuote]
    count: int
    limit: int
    subscription_tier: str