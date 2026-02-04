"""
Intraday market data endpoints using Massive API with Moving Averages

from fastapi import APIRouter, HTTPException, status
from typing import List, Dict, Any, Optional
from massive import RESTClient
from datetime import datetime, date, timedelta
import os
"""
from fastapi import APIRouter, Depends, Query, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional
from app.db.models import User
from app.api.dependencies import get_current_user
from app.db.session import get_db
from app.services.market_data import market_data_service
from app.services.company_info import get_sector_from_yfinance, get_company_basics
from massive import RESTClient
from massive.rest.models import TickerSnapshot, Agg

router = APIRouter()

# Initialize Massive client - use environment variable in production
# MASSIVE_API_KEY = os.getenv("MASSIVE_API_KEY", "Vu377TX0oKEohsfLJjFXRXJjeA6yj7sA")
# client = RESTClient(MASSIVE_API_KEY)
class Intraday:
    def __init__(self):
        self.base_url = "https://api.massive.com"
        self.api_key = settings.MASSIVE_API_KEY
        self.timeout = 10.0
        # Initialize Massive REST client for snapshot data
        self.rest_client = RESTClient(self.api_key)

    def safe_get_attr(obj, attr_path: str, default=None):
        """Safely get nested attributes from an object"""
        try:
            attrs = attr_path.split('.')
            value = obj
            for attr in attrs:
                value = getattr(value, attr)
            return value
        except (AttributeError, TypeError):
            return default


    def calculate_moving_average(prices: List[float], period: int) -> Optional[float]:
        """Calculate simple moving average for a given period"""
        if len(prices) < period:
            return None
        return sum(prices[-period:]) / period


@router.get("/intraday/{ticker}")
async def get_intraday_data(ticker: str) -> Dict[str, Any]:
    """
    Get intraday snapshot data for a ticker symbol
    Returns current price, session data, and recent activity
    """
    try:
        # Fetch snapshot data for the specific ticker
        snapshots = list(client.list_universal_snapshots(
            ticker_any_of=[ticker.upper()]
        ))
        
        if not snapshots:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"No intraday data found for ticker: {ticker}"
            )
        
        snapshot = snapshots[0]
        
        # Build response with safe attribute access
        data = {
            "ticker": safe_get_attr(snapshot, 'ticker'),
            "name": safe_get_attr(snapshot, 'name'),
            "type": safe_get_attr(snapshot, 'type'),
            "market_status": safe_get_attr(snapshot, 'market_status'),
            "price": safe_get_attr(snapshot, 'price'),
            "updated": safe_get_attr(snapshot, 'updated').isoformat() if safe_get_attr(snapshot, 'updated') else None,
            
            # Session data
            "session": {
                "open": safe_get_attr(snapshot, 'session.open'),
                "high": safe_get_attr(snapshot, 'session.high'),
                "low": safe_get_attr(snapshot, 'session.low'),
                "close": safe_get_attr(snapshot, 'session.close'),
                "volume": safe_get_attr(snapshot, 'session.volume'),
                "previous_close": safe_get_attr(snapshot, 'session.previous_close'),
                "change": safe_get_attr(snapshot, 'session.change'),
                "change_percent": safe_get_attr(snapshot, 'session.change_percent'),
            } if hasattr(snapshot, 'session') else None,
        }
        
        return data
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch intraday data: {str(e)}"
        )


@router.get("/intraday/{ticker}/bars-with-ma")
async def get_intraday_bars_with_moving_averages(ticker: str) -> Dict[str, Any]:
    """
    Get intraday aggregate bars at 15-minute intervals with 50-day and 200-day moving averages
    Returns bars for the current trading day with moving averages overlayed
    """
    try:
        today = date.today()
        ticker_upper = ticker.upper()
        
        # Fetch 15-minute intraday bars for today
        intraday_bars_iterator = client.list_aggregates(
            ticker=ticker_upper,
            multiplier=15,
            timespan="minute",
            from_=today.isoformat(),
            to=today.isoformat(),
            sort="asc"
        )
        
        intraday_bars = list(intraday_bars_iterator)
        
        # Fetch daily bars for moving average calculation
        # Get last 250 days to ensure we have enough data for 200-day MA
        end_date = today
        start_date = today - timedelta(days=250)
        
        daily_bars_iterator = client.list_aggregates(
            ticker=ticker_upper,
            multiplier=1,
            timespan="day",
            from_=start_date.isoformat(),
            to=end_date.isoformat(),
            sort="asc"
        )
        
        daily_bars = list(daily_bars_iterator)
        
        # Calculate moving averages from daily data
        daily_closes = [safe_get_attr(bar, 'close') for bar in daily_bars if safe_get_attr(bar, 'close') is not None]
        
        ma_50 = calculate_moving_average(daily_closes, 50)
        ma_200 = calculate_moving_average(daily_closes, 200)
        
        # Convert intraday bars to dict format
        bars_data = []
        for bar in intraday_bars:
            bar_dict = {
                "timestamp": bar.timestamp.isoformat() if hasattr(bar, 'timestamp') else None,
                "open": safe_get_attr(bar, 'open'),
                "high": safe_get_attr(bar, 'high'),
                "low": safe_get_attr(bar, 'low'),
                "close": safe_get_attr(bar, 'close'),
                "volume": safe_get_attr(bar, 'volume'),
                "vwap": safe_get_attr(bar, 'vwap'),
                # Add moving averages to each bar (they'll be flat lines across the chart)
                "ma_50": ma_50,
                "ma_200": ma_200
            }
            bars_data.append(bar_dict)
        
        # If no intraday data, try to get snapshot data as fallback
        if not bars_data:
            snapshots = list(client.list_universal_snapshots(
                ticker_any_of=[ticker_upper]
            ))
            
            if snapshots:
                snapshot = snapshots[0]
                if hasattr(snapshot, 'session'):
                    current_time = datetime.now()
                    bars_data = [{
                        "timestamp": current_time.isoformat(),
                        "open": safe_get_attr(snapshot, 'session.open'),
                        "high": safe_get_attr(snapshot, 'session.high'),
                        "low": safe_get_attr(snapshot, 'session.low'),
                        "close": safe_get_attr(snapshot, 'session.close'),
                        "volume": safe_get_attr(snapshot, 'session.volume'),
                        "ma_50": ma_50,
                        "ma_200": ma_200
                    }]
        
        return {
            "ticker": ticker_upper,
            "bars": bars_data,
            "timespan": "minute",
            "multiplier": 15,
            "count": len(bars_data),
            "moving_averages": {
                "ma_50": ma_50,
                "ma_200": ma_200
            }
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch intraday bars with moving averages: {str(e)}"
        )


@router.get("/intraday/batch")
async def get_batch_intraday_data(tickers: str) -> List[Dict[str, Any]]:
    """
    Get intraday data for multiple tickers
    Pass tickers as comma-separated string: ?tickers=AAPL,GOOGL,MSFT
    """
    try:
        ticker_list = [t.strip().upper() for t in tickers.split(',') if t.strip()]
        
        if not ticker_list:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No valid tickers provided"
            )
        
        snapshots = list(client.list_universal_snapshots(
            ticker_any_of=ticker_list
        ))
        
        results = []
        for snapshot in snapshots:
            data = {
                "ticker": safe_get_attr(snapshot, 'ticker'),
                "name": safe_get_attr(snapshot, 'name'),
                "type": safe_get_attr(snapshot, 'type'),
                "price": safe_get_attr(snapshot, 'price'),
                "change": safe_get_attr(snapshot, 'session.change') if hasattr(snapshot, 'session') else None,
                "change_percent": safe_get_attr(snapshot, 'session.change_percent') if hasattr(snapshot, 'session') else None,
                "market_status": safe_get_attr(snapshot, 'market_status'),
            }
            results.append(data)
        
        return results
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch batch intraday data: {str(e)}"
        )