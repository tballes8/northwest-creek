"""
Stock API Endpoints
"""
import re
from fastapi import APIRouter, HTTPException, Query, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, Date, or_, update
from datetime import date, datetime, timedelta
from typing import Optional
import asyncio
from app.api.dependencies import get_current_user
from app.services.market_data import market_data_service, evaluate_dividend
from app.services.fmp_client import get_fmp_client, API_KEY
from app.services.analyst_estimates import fetch_estimates
from app.services.sec_filings import detect_bankruptcy, is_new_issuer
from app.services.edgar_identity import resolve_fund_ticker
from app.db.session import get_db
from app.schemas.daily_snapshot import DailySnapshotItem, DailySnapshotResponse
from app.db.models import DailyStockSnapshot, StockSnapshot
from app.core.tier_limits import can_use_feature, get_upgrade_tier
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
    sector: Optional[str] = Query(default=None, description="Sector filter, e.g. 'Energy' — resolved from stock_snapshots.sector"),
    db: AsyncSession = Depends(get_db)
):
    """
    Get random stocks from today's daily snapshot

    **Parameters:**
    - **limit**: Number of random stocks to return (1-50, default 10)
    - **tickers**: Optional comma-separated list of tickers to filter by (e.g. "AAPL,MSFT,GOOGL")
    - **asset_type**: Optional asset type filter (e.g. "ETF", "CS")
    - **sector**: Optional sector filter, joined against `stock_snapshots.sector`

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

        # Sector membership comes from stock_snapshots.sector — the one stored sector,
        # written only from /stable/profile. The sector explorer used to build its own
        # ticker list from a static frontend map, so a Marine Shipping name like KNOP
        # was listed under Energy and then showed "Industrials" on its own page. Read
        # the same column Company Details and the screener read, and they agree.
        #
        # is_etf guard for the same reason /stocks/sectors carries one: funds are in
        # stock_snapshots but deliberately carry no sector, and a stray write must not
        # let one answer a stock-mode sector browse.
        if sector:
            sector_symbols = (
                select(StockSnapshot.symbol)
                .where(
                    func.lower(StockSnapshot.sector) == sector.strip().lower(),
                    StockSnapshot.is_etf.isnot(True),
                )
            )
            base_filter = base_filter & DailyStockSnapshot.ticker.in_(sector_symbols)

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
    
@router.get("/{ticker}/implied-volatility")
async def get_implied_volatility(
    ticker: str,
    lookback_days: int = Query(default=30, ge=5, le=180, description="Trading days of returns to use"),
):
    """Annualized volatility estimate for a ticker.

    Computed from historical realized volatility (stdev of daily log returns)
    since the FMP plan does not include options-chain data. Returns a payload
    with `value`, `source` ("realized" or "default"), and `lookback_days` so the
    UI can label the source.
    """
    from app.services.volatility_service import get_volatility_estimate
    try:
        return await get_volatility_estimate(ticker, lookback_days)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error estimating volatility: {_safe_error(e)}")


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


@router.get("/sectors")
async def get_sectors(
    tickers: str = Query(..., description="Comma-separated tickers (max 250)"),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    Bulk ticker → sector lookup for the app's sector labels.

    Reads `stock_snapshots.sector` first and only calls FMP for what the table cannot
    answer. Dashboard and Watchlist call this on every load with the user's whole ticker
    list, so the previous behaviour — a live `get_company_info` for all 250 — put up to
    250 profile calls behind a page load.

    That fan-out existed for a real reason: the stored column used to be an unversioned
    cache with no invalidation, so a wrong row (NFE stored as Utilities while the profile
    said Energy) could never correct itself. `_update_company_profiles` in
    `app/tasks/refresh_stock_snapshots.py` is now that invalidation — it refreshes every
    universe symbol missing a profile from `/stable/profile` daily, which is the same
    source `/company/{ticker}` renders. One source, so a ticker still cannot show one
    sector here and another in the Company Details panel.

    The live path remains for symbols the table has no sector for — non-universe tickers
    a user holds, which `_prune_universe` keeps out of `stock_snapshots`, and ETFs, which
    are in the table but never get a sector (see below). Those are written back when they
    resolve, except onto fund rows.

    **Returns:** `{"sectors": {"NFE": "Energy", ...}}` — every requested ticker is
    present; anything unresolvable maps to "Other".
    """
    requested: list[str] = []
    seen: set[str] = set()
    for raw in tickers.split(","):
        sym = raw.strip().upper()
        if sym and sym not in seen:
            seen.add(sym)
            requested.append(sym)

    if not requested:
        return {"sectors": {}}
    if len(requested) > 250:
        raise HTTPException(status_code=400, detail="Too many tickers (max 250)")

    # 1. The authoritative read: one query for everything the table already knows.
    stored: dict[str, str] = {}
    rows = await db.execute(
        select(StockSnapshot.symbol, StockSnapshot.sector).where(
            StockSnapshot.symbol.in_(requested),
            StockSnapshot.sector.isnot(None),
        )
    )
    for symbol, sector in rows.all():
        if sector:
            stored[symbol.upper()] = sector

    # 2. Live fallback for the remainder only — non-universe tickers (ETFs a user holds)
    #    and universe symbols the daily profile fill hasn't reached yet. Bounded
    #    concurrency so a large portfolio can't open 75 sockets at once; cache hits
    #    don't touch the network at all.
    unresolved = [s for s in requested if s not in stored]
    fetched: dict[str, Optional[str]] = {}

    if unresolved:
        sem = asyncio.Semaphore(8)

        async def _fetch(sym: str) -> tuple[str, Optional[str]]:
            async with sem:
                try:
                    info = await market_data_service.get_company_info(sym)
                    sector = info.get("sector")
                    # get_company_info substitutes "Other" when FMP omits a sector.
                    # Treat that as no answer rather than storing a placeholder.
                    return sym, (sector if sector and sector != "Other" else None)
                except Exception:
                    return sym, None

        fetched = dict(await asyncio.gather(*(_fetch(s) for s in unresolved)))

        # 3. Keep stock_snapshots in step, so the screener's sector filter and keyword
        #    search agree with the labels users see. UPDATE-only: never INSERT, so a
        #    non-universe ticker can't leak into the screener universe.
        #
        #    Guarded on is_etf because funds ARE in stock_snapshots now (the universe
        #    build has an isEtf=true leg) but deliberately carry no sector: they are
        #    excluded from the profile pass, and /screener/filter-options builds the
        #    sector dropdown from DISTINCT over this column. Without the guard, one user
        #    holding SPY writes a sector onto a fund row and it turns up as a sector
        #    option — and makes that fund answer a stock-mode sector screen.
        changed = [(sym, sector) for sym, sector in fetched.items() if sector]
        if changed:
            for sym, sector in changed:
                await db.execute(
                    update(StockSnapshot)
                    .where(
                        StockSnapshot.symbol == sym,
                        StockSnapshot.is_etf.isnot(True),
                    )
                    .values(sector=sector)
                )
            await db.commit()

    return {
        "sectors": {
            s: stored.get(s) or fetched.get(s) or "Other"
            for s in requested
        }
    }


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

    Three buckets:
      - upcoming        — listing date in the next 21 days, today excluded
      - recently_active — listed in the last 7 days and already trading
      - pending         — listed in the last 7 days but no trading data yet

    The last two are split by a batch quote: a ticker with a real price is
    trading, so it belongs in recently_active. Entries age out of both after
    7 days because the calendar window itself is 7 days wide.

    The upcoming window starts *tomorrow*. FMP's from/to are both inclusive, so
    running it from `today` put every listing dated today in two tabs at once —
    the same four rows rendered under Upcoming and again under Pending. A
    listing dated today is not upcoming; it is pending until it prints.

    Filters out warrants, rights, units, foreign listings, SPAC shells, and
    companies that were already public — the vendor calendar also carries
    exchange transfers, uplistings and relistings, which are listing events
    rather than new issuers. See `_drop_established_registrants`.

    Every entry carries `asset_type` ("CS" or "ETF"). Fund launches are not
    filtered out here because they are a legitimate thing to watch; they are
    labelled so the client can separate them from share IPOs, which they
    otherwise outnumber. See `_tag_asset_types`.
    """
    today = datetime.now().strftime("%Y-%m-%d")
    seven_days_ago = (datetime.now() - timedelta(days=7)).strftime("%Y-%m-%d")
    tomorrow = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")
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
            # Overwritten by _tag_asset_types; "CS" is the fail-open default so
            # an unclassifiable listing shows under stocks rather than vanishing.
            "asset_type": "CS",
            "last_updated": None,
            "currency_code": "USD",
            "min_shares_offered": None,
            "max_shares_offered": None,
            "current_price": None,
            "change_percent": None,
            "volume": None,
        }

    results = {
        "upcoming": [],
        "recently_active": [],
        "pending": [],
    }

    MAX_PER_TAB = 25

    try:
        client = get_fmp_client()

        # Fetch upcoming and recent IPOs in parallel
        upcoming_resp, recent_resp = await asyncio.gather(
            client.get(
                "ipos-calendar",
                params={"from": tomorrow, "to": twenty_one_days_ahead, "apikey": API_KEY},
            ),
            client.get(
                "ipos-calendar",
                params={"from": seven_days_ago, "to": today, "apikey": API_KEY},
            ),
            return_exceptions=True,
        )

        def _parse_ipo_response(resp, status_label: str, limit: int, label: str) -> list:
            """Filter an FMP calendar response down to tradeable US listings."""
            items = []
            if isinstance(resp, Exception):
                print(f"IPO fetch error for {label}: {resp}")
                return items
            if resp.status_code != 200:
                return items
            data = resp.json()
            if not isinstance(data, list):
                return items
            for ipo in data:
                sym = ipo.get("symbol", "")
                exchange = (ipo.get("exchange") or "").upper()
                if _is_junk_symbol(sym):
                    continue
                if exchange and exchange not in US_EXCHANGES:
                    continue
                items.append(_build_ipo_item(ipo, status_label))
                if len(items) >= limit:
                    break
            return items

        async def _drop_established_registrants(items: list, label: str) -> list:
            """Remove calendar entries whose registrant EDGAR shows filing years
            before the listing date.

            OPAD is the case this exists for: Offerpad transferred its listing
            from NYSE to Nasdaq on 2026-08-31 and the vendor calendar reported
            it as an IPO, so the tracker showed a company public since its 2021
            SPAC merger — with five years of price history and $400M of revenue
            — next to genuine new issuers.

            Both lookups are cached (the ticker map in memory, submissions on a
            6h TTL), so this is a handful of requests for the whole calendar at
            most. Each check fails open, and an outright error keeps the entry:
            showing a stale listing beats hiding a real IPO.
            """
            if not items:
                return items
            verdicts = await asyncio.gather(
                *[is_new_issuer(i["ticker"], i.get("listing_date")) for i in items],
                return_exceptions=True,
            )
            kept = []
            for item, verdict in zip(items, verdicts):
                if isinstance(verdict, BaseException):
                    print(f"IPO filter: {item['ticker']} check failed ({verdict}) — kept")
                    kept.append(item)
                elif verdict:
                    kept.append(item)
                else:
                    print(
                        f"IPO filter [{label}]: {item['ticker']} excluded — EDGAR shows "
                        f"the registrant filing well before {item.get('listing_date')}"
                    )
            return kept

        async def _tag_asset_types(items: list) -> list:
            """Stamp each entry as an ETF launch ("ETF") or a share IPO ("CS").

            New ETF listings outnumber genuine IPOs by several times over, so
            without this the tracker reads as a fund-launch feed. SEC's
            registered-fund file is the discriminator: a '40 Act fund is in it,
            keyed by series/class, and a new ETF listing is nearly always one.

            It does not catch trust-structured ETPs — the commodity and
            spot-crypto vehicles that file the way SPY and GLD do — which stay
            "CS". That is the intended edge: a new ETP is closer to an IPO in
            what it offers investors than a fund launch is.

            Costs one cached file for the whole calendar, then a dict lookup per
            ticker. Fails open to "CS": an unclassifiable listing belongs with
            the IPOs, since that is the tab a user is not filtering away.
            """
            if not items:
                return items
            funds = await asyncio.gather(
                *[resolve_fund_ticker(i["ticker"]) for i in items],
                return_exceptions=True,
            )
            for item, fund in zip(items, funds):
                if isinstance(fund, BaseException):
                    print(f"IPO asset type: {item['ticker']} check failed ({fund}) — CS")
                    continue
                item["asset_type"] = "ETF" if fund else "CS"
            return items

        # Over-pull, then filter, so excluded relistings do not leave the tab
        # short of genuine IPOs.
        upcoming_items = _parse_ipo_response(
            upcoming_resp, "upcoming", MAX_PER_TAB * 2, "upcoming"
        )
        results["upcoming"] = await _tag_asset_types(
            (await _drop_established_registrants(upcoming_items, "upcoming"))[:MAX_PER_TAB]
        )

        # Recent-window listings get split by whether they are actually trading.
        # Pull up to 2x so neither bucket is starved by the other.
        recent_items = _parse_ipo_response(
            recent_resp, "recent", MAX_PER_TAB * 2, "recent"
        )
        recent_items = await _drop_established_registrants(recent_items, "recent")
        recent_items = await _tag_asset_types(recent_items)

        quotes = {}
        if recent_items:
            quotes = await market_data_service.get_batch_quotes(
                [i["ticker"] for i in recent_items if i["ticker"] != "N/A"]
            )

        for item in recent_items:
            quote = quotes.get(item["ticker"].upper()) or {}
            price = _safe_float(quote.get("price"))
            if price and price > 0:
                item["ipo_status"] = "trading"
                item["current_price"] = price
                item["change_percent"] = _safe_float(quote.get("change_percent"))
                item["volume"] = quote.get("volume")
                bucket = "recently_active"
            else:
                bucket = "pending"
            if len(results[bucket]) < MAX_PER_TAB:
                results[bucket].append(item)

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

        price = None
        if not isinstance(quote_result, Exception) and quote_result:
            price = quote_result.get("price")

        # Annualize the latest payment into a yield — gated on recency, so a
        # lapsed dividend reports as suspended instead of as a huge yield
        # against today's price. See evaluate_dividend().
        divs = div_result.get("dividends", [])
        assessment = evaluate_dividend(divs, price)

        return {
            "ticker": ticker.upper(),
            "has_dividends": div_result.get("has_dividends", False),
            "dividends": divs,
            "annual_dividend": assessment["annual_dividend"],
            "annual_yield": assessment["annual_yield"],
            "frequency_label": assessment["frequency_label"],
            "dividend_status": assessment["dividend_status"],
            "last_ex_date": assessment["last_ex_date"],
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


@router.get("/search-by-keywords")
async def search_by_keywords(
    keywords: str = Query(..., min_length=1, description="Keywords to search in company sector, industry, or description"),
    limit: int = Query(default=20, ge=1, le=100, description="Maximum number of results"),
    db: AsyncSession = Depends(get_db),
):
    """
    Search for companies by keywords in their sector, industry, or description.

    This endpoint uses PostgreSQL full-text search to find companies that match
    the provided keywords. It searches across:
    - Company sector (e.g., "Technology", "Healthcare")
    - Company industry (e.g., "Semiconductors", "Copper Mining")
    - Company description (business activities and operations)

    **Parameters:**
    - **keywords**: Search terms (e.g., "memory chips", "copper mining", "artificial intelligence")
    - **limit**: Maximum number of results to return (1-100)

    **Returns:**
    - Array of matching companies with relevance ranking

    Results include ETFs. Funds are in `stock_snapshots` and their descriptions come
    from `etf/info`, so a thematic search ("uranium", "semiconductors") legitimately
    surfaces the sector fund alongside the operating companies. They carry `is_etf`
    so the caller can label them, and their `sector`/`industry` are always null —
    funds are excluded from the profile pass — so `match_reason` on a fund always
    falls through to the description branch.
    """
    from sqlalchemy import func, text

    # Clean and prepare search query
    search_query = keywords.strip()

    try:
        # Use PostgreSQL full-text search with ts_rank for relevance scoring
        # This query searches across name, sector, industry, and description
        query = text("""
            SELECT
                symbol,
                name,
                sector,
                industry,
                description,
                market_cap,
                price,
                is_etf,
                ts_rank(
                    to_tsvector('english',
                        COALESCE(name, '') || ' ' ||
                        COALESCE(sector, '') || ' ' ||
                        COALESCE(industry, '') || ' ' ||
                        COALESCE(description, '')
                    ),
                    plainto_tsquery('english', :search_query)
                ) AS rank,
                -- Highlight matching terms
                ts_headline('english',
                    COALESCE(industry, '') || ' - ' || COALESCE(description, ''),
                    plainto_tsquery('english', :search_query),
                    'MaxWords=50, MinWords=20, HighlightAll=false'
                ) AS match_snippet
            FROM stock_snapshots
            WHERE
                to_tsvector('english',
                    COALESCE(name, '') || ' ' ||
                    COALESCE(sector, '') || ' ' ||
                    COALESCE(industry, '') || ' ' ||
                    COALESCE(description, '')
                ) @@ plainto_tsquery('english', :search_query)
            ORDER BY rank DESC, market_cap DESC NULLS LAST
            LIMIT :limit
        """)

        result = await db.execute(query, {"search_query": search_query, "limit": limit})
        rows = result.fetchall()

        results = []
        for row in rows:
            # Determine why this company matched
            match_reason = ""
            if row.industry and search_query.lower() in row.industry.lower():
                match_reason = f"Industry: {row.industry}"
            elif row.sector and search_query.lower() in row.sector.lower():
                match_reason = f"Sector: {row.sector}"
            else:
                match_reason = "Description matches keywords"

            results.append({
                "ticker": row.symbol,
                "name": row.name,
                "sector": row.sector,
                "industry": row.industry,
                "match_reason": match_reason,
                "description_snippet": row.match_snippet if row.match_snippet else row.description[:200] if row.description else None,
                "market_cap": float(row.market_cap) if row.market_cap else None,
                "price": float(row.price) if row.price else None,
                "relevance_score": float(row.rank) if row.rank else 0,
                "is_etf": bool(row.is_etf),
            })

        # Also search for exact matches in sector/industry (case-insensitive)
        if not results:
            # Fallback to simpler ILIKE search if full-text search returns nothing
            fallback_query = select(StockSnapshot).where(
                or_(
                    StockSnapshot.sector.ilike(f"%{search_query}%"),
                    StockSnapshot.industry.ilike(f"%{search_query}%"),
                    StockSnapshot.description.ilike(f"%{search_query}%"),
                )
            ).order_by(StockSnapshot.market_cap.desc().nulls_last()).limit(limit)

            fallback_result = await db.execute(fallback_query)
            fallback_rows = fallback_result.scalars().all()

            for row in fallback_rows:
                match_reason = ""
                if row.industry and search_query.lower() in row.industry.lower():
                    match_reason = f"Industry: {row.industry}"
                elif row.sector and search_query.lower() in row.sector.lower():
                    match_reason = f"Sector: {row.sector}"
                else:
                    match_reason = "Description matches keywords"

                results.append({
                    "ticker": row.symbol,
                    "name": row.name,
                    "sector": row.sector,
                    "industry": row.industry,
                    "match_reason": match_reason,
                    "description_snippet": row.description[:200] if row.description else None,
                    "market_cap": float(row.market_cap) if row.market_cap else None,
                    "price": float(row.price) if row.price else None,
                    "relevance_score": 0,
                    "is_etf": bool(row.is_etf),
                })

        return {
            "results": results,
            "total": len(results),
            "keywords_searched": search_query.split(),
        }

    except Exception as e:
        print(f"Keyword search error: {e}")
        raise HTTPException(status_code=500, detail=f"Search failed: {_safe_error(e)}")


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

    Field mapping lives in market_data.get_etf_info, which the daily snapshot
    enrichment also calls — so this panel and the ETF screener read one shape and
    one expense-ratio unit. `expense_ratio` is a percent (0.09 = 0.09%); FMP's raw
    value is a percent for some funds and a fraction for others.
    """
    try:
        info = await market_data_service.get_etf_info(symbol)
        if info is None:
            raise HTTPException(status_code=404, detail=f"No ETF info found for {symbol}")
        return info

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

        # FMP happens to return holdings sorted by weight descending (verified
        # against ULTY, 93 rows, 2026-08-26) but does not document it, and "top N"
        # is only true if that holds. Sort explicitly. Rows with a missing or
        # non-numeric weight sort last rather than poisoning the comparison.
        #
        # Option-income and leveraged funds legitimately carry negative weights
        # (short calls, cash offsets), so do NOT filter on weight > 0 — ULTY has
        # 39 negative rows out of 93 and they are part of the strategy.
        def _weight_key(item: dict) -> float:
            w = item.get("weightPercentage")
            return float(w) if isinstance(w, (int, float)) else float("-inf")

        rows = sorted(
            (i for i in data if isinstance(i, dict)),
            key=_weight_key,
            reverse=True,
        )

        holdings = []
        for item in rows[:limit]:
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
            # Pre-truncation total, so the UI can say "top 10 of 93 holdings"
            # instead of implying the returned slice is the whole fund.
            "total_count": len(rows),
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
                # /stable/company-screener returns `exchange`; older API used `exchangeShortName`.
                "exchange": item.get("exchange") or item.get("exchangeShortName"),
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

        # analyst-estimates goes through services/analyst_estimates, which owns the
        # FMP schema and the forward-row selection for every consumer.
        estimates, targets_resp = await asyncio.gather(
            fetch_estimates(sym),
            client.get("price-target-consensus", params={"symbol": sym, "apikey": API_KEY}),
            return_exceptions=True,
        )

        # ── Analyst EPS estimates ───────────────────────────────────────────
        if isinstance(estimates, BaseException) or not isinstance(estimates, dict):
            estimates = {}
        forward_eps = estimates.get("forward_eps")
        forward_eps_high = estimates.get("forward_eps_high")
        forward_eps_low = estimates.get("forward_eps_low")
        forward_revenue_avg = estimates.get("forward_revenue")
        num_analysts_eps = estimates.get("num_analysts_eps")
        estimate_year = estimates.get("estimate_year")

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

    def _recent_quarters(count: int = 5) -> list[tuple[int, int]]:
        """Last `count` (year, quarter) pairs, counting back from the quarter
        before today's — the current quarter's 13Fs aren't filed yet (~45-day lag)."""
        today = date.today()
        q = (today.month - 1) // 3 + 1
        y = today.year
        out: list[tuple[int, int]] = []
        for _ in range(count):
            q -= 1
            if q == 0:
                q, y = 4, y - 1
            out.append((y, q))
        return out

    async def _load_holders() -> list:
        # 13F data lags ~45 days; walk back quarters until one has rows.
        for y, q in _recent_quarters():
            rows = await _get(
                "institutional-ownership/extract-analytics/holder",
                {"symbol": ticker, "year": y, "quarter": q, "page": 0, "limit": 50},
            )
            if rows:
                return rows
        return []

    today = date.today()
    filings_raw, inst_raw = await asyncio.gather(
        _get(
            "sec-filings-search/symbol",
            {
                "symbol": ticker,
                "from": (today - timedelta(days=730)).isoformat(),
                "to": today.isoformat(),
                "page": 0,
                "limit": 100,
            },
        ),
        _load_holders(),
    )

    def _is_dilution(form_type: str | None) -> bool:
        ft = (form_type or "").upper()
        return ft.startswith("S-3") or ft.startswith("424B5")

    def _parse_filing(f: dict) -> dict:
        raw_date = f.get("filingDate") or f.get("acceptedDate") or f.get("date") or ""
        return {
            "type": f.get("formType") or f.get("type"),
            "date": raw_date[:10] or None,  # normalize to YYYY-MM-DD for the frontend
            "link": f.get("finalLink") or f.get("link"),
        }

    filings = sorted(
        [_parse_filing(f) for f in filings_raw if _is_dilution(f.get("formType") or f.get("type"))],
        key=lambda x: x["date"] or "",
        reverse=True,
    )[:6]

    holders = sorted(
        [
            {
                "holder": h.get("investorName") or None,
                "shares": h.get("sharesNumber"),
                "date_reported": h.get("date"),
                "change": h.get("changeInSharesNumber"),
                "weight_percent": h.get("ownership"),
            }
            for h in inst_raw
        ],
        key=lambda x: x["weight_percent"] or 0,
        reverse=True,
    )[:10]

    # Company CIK comes free with the SEC filings response; use it to check for
    # a recent bankruptcy/receivership 8-K (Item 1.03) via SEC EDGAR.
    cik = next((f.get("cik") for f in filings_raw if f.get("cik")), None)
    bankruptcy = await detect_bankruptcy(cik)

    return {"filings": filings, "institutional_holders": holders, "bankruptcy": bankruptcy}


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