"""
Stock API Endpoints
"""
import re
from fastapi import APIRouter, HTTPException, Query, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, Date
from datetime import date, datetime, timedelta
from typing import Optional
import asyncio
from app.api.dependencies import get_current_user
from app.services.market_data import market_data_service
from app.services.fmp_client import get_fmp_client, API_KEY
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


def _safe_error(e: Exception) -> str:
    """Strip API keys and sensitive params from error messages before sending to client."""
    msg = str(e)
    msg = re.sub(r'apiKey=[^&\s\'"]+', 'apiKey=***', msg)
    msg = re.sub(r'api_key=[^&\s\'"]+', 'api_key=***', msg)
    msg = re.sub(r'token=[^&\s\'"]+', 'token=***', msg)
    return msg


router = APIRouter()
@router.get("/daily-snapshot", response_model=DailySnapshotResponse)
async def get_daily_snapshot(
    limit: int = Query(default=10, ge=1, le=50),
    tickers: Optional[str] = Query(default=None, description="Comma-separated tickers to filter by"),
    asset_type: Optional[str] = Query(default=None, description="Filter by asset type, e.g. 'ETF' or 'CS'"),
    db: AsyncSession = Depends(get_db)
):
    """
    Get random stocks from today's daily snapshot

    **Parameters:**
    - **limit**: Number of random stocks to return (1-50, default 10)
    - **tickers**: Optional comma-separated list of tickers to filter by (e.g. "AAPL,MSFT,GOOGL")
    - **asset_type**: Optional asset type filter (e.g. "ETF", "CS")

    **Returns:**
    - Random selection of stocks from today's snapshot with change percentages
    """
    try:
        # Use the most recent snapshot date (handles weekends/holidays)
        latest_date_query = select(func.max(DailyStockSnapshot.snapshot_date))
        latest_date_result = await db.execute(latest_date_query)
        snapshot_date = latest_date_result.scalar() or date.today()

        # Build base filter
        base_filter = DailyStockSnapshot.snapshot_date == snapshot_date

        # If tickers provided, also filter by those tickers
        ticker_list = None
        if tickers:
            ticker_list = [t.strip().upper() for t in tickers.split(",") if t.strip()]
            if ticker_list:
                base_filter = base_filter & DailyStockSnapshot.ticker.in_(ticker_list)

        # If asset_type provided, filter by it
        if asset_type:
            base_filter = base_filter & (DailyStockSnapshot.asset_type == asset_type.upper())

        # Get total count
        count_query = select(func.count(DailyStockSnapshot.id)).where(base_filter)
        count_result = await db.execute(count_query)
        total_count = count_result.scalar() or 0

        if total_count == 0:
            return {
                "snapshots": [],
                "total_count": 0,
                "snapshot_date": snapshot_date
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
            "snapshot_date": snapshot_date
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching daily snapshot: {_safe_error(e)}")

@router.get("/top-gainers")
async def get_top_gainers(limit: int = 10):
    """Get top stock gainers (warrant/non-equity filtering handled by market_data_service)"""
    try:
        result = await market_data_service.get_top_gainers(limit)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=_safe_error(e))

@router.get("/top-losers")
async def get_top_losers(limit: int = 10):
    """Get top stock losers (warrant/non-equity filtering handled by market_data_service)"""
    try:
        result = await market_data_service.get_top_losers(limit)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=_safe_error(e))
    
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
        raise HTTPException(status_code=404, detail=_safe_error(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching quote: {_safe_error(e)}")


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
        raise HTTPException(status_code=404, detail=_safe_error(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching company info: {_safe_error(e)}")


@router.get("/historical/{ticker}", response_model=HistoricalData)
async def get_historical_data(
    ticker: str,
    days: int = Query(default=90, ge=1, le=1825, description="Number of days of historical data (max 5 years)")
):
    """
    Get historical price data
    
    **Parameters:**
    - **ticker**: Stock symbol
    - **days**: Number of days of history (1-1825, default 90)
    
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
        raise HTTPException(status_code=404, detail=_safe_error(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching historical data: {_safe_error(e)}")

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
        raise HTTPException(status_code=404, detail=_safe_error(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching news: {_safe_error(e)}")
    
@router.get("/news-market/latest")
async def get_market_news(
    limit: int = Query(default=3, ge=1, le=20, description="Number of news articles to fetch")
):
    """
    Get latest general financial/market news (not tied to a specific ticker).
    Used as a fallback when no ticker-specific news is available.
    """
    try:
        news = await market_data_service.get_general_market_news(limit)
        return {
            "data": news,
            "count": len(news)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching market news: {_safe_error(e)}")


@router.get("/treasury-rates")
async def get_treasury_rates():
    """
    Get current Treasury rates with day-over-day change.
    Fetches 2 most recent days from FMP and computes the diff.
    """
    # Fetch last 7 calendar days to ensure we get at least 2 trading days
    today = datetime.now().strftime("%Y-%m-%d")
    week_ago = (datetime.now() - timedelta(days=7)).strftime("%Y-%m-%d")

    MATURITIES = [
        ("month1", "1 Month"),
        ("month2", "2 Month"),
        ("month3", "3 Month"),
        ("month6", "6 Month"),
        ("year1", "1 Year"),
        ("year2", "2 Year"),
        ("year3", "3 Year"),
        ("year5", "5 Year"),
        ("year7", "7 Year"),
        ("year10", "10 Year"),
        ("year20", "20 Year"),
        ("year30", "30 Year"),
    ]

    try:
        client = get_fmp_client()
        resp = await client.get(
            "treasury-rates",
            params={"from": week_ago, "to": today, "apikey": API_KEY},
        )
        resp.raise_for_status()
        data = resp.json()

        if not data or not isinstance(data, list) or len(data) < 1:
            return {"rates": [], "date": None}

        # FMP returns newest-first
        current = data[0]
        previous = data[1] if len(data) >= 2 else {}

        rates = []
        for key, name in MATURITIES:
            val = current.get(key)
            prev_val = previous.get(key)
            change = round(val - prev_val, 3) if val is not None and prev_val is not None else None
            change_pct = round((change / prev_val) * 100, 2) if change is not None and prev_val and prev_val != 0 else None
            rates.append({
                "name": name,
                "value": val,
                "change": change,
                "changePercent": change_pct,
            })

        return {"rates": rates, "date": current.get("date")}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching treasury rates: {_safe_error(e)}")


@router.get("/commodity-quotes")
async def get_commodity_quotes():
    """
    Get quotes for 10 key commodities.

    Calls FMP batch-commodity-quotes, filters to our curated list,
    and returns name/price/change data for the dashboard card + modal.
    """
    # Symbol → display name mapping (order matters for the card preview)
    COMMODITY_MAP = {
        "GCUSD": "Gold",
        "CLUSD": "Crude Oil",
        "SIUSD": "Silver",
        "NGUSD": "Natural Gas",
        "HGUSD": "Copper",
        "BZUSD": "Brent Crude",
        "PLUSD": "Platinum",
        "KCUSX": "Coffee",
        "CCUSD": "Cocoa",
        "LBUSD": "Lumber",
    }

    try:
        client = get_fmp_client()
        resp = await client.get(
            "batch-commodity-quotes",
            params={"apikey": API_KEY},
        )
        resp.raise_for_status()
        data = resp.json()

        if not data or not isinstance(data, list):
            data = []

        # Build a lookup from the full batch response
        lookup = {item.get("symbol", "").upper(): item for item in data}

        # Identify symbols missing from the batch response
        missing = [sym for sym in COMMODITY_MAP if sym not in lookup]

        # Fallback: fetch individual quotes for any missing symbols
        if missing:
            async def _fetch_quote(sym: str):
                try:
                    r = await client.get(
                        "quote",
                        params={"symbol": sym, "apikey": API_KEY},
                    )
                    r.raise_for_status()
                    items = r.json()
                    if isinstance(items, list) and items:
                        return items[0]
                except Exception:
                    pass
                return None

            fallback_results = await asyncio.gather(
                *[_fetch_quote(sym) for sym in missing]
            )
            for sym, result in zip(missing, fallback_results):
                if result:
                    lookup[sym] = result

        commodities = []
        for symbol, display_name in COMMODITY_MAP.items():
            item = lookup.get(symbol)
            if not item:
                continue
            price = item.get("price")
            change = item.get("change")
            change_pct = item.get("changesPercentage")
            if change_pct is None:
                change_pct = item.get("changePercentage")
            if change_pct is None and price is not None and change is not None:
                prev = price - change
                if prev != 0:
                    change_pct = round((change / prev) * 100, 4)
            commodities.append({
                "name": display_name,
                "symbol": symbol,
                "value": price,
                "change": change,
                "changePercent": change_pct,
            })

        return {"commodities": commodities, "count": len(commodities)}

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error fetching commodity quotes: {_safe_error(e)}",
        )


@router.get("/crypto-quotes")
async def get_crypto_quotes():
    """
    Get quotes for 10 key cryptocurrencies.

    Calls FMP batch-crypto-quotes, filters to our curated list,
    and returns name/price/change data for the dashboard card + modal.
    Falls back to individual /stable/quote calls for any symbols
    missing from the batch response.
    """
    # Symbol → display name mapping (order matters for the card preview)
    CRYPTO_MAP = {
        "BTCUSD": "Bitcoin",
        "ETHUSD": "Ethereum",
        "SOLUSD": "Solana",
        "XRPUSD": "XRP",
        "BNBUSD": "BNB",
        "ADAUSD": "Cardano",
        "DOGEUSD": "Dogecoin",
        "AVAXUSD": "Avalanche",
        "LINKUSD": "Chainlink",
        "DOTUSD": "Polkadot",
    }

    try:
        client = get_fmp_client()
        resp = await client.get(
            "batch-crypto-quotes",
            params={"apikey": API_KEY},
        )
        resp.raise_for_status()
        data = resp.json()

        if not data or not isinstance(data, list):
            data = []

        # Build a lookup from the full batch response
        lookup = {item.get("symbol", "").upper(): item for item in data}

        # Identify symbols missing from the batch response
        missing = [sym for sym in CRYPTO_MAP if sym not in lookup]

        # Fallback: fetch individual quotes for any missing symbols
        if missing:
            async def _fetch_quote(sym: str):
                try:
                    r = await client.get(
                        "quote",
                        params={"symbol": sym, "apikey": API_KEY},
                    )
                    r.raise_for_status()
                    items = r.json()
                    if isinstance(items, list) and items:
                        return items[0]
                except Exception:
                    pass
                return None

            fallback_results = await asyncio.gather(
                *[_fetch_quote(sym) for sym in missing]
            )
            for sym, result in zip(missing, fallback_results):
                if result:
                    lookup[sym] = result

        cryptos = []
        for symbol, display_name in CRYPTO_MAP.items():
            item = lookup.get(symbol)
            if not item:
                continue
            price = item.get("price")
            change = item.get("change")
            change_pct = item.get("changesPercentage")
            if change_pct is None:
                change_pct = item.get("changePercentage")
            if change_pct is None and price is not None and change is not None:
                prev = price - change
                if prev != 0:
                    change_pct = round((change / prev) * 100, 4)
            cryptos.append({
                "name": display_name,
                "symbol": symbol,
                "value": price,
                "change": change,
                "changePercent": change_pct,
            })

        return {"cryptos": cryptos, "count": len(cryptos)}

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error fetching crypto quotes: {_safe_error(e)}",
        )


@router.get("/index-quotes")
async def get_index_quotes():
    """
    Get quotes for 10 key market indexes.

    Calls FMP batch-index-quotes, filters to our curated list,
    and returns name/price/change data for the dashboard card + modal.
    Falls back to individual /stable/quote calls for any symbols
    missing from the batch response.
    """
    # Symbol → (display name, is_points) mapping
    # is_points=True means display raw value (no $ prefix)
    INDEX_MAP = {
        "^GSPC": ("S&P 500", True),
        "^DJI": ("Dow Jones", True),
        "^IXIC": ("NASDAQ Composite", True),
        "^NDX": ("NASDAQ 100", True),
        "^RUT": ("Russell 2000", True),
        "^VIX": ("VIX", True),
        "^GSPTSE": ("S&P/TSX", True),
        "^FTSE": ("FTSE 100", True),
        "^GDAXI": ("DAX", True),
        "^N225": ("Nikkei 225", True),
    }

    try:
        client = get_fmp_client()
        resp = await client.get(
            "batch-index-quotes",
            params={"apikey": API_KEY},
        )
        resp.raise_for_status()
        data = resp.json()

        if not data or not isinstance(data, list):
            data = []

        # Build a lookup from the full batch response
        lookup = {item.get("symbol", ""): item for item in data}

        # Identify symbols missing from the batch response
        missing = [sym for sym in INDEX_MAP if sym not in lookup]

        # Fallback: fetch individual quotes for any missing symbols
        if missing:
            async def _fetch_quote(sym: str):
                try:
                    r = await client.get(
                        "quote",
                        params={"symbol": sym, "apikey": API_KEY},
                    )
                    r.raise_for_status()
                    items = r.json()
                    if isinstance(items, list) and items:
                        return items[0]
                except Exception:
                    pass
                return None

            fallback_results = await asyncio.gather(
                *[_fetch_quote(sym) for sym in missing]
            )
            for sym, result in zip(missing, fallback_results):
                if result:
                    lookup[sym] = result

        indexes = []
        for symbol, (display_name, _) in INDEX_MAP.items():
            item = lookup.get(symbol)
            if not item:
                continue
            price = item.get("price")
            change = item.get("change")
            change_pct = item.get("changesPercentage")
            if change_pct is None:
                change_pct = item.get("changePercentage")
            if change_pct is None and price is not None and change is not None:
                prev = price - change
                if prev != 0:
                    change_pct = round((change / prev) * 100, 4)
            indexes.append({
                "name": display_name,
                "symbol": symbol,
                "value": price,
                "change": change,
                "changePercent": change_pct,
            })

        return {"indexes": indexes, "count": len(indexes)}

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error fetching index quotes: {_safe_error(e)}",
        )


@router.get("/ipos")
async def get_ipos():
    """
    Get upcoming IPOs from FMP IPO calendar.
    Returns upcoming (next 21 days) and recent (last 7 days) IPOs.
    Filters out warrants, rights, units, foreign listings, and SPAC shells.
    """
    today = datetime.now().strftime("%Y-%m-%d")
    seven_days_ago = (datetime.now() - timedelta(days=7)).strftime("%Y-%m-%d")
    twenty_one_days_ahead = (datetime.now() + timedelta(days=21)).strftime("%Y-%m-%d")

    # US exchanges we care about
    US_EXCHANGES = {"NYSE", "NASDAQ", "AMEX", "NYSEAMERICAN", "NYSEARCA", "BATS"}

    def _is_junk_symbol(symbol: str) -> bool:
        """Filter out warrants, rights, units, and foreign tickers."""
        if not symbol or symbol == "N/A":
            return True
        s = symbol.upper().strip()
        # Foreign listings contain dots (NA.KQ, MTEK.TO, 509A.JP)
        if "." in s:
            return True
        # Warrants typically end in W or WS (FGIIW, SVIVW, ADACW)
        if len(s) > 4 and s.endswith("W"):
            return True
        if s.endswith("WS") or s.endswith("WT"):
            return True
        # Rights end in R (IEAGR, CRANR, HCACR)
        if len(s) > 4 and s.endswith("R"):
            return True
        # Units end in U (SUMAU, GLEDU, CTAAU)
        if len(s) > 4 and s.endswith("U"):
            return True
        return False

    def _safe_float(val) -> Optional[float]:
        """Safely convert a value to float, return None on failure."""
        if val is None:
            return None
        try:
            return float(val)
        except (TypeError, ValueError):
            return None

    def _parse_price_range(range_str: str):
        """Parse '10.00 - 12.00' into (low, high) floats."""
        if not range_str or not isinstance(range_str, str):
            return None, None
        parts = range_str.split("-")
        if len(parts) < 2:
            return None, None
        low = _safe_float(parts[0].strip())
        high = _safe_float(parts[-1].strip())
        return low, high

    def _build_ipo_item(ipo: dict, status: str) -> dict:
        """Map FMP IPO response to our frontend schema."""
        low, high = _parse_price_range(ipo.get("priceRange"))
        return {
            "ticker": ipo.get("symbol", "N/A"),
            "issuer_name": ipo.get("company", "Unknown"),
            "listing_date": ipo.get("date"),
            "announced_date": None,
            "final_issue_price": _safe_float(ipo.get("price")),
            "lowest_offer_price": low,
            "highest_offer_price": high,
            "total_offer_size": ipo.get("numberOfShares"),
            "shares_outstanding": None,
            "primary_exchange": ipo.get("exchange"),
            "security_type": None,
            "security_description": ipo.get("actions"),
            "ipo_status": status,
            "last_updated": None,
            "currency_code": "USD",
            "min_shares_offered": None,
            "max_shares_offered": None,
        }

    results = {
        "upcoming": [],
        "pending": [],
    }

    MAX_PER_TAB = 25

    try:
        client = get_fmp_client()

        # Fetch upcoming and recent IPOs in parallel
        upcoming_resp, recent_resp = await asyncio.gather(
            client.get(
                "ipos-calendar",
                params={"from": today, "to": twenty_one_days_ahead, "apikey": API_KEY},
            ),
            client.get(
                "ipos-calendar",
                params={"from": seven_days_ago, "to": today, "apikey": API_KEY},
            ),
            return_exceptions=True,
        )

        def _process_ipo_response(resp, status_label: str, key: str):
            if isinstance(resp, Exception):
                print(f"IPO fetch error for {key}: {resp}")
                return
            if resp.status_code != 200:
                return
            data = resp.json()
            if not isinstance(data, list):
                return
            for ipo in data:
                sym = ipo.get("symbol", "")
                exchange = (ipo.get("exchange") or "").upper()
                if _is_junk_symbol(sym):
                    continue
                if exchange and exchange not in US_EXCHANGES:
                    continue
                results[key].append(_build_ipo_item(ipo, status_label))
                if len(results[key]) >= MAX_PER_TAB:
                    break

        _process_ipo_response(upcoming_resp, "upcoming", "upcoming")
        _process_ipo_response(recent_resp, "recent", "pending")

        return results

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching IPO data: {_safe_error(e)}")


@router.get("/dividends/{ticker}")
async def get_dividends(ticker: str):
    """
    Get dividend information for a stock or ETF.

    Returns the most recent dividends plus a computed annual yield
    when a current price is available.
    """
    try:
        # Fetch dividends and current quote concurrently
        div_task = market_data_service.get_dividends(ticker, limit=10)
        quote_task = market_data_service.get_quote(ticker)

        div_result, quote_result = await asyncio.gather(
            div_task,
            quote_task,
            return_exceptions=True,
        )

        # Ensure dividends succeeded
        if isinstance(div_result, Exception):
            div_result = {"ticker": ticker.upper(), "dividends": [], "has_dividends": False}

        # Compute annual yield if we have both price and dividend data
        annual_dividend = None
        annual_yield = None
        frequency_label = None

        divs = div_result.get("dividends", [])
        if divs:
            latest = divs[0]
            cash = latest.get("cash_amount")
            freq = latest.get("frequency")

            # Map frequency integer to readable label
            freq_map = {
                0: "One-time",
                1: "Annual",
                2: "Semi-Annual",
                3: "Trimester",
                4: "Quarterly",
                12: "Monthly",
                24: "Bi-Monthly",
                52: "Weekly",
            }
            frequency_label = freq_map.get(freq, "Unknown")

            if cash and freq and freq > 0:
                annual_dividend = round(cash * freq, 4)

                # Yield = annual dividend / current price * 100
                if not isinstance(quote_result, Exception) and quote_result:
                    price = quote_result.get("price")
                    if price and price > 0:
                        annual_yield = round((annual_dividend / price) * 100, 2)

        return {
            "ticker": ticker.upper(),
            "has_dividends": div_result.get("has_dividends", False),
            "dividends": divs,
            "annual_dividend": annual_dividend,
            "annual_yield": annual_yield,
            "frequency_label": frequency_label,
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching dividends: {_safe_error(e)}")


@router.get("/search")
async def search_tickers(q: str = Query(..., min_length=1, description="Search query - ticker symbol or company name")):
    """
    Search for stocks by ticker symbol or company name using FMP.

    Calls both /stable/search-name (company name matching) and
    /stable/search-symbol (ticker symbol matching) in parallel,
    then merges and deduplicates results with symbol matches first.
    """
    query = q.strip()

    try:
        client = get_fmp_client()
        search_params = {"query": query, "limit": 10, "apikey": API_KEY}

        # Fire both endpoints in parallel
        name_resp, symbol_resp = await asyncio.gather(
            client.get("search-name", params=search_params),
            client.get("search-symbol", params=search_params),
            return_exceptions=True,
        )

        def _parse_response(resp) -> list:
            if isinstance(resp, Exception):
                return []
            if resp.status_code != 200:
                return []
            data = resp.json()
            return data if isinstance(data, list) else []

        name_data = _parse_response(name_resp)
        symbol_data = _parse_response(symbol_resp)

        def _to_result(item: dict) -> dict:
            return {
                "ticker": item.get("symbol"),
                "name": item.get("name"),
                "market": "stocks",
                "type": item.get("stockExchange"),
                "primary_exchange": item.get("stockExchange"),
                "active": True,
            }

        # Symbol matches first (more relevant when user types a ticker),
        # then name matches, deduplicated by ticker symbol.
        seen: set = set()
        results: list = []
        for item in symbol_data + name_data:
            sym = item.get("symbol")
            if not sym or sym in seen:
                continue
            seen.add(sym)
            results.append(_to_result(item))

        return {"results": results[:15]}

    except Exception as e:
        print(f"Ticker search error: {e}")
        return {"results": []}


@router.get("/earnings-calendar")
async def get_earnings_calendar(
    days: int = Query(default=7, ge=1, le=30, description="Number of days ahead to look"),
    symbol: Optional[str] = Query(default=None, description="Filter by ticker symbol"),
):
    """
    Get upcoming earnings reports from FMP earnings calendar.

    **Parameters:**
    - **days**: Number of days ahead (1-30, default 7)
    - **symbol**: Optional ticker to filter (e.g. AAPL)

    **Returns:**
    - Array of earnings reports with EPS and revenue estimates
    """
    today_str = datetime.now().strftime("%Y-%m-%d")
    end_str = (datetime.now() + timedelta(days=days)).strftime("%Y-%m-%d")

    try:
        client = get_fmp_client()
        params = {
            "from": today_str,
            "to": end_str,
            "apikey": API_KEY,
        }

        resp = await client.get("earnings-calendar", params=params)
        resp.raise_for_status()
        data = resp.json()

        if not isinstance(data, list):
            data = []

        # Filter by symbol if provided
        if symbol:
            symbol_upper = symbol.strip().upper()
            data = [e for e in data if e.get("symbol", "").upper() == symbol_upper]

        # Filter to US exchanges only (no .SS, .T, .TWO suffixes)
        earnings = []
        for item in data:
            sym = item.get("symbol", "")
            if "." in sym:
                continue  # skip non-US symbols
            earnings.append({
                "symbol": sym,
                "date": item.get("date"),
                "eps_estimated": item.get("epsEstimated"),
                "eps_actual": item.get("epsActual"),
                "revenue_estimated": item.get("revenueEstimated"),
                "revenue_actual": item.get("revenueActual"),
            })

        return {
            "earnings": earnings[:50],
            "count": len(earnings),
            "from": today_str,
            "to": end_str,
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching earnings calendar: {_safe_error(e)}")


@router.get("/etf/{symbol}/info")
async def get_etf_info(symbol: str):
    """
    Get ETF information including sector weightings, expense ratio, and AUM.

    **Parameters:**
    - **symbol**: ETF symbol (e.g. SPY, QQQ, VTI)

    **Returns:**
    - ETF metadata, sector breakdown, and fund details
    """
    try:
        client = get_fmp_client()
        resp = await client.get(
            "etf/info",
            params={"symbol": symbol.upper(), "apikey": API_KEY},
        )
        resp.raise_for_status()
        data = resp.json()

        if not data or not isinstance(data, list) or len(data) == 0:
            raise HTTPException(status_code=404, detail=f"No ETF info found for {symbol}")

        info = data[0]
        sectors = info.get("sectorsList", [])

        return {
            "symbol": info.get("symbol"),
            "name": info.get("name"),
            "description": info.get("description"),
            "etf_company": info.get("etfCompany"),
            "expense_ratio": info.get("expenseRatio"),
            "aum": info.get("assetsUnderManagement"),
            "nav": info.get("nav"),
            "holdings_count": info.get("holdingsCount"),
            "inception_date": info.get("inceptionDate"),
            "avg_volume": info.get("avgVolume"),
            "asset_class": info.get("assetClass"),
            "is_actively_trading": info.get("isActivelyTrading"),
            "sectors": [
                {"sector": s.get("industry"), "weight": s.get("exposure")}
                for s in sectors
            ],
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching ETF info: {_safe_error(e)}")


@router.get("/etf/{symbol}/holdings")
async def get_etf_holdings(
    symbol: str,
    limit: int = Query(default=25, ge=1, le=100, description="Number of holdings to return"),
):
    """
    Get top holdings for an ETF.

    **Parameters:**
    - **symbol**: ETF symbol (e.g. SPY, QQQ)
    - **limit**: Number of top holdings (1-100, default 25)

    **Returns:**
    - Array of holdings with ticker, name, weight, shares, and market value
    """
    try:
        client = get_fmp_client()
        resp = await client.get(
            "etf/holdings",
            params={"symbol": symbol.upper(), "apikey": API_KEY},
        )
        resp.raise_for_status()
        data = resp.json()

        if not data or not isinstance(data, list):
            return {"symbol": symbol.upper(), "holdings": [], "count": 0}

        holdings = []
        for item in data[:limit]:
            holdings.append({
                "ticker": item.get("asset"),
                "name": item.get("name"),
                "weight": item.get("weightPercentage"),
                "shares": item.get("sharesNumber"),
                "market_value": item.get("marketValue"),
            })

        return {
            "symbol": symbol.upper(),
            "holdings": holdings,
            "count": len(holdings),
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching ETF holdings: {_safe_error(e)}")


@router.get("/screener")
async def stock_screener(
    market_cap_more_than: Optional[float] = Query(default=None, description="Minimum market cap"),
    market_cap_lower_than: Optional[float] = Query(default=None, description="Maximum market cap"),
    sector: Optional[str] = Query(default=None, description="Sector filter (e.g. Technology, Healthcare)"),
    industry: Optional[str] = Query(default=None, description="Industry filter (e.g. Semiconductors)"),
    beta_more_than: Optional[float] = Query(default=None, description="Minimum beta"),
    beta_lower_than: Optional[float] = Query(default=None, description="Maximum beta"),
    price_more_than: Optional[float] = Query(default=None, description="Minimum price"),
    price_lower_than: Optional[float] = Query(default=None, description="Maximum price"),
    dividend_more_than: Optional[float] = Query(default=None, description="Minimum annual dividend"),
    dividend_lower_than: Optional[float] = Query(default=None, description="Maximum annual dividend"),
    volume_more_than: Optional[float] = Query(default=None, description="Minimum volume"),
    volume_lower_than: Optional[float] = Query(default=None, description="Maximum volume"),
    exchange: Optional[str] = Query(default=None, description="Exchange (e.g. NASDAQ, NYSE)"),
    is_etf: Optional[bool] = Query(default=None, description="Filter ETFs"),
    is_fund: Optional[bool] = Query(default=None, description="Filter mutual funds"),
    is_actively_trading: Optional[bool] = Query(default=True, description="Only actively trading"),
    limit: int = Query(default=50, ge=1, le=200, description="Number of results"),
):
    """
    Screen stocks using FMP company screener.
    Filter by market cap, sector, price, beta, volume, dividends, and more.
    """
    # Build params — only include non-None values
    params: dict = {"apikey": API_KEY, "limit": limit}
    param_map = {
        "marketCapMoreThan": market_cap_more_than,
        "marketCapLowerThan": market_cap_lower_than,
        "sector": sector,
        "industry": industry,
        "betaMoreThan": beta_more_than,
        "betaLowerThan": beta_lower_than,
        "priceMoreThan": price_more_than,
        "priceLowerThan": price_lower_than,
        "dividendMoreThan": dividend_more_than,
        "dividendLowerThan": dividend_lower_than,
        "volumeMoreThan": volume_more_than,
        "volumeLowerThan": volume_lower_than,
        "exchange": exchange,
        "isEtf": is_etf,
        "isFund": is_fund,
        "isActivelyTrading": is_actively_trading,
    }
    for key, val in param_map.items():
        if val is not None:
            params[key] = val

    try:
        client = get_fmp_client()
        resp = await client.get("company-screener", params=params)
        resp.raise_for_status()
        data = resp.json()

        if not isinstance(data, list):
            data = []

        # Filter out non-US exchanges client-side for cleaner results
        results = []
        for item in data:
            short_name = (item.get("exchangeShortName") or "").upper()
            sym = item.get("symbol", "")
            # Skip foreign-listed symbols (contain dots like .BA, .T)
            if "." in sym:
                continue
            results.append({
                "symbol": sym,
                "name": item.get("companyName"),
                "market_cap": item.get("marketCap"),
                "sector": item.get("sector"),
                "industry": item.get("industry"),
                "beta": item.get("beta"),
                "price": item.get("price"),
                "last_annual_dividend": item.get("lastAnnualDividend"),
                "volume": item.get("volume"),
                "exchange": item.get("exchangeShortName"),
                "is_etf": item.get("isEtf"),
                "is_actively_trading": item.get("isActivelyTrading"),
            })

        return {
            "results": results,
            "count": len(results),
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error running stock screener: {_safe_error(e)}")


@router.get("/analyst-estimates/{ticker}")
async def get_analyst_estimates(ticker: str):
    """
    Get analyst estimates and price target consensus for a stock.

    Returns:
    - forward_eps: next-year average EPS estimate
    - forward_eps_high / forward_eps_low: estimate range
    - num_analysts_eps: number of analysts covering EPS
    - forward_revenue_avg: next-year average revenue estimate
    - estimate_year: the fiscal year the forward EPS applies to
    - price_target_consensus: mean analyst price target
    - price_target_high / price_target_low: target range
    - price_target_median: median target
    """
    sym = ticker.upper().strip()
    try:
        client = get_fmp_client()

        estimates_resp, targets_resp = await asyncio.gather(
            client.get("analyst-estimates", params={"symbol": sym, "apikey": API_KEY, "limit": 4}),
            client.get("price-target-consensus", params={"symbol": sym, "apikey": API_KEY}),
            return_exceptions=True,
        )

        # ── Analyst EPS estimates ───────────────────────────────────────────
        forward_eps = None
        forward_eps_high = None
        forward_eps_low = None
        forward_revenue_avg = None
        num_analysts_eps = None
        estimate_year = None

        if not isinstance(estimates_resp, Exception) and estimates_resp.status_code == 200:
            estimates_data = estimates_resp.json()
            if isinstance(estimates_data, list) and estimates_data:
                from datetime import date as _date
                current_year = _date.today().year
                # Pick the first entry whose date year is >= current year (forward-looking)
                for entry in estimates_data:
                    entry_year = None
                    try:
                        entry_year = int(str(entry.get("date", ""))[:4])
                    except (ValueError, TypeError):
                        pass
                    if entry_year and entry_year >= current_year:
                        forward_eps = entry.get("estimatedEpsAvg")
                        forward_eps_high = entry.get("estimatedEpsHigh")
                        forward_eps_low = entry.get("estimatedEpsLow")
                        forward_revenue_avg = entry.get("estimatedRevenueAvg")
                        num_analysts_eps = entry.get("numberAnalystEstimatedEps")
                        estimate_year = entry_year
                        break

        # ── Price target consensus ──────────────────────────────────────────
        price_target_consensus = None
        price_target_high = None
        price_target_low = None
        price_target_median = None

        if not isinstance(targets_resp, Exception) and targets_resp.status_code == 200:
            targets_data = targets_resp.json()
            if isinstance(targets_data, list) and targets_data:
                t = targets_data[0]
                price_target_consensus = t.get("targetConsensus")
                price_target_high = t.get("targetHigh")
                price_target_low = t.get("targetLow")
                price_target_median = t.get("targetMedian")

        return {
            "ticker": sym,
            "forward_eps": forward_eps,
            "forward_eps_high": forward_eps_high,
            "forward_eps_low": forward_eps_low,
            "forward_revenue_avg": forward_revenue_avg,
            "num_analysts_eps": num_analysts_eps,
            "estimate_year": estimate_year,
            "price_target_consensus": price_target_consensus,
            "price_target_high": price_target_high,
            "price_target_low": price_target_low,
            "price_target_median": price_target_median,
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching analyst estimates: {_safe_error(e)}")


@router.get("/ownership/{ticker}")
async def get_ownership(
    ticker: str,
    current_user=Depends(get_current_user),
):
    """
    Fetch SEC dilution filings (S-3, 424B5) and top institutional holders for a ticker.
    """
    ticker = ticker.strip().upper()
    client = get_fmp_client()

    async def _get(path: str, params: dict):
        try:
            r = await client.get(path, params={"apikey": API_KEY, **params})
            r.raise_for_status()
            data = r.json()
            return data if isinstance(data, list) else []
        except Exception:
            return []

    s3_raw, b5_raw, inst_raw = await asyncio.gather(
        _get("sec-filings", {"symbol": ticker, "type": "S-3", "limit": 5}),
        _get("sec-filings", {"symbol": ticker, "type": "424B5", "limit": 5}),
        _get("institutional-holder", {"symbol": ticker}),
    )

    def _parse_filing(f: dict) -> dict:
        return {
            "type": f.get("type") or f.get("formType"),
            "date": f.get("date") or f.get("fillingDate"),
            "link": f.get("finalLink") or f.get("link"),
        }

    filings = sorted(
        [_parse_filing(f) for f in (s3_raw + b5_raw) if f.get("date") or f.get("fillingDate")],
        key=lambda x: x["date"] or "",
        reverse=True,
    )[:6]

    holders = [
        {
            "holder": h.get("holder") or h.get("name"),
            "shares": h.get("shares"),
            "date_reported": h.get("dateReported"),
            "change": h.get("change"),
            "weight_percent": h.get("weightPercent"),
        }
        for h in (inst_raw[:10] if inst_raw else [])
    ]

    return {"filings": filings, "institutional_holders": holders}


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
        quote_task = market_data_service.get_quote(ticker)
        company_task = market_data_service.get_company_info(ticker)
        
        quote, company = await asyncio.gather(quote_task, company_task)
        
        return {
            "ticker": ticker.upper(),
            "quote": quote,
            "company": company
        }
    except ValueError as e:
        raise HTTPException(status_code=404, detail=_safe_error(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching stock overview: {_safe_error(e)}")