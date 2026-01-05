"""
Market Data Service - Integrates with Massive API for stock data
"""
import aiohttp
from typing import Optional, Dict, Any, List
from datetime import datetime, timedelta
from app.config import get_settings

settings = get_settings()


class MarketDataService:
    """Service for fetching stock market data from Massive API"""
    
    BASE_URL = "https://api.massive.com"
    
    def __init__(self):
        self.api_key = settings.MASSIVE_API_KEY
    
    async def get_quote(self, ticker: str) -> Dict[str, Any]:
        """
        Get current stock quote (previous day's data)
        
        Args:
            ticker: Stock symbol (e.g., 'AAPL', 'TSLA')
            
        Returns:
            Dict with price, change, volume, etc.
        """
        # Use previous day endpoint for quote data
        url = f"{self.BASE_URL}/v2/aggs/ticker/{ticker.upper()}/prev"
        params = {"apiKey": self.api_key}
        
        async with aiohttp.ClientSession() as session:
            async with session.get(url, params=params) as response:
                if response.status == 200:
                    data = await response.json()
                    return self._format_quote(data, ticker.upper())
                elif response.status == 404:
                    raise ValueError(f"Ticker '{ticker}' not found")
                elif response.status == 401 or response.status == 403:
                    raise ValueError("Invalid API key or unauthorized access")
                else:
                    error_text = await response.text()
                    raise Exception(f"API error: {response.status} - {error_text}")
    
    async def get_company_info(self, ticker: str) -> Dict[str, Any]:
        """
        Get company information
        
        Args:
            ticker: Stock symbol
            
        Returns:
            Dict with company name, sector, description, etc.
        """
        url = f"{self.BASE_URL}/v3/reference/tickers/{ticker.upper()}"
        params = {"apiKey": self.api_key}
        
        async with aiohttp.ClientSession() as session:
            async with session.get(url, params=params) as response:
                if response.status == 200:
                    data = await response.json()
                    return self._format_company_info(data)
                elif response.status == 404:
                    raise ValueError(f"Company info for '{ticker}' not found")
                else:
                    error_text = await response.text()
                    raise Exception(f"API error: {response.status} - {error_text}")
    
    async def get_historical_prices(
        self, 
        ticker: str, 
        days: int = 30
    ) -> List[Dict[str, Any]]:
        """
        Get historical price data
        
        Args:
            ticker: Stock symbol
            days: Number of days of history (default 30)
            
        Returns:
            List of price data by date
        """
        # Calculate date range
        end_date = datetime.now()
        start_date = end_date - timedelta(days=days)
        
        # Format dates as YYYY-MM-DD
        from_date = start_date.strftime("%Y-%m-%d")
        to_date = end_date.strftime("%Y-%m-%d")
        
        url = f"{self.BASE_URL}/v2/aggs/ticker/{ticker.upper()}/range/1/day/{from_date}/{to_date}"
        params = {"apiKey": self.api_key}
        
        async with aiohttp.ClientSession() as session:
            async with session.get(url, params=params) as response:
                if response.status == 200:
                    data = await response.json()
                    return self._format_historical_data(data)
                elif response.status == 404:
                    raise ValueError(f"Historical data for '{ticker}' not found")
                else:
                    error_text = await response.text()
                    raise Exception(f"API error: {response.status} - {error_text}")
    
    def _format_quote(self, data: Dict[str, Any], ticker: str) -> Dict[str, Any]:
        """Format quote data from API response"""
        # Massive API returns results array
        results = data.get("results", [])
        if not results:
            raise ValueError("No quote data available")
        
        quote = results[0]
        
        # Calculate change and change percent
        close = float(quote.get("c", 0))
        open_price = float(quote.get("o", 0))
        change = close - open_price
        change_percent = (change / open_price * 100) if open_price else 0
        
        return {
            "ticker": ticker,
            "price": close,
            "change": change,
            "change_percent": change_percent,
            "volume": int(quote.get("v", 0)),
            "high": float(quote.get("h", 0)),
            "low": float(quote.get("l", 0)),
            "open": open_price,
            "previous_close": open_price,
            "timestamp": datetime.fromtimestamp(quote.get("t", 0) / 1000).isoformat() if quote.get("t") else datetime.now().isoformat()
        }
    
    def _format_company_info(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Format company info from API response"""
        results = data.get("results", {})
        
        return {
            "ticker": results.get("ticker", "").upper(),
            "name": results.get("name", ""),
            "description": results.get("description", ""),
            "sector": results.get("sic_description", ""),
            "industry": results.get("sic_description", ""),
            "website": results.get("homepage_url", ""),
            "exchange": results.get("primary_exchange", ""),
            "market_cap": results.get("market_cap"),
            "phone": results.get("phone_number", ""),
            "employees": results.get("total_employees"),
            "country": results.get("locale", "USA")
        }
    
    def _format_historical_data(self, data: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Format historical data from API response"""
        results = data.get("results", [])
        
        formatted = []
        for item in results:
            # Convert timestamp (milliseconds) to date
            timestamp = item.get("t", 0)
            date = datetime.fromtimestamp(timestamp / 1000).strftime("%Y-%m-%d") if timestamp else None
            
            formatted.append({
                "date": date,
                "open": float(item.get("o", 0)),
                "high": float(item.get("h", 0)),
                "low": float(item.get("l", 0)),
                "close": float(item.get("c", 0)),
                "volume": int(item.get("v", 0))
            })
        
        return formatted


# Global instance
market_data_service = MarketDataService()
