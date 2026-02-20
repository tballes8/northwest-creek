"""
Market data service - Polygon.io integration
"""
import httpx, os
import pandas as pd
from typing import Dict, Any, Optional, List
from datetime import datetime, timezone, timedelta
from app.config import get_settings
from massive import RESTClient
from massive.rest.models import TickerSnapshot, Agg

settings = get_settings()


class MarketDataService:
    def __init__(self):
        self.base_url = "https://api.massive.com"
        self.api_key = settings.MASSIVE_API_KEY
        self.timeout = 10.0
        # Initialize Massive REST client for snapshot data
        self.rest_client = RESTClient(self.api_key)

    def _map_sic_to_sector(self, sic_description: str) -> str:
        """
        Map Polygon SIC description to standard sector categories
        
        Args:
            sic_description: SIC description from Polygon API
            
        Returns:
            Standardized sector name
        """
        sic_lower = sic_description.lower()
        
        # Technology sector keywords
        if any(keyword in sic_lower for keyword in [
            'computer', 'software', 'technology', 'semiconductor', 
            'internet', 'electronic', 'data processing', 'telecommunications',
            'information', 'tech'
        ]):
            return "Technology"
        
        # Healthcare sector keywords
        elif any(keyword in sic_lower for keyword in [
            'pharmaceutical', 'medical', 'health', 'biotechnology',
            'drug', 'hospital', 'surgical', 'dental', 'biotech'
        ]):
            return "Healthcare"
        
        # Financial Services sector keywords
        elif any(keyword in sic_lower for keyword in [
            'bank', 'finance', 'insurance', 'investment', 'securities',
            'credit', 'mortgage', 'financial', 'trust', 'asset management'
        ]):
            return "Financial Services"
        
        # Consumer Cyclical sector keywords
        elif any(keyword in sic_lower for keyword in [
            'retail', 'automobile', 'apparel', 'restaurant', 'hotel',
            'leisure', 'entertainment', 'travel', 'consumer durables',
            'home building', 'automotive'
        ]):
            return "Consumer Cyclical"
        
        # Consumer Defensive sector keywords
        elif any(keyword in sic_lower for keyword in [
            'food', 'beverage', 'tobacco', 'household', 'personal care',
            'consumer staples', 'grocery', 'packaged foods'
        ]):
            return "Consumer Defensive"
        
        # Energy sector keywords
        elif any(keyword in sic_lower for keyword in [
            'oil', 'gas', 'petroleum', 'energy', 'coal', 'fuel',
            'pipeline', 'exploration', 'drilling'
        ]):
            return "Energy"
        
        # Industrials sector keywords
        elif any(keyword in sic_lower for keyword in [
            'manufacturing', 'industrial', 'machinery', 'aerospace',
            'defense', 'construction', 'engineering', 'transportation',
            'logistics', 'shipping', 'freight'
        ]):
            return "Industrials"
        
        # Real Estate sector keywords
        elif any(keyword in sic_lower for keyword in [
            'real estate', 'reit', 'property', 'housing'
        ]):
            return "Real Estate"
        
        # Utilities sector keywords
        elif any(keyword in sic_lower for keyword in [
            'utility', 'utilities', 'electric', 'water', 'gas distribution',
            'power'
        ]):
            return "Utilities"
        
        # Communication Services sector keywords
        elif any(keyword in sic_lower for keyword in [
            'communication', 'broadcasting', 'media', 'publishing',
            'advertising', 'cable', 'wireless', 'telecom'
        ]):
            return "Communication Services"
        
        # Materials sector keywords
        elif any(keyword in sic_lower for keyword in [
            'chemical', 'metals', 'mining', 'paper', 'forest products',
            'steel', 'aluminum', 'copper', 'materials'
        ]):
            return "Materials"
        
        # Default to "Other" if no match
        else:
            return "Other"        
    
    async def get_quote(self, ticker: str) -> Dict[str, Any]:
        """
        Get real-time quote for a stock using Polygon.io
        """
        try:
            async with httpx.AsyncClient() as client:
                # Get previous day's data
                url = f"{self.base_url}/v2/aggs/ticker/{ticker}/prev"
                params = {"apiKey": self.api_key}
                
                response = await client.get(url, params=params, timeout=self.timeout)
                response.raise_for_status()
                data = response.json()
                
                if "results" not in data or not data["results"]:
                    raise ValueError(f"No data available for ticker '{ticker}'")
                
                result = data["results"][0]
                
                # Calculate change
                open_price = result.get("o", 0)
                close_price = result.get("c", 0)
                change = close_price - open_price
                change_percent = (change / open_price * 100) if open_price > 0 else 0
                
                return {
                    "ticker": ticker,
                    "price": close_price,
                    "change": change,
                    "change_percent": change_percent,
                    "volume": result.get("v", 0),
                    "high": result.get("h", 0),
                    "low": result.get("l", 0),
                    "open": open_price,
                    "previous_close": open_price,
                    "timestamp": datetime.fromtimestamp(result.get("t", 0) / 1000, tz=timezone.utc).isoformat()
                }
                
        except httpx.TimeoutException:
            raise ValueError(f"Timeout fetching data for {ticker}")
        except httpx.HTTPError as e:
            raise ValueError(f"HTTP error fetching data for {ticker}: {str(e)}")
        except Exception as e:
            raise ValueError(f"Error fetching quote for {ticker}: {str(e)}")
    
    async def get_company_info(self, ticker: str) -> Dict[str, Any]:
        """
        Get company information using Polygon.io
        For fund-type tickers (ETF, ETS, ETN, etc.), enriches with yfinance fund data.
        """
        try:
            async with httpx.AsyncClient() as client:
                url = f"{self.base_url}/v3/reference/tickers/{ticker}"
                params = {"apiKey": self.api_key}
                
                response = await client.get(url, params=params, timeout=self.timeout)
                response.raise_for_status()
                data = response.json()
                
                if "results" not in data:
                    raise ValueError(f"No company info available for '{ticker}'")
                
                result = data["results"]
                
                sic_description = result.get("sic_description", "").lower()
                sector = self._map_sic_to_sector(sic_description)

                company = {
                    "ticker": result.get("ticker", ticker),
                    "name": result.get("name", ""),
                    "description": result.get("description", ""),
                    "sector": sector,
                    "industry": result.get("sic_description", ""),
                    "website": result.get("homepage_url", ""),
                    "exchange": result.get("primary_exchange", ""),
                    "market_cap": result.get("market_cap"),
                    "phone": result.get("phone_number", ""),
                    "employees": result.get("total_employees"),
                    "country": result.get("locale", "US"),
                    "type": result.get("type", ""),
                    # Fund-specific fields default to None
                    "fund_description": None,
                    "fund_category": None,
                    "fund_family": None,
                    "fund_expense_ratio": None,
                    "fund_inception_date": None,
                    "fund_total_assets": None,
                }

                # If this is a fund-type ticker, enrich with yfinance fund data
                fund_types = {"ETF", "ETS", "ETN", "ETV", "ETD"}
                if company["type"] in fund_types:
                    try:
                        import asyncio
                        from app.services.company_info import get_company_basics

                        yf_data = await asyncio.to_thread(get_company_basics, ticker)

                        # Merge fund-specific fields from yfinance
                        company["fund_description"] = yf_data.get("fund_description")
                        company["fund_category"] = yf_data.get("fund_category")
                        company["fund_family"] = yf_data.get("fund_family")
                        company["fund_expense_ratio"] = yf_data.get("fund_expense_ratio")
                        company["fund_inception_date"] = yf_data.get("fund_inception_date")
                        company["fund_total_assets"] = yf_data.get("fund_total_assets")

                        # If Polygon description is empty, use yfinance description
                        if not company["description"]:
                            company["description"] = yf_data.get("fund_description") or yf_data.get("description") or ""
                    except Exception as e:
                        print(f"Warning: Could not enrich ETF data from yfinance for {ticker}: {e}")

                return company

        except httpx.TimeoutException:
            raise ValueError(f"Timeout fetching company info for {ticker}")
        except httpx.HTTPError as e:
            raise ValueError(f"HTTP error fetching company info for {ticker}: {str(e)}")
        except Exception as e:
            raise ValueError(f"Error fetching company info for {ticker}: {str(e)}")
                
    async def get_historical_prices(
        self,
        ticker: str,
        days: int = 30
    ) -> list[Dict[str, Any]]:
        """
        Get historical price data using Polygon.io
        """
        try:
            # Calculate date range
            end_date = datetime.now(timezone.utc)
            start_date = end_date - timedelta(days=days)
            
            from_date = start_date.strftime("%Y-%m-%d")
            to_date = end_date.strftime("%Y-%m-%d")
            
            async with httpx.AsyncClient() as client:
                url = f"{self.base_url}/v2/aggs/ticker/{ticker}/range/1/day/{from_date}/{to_date}"
                params = {"apiKey": self.api_key}
                
                response = await client.get(url, params=params, timeout=self.timeout)
                response.raise_for_status()
                data = response.json()
                
                if "results" not in data or not data["results"]:
                    raise ValueError(f"No historical data available for '{ticker}'")
                
                results = []
                for item in data["results"]:
                    date = datetime.fromtimestamp(item["t"] / 1000, tz=timezone.utc).strftime("%Y-%m-%d")
                    results.append({
                        "date": date,
                        "open": item.get("o", 0),
                        "high": item.get("h", 0),
                        "low": item.get("l", 0),
                        "close": item.get("c", 0),
                        "volume": item.get("v", 0)
                    })
                
                # Sort by date ascending
                results.sort(key=lambda x: x["date"])
                
                return results
                
        except httpx.TimeoutException:
            raise ValueError(f"Timeout fetching historical data for {ticker}")
        except httpx.HTTPError as e:
            raise ValueError(f"HTTP error fetching historical data for {ticker}: {str(e)}")
        except Exception as e:
            raise ValueError(f"Error fetching historical data for {ticker}: {str(e)}")


    async def get_stock_news(self, ticker: str, limit: int = 3) -> List[Dict[str, Any]]:
        """
        Fetch latest news articles for a stock ticker from Polygon.io
        
        Args:
            ticker: Stock symbol
            limit: Number of articles to return (default 3)
            
        Returns:
            List of news article dictionaries
            
        Raises:
            ValueError: If ticker is invalid
            Exception: If API request fails
        """
        try:
            ticker = ticker.upper().strip()
            if not ticker:
                raise ValueError("Ticker symbol is required")
            
            # Calculate date range (last 6 months)
            end_date = datetime.now()
            start_date = end_date - timedelta(days=180)
            start_date_str = start_date.strftime("%Y-%m-%d")
            
            # Fetch news from Polygon.io
            # Note: Replace 'self.polygon_client' with your actual Polygon client instance
            news_results = self.polygon_client.list_ticker_news(
                ticker,
                published_utc_gte=start_date_str,
                order="desc",
                limit=limit * 3  # Fetch more than needed to filter
            )
            
            articles = []
            count = 0
            
            for article in news_results:
                if count >= limit:
                    break
                    
                # Parse publication date
                pub_str = article.published_utc or ""
                if pub_str:
                    try:
                        # Handle ISO format with Z suffix
                        dt = datetime.fromisoformat(pub_str.replace("Z", "+00:00"))
                        published_utc = dt.isoformat()
                    except Exception:
                        # Fallback to original string
                        published_utc = pub_str
                else:
                    published_utc = datetime.now().isoformat()
                
                # Build article data
                article_data = {
                    "title": article.title or "No title available",
                    "publisher": article.publisher.name if hasattr(article, 'publisher') and article.publisher else "Unknown",
                    "published_utc": published_utc,
                    "article_url": article.article_url or "",
                    "summary": getattr(article, 'description', None) or getattr(article, 'summary', None),
                }
                
                # Add sentiment insights if available
                if hasattr(article, "insights") and article.insights:
                    insights = []
                    for insight in article.insights[:4]:  # Top 4 insights
                        insight_data = {
                            "ticker": insight.ticker if hasattr(insight, 'ticker') else ticker,
                            "sentiment": insight.sentiment if hasattr(insight, 'sentiment') else "neutral",
                            "sentiment_reasoning": insight.sentiment_reasoning if hasattr(insight, 'sentiment_reasoning') else ""
                        }
                        insights.append(insight_data)
                    article_data["insights"] = insights
                else:
                    article_data["insights"] = None
                
                articles.append(article_data)
                count += 1
            
            if not articles:
                # Return empty list if no news found (not an error)
                return []
            
            return articles
            
        except Exception as e:
            # Log the error
            print(f"Error fetching news for {ticker}: {str(e)}")
            raise Exception(f"Failed to fetch news: {str(e)}")
    
    async def get_stock_news_rest(self, ticker: str, limit: int = 3) -> List[Dict[str, Any]]:
        """
        Alternative implementation using Polygon REST API directly
        Use this if you're using RESTClient instead of the SDK
        """
        try:
            ticker = ticker.upper().strip()
            if not ticker:
                raise ValueError("Ticker symbol is required")
            
            # Use the initialized REST client
            client = self.rest_client
            
            # Calculate date range
            end_date = datetime.now()
            start_date = end_date - timedelta(days=180)
            start_date_str = start_date.strftime("%Y-%m-%d")
            
            # Fetch news
            news_results = client.list_ticker_news(
                ticker=ticker,
                published_utc_gte=start_date_str,
                order="desc",
                limit=limit * 2
            )
            
            articles = []
            for i, article in enumerate(news_results):
                if i >= limit:
                    break
                
                # Parse date
                pub_str = article.published_utc or ""
                try:
                    dt = datetime.fromisoformat(pub_str.replace("Z", "+00:00"))
                    published_utc = dt.isoformat()
                except:
                    published_utc = pub_str or datetime.now().isoformat()
                
                # Build article
                article_data = {
                    "title": article.title or "No title",
                    "publisher": article.publisher.name if article.publisher else "Unknown",
                    "published_utc": published_utc,
                    "article_url": article.article_url or "",
                    "summary": None,
                }
                
                # Add insights
                if hasattr(article, "insights") and article.insights:
                    article_data["insights"] = [
                        {
                            "ticker": ins.ticker,
                            "sentiment": ins.sentiment,
                            "sentiment_reasoning": ins.sentiment_reasoning or ""
                        }
                        for ins in article.insights[:4]
                    ]
                
                articles.append(article_data)
            
            return articles
            
        except Exception as e:
            print(f"Error fetching news: {str(e)}")
            raise Exception(f"Failed to fetch news: {str(e)}")
    
    async def get_dividends(self, ticker: str, limit: int = 10) -> Dict[str, Any]:
        """
        Fetch dividend history for a stock/ETF from Massive API.

        Args:
            ticker: Stock or ETF symbol
            limit: Max number of dividend records to return (default 10)

        Returns:
            dict with 'ticker', 'dividends' list, and 'has_dividends' bool
        """
        try:
            ticker = ticker.upper().strip()
            if not ticker:
                raise ValueError("Ticker symbol is required")

            async with httpx.AsyncClient() as client:
                resp = await client.get(
                    f"{self.base_url}/v3/reference/dividends",
                    params={
                        "ticker": ticker,
                        "order": "desc",
                        "sort": "ex_dividend_date",
                        "limit": limit,
                        "apiKey": self.api_key,
                    },
                    timeout=self.timeout,
                )

                if resp.status_code != 200:
                    return {
                        "ticker": ticker,
                        "dividends": [],
                        "has_dividends": False,
                    }

                data = resp.json()
                results = data.get("results", [])

                dividends = []
                for d in results:
                    dividends.append({
                        "cash_amount": d.get("cash_amount"),
                        "currency": d.get("currency", "USD"),
                        "declaration_date": d.get("declaration_date"),
                        "ex_dividend_date": d.get("ex_dividend_date"),
                        "pay_date": d.get("pay_date"),
                        "record_date": d.get("record_date"),
                        "frequency": d.get("frequency"),
                        "distribution_type": d.get("dividend_type") or d.get("distribution_type", "unknown"),
                    })

                return {
                    "ticker": ticker,
                    "dividends": dividends,
                    "has_dividends": len(dividends) > 0,
                }

        except Exception as e:
            print(f"Error fetching dividends for {ticker}: {e}")
            return {
                "ticker": ticker,
                "dividends": [],
                "has_dividends": False,
            }

    # Security types allowed in gainers/losers (excludes WARRANT, RIGHT, UNIT)
    ALLOWED_SECURITY_TYPES = {'CS', 'ADRC', 'PFD', 'ETF', 'ETS', 'ETN', 'ETV'}

    def _snapshot_to_df(self) -> pd.DataFrame:
        """
        Load all stock snapshots into a DataFrame and filter out
        non-equity security types (warrants, rights, units, etc.).
        """
        snapshot = self.rest_client.get_snapshot_all("stocks")

        rows = []
        for item in snapshot:
            if isinstance(item, TickerSnapshot) and isinstance(item.prev_day, Agg):
                o = item.prev_day.open
                c = item.prev_day.close
                if isinstance(o, float) and isinstance(c, float) and o != 0:
                    rows.append({
                        'ticker': item.ticker,
                        'type': getattr(item, 'type', None) or '',
                        'open': round(o, 2),
                        'close': round(c, 2),
                        'change_percent': round((c - o) / o * 100, 2),
                    })

        df = pd.DataFrame(rows)
        if df.empty:
            return df

        # Keep allowed types + unknown (empty) so we don't drop stocks
        # whose type field isn't populated on the v2 snapshot endpoint
        df = df[df['type'].isin(self.ALLOWED_SECURITY_TYPES) | (df['type'] == '')]
        return df.drop(columns=['type'])

    async def get_top_gainers(self, limit: int = 10) -> Dict[str, Any]:
        """Get top stock gainers, excluding warrants/rights/units"""
        try:
            if limit < 1 or limit > 50:
                raise ValueError("Limit must be between 1 and 50")

            df = self._snapshot_to_df()
            top = (
                df.sort_values('change_percent', ascending=False)
                  .head(limit)
                  .to_dict('records')
            ) if not df.empty else []

            return {
                'timestamp': datetime.now().isoformat(),
                'generated_at': datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                'top_gainers': top,
            }
        except Exception as e:
            raise Exception(f"Failed to fetch top gainers: {str(e)}")

    async def get_top_losers(self, limit: int = 10) -> Dict[str, Any]:
        """Get top stock losers, excluding warrants/rights/units"""
        try:
            if limit < 1 or limit > 50:
                raise ValueError("Limit must be between 1 and 50")

            df = self._snapshot_to_df()
            top = (
                df.sort_values('change_percent', ascending=True)
                  .head(limit)
                  .to_dict('records')
            ) if not df.empty else []

            return {
                'timestamp': datetime.now().isoformat(),
                'generated_at': datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                'top_losers': top,
            }
        except Exception as e:
            raise Exception(f"Failed to fetch top losers: {str(e)}")
        

# Singleton instance
market_data_service = MarketDataService()