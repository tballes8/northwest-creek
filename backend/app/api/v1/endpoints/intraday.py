"""
Intraday market data endpoints using Massive API with Moving Averages
UPDATED FOR STOCKS ADVANCED PLAN
Now includes TRUE 15-minute bars!
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


@router.get("/batch")
async def get_batch_intraday_data(tickers: str) -> List[Dict[str, Any]]:
    """
    Get intraday data for multiple tickers
    Pass tickers as comma-separated string: ?tickers=AAPL,GOOGL,MSFT
    MUST be declared before /{ticker} to avoid FastAPI treating 'batch' as a ticker
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
    Get TRUE 15-minute intraday bars with 50-day and 200-day moving averages
    NOW WORKS WITH STOCKS ADVANCED PLAN!
    Returns bars for the current trading day (or most recent trading day if market is closed)
    """
    try:
        today = date.today()
        ticker_upper = ticker.upper()
        
        async with httpx.AsyncClient(timeout=30.0) as http_client:
            # Try today first, then go back up to 7 days to find most recent trading day
            bars_found = False
            intraday_data = None
            data_date = today
            
            for days_back in range(8):  # Try today and up to 7 days back
                check_date = today - timedelta(days=days_back)
                intraday_url = f"{BASE_URL}/v2/aggs/ticker/{ticker_upper}/range/15/minute/{check_date.isoformat()}/{check_date.isoformat()}"
                intraday_params = {"apiKey": MASSIVE_API_KEY, "adjusted": "true", "sort": "asc"}
                
                try:
                    intraday_response = await http_client.get(intraday_url, params=intraday_params)
                    intraday_response.raise_for_status()
                    intraday_data = intraday_response.json()
                    
                    # Check if we got bars
                    if "results" in intraday_data and intraday_data["results"] and len(intraday_data["results"]) > 0:
                        bars_found = True
                        data_date = check_date
                        break
                        
                except httpx.HTTPStatusError as e:
                    if e.response.status_code == 403:
                        raise HTTPException(
                            status_code=status.HTTP_403_FORBIDDEN,
                            detail="API key doesn't have access to minute-level data. Please verify your Stocks Advanced plan is active."
                        )
                    # Continue trying previous days
                    continue
            
            if not bars_found or not intraday_data:
                # If we still don't have data after 7 days, return error
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"No recent trading data found for {ticker_upper}"
                )
            
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
            
            print(f"DEBUG: Got {len(daily_closes)} daily closes for {ticker_upper}")
            
            ma_20 = calculate_moving_average(daily_closes, 20)
            ma_50 = calculate_moving_average(daily_closes, 50)
            ma_200 = calculate_moving_average(daily_closes, 200)
            
            print(f"DEBUG: MA calculations - 20-day: {ma_20}, 50-day: {ma_50}, 200-day: {ma_200}")
            
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
                        "ma_20": ma_20,
                        "ma_50": ma_50,
                        "ma_200": ma_200
                    }
                    bars_data.append(bar_dict)
            
            # Determine if showing today's or previous day's data
            is_today = data_date == today
            market_status = "open" if is_today else "closed"
            data_note = f"Showing most recent trading day ({data_date.strftime('%B %d, %Y')})" if not is_today else "Real-time data from today"
            
            return {
                "ticker": ticker_upper,
                "bars": bars_data,
                "timespan": "minute",
                "multiplier": 15,
                "count": len(bars_data),
                "data_date": data_date.isoformat(),
                "is_today": is_today,
                "market_status": market_status,
                "moving_averages": {
                    "ma_20": ma_20,
                    "ma_50": ma_50,
                    "ma_200": ma_200
                },
                "note": data_note
            }
        
    except HTTPException:
        raise
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