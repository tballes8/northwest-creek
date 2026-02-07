"""
Stock API Endpoints
"""
from fastapi import APIRouter, HTTPException, Query, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, Date
from datetime import date
from typing import Optional
from app.services.market_data import market_data_service
from app.db.session import get_db
from app.schemas.daily_snapshot import DailySnapshotItem, DailySnapshotResponse
from app.db.models import DailyStockSnapshot
from app.schemas.stock import (
    StockQuote,
    CompanyInfo,
    HistoricalData,
    HistoricalPrice,
    StockError,
    NewsData,
    NewsArticle,
)


router = APIRouter()
@router.get("/daily-snapshot", response_model=DailySnapshotResponse)
async def get_daily_snapshot(
    limit: int = Query(default=10, ge=1, le=50),
    tickers: Optional[str] = Query(default=None, description="Comma-separated tickers to filter by"),
    db: AsyncSession = Depends(get_db)
):
    """
    Get random stocks from today's daily snapshot
    
    **Parameters:**
    - **limit**: Number of random stocks to return (1-50, default 10)
    - **tickers**: Optional comma-separated list of tickers to filter by (e.g. "AAPL,MSFT,GOOGL")
    
    **Returns:**
    - Random selection of stocks from today's snapshot with change percentages
    """
    try:
        # Get today's date
        today = date.today()
        
        # Build base filter
        base_filter = DailyStockSnapshot.snapshot_date == today
        
        # If tickers provided, also filter by those tickers
        ticker_list = None
        if tickers:
            ticker_list = [t.strip().upper() for t in tickers.split(",") if t.strip()]
            if ticker_list:
                base_filter = (DailyStockSnapshot.snapshot_date == today) & (
                    DailyStockSnapshot.ticker.in_(ticker_list)
                )
        
        # Get total count
        count_query = select(func.count(DailyStockSnapshot.id)).where(base_filter)
        count_result = await db.execute(count_query)
        total_count = count_result.scalar() or 0
        
        if total_count == 0:
            return {
                "snapshots": [],
                "total_count": 0,
                "snapshot_date": today
            }
        
        # Get random snapshots
        query = (
            select(DailyStockSnapshot)
            .where(base_filter)
            .order_by(func.random())
            .limit(limit)
        )
        
        result = await db.execute(query)
        snapshots = result.scalars().all()
        
        return {
            "snapshots": snapshots,
            "total_count": total_count,
            "snapshot_date": today
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching daily snapshot: {str(e)}")

@router.get("/top-gainers")
async def get_top_gainers(limit: int = 10):
    """Get top stock gainers"""
    try:
        result = await market_data_service.get_top_gainers(limit)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/top-losers")
async def get_top_losers(limit: int = 10):
    """Get top stock losers"""
    try:
        return await market_data_service.get_top_losers(limit)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    
@router.get("/quote/{ticker}", response_model=StockQuote)
async def get_stock_quote(ticker: str):
    """
    Get current stock quote
    
    **Parameters:**
    - **ticker**: Stock symbol (e.g., AAPL, TSLA, MSFT)
    
    **Returns:**
    - Current price, change, volume, and other quote data
    """
    try:
        quote = await market_data_service.get_quote(ticker)
        return quote
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching quote: {str(e)}")


@router.get("/company/{ticker}", response_model=CompanyInfo)
async def get_company_info(ticker: str):
    """
    Get company information
    
    **Parameters:**
    - **ticker**: Stock symbol
    
    **Returns:**
    - Company name, description, sector, industry, and other details
    """
    try:
        company = await market_data_service.get_company_info(ticker)
        return company
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching company info: {str(e)}")


@router.get("/historical/{ticker}", response_model=HistoricalData)
async def get_historical_data(
    ticker: str,
    days: int = Query(default=90, ge=1, le=365, description="Number of days of historical data")
):
    """
    Get historical price data
    
    **Parameters:**
    - **ticker**: Stock symbol
    - **days**: Number of days of history (1-365, default 30)
    
    **Returns:**
    - Array of daily OHLCV (Open, High, Low, Close, Volume) data
    """
    try:
        historical = await market_data_service.get_historical_prices(ticker, days)
        return {
            "ticker": ticker.upper(),
            "data": historical,
            "days": len(historical)
        }
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching historical data: {str(e)}")

@router.get("/news/{ticker}", response_model=NewsData)
async def get_stock_news(
    ticker: str,
    limit: int = Query(default=3, ge=1, le=50, description="Number of news articles to fetch")
):
    """
    Get latest news articles for a stock
    
    **Parameters:**
    - **ticker**: Stock symbol
    - **limit**: Number of articles to return (1-50, default 3)
    
    **Returns:**
    - Array of news articles with titles, publishers, dates, URLs, and sentiment insights
    """
    try:
        news = await market_data_service.get_stock_news_rest(ticker, limit)
        return {
            "ticker": ticker.upper(),
            "data": news,
            "count": len(news)
        }
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching news: {str(e)}")
    
@router.get("/{ticker}", response_model=dict)
async def get_stock_overview(ticker: str):
    """
    Get complete stock overview (quote + company info)
    
    **Parameters:**
    - **ticker**: Stock symbol
    
    **Returns:**
    - Combined quote and company information
    """
    try:
        # Fetch both quote and company info concurrently
        import asyncio
        quote_task = market_data_service.get_quote(ticker)
        company_task = market_data_service.get_company_info(ticker)
        
        quote, company = await asyncio.gather(quote_task, company_task)
        
        return {
            "ticker": ticker.upper(),
            "quote": quote,
            "company": company
        }
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching stock overview: {str(e)}")
        