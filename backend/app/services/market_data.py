"""
Market data service - Financial Modeling Prep (FMP) integration
"""
import re
import httpx
from typing import Dict, Any, List
from datetime import datetime, timezone, timedelta
from app.config import get_settings
from app.services.fmp_client import get_fmp_client
from app.utils.cache import SimpleCache

settings = get_settings()


def _safe_error(e: Exception) -> str:
    """Strip API keys and sensitive params from error messages."""
    msg = str(e)
    msg = re.sub(r'apiKey=[^&\s\'"]+', 'apiKey=***', msg)
    msg = re.sub(r'apikey=[^&\s\'"]+', 'apikey=***', msg)
    msg = re.sub(r'api_key=[^&\s\'"]+', 'api_key=***', msg)
    msg = re.sub(r'token=[^&\s\'"]+', 'token=***', msg)
    return msg


class MarketDataService:

    def __init__(self):
        self.api_key = settings.MASSIVE_API_KEY
        self._quote_cache = SimpleCache(ttl_seconds=15)
        self._profile_cache = SimpleCache(ttl_seconds=3600)
        self._dividend_cache = SimpleCache(ttl_seconds=43200)  # 12 hours — dividends change quarterly

    @staticmethod
    def _is_warrant_ticker(ticker: str) -> bool:
        """Fast heuristic pre-filter for obvious warrant tickers."""
        t = ticker.upper().strip()
        for suffix in ('.WS', '.WT', '.W', '+WS', '+WT', '+W', '/WS', '/WT', '/W'):
            if t.endswith(suffix):
                return True
        if t.endswith('WW') or t.endswith('+'):
            return True
        if len(t) > 4 and t.endswith('WS') and t[-3].isalpha():
            return True
        return False

    async def _fmp_get(self, path: str, params: dict = None) -> Any:
        """Central FMP request helper. Appends apikey and handles errors."""
        if params is None:
            params = {}
        params["apikey"] = self.api_key
        client = get_fmp_client()
        response = await client.get(
            path,
            params=params,
        )
        response.raise_for_status()
        return response.json()

    @staticmethod
    def _format_timestamp(ts) -> str:
        """Convert an FMP timestamp (int epoch or string) to ISO string."""
        if ts is None:
            return datetime.now(timezone.utc).isoformat()
        if isinstance(ts, (int, float)):
            return datetime.fromtimestamp(ts, tz=timezone.utc).isoformat()
        return str(ts)

    async def get_quote(self, ticker: str) -> Dict[str, Any]:
        """
        Get real-time quote for a stock using FMP.
        FMP /stable/quote returns a list; we take the first element.
        """
        cache_key = f"quote:{ticker.upper()}"
        cached = self._quote_cache.get(cache_key)
        if cached is not None:
            return cached

        try:
            data = await self._fmp_get("quote", {"symbol": ticker})

            if not data or not isinstance(data, list) or len(data) == 0:
                raise ValueError(f"No data available for ticker '{ticker}'")

            result = data[0]

            quote = {
                "ticker": ticker,
                "price": result.get("price", 0),
                "change": result.get("change", 0),
                "change_percent": result.get("changePercentage", 0),
                "volume": int(result.get("volume", 0)),
                "high": result.get("dayHigh", 0),
                "low": result.get("dayLow", 0),
                "open": result.get("open", 0),
                "previous_close": result.get("previousClose", 0),
                "timestamp": self._format_timestamp(result.get("timestamp")),
            }

            self._quote_cache.set(cache_key, quote)
            return quote

        except httpx.TimeoutException:
            raise ValueError(f"Timeout fetching data for {ticker}")
        except httpx.HTTPError as e:
            raise ValueError(f"HTTP error fetching data for {ticker}: {_safe_error(e)}")
        except Exception as e:
            raise ValueError(f"Error fetching quote for {ticker}: {_safe_error(e)}")

    async def get_batch_quotes(self, tickers: List[str]) -> Dict[str, Dict[str, Any]]:
        """
        Fetch quotes for multiple tickers in a single FMP API call.
        Returns a dict keyed by ticker symbol with the same format as get_quote().
        """
        if not tickers:
            return {}

        symbols = ",".join(t.upper().strip() for t in tickers)
        try:
            data = await self._fmp_get("batch-quote", {"symbols": symbols})

            if not data or not isinstance(data, list):
                return {}

            quotes = {}
            for result in data:
                symbol = result.get("symbol", "")
                quotes[symbol.upper()] = {
                    "ticker": symbol,
                    "price": result.get("price", 0),
                    "change": result.get("change", 0),
                    "change_percent": result.get("changePercentage", 0),
                    "volume": int(result.get("volume", 0)),
                    "high": result.get("dayHigh", 0),
                    "low": result.get("dayLow", 0),
                    "open": result.get("open", 0),
                    "previous_close": result.get("previousClose", 0),
                    "timestamp": self._format_timestamp(result.get("timestamp")),
                }
            return quotes

        except Exception as e:
            print(f"Error fetching batch quotes: {_safe_error(e)}")
            return {}

    async def get_company_info(self, ticker: str) -> Dict[str, Any]:
        """
        Get company information using FMP /stable/profile.
        FMP profiles include sector directly — no SIC mapping needed.
        For fund-type tickers (ETF, etc.), FMP profile includes fund fields.
        """
        cache_key = f"profile:{ticker.upper()}"
        cached = self._profile_cache.get(cache_key)
        if cached is not None:
            return cached

        try:
            data = await self._fmp_get("profile", {"symbol": ticker})

            if not data or not isinstance(data, list) or len(data) == 0:
                raise ValueError(f"No company info available for '{ticker}'")

            result = data[0]

            is_etf = result.get("isEtf", False)

            company = {
                "ticker": result.get("symbol", ticker),
                "name": result.get("companyName", ""),
                "description": result.get("description", ""),
                "sector": result.get("sector", "Other"),
                "industry": result.get("industry", ""),
                "website": result.get("website", ""),
                "exchange": result.get("exchangeShortName", ""),
                "market_cap": result.get("mktCap"),
                "phone": result.get("phone", ""),
                "employees": result.get("fullTimeEmployees"),
                "country": result.get("country", "US"),
                "type": "ETF" if is_etf else (result.get("type", "") or "CS"),
                # Fund-specific fields
                "fund_description": result.get("description") if is_etf else None,
                "fund_category": result.get("industry") if is_etf else None,
                "fund_family": None,
                "fund_expense_ratio": None,
                "fund_inception_date": result.get("ipoDate") if is_etf else None,
                "fund_total_assets": result.get("mktCap") if is_etf else None,
            }

            self._profile_cache.set(cache_key, company)
            return company

        except httpx.TimeoutException:
            raise ValueError(f"Timeout fetching company info for {ticker}")
        except httpx.HTTPError as e:
            raise ValueError(f"HTTP error fetching company info for {ticker}: {_safe_error(e)}")
        except Exception as e:
            raise ValueError(f"Error fetching company info for {ticker}: {_safe_error(e)}")

    async def get_historical_prices(
        self,
        ticker: str,
        days: int = 30
    ) -> list[Dict[str, Any]]:
        """
        Get historical price data using FMP /stable/historical-price-eod/full.
        """
        try:
            end_date = datetime.now(timezone.utc)
            start_date = end_date - timedelta(days=days)

            from_date = start_date.strftime("%Y-%m-%d")
            to_date = end_date.strftime("%Y-%m-%d")

            data = await self._fmp_get("historical-price-eod/full", {
                "symbol": ticker,
                "from": from_date,
                "to": to_date,
            })

            # FMP returns {"symbol": "X", "historical": [...]}
            historical = []
            if isinstance(data, dict):
                historical = data.get("historical", [])
            elif isinstance(data, list):
                historical = data

            if not historical:
                raise ValueError(f"No historical data available for '{ticker}'")

            results = []
            for item in historical:
                results.append({
                    "date": item.get("date", ""),
                    "open": item.get("open", 0),
                    "high": item.get("high", 0),
                    "low": item.get("low", 0),
                    "close": item.get("close", 0),
                    "volume": int(item.get("volume", 0)),
                })

            # FMP returns newest-first; sort ascending for consistency
            results.sort(key=lambda x: x["date"])

            return results

        except httpx.TimeoutException:
            raise ValueError(f"Timeout fetching historical data for {ticker}")
        except httpx.HTTPError as e:
            raise ValueError(f"HTTP error fetching historical data for {ticker}: {_safe_error(e)}")
        except Exception as e:
            raise ValueError(f"Error fetching historical data for {ticker}: {_safe_error(e)}")

    async def get_stock_news(self, ticker: str, limit: int = 3) -> List[Dict[str, Any]]:
        """
        Fetch latest news articles for a stock ticker from FMP.
        """
        try:
            ticker = ticker.upper().strip()
            if not ticker:
                raise ValueError("Ticker symbol is required")

            data = await self._fmp_get("news/stock-latest", {
                "tickers": ticker,
                "limit": limit,
            })

            if not data or not isinstance(data, list):
                return []

            articles = []
            for article in data[:limit]:
                published_utc = article.get("publishedDate", datetime.now().isoformat())

                article_data = {
                    "title": article.get("title", "No title available"),
                    "publisher": article.get("site", "Unknown"),
                    "published_utc": published_utc,
                    "article_url": article.get("url", ""),
                    "summary": article.get("text"),
                    "insights": None,
                }

                # FMP includes sentiment on some plans
                sentiment = article.get("sentiment")
                if sentiment:
                    article_data["insights"] = [{
                        "ticker": ticker,
                        "sentiment": sentiment,
                        "sentiment_reasoning": article.get("sentimentReasoning", ""),
                    }]

                articles.append(article_data)

            return articles

        except Exception as e:
            print(f"Error fetching news for {ticker}: {_safe_error(e)}")
            raise Exception(f"Failed to fetch news: {_safe_error(e)}")

    async def get_stock_news_rest(self, ticker: str, limit: int = 3) -> List[Dict[str, Any]]:
        """Alias for get_stock_news — kept for backward compatibility."""
        return await self.get_stock_news(ticker, limit)

# Mapping from FMP frequency strings to annual payment counts
    FREQ_STR_TO_INT = {
        "annual": 1,
        "annually": 1,
        "semi-annual": 2,
        "semi-annually": 2,
        "trimester": 3,
        "quarterly": 4,
        "bi-monthly": 6,
        "monthly": 12,
        "bi-weekly": 26,
        "weekly": 52,
    }

    async def get_dividends(self, ticker: str, limit: int = 10) -> Dict[str, Any]:
        """
        Fetch dividend history for a stock/ETF from FMP.
        FMP returns frequency as a string (e.g. "Quarterly", "Weekly").
        We convert it to an integer (payments per year) for yield calculation.
        """
        try:
            ticker = ticker.upper().strip()
            if not ticker:
                raise ValueError("Ticker symbol is required")

            cache_key = f"dividends:{ticker}"
            cached = self._dividend_cache.get(cache_key)
            if cached is not None:
                return cached

            data = await self._fmp_get("dividends", {"symbol": ticker})

            if not data or not isinstance(data, list):
                return {
                    "ticker": ticker,
                    "dividends": [],
                    "has_dividends": False,
                }

            dividends = []
            for d in data[:limit]:
                # Convert FMP string frequency to integer
                raw_freq = d.get("frequency")
                if isinstance(raw_freq, str):
                    freq_int = self.FREQ_STR_TO_INT.get(raw_freq.strip().lower())
                elif isinstance(raw_freq, (int, float)):
                    freq_int = int(raw_freq) if raw_freq > 0 else None
                else:
                    freq_int = None

                dividends.append({
                    "cash_amount": d.get("dividend") or d.get("adjDividend"),
                    "currency": "USD",
                    "declaration_date": d.get("declarationDate"),
                    "ex_dividend_date": d.get("date"),
                    "pay_date": d.get("paymentDate"),
                    "record_date": d.get("recordDate"),
                    "frequency": freq_int,
                    "distribution_type": d.get("label") or raw_freq or "dividend",
                })

            result = {
                "ticker": ticker,
                "dividends": dividends,
                "has_dividends": len(dividends) > 0,
            }
            self._dividend_cache.set(cache_key, result)
            return result

        except Exception as e:
            print(f"Error fetching dividends for {ticker}: {e}")
            return {
                "ticker": ticker,
                "dividends": [],
                "has_dividends": False,
            }
        
    async def get_top_gainers(self, limit: int = 10) -> Dict[str, Any]:
        """
        Get top stock gainers from FMP /stable/gainers.
        Heuristic filter removes obvious warrants.
        """
        try:
            if limit < 1 or limit > 50:
                raise ValueError("Limit must be between 1 and 50")

            data = await self._fmp_get("biggest-gainers")

            if not data or not isinstance(data, list):
                return {
                    'timestamp': datetime.now().isoformat(),
                    'generated_at': datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                    'top_gainers': [],
                }

            filtered = []
            for item in data:
                ticker = item.get("symbol", "")
                if self._is_warrant_ticker(ticker):
                    continue

                filtered.append({
                    'ticker': ticker,
                    'open': item.get("open"),
                    'close': item.get("price"),
                    'change_percent': round(item.get("changesPercentage", 0), 2),
                })

                if len(filtered) >= limit:
                    break

            return {
                'timestamp': datetime.now().isoformat(),
                'generated_at': datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                'top_gainers': filtered,
            }

        except Exception as e:
            raise Exception(f"Failed to fetch top gainers: {_safe_error(e)}")

    async def get_top_losers(self, limit: int = 10) -> Dict[str, Any]:
        """
        Get top stock losers from FMP /stable/losers.
        Heuristic filter removes obvious warrants.
        """
        try:
            if limit < 1 or limit > 50:
                raise ValueError("Limit must be between 1 and 50")

            data = await self._fmp_get("biggest-losers")

            if not data or not isinstance(data, list):
                return {
                    'timestamp': datetime.now().isoformat(),
                    'generated_at': datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                    'top_losers': [],
                }

            filtered = []
            for item in data:
                ticker = item.get("symbol", "")
                if self._is_warrant_ticker(ticker):
                    continue

                filtered.append({
                    'ticker': ticker,
                    'open': item.get("open"),
                    'close': item.get("price"),
                    'change_percent': round(item.get("changesPercentage", 0), 2),
                })

                if len(filtered) >= limit:
                    break

            return {
                'timestamp': datetime.now().isoformat(),
                'generated_at': datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                'top_losers': filtered,
            }

        except Exception as e:
            raise Exception(f"Failed to fetch top losers: {_safe_error(e)}")


# Singleton instance
market_data_service = MarketDataService()