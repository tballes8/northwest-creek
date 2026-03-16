"""
Intraday market data endpoints using Financial Modeling Prep (FMP)
Includes batch quotes, single-ticker snapshots, and 15-minute bars with MAs.
"""
import asyncio
import re
from fastapi import APIRouter, HTTPException, status
from typing import List, Dict, Any, Optional, Set
from datetime import datetime, date, time as dt_time, timedelta, timezone
import pytz
import httpx
from app.services.fmp_client import get_fmp_client, API_KEY

router = APIRouter()

# Eastern time for display
ET = pytz.timezone('US/Eastern')


def _safe_error(e: Exception) -> str:
    """Strip API keys and sensitive params from error messages."""
    msg = str(e)
    msg = re.sub(r'apiKey=[^&\s\'"]+', 'apiKey=***', msg)
    msg = re.sub(r'apikey=[^&\s\'"]+', 'apikey=***', msg)
    msg = re.sub(r'api_key=[^&\s\'"]+', 'api_key=***', msg)
    msg = re.sub(r'token=[^&\s\'"]+', 'token=***', msg)
    return msg



async def _get_market_status() -> Optional[str]:
    """Fetch NASDAQ market status from FMP. Returns 'open', 'closed', or None."""
    try:
        data = await _fmp_get("exchange-market-hours", {"exchange": "NASDAQ"})
        if data and isinstance(data, list) and len(data) > 0:
            is_open = data[0].get("isMarketOpen")
            if is_open is None:
                is_open = data[0].get("isTheStockMarketOpen")
            if is_open is True:
                return "open"
            elif is_open is False:
                return "closed"
        return None
    except Exception:
        return None


async def _get_extended_hours_quotes(
    symbols: str,
    regular_quotes: Dict[str, Dict[str, Any]],
) -> Dict[str, Dict[str, Any]]:
    """
    Fetch extended-hours trade data from FMP and split into pre-market vs
    after-hours using timestamp logic:
      - Before 9:30 AM ET  → pre-market  (early_trading)
      - After  4:00 PM ET  → after-hours (late_trading)

    `regular_quotes` supplies previousClose per symbol so we can compute
    change / change_percent.

    Returns dict keyed by symbol:
        { "early": {price, change, change_percent}, "late": {…} }
    """
    try:
        data = await _fmp_get("batch-aftermarket-trade", {"symbols": symbols})
        if not data or not isinstance(data, list):
            return {}

        result: Dict[str, Dict[str, Any]] = {}
        for item in data:
            sym = item.get("symbol")
            if not sym:
                continue

            price = item.get("price") or item.get("askPrice")
            ts_ms = item.get("timestamp")

            # Determine which session this trade belongs to
            session = None
            if ts_ms is not None:
                try:
                    dt_utc = datetime.fromtimestamp(ts_ms / 1000, tz=timezone.utc)
                    dt_et = dt_utc.astimezone(ET)
                    trade_time = dt_et.time()

                    if trade_time < dt_time(9, 30):
                        session = "early"
                    elif trade_time >= dt_time(16, 0):
                        session = "late"
                except (ValueError, OSError):
                    pass

            # Compute change from previous close
            prev_close = regular_quotes.get(sym, {}).get("previousClose")
            ext_change = None
            ext_change_pct = None
            if price is not None and prev_close is not None and prev_close != 0:
                ext_change = round(price - prev_close, 4)
                ext_change_pct = round((ext_change / prev_close) * 100, 4)

            entry = {
                "price": price,
                "change": ext_change,
                "change_percent": ext_change_pct,
            }

            if sym not in result:
                result[sym] = {"early": None, "late": None}

            if session == "early":
                result[sym]["early"] = entry
            elif session == "late":
                result[sym]["late"] = entry
            else:
                # Timestamp missing or during regular hours — fall back to
                # current time of day to decide which badge to show
                now_et = datetime.now(ET).time()
                if now_et < dt_time(9, 30):
                    result[sym]["early"] = entry
                else:
                    result[sym]["late"] = entry

        return result
    except Exception:
        return {}


async def _get_holiday_dates() -> Set[date]:
    """Fetch NASDAQ holidays from FMP. Returns a set of fully-closed dates."""
    try:
        data = await _fmp_get("holidays-by-exchange", {"exchange": "NASDAQ"})
        if not data or not isinstance(data, list):
            return set()
        closed = set()
        for item in data:
            if item.get("isClosed") is True:
                try:
                    closed.add(date.fromisoformat(item["date"]))
                except (KeyError, ValueError):
                    pass
        return closed
    except Exception:
        return set()


def _is_trading_day(d: date, holidays: Set[date]) -> bool:
    """Return True if d is a weekday and not a market holiday."""
    return d.weekday() < 5 and d not in holidays


async def _fmp_get(path: str, params: dict = None) -> Any:
    """FMP request helper."""
    if params is None:
        params = {}
    params["apikey"] = API_KEY
    client = get_fmp_client()
    response = await client.get(path, params=params)
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

        # FMP /stable/batch-quote accepts comma-separated symbols
        symbols = ",".join(ticker_list)

        data = await _fmp_get("batch-quote", {"symbols": symbols})
        market_status = await _get_market_status()

        # Build lookup of regular-session previousClose for change calc
        regular_lookup: Dict[str, Dict[str, Any]] = {}
        if data and isinstance(data, list):
            for q in data:
                s = q.get("symbol")
                if s:
                    regular_lookup[s] = {"previousClose": q.get("previousClose")}

        ext_quotes = await _get_extended_hours_quotes(symbols, regular_lookup)

        if not data or not isinstance(data, list):
            data = []

        results = []
        for item in data:
            price = item.get("price")
            previous_close = item.get("previousClose")
            change = item.get("change")
            change_percent = item.get("changePercentage")
            sym = item.get("symbol")
            ext = ext_quotes.get(sym, {})
            early = ext.get("early") or {}
            late = ext.get("late") or {}

            results.append({
                "ticker": sym,
                "name": item.get("name"),
                "type": None,
                "price": price,
                "previous_close": previous_close,
                "change": change,
                "change_percent": change_percent,
                "market_status": market_status,
                # Extended hours — split by timestamp
                "early_trading_change": early.get("change"),
                "early_trading_change_percent": early.get("change_percent"),
                "late_trading_change": late.get("change"),
                "late_trading_change_percent": late.get("change_percent"),
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

        data = await _fmp_get("quote", {"symbol": ticker_upper})
        market_status = await _get_market_status()

        regular_lookup = {ticker_upper: {"previousClose": None}}
        if data and isinstance(data, list) and len(data) > 0:
            regular_lookup[ticker_upper]["previousClose"] = data[0].get("previousClose")

        ext_quotes = await _get_extended_hours_quotes(ticker_upper, regular_lookup)

        if not data or not isinstance(data, list) or len(data) == 0:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"No intraday data found for ticker: {ticker}"
            )

        item = data[0]
        ext = ext_quotes.get(ticker_upper, {})
        early = ext.get("early") or {}
        late = ext.get("late") or {}

        return {
            "ticker": item.get("symbol"),
            "name": item.get("name"),
            "type": None,
            "market_status": market_status,
            "price": item.get("price"),
            "updated": item.get("timestamp"),
            # Extended hours — split by timestamp
            "early_trading_change": early.get("change"),
            "early_trading_change_percent": early.get("change_percent"),
            "late_trading_change": late.get("change"),
            "late_trading_change_percent": late.get("change_percent"),
            # Session data mapped from FMP quote fields
            "session": {
                "open": item.get("open"),
                "high": item.get("dayHigh"),
                "low": item.get("dayLow"),
                "close": item.get("price"),
                "volume": item.get("volume"),
                "previous_close": item.get("previousClose"),
                "change": item.get("change"),
                "change_percent": item.get("changePercentage"),
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

        # Fetch holidays so we can skip non-trading days
        holidays = await _get_holiday_dates()

        # Walk backwards skipping weekends and holidays
        bars_found = False
        bars_data_raw = []
        data_date = today

        for days_back in range(15):
            check_date = today - timedelta(days=days_back)

            if not _is_trading_day(check_date, holidays):
                continue

            try:
                intraday_data = await _fmp_get(
                    "historical-chart/15min",
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

        # Fetch pre-computed SMAs from FMP technical indicators (parallel)
        sma_params = {"symbol": ticker_upper, "timeframe": "1day"}
        sma_20_data, sma_50_data, sma_200_data = await asyncio.gather(
            _fmp_get("technical-indicators/sma", {**sma_params, "periodLength": 20}),
            _fmp_get("technical-indicators/sma", {**sma_params, "periodLength": 50}),
            _fmp_get("technical-indicators/sma", {**sma_params, "periodLength": 200}),
        )

        # Extract latest SMA value from each response (newest-first array)
        def _extract_sma(data) -> Optional[float]:
            if data and isinstance(data, list) and len(data) > 0:
                return data[0].get("sma")
            return None

        ma_20 = _extract_sma(sma_20_data)
        ma_50 = _extract_sma(sma_50_data)
        ma_200 = _extract_sma(sma_200_data)

        # Process intraday bars — FMP returns newest-first, sort ascending
        bars_data_raw.sort(key=lambda x: x.get("date", ""))

        bars_data = []
        for bar in bars_data_raw:
            # FMP returns date as "2026-03-10 09:30:00" string
            bar_date_str = bar.get("date", "")
            timestamp_et = None
            if bar_date_str:
                try:
                    dt_et = ET.localize(datetime.strptime(bar_date_str, "%Y-%m-%d %H:%M:%S"))
                    timestamp_et = dt_et.isoformat()
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