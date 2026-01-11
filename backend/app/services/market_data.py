"""
Market data service - Polygon.io integration
"""
import httpx
from typing import Dict, Any, Optional
from datetime import datetime, timezone, timedelta
from app.config import get_settings

settings = get_settings()


class MarketDataService:
    def __init__(self):
        self.base_url = "https://api.massive.com"
        self.api_key = settings.MASSIVE_API_KEY
        self.timeout = 10.0
    
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
                
                return {
                    "ticker": result.get("ticker", ticker),
                    "name": result.get("name", ""),
                    "description": result.get("description", ""),
                    "sector": result.get("sic_description", ""),
                    "industry": result.get("sic_description", ""),
                    "website": result.get("homepage_url", ""),
                    "exchange": result.get("primary_exchange", ""),
                    "market_cap": result.get("market_cap"),
                    "phone": result.get("phone_number", ""),
                    "employees": result.get("total_employees"),
                    "country": result.get("locale", "US")
                }
                
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


# Singleton instance
market_data_service = MarketDataService()