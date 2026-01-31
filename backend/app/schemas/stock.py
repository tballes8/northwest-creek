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


class NewsInsight(BaseModel):
    """Sentiment insight for a news article"""
    ticker: str = Field(..., description="Stock ticker")
    sentiment: str = Field(..., description="Sentiment: positive, negative, or neutral")
    sentiment_reasoning: str = Field(..., description="Reasoning for the sentiment")


class NewsArticle(BaseModel):
    """News article data"""
    title: str = Field(..., description="Article title")
    publisher: str = Field(..., description="Publisher name")
    published_utc: str = Field(..., description="Publication date/time in ISO format")
    article_url: str = Field(..., description="URL to full article")
    summary: Optional[str] = Field(None, description="Article summary/description")
    insights: Optional[List[NewsInsight]] = Field(None, description="Sentiment insights")

    class Config:
        json_schema_extra = {
            "example": {
                "title": "Apple Announces Record Quarterly Earnings",
                "publisher": "Financial Times",
                "published_utc": "2025-01-31T14:30:00Z",
                "article_url": "https://example.com/article",
                "summary": "Apple Inc. reported record revenue driven by strong iPhone sales.",
                "insights": [
                    {
                        "ticker": "AAPL",
                        "sentiment": "positive",
                        "sentiment_reasoning": "Strong quarterly earnings beat analyst expectations"
                    }
                ]
            }
        }


class NewsData(BaseModel):
    """News data response"""
    ticker: str = Field(..., description="Stock ticker")
    data: List[NewsArticle] = Field(..., description="Array of news articles")
    count: int = Field(..., description="Number of articles returned")

    class Config:
        json_schema_extra = {
            "example": {
                "ticker": "AAPL",
                "data": [
                    {
                        "title": "Apple Announces Record Quarterly Earnings",
                        "publisher": "Financial Times",
                        "published_utc": "2025-01-31T14:30:00Z",
                        "article_url": "https://example.com/article",
                        "summary": "Apple Inc. reported record revenue.",
                        "insights": [
                            {
                                "ticker": "AAPL",
                                "sentiment": "positive",
                                "sentiment_reasoning": "Strong earnings"
                            }
                        ]
                    }
                ],
                "count": 1
            }
        }
