"""
Indicator Schemas - Pydantic models for technical analysis endpoints
"""
from pydantic import BaseModel, Field
from typing import List, Optional


class RSIResponse(BaseModel):
    """RSI indicator response"""
    ticker: str
    rsi: float = Field(..., description="RSI value (0-100)")
    signal: str = Field(..., description="Overbought, Oversold, or Neutral")
    interpretation: str


class MACDResponse(BaseModel):
    """MACD indicator response"""
    ticker: str
    macd: float = Field(..., description="MACD line value")
    signal: float = Field(..., description="Signal line value")
    histogram: float = Field(..., description="MACD histogram")
    trend: str = Field(..., description="Bullish or Bearish")
    interpretation: str


class MovingAveragesResponse(BaseModel):
    """Moving averages response"""
    ticker: str
    current_price: float
    sma_20: Optional[float] = None
    sma_50: Optional[float] = None
    sma_200: Optional[float] = None
    golden_cross: bool = Field(..., description="50-day above 200-day (bullish)")
    death_cross: bool = Field(..., description="50-day below 200-day (bearish)")


class BollingerBandsResponse(BaseModel):
    """Bollinger Bands response"""
    ticker: str
    current_price: float
    upper_band: float
    middle_band: float
    lower_band: float
    bandwidth: float
    position: str = Field(..., description="Price position relative to bands")
    interpretation: str


class TrendAnalysisResponse(BaseModel):
    """Trend analysis response"""
    ticker: str
    current_price: float
    trend: str = Field(..., description="Overall trend direction")
    strength: str = Field(..., description="Trend strength")
    above_sma_20: Optional[bool] = None
    above_sma_50: Optional[bool] = None
    above_sma_200: Optional[bool] = None
    support_level: Optional[float] = Field(None, description="Nearest support level")
    resistance_level: Optional[float] = Field(None, description="Nearest resistance level")


class CompleteAnalysisResponse(BaseModel):
    """Complete technical analysis"""
    ticker: str
    company_name: str
    current_price: float
    last_updated: str
    
    # Indicators
    rsi: Optional[RSIResponse] = None
    macd: Optional[MACDResponse] = None
    moving_averages: Optional[MovingAveragesResponse] = None
    bollinger_bands: Optional[BollingerBandsResponse] = None
    trend_analysis: Optional[TrendAnalysisResponse] = None
    
    # Trading signals
    signals: List[str] = Field(..., description="List of trading signals")
    overall_sentiment: str = Field(..., description="Bullish, Bearish, or Neutral")
    recommendation: str = Field(..., description="Buy, Sell, or Hold recommendation")