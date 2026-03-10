"""
Stock API Endpoints
"""
import re
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
    
@router.get("/ipos")
async def get_ipos():
    """
    Get upcoming IPOs from FMP IPO calendar.
    Returns upcoming, confirmed, and recent IPOs.
    """
    import httpx
    from app.config import settings
    from datetime import datetime, timedelta

    api_key = settings.MASSIVE_API_KEY
    base_url = "https://financialmodelingprep.com/stable"

    today = datetime.now().strftime("%Y-%m-%d")
    thirty_days_ago = (datetime.now() - timedelta(days=30)).strftime("%Y-%m-%d")
    ninety_days_ahead = (datetime.now() + timedelta(days=90)).strftime("%Y-%m-%d")

    results = {
        "upcoming": [],
        "pending": [],
        "rumored": [],
    }

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            # Fetch upcoming IPOs (today through 90 days out)
            try:
                resp = await client.get(
                    f"{base_url}/ipo-calendar",
                    params={
                        "from": today,
                        "to": ninety_days_ahead,
                        "apikey": api_key,
                    },
                )
                if resp.status_code == 200:
                    data = resp.json()
                    if isinstance(data, list):
                        for ipo in data[:25]:
                            results["upcoming"].append({
                                "ticker": ipo.get("symbol", "N/A"),
                                "issuer_name": ipo.get("company", "Unknown"),
                                "listing_date": ipo.get("date"),
                                "announced_date": None,
                                "final_issue_price": ipo.get("price"),
                                "lowest_offer_price": ipo.get("priceRange", "").split("-")[0].strip() if ipo.get("priceRange") else None,
                                "highest_offer_price": ipo.get("priceRange", "").split("-")[-1].strip() if ipo.get("priceRange") else None,
                                "total_offer_size": ipo.get("numberOfShares"),
                                "shares_outstanding": None,
                                "primary_exchange": ipo.get("exchange"),
                                "security_type": None,
                                "security_description": ipo.get("actions"),
                                "ipo_status": "upcoming",
                                "last_updated": None,
                                "currency_code": "USD",
                                "min_shares_offered": None,
                                "max_shares_offered": None,
                            })
            except Exception as inner_err:
                print(f"IPO fetch error for upcoming: {inner_err}")

            # Fetch recent IPOs (last 30 days) as "pending/confirmed"
            try:
                resp = await client.get(
                    f"{base_url}/ipo-calendar",
                    params={
                        "from": thirty_days_ago,
                        "to": today,
                        "apikey": api_key,
                    },
                )
                if resp.status_code == 200:
                    data = resp.json()
                    if isinstance(data, list):
                        for ipo in data[:25]:
                            results["pending"].append({
                                "ticker": ipo.get("symbol", "N/A"),
                                "issuer_name": ipo.get("company", "Unknown"),
                                "listing_date": ipo.get("date"),
                                "announced_date": None,
                                "final_issue_price": ipo.get("price"),
                                "lowest_offer_price": None,
                                "highest_offer_price": None,
                                "total_offer_size": ipo.get("numberOfShares"),
                                "shares_outstanding": None,
                                "primary_exchange": ipo.get("exchange"),
                                "security_type": None,
                                "security_description": ipo.get("actions"),
                                "ipo_status": "recent",
                                "last_updated": None,
                                "currency_code": "USD",
                                "min_shares_offered": None,
                                "max_shares_offered": None,
                            })
            except Exception as inner_err:
                print(f"IPO fetch error for recent: {inner_err}")

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
        raise HTTPException(status_code=500, detail=f"Error fetching dividends: {_safe_error(e)}")


@router.get("/search")
async def search_tickers(q: str = Query(..., min_length=1, description="Search query - ticker symbol or company name")):
    """
    Search for stocks by ticker symbol or company name using FMP.
    Returns matching tickers with company names.
    """
    import httpx
    from app.config import settings

    api_key = settings.MASSIVE_API_KEY

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                "https://financialmodelingprep.com/stable/search",
                params={
                    "query": q.strip(),
                    "limit": 10,
                    "apikey": api_key,
                },
            )

            if resp.status_code != 200:
                return {"results": []}

            data = resp.json()
            if not isinstance(data, list):
                return {"results": []}

            results = []
            for item in data:
                results.append({
                    "ticker": item.get("symbol"),
                    "name": item.get("name"),
                    "market": "stocks",
                    "type": item.get("stockExchange"),
                    "primary_exchange": item.get("stockExchange"),
                    "active": True,
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
        raise HTTPException(status_code=404, detail=_safe_error(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching stock overview: {_safe_error(e)}")