"""
Price Alert Schemas - Pydantic models for price alerts
"""
from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime
from decimal import Decimal


class AlertCreate(BaseModel):
    """Create a price alert"""
    ticker: str = Field(..., min_length=1, max_length=10)
    target_price: float = Field(..., gt=0, description="Target price to trigger alert")
    condition: str = Field(..., pattern="^(above|below)$", description="'above' or 'below'")
    notes: Optional[str] = Field(None, max_length=500)


class AlertUpdate(BaseModel):
    """Update a price alert"""
    target_price: Optional[float] = Field(None, gt=0)
    condition: Optional[str] = Field(None, pattern="^(above|below)$")
    notes: Optional[str] = Field(None, max_length=500)
    is_active: Optional[bool] = None


class AlertResponse(BaseModel):
    """Price alert response"""
    id: str
    ticker: str
    target_price: float
    condition: str
    is_active: bool
    triggered_at: Optional[datetime] = None
    notes: Optional[str] = None
    created_at: datetime
    
    # Current status
    current_price: Optional[float] = None
    distance_to_target: Optional[float] = None
    distance_percent: Optional[float] = None
    
    # Warning
    warning: Optional[str] = None
    
    class Config:
        from_attributes = True


class AlertsSummary(BaseModel):
    """All alerts summary"""
    alerts: List[AlertResponse]
    total_alerts: int
    active_alerts: int
    triggered_alerts: int
    alerts_used: int
    alerts_limit: int
    