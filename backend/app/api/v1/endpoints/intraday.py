"""
Intraday market data endpoints using Financial Modeling Prep (FMP)
Includes batch quotes, single-ticker snapshots, and 15-minute bars with MAs.
"""
import re
from fastapi import APIRouter, HTTPException, status
from typing import List, Dict, Any, Optional
from datetime import datetime, date, timedelta, timezone
import pytz
import httpx
from app.config import get_settings

settings = get_settings()

router = APIRouter()

# Eastern time for display
ET = pytz.timezone('US/Eastern')

FMP_BASE = "https://financialmodelingprep.com/stable"
API_KEY = settings.MASSIVE_API_KEY


def _safe_error(e: Exception) -> str:
    """Strip API keys and sensitive params from error messages."""
    msg = str(e)
    msg = re.sub(r'apiKey=[^&\s\'"]+', 'apiKey=***', msg)
    msg = re.sub(r'apikey=[^&\s\'"]+', 'apikey=***', msg)
    msg = re.sub(r'api_key=[^&\s\'"]+', 'api_key=***', msg)
    msg = re.sub(r'token=[^&\s\'"]+', 'token=***', msg)
    return msg


def calculate_moving_average(prices: List[float], period: int) -> Optional[float]:
    """Calculate simple moving average for a given period"""
    if len(prices) < period:
        return None
    return sum(prices[-period:]) / period


async def _get_market_status(client: httpx.AsyncClient) -> Optional[str]:
    """Fetch NASDAQ market status from FMP. Returns 'open', 'closed', or None."""
    try:
        data = await _fmp_get(client, "exchange-market-hours", {"exchange": "NASDAQ"})
        if data and isinstance(data, list) and len(data) > 0:
            is_open = data[0].get("isMarketOpen") or data[0].get("isTheStockMarketOpen")
            if is_open is True:
                return "open"
            elif is_open is False:
                return "closed"
        return None
    except Exception:
        return None


async def _get_aftermarket_quotes(client: httpx.AsyncClient, symbols: str) -> Dict[str, Dict[str, Any]]:
    """
    Fetch aftermarket (pre/post market) quotes from FMP.
    Returns dict keyed by symbol with extended hours fields.
    """
    try:
        data = await _fmp_get(client, "batch-aftermarket-quote", {"symbols": symbols})
        if not data or not isinstance(data, list):
            return {}
        result = {}
        for item in data:
            sym = item.get("symbol")
            if not sym:
                continue
            price = item.get("price")
            prev_close = item.get("previousClose")
            # Compute change from previous close if both available
            ah_change = None
            ah_change_pct = None
            if price is not None and prev_close is not None and prev_close != 0:
                ah_change = round(price - prev_close, 4)
                ah_change_pct = round((ah_change / prev_close) * 100, 4)
            result[sym] = {
                "price": price,
                "change": ah_change,
                "change_percent": ah_change_pct,
                "timestamp": item.get("timestamp"),
            }
        return result
    except Exception:
        return {}


async def _fmp_get(client: httpx.AsyncClient, path: str, params: dict = None) -> Any:
    """FMP request helper."""
    if params is None:
        params = {}
    params["apikey"] = API_KEY
    response = await client.get(f"{FMP_BASE}/{path}", params=params, timeout=15.0)
    response.raise_for_status()
    return response.json()


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

        # FMP /stable/quote accepts comma-separated symbols
        symbols = ",".join(ticker_list)

        async with httpx.AsyncClient() as client:
            data = await _fmp_get(client, "quote", {"symbol": symbols})
            market_status = await _get_market_status(client)
            ah_quotes = await _get_aftermarket_quotes(client, symbols)

        if not data or not isinstance(data, list):
            data = []

        results = []
        for item in data:
            price = item.get("price")
            previous_close = item.get("previousClose")
            change = item.get("change")
            change_percent = item.get("changesPercentage")
            sym = item.get("symbol")
            ah = ah_quotes.get(sym, {})

            results.append({
                "ticker": sym,
                "name": item.get("name"),
                "type": None,
                "price": price,
                "previous_close": previous_close,
                "change": change,
                "change_percent": change_percent,
                "market_status": market_status,
                # Extended hours from FMP batch-aftermarket-quote
                "early_trading_change": ah.get("change"),
                "early_trading_change_percent": ah.get("change_percent"),
                "late_trading_change": ah.get("change"),
                "late_trading_change_percent": ah.get("change_percent"),
            })

        # Debug summary
        prices_found = sum(1 for r in results if r.get('price'))
        print(f"📊 Batch: {len(ticker_list)} requested, {len(results)} quotes returned, {prices_found} have prices")

        return results

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch batch intraday data: {_safe_error(e)}"
        )


@router.get("/{ticker}")
async def get_intraday_data(ticker: str) -> Dict[str, Any]:
    """
    Get intraday snapshot data for a ticker symbol
    Returns current price, session data, and recent activity
    """
    try:
        ticker_upper = ticker.upper()

        async with httpx.AsyncClient() as client:
            data = await _fmp_get(client, "quote", {"symbol": ticker_upper})
            market_status = await _get_market_status(client)
            ah_quotes = await _get_aftermarket_quotes(client, ticker_upper)

        if not data or not isinstance(data, list) or len(data) == 0:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"No intraday data found for ticker: {ticker}"
            )

        item = data[0]
        ah = ah_quotes.get(ticker_upper, {})

        return {
            "ticker": item.get("symbol"),
            "name": item.get("name"),
            "type": None,
            "market_status": market_status,
            "price": item.get("price"),
            "updated": item.get("timestamp"),
            # Extended hours from FMP batch-aftermarket-quote
            "early_trading_change": ah.get("change"),
            "early_trading_change_percent": ah.get("change_percent"),
            "late_trading_change": ah.get("change"),
            "late_trading_change_percent": ah.get("change_percent"),
            # Session data mapped from FMP quote fields
            "session": {
                "open": item.get("open"),
                "high": item.get("dayHigh"),
                "low": item.get("dayLow"),
                "close": item.get("price"),
                "volume": item.get("volume"),
                "previous_close": item.get("previousClose"),
                "change": item.get("change"),
                "change_percent": item.get("changesPercentage"),
            },
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch intraday data: {_safe_error(e)}"
        )


@router.get("/{ticker}/bars-with-ma")
async def get_intraday_bars_with_moving_averages(ticker: str) -> Dict[str, Any]:
    """
    Get 15-minute intraday bars with 50-day and 200-day moving averages.
    Returns bars for the current trading day (or most recent trading day if market is closed).
    """
    try:
        today = date.today()
        ticker_upper = ticker.upper()

        async with httpx.AsyncClient(timeout=30.0) as http_client:
            # Try today first, then go back up to 7 days to find most recent trading day
            bars_found = False
            bars_data_raw = []
            data_date = today

            for days_back in range(8):
                check_date = today - timedelta(days=days_back)

                try:
                    intraday_data = await _fmp_get(
                        http_client, "historical-chart/15min",
                        {
                            "symbol": ticker_upper,
                            "from": check_date.isoformat(),
                            "to": check_date.isoformat(),
                        }
                    )

                    if intraday_data and isinstance(intraday_data, list) and len(intraday_data) > 0:
                        bars_data_raw = intraday_data
                        bars_found = True
                        data_date = check_date
                        break

                except httpx.HTTPStatusError as e:
                    if e.response.status_code == 403:
                        raise HTTPException(
                            status_code=status.HTTP_403_FORBIDDEN,
                            detail="API key doesn't have access to intraday data. Please verify your FMP plan."
                        )
                    continue

            if not bars_found:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"No recent trading data found for {ticker_upper}"
                )

            # Fetch daily bars for moving average calculation (last 250 days)
            start_date = today - timedelta(days=365)
            daily_data = await _fmp_get(
                http_client, "historical-price-eod/full",
                {
                    "symbol": ticker_upper,
                    "from": start_date.isoformat(),
                    "to": today.isoformat(),
                }
            )

            # Extract daily closes for MA calculation
            daily_closes = []
            historical = []
            if isinstance(daily_data, dict):
                historical = daily_data.get("historical", [])
            elif isinstance(daily_data, list):
                historical = daily_data

            # FMP returns newest-first; reverse for MA calculation (oldest-first)
            historical.sort(key=lambda x: x.get("date", ""))
            daily_closes = [bar["close"] for bar in historical if "close" in bar]

            print(f"DEBUG: Got {len(daily_closes)} daily closes for {ticker_upper}")

            ma_20 = calculate_moving_average(daily_closes, 20)
            ma_50 = calculate_moving_average(daily_closes, 50)
            ma_200 = calculate_moving_average(daily_closes, 200)

            print(f"DEBUG: MA calculations - 20-day: {ma_20}, 50-day: {ma_50}, 200-day: {ma_200}")

            # Process intraday bars — FMP returns newest-first, sort ascending
            bars_data_raw.sort(key=lambda x: x.get("date", ""))

            bars_data = []
            for bar in bars_data_raw:
                # FMP returns date as "2026-03-10 09:30:00" string
                bar_date_str = bar.get("date", "")
                timestamp_et = None
                if bar_date_str:
                    try:
                        dt_utc = datetime.strptime(bar_date_str, "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc)
                        timestamp_et = dt_utc.astimezone(ET).isoformat()
                    except ValueError:
                        timestamp_et = bar_date_str

                bars_data.append({
                    "timestamp": timestamp_et,
                    "open": bar.get("open"),
                    "high": bar.get("high"),
                    "low": bar.get("low"),
                    "close": bar.get("close"),
                    "volume": bar.get("volume"),
                    "vwap": None,  # FMP intraday bars don't include VWAP
                    "ma_20": ma_20,
                    "ma_50": ma_50,
                    "ma_200": ma_200,
                })

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
                    "ma_200": ma_200,
                },
                "note": data_note,
            }

    except HTTPException:
        raise
    except httpx.HTTPStatusError as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch data from FMP API: {_safe_error(e)}"
        )
    except httpx.TimeoutException:
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail="Request to FMP API timed out"
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch intraday bars with moving averages: {_safe_error(e)}"
        )
