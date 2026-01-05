"""
Stock Data Schemas - Pydantic models for stock endpoints
"""
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime


class StockQuote(BaseModel):
    """Current stock quote"""
    ticker: str
    price: float = Field(..., description="Current stock price")
    change: float = Field(..., description="Price change from previous close")
    change_percent: float = Field(..., description="Percentage change")
    volume: int = Field(..., description="Trading volume")
    high: float = Field(..., description="Day's high")
    low: float = Field(..., description="Day's low")
    open: float = Field(..., description="Opening price")
    previous_close: float
    timestamp: str


class CompanyInfo(BaseModel):
    """Company information"""
    ticker: str
    name: str
    description: Optional[str] = None
    sector: Optional[str] = None
    industry: Optional[str] = None
    website: Optional[str] = None
    exchange: Optional[str] = None
    market_cap: Optional[float] = None
    phone: Optional[str] = None
    employees: Optional[int] = None
    country: Optional[str] = None


class HistoricalPrice(BaseModel):
    """Single day's price data"""
    date: str
    open: float
    high: float
    low: float
    close: float
    volume: int


class HistoricalData(BaseModel):
    """Historical price data response"""
    ticker: str
    data: List[HistoricalPrice]
    days: int


class StockError(BaseModel):
    """Error response"""
    error: str
    detail: Optional[str] = None