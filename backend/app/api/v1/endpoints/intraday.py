"""
Intraday market data endpoints using Massive API with Moving Averages
"""
from fastapi import APIRouter, HTTPException, status
from typing import List, Dict, Any, Optional
from massive import RESTClient
from datetime import datetime, date, timedelta
import os
import httpx

router = APIRouter()

# Initialize Massive client - use environment variable in production
MASSIVE_API_KEY = os.getenv("MASSIVE_API_KEY", "Vu377TX0oKEohsfLJjFXRXJjeA6yj7sA")
client = RESTClient(MASSIVE_API_KEY)
BASE_URL = "https://api.massive.com"


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


@router.get("/{ticker}")
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


@router.get("/{ticker}/bars-with-ma")
async def get_intraday_bars_with_moving_averages(ticker: str) -> Dict[str, Any]:
    """
    Get intraday aggregate bars at 15-minute intervals with 50-day and 200-day moving averages
    Returns bars for the current trading day with moving averages overlayed
    """
    try:
        today = date.today()
        ticker_upper = ticker.upper()
        
        async with httpx.AsyncClient(timeout=30.0) as http_client:
            # Fetch 15-minute intraday bars for today
            intraday_url = f"{BASE_URL}/v2/aggs/ticker/{ticker_upper}/range/15/minute/{today.isoformat()}/{today.isoformat()}"
            intraday_params = {"apiKey": MASSIVE_API_KEY, "adjusted": "true", "sort": "asc"}
            
            intraday_response = await http_client.get(intraday_url, params=intraday_params)
            intraday_response.raise_for_status()
            intraday_data = intraday_response.json()
            
            # Fetch daily bars for moving average calculation (last 250 days)
            end_date = today
            start_date = today - timedelta(days=250)
            
            daily_url = f"{BASE_URL}/v2/aggs/ticker/{ticker_upper}/range/1/day/{start_date.isoformat()}/{end_date.isoformat()}"
            daily_params = {"apiKey": MASSIVE_API_KEY, "adjusted": "true", "sort": "asc"}
            
            daily_response = await http_client.get(daily_url, params=daily_params)
            daily_response.raise_for_status()
            daily_data = daily_response.json()
            
            # Calculate moving averages from daily data
            daily_closes = []
            if "results" in daily_data and daily_data["results"]:
                daily_closes = [bar["c"] for bar in daily_data["results"] if "c" in bar]
            
            ma_50 = calculate_moving_average(daily_closes, 50)
            ma_200 = calculate_moving_average(daily_closes, 200)
            
            # Process intraday bars
            bars_data = []
            if "results" in intraday_data and intraday_data["results"]:
                for bar in intraday_data["results"]:
                    bar_dict = {
                        "timestamp": datetime.fromtimestamp(bar["t"] / 1000).isoformat() if "t" in bar else None,
                        "open": bar.get("o"),
                        "high": bar.get("h"),
                        "low": bar.get("l"),
                        "close": bar.get("c"),
                        "volume": bar.get("v"),
                        "vwap": bar.get("vw"),
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
        
    except httpx.HTTPStatusError as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch data from Massive API: {str(e)}"
        )
    except httpx.TimeoutException:
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail="Request to Massive API timed out"
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch intraday bars with moving averages: {str(e)}"
        )


@router.get("/batch")
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
