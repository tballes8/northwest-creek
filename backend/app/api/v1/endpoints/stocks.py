"""
Stock API Endpoints
"""
from fastapi import APIRouter, HTTPException, Query, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, Date
from datetime import date
from typing import Optional, Dict, List
import httpx
from app.services.market_data import market_data_service
from app.config import get_settings
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

def _is_warrant(ticker: str) -> bool:
    """
    Heuristic filter to exclude likely warrants from gainers/losers lists.
    
    Only matches unambiguous patterns — separator-based suffixes and
    double-W endings.  Single trailing 'W' without a separator is NOT
    matched because it produces too many false positives on legitimate
    tickers (MATW, PLOW, BMW, etc.).
    
    The authoritative warrant check happens on the frontend via Polygon's
    `type` field from the /v3/reference/tickers endpoint.
    """
    t = ticker.upper().strip()
    # Explicit separator patterns (always warrants)
    for suffix in ('.WS', '.WT', '.W', '+WS', '+WT', '+W', '/WS', '/WT', '/W'):
        if t.endswith(suffix):
            return True
    # Double-W ending (e.g., BRKHWW) — always a warrant
    if t.endswith('WW'):
        return True
    # Ends with + (units / warrants on some exchanges)
    if t.endswith('+'):
        return True
    # Ends with 'WS' without separator (e.g., SOUNWS) — very likely warrant
    # Only for length > 4 to avoid short legitimate tickers like NWS
    if len(t) > 4 and t.endswith('WS') and t[-3].isalpha():
        return True
    return False


# Types we want to keep in gainers/losers lists
_ALLOWED_TYPES = {'CS', 'ADRC', 'PFD', 'ETF', 'ETS', 'ETN', 'ETV'}


async def _batch_get_types(tickers: List[str]) -> Dict[str, str]:
    """
    Batch-fetch security types from Polygon /v3/reference/tickers.
    Single lightweight HTTP call — returns {ticker: type} dict.
    Unknown tickers return empty string.
    """
    if not tickers:
        return {}
    try:
        settings = get_settings()
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.get(
                "https://api.polygon.io/v3/reference/tickers",
                params={
                    "ticker.any_of": ",".join(tickers),
                    "active": "true",
                    "limit": len(tickers),
                    "apiKey": settings.MASSIVE_API_KEY,
                },
            )
            resp.raise_for_status()
            results = resp.json().get("results", [])
            return {r["ticker"]: r.get("type", "") for r in results}
    except Exception as e:
        print(f"⚠️ _batch_get_types failed: {e}")
        return {}


@router.get("/top-gainers")
async def get_top_gainers(limit: int = 10):
    """Get top stock gainers, excluding warrants and non-equity securities"""
    try:
        # Over-fetch to compensate for filtered-out warrants
        result = await market_data_service.get_top_gainers(limit + 30)

        if "top_gainers" in result and isinstance(result["top_gainers"], list):
            # Pass 1: fast heuristic — catches separator-pattern warrants
            candidates = [g for g in result["top_gainers"] if not _is_warrant(g.get("ticker", ""))]

            # Pass 2: API type check on remaining candidates
            tickers = [g["ticker"] for g in candidates[:limit + 15]]
            type_map = await _batch_get_types(tickers)

            filtered = []
            for g in candidates:
                t = g.get("ticker", "")
                tkr_type = type_map.get(t, "")
                # Keep if type is allowed OR unknown (empty = not in Polygon ref data)
                if tkr_type in _ALLOWED_TYPES or tkr_type == "":
                    filtered.append(g)
                    if len(filtered) >= limit:
                        break

            result["top_gainers"] = filtered

        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/top-losers")
async def get_top_losers(limit: int = 10):
    """Get top stock losers, excluding warrants and non-equity securities"""
    try:
        result = await market_data_service.get_top_losers(limit + 30)

        if "top_losers" in result and isinstance(result["top_losers"], list):
            candidates = [g for g in result["top_losers"] if not _is_warrant(g.get("ticker", ""))]

            tickers = [g["ticker"] for g in candidates[:limit + 15]]
            type_map = await _batch_get_types(tickers)

            filtered = []
            for g in candidates:
                t = g.get("ticker", "")
                tkr_type = type_map.get(t, "")
                if tkr_type in _ALLOWED_TYPES or tkr_type == "":
                    filtered.append(g)
                    if len(filtered) >= limit:
                        break

            result["top_losers"] = filtered

        return result
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
    
@router.get("/ipos")
async def get_ipos():
    """
    Get upcoming, pending, and rumored IPOs from Massive API.
    """
    import httpx
    from app.config import settings
    
    api_key = settings.MASSIVE_API_KEY
    base_url = "https://api.polygon.io/vX/reference/ipos"
    
    results = {
        "upcoming": [],
        "pending": [],
        "rumored": [],
    }
    
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            for status_key, ipo_status in [("upcoming", "new"), ("pending", "pending"), ("rumored", "rumor")]:
                try:
                    resp = await client.get(
                        base_url,
                        params={
                            "ipo_status": ipo_status,
                            "order": "desc",
                            "sort": "listing_date",
                            "limit": 15,
                            "apiKey": api_key,
                        },
                    )
                    if resp.status_code == 200:
                        data = resp.json()
                        items = []
                        for ipo in data.get("results", []):
                            items.append({
                                "ticker": ipo.get("ticker", "N/A"),
                                "issuer_name": ipo.get("issuer_name", "Unknown"),
                                "listing_date": ipo.get("listing_date"),
                                "final_issue_price": ipo.get("final_issue_price"),
                                "lowest_offer_price": ipo.get("lowest_offer_price"),
                                "highest_offer_price": ipo.get("highest_offer_price"),
                                "total_offer_size": ipo.get("total_offer_size"),
                                "shares_outstanding": ipo.get("shares_outstanding"),
                                "primary_exchange": ipo.get("primary_exchange"),
                                "security_type": ipo.get("security_type"),
                                "ipo_status": ipo.get("ipo_status"),
                            })
                        results[status_key] = items
                    else:
                        print(f"IPO fetch for {ipo_status} returned {resp.status_code}")
                except Exception as inner_err:
                    print(f"IPO fetch error for {ipo_status}: {inner_err}")
        
        return results
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching IPO data: {str(e)}")


@router.get("/dividends/{ticker}")
async def get_dividends(ticker: str):
    """
    Get dividend information for a stock or ETF.

    Returns the most recent dividends plus a computed annual yield
    when a current price is available.
    """
    try:
        import asyncio

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
        raise HTTPException(status_code=500, detail=f"Error fetching dividends: {str(e)}")


@router.get("/search")
async def search_tickers(q: str = Query(..., min_length=1, description="Search query - ticker symbol or company name")):
    """
    Search for stocks by ticker symbol or company name using Massive API.
    Returns matching tickers with company names.
    """
    import httpx
    from app.config import settings
    
    api_key = settings.MASSIVE_API_KEY
    
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                "https://api.polygon.io/v3/reference/tickers",
                params={
                    "search": q.strip(),
                    "active": "true",
                    "market": "stocks",
                    "limit": 10,
                    "sort": "ticker",
                    "order": "asc",
                    "apiKey": api_key,
                },
            )
            
            if resp.status_code != 200:
                return {"results": []}
            
            data = resp.json()
            results = []
            for item in data.get("results", []):
                results.append({
                    "ticker": item.get("ticker"),
                    "name": item.get("name"),
                    "market": item.get("market"),
                    "type": item.get("type"),
                    "primary_exchange": item.get("primary_exchange"),
                    "active": item.get("active"),
                })
            
            return {"results": results}
            
    except Exception as e:
        print(f"Ticker search error: {e}")
        return {"results": []}


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