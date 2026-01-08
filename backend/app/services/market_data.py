"""
Market Data Service - Integrates with Alpha Vantage API for stock data
"""
import aiohttp
from typing import Optional, Dict, Any, List
from datetime import datetime, timedelta
from app.config import get_settings

settings = get_settings()


class MarketDataService:
    """Service for fetching stock market data from Alpha Vantage API"""
    
    BASE_URL = "https://www.alphavantage.co/query"
    
    def __init__(self):
        self.api_key = settings.ALPHA_VANTAGE_API_KEY
    
    async def get_quote(self, ticker: str) -> Dict[str, Any]:
        """
        Get current stock quote (15-minute delayed)
        
        Args:
            ticker: Stock symbol (e.g., 'AAPL', 'TSLA')
            
        Returns:
            Dict with price, change, volume, etc.
        """
        params = {
            "function": "GLOBAL_QUOTE",
            "symbol": ticker.upper(),
            "apikey": self.api_key
        }
        
        async with aiohttp.ClientSession() as session:
            async with session.get(self.BASE_URL, params=params) as response:
                if response.status == 200:
                    data = await response.json()
                    
                    # Check for API error messages
                    if "Error Message" in data:
                        raise ValueError(f"Ticker '{ticker}' not found")
                    if "Note" in data:
                        raise Exception("API rate limit exceeded. Please wait a moment.")
                    if "Global Quote" not in data or not data["Global Quote"]:
                        raise ValueError(f"No data available for ticker '{ticker}'")
                    
                    return self._format_quote(data, ticker.upper())
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
        params = {
            "function": "OVERVIEW",
            "symbol": ticker.upper(),
            "apikey": self.api_key
        }
        
        async with aiohttp.ClientSession() as session:
            async with session.get(self.BASE_URL, params=params) as response:
                if response.status == 200:
                    data = await response.json()
                    
                    # Check for errors
                    if "Error Message" in data:
                        raise ValueError(f"Company info for '{ticker}' not found")
                    if "Note" in data:
                        raise Exception("API rate limit exceeded. Please wait a moment.")
                    if not data or "Symbol" not in data:
                        raise ValueError(f"No company info available for '{ticker}'")
                    
                    return self._format_company_info(data)
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
        # Use TIME_SERIES_DAILY for up to 100 days
        # Use TIME_SERIES_DAILY with outputsize=full for more
        outputsize = "compact" if days <= 100 else "full"
        
        params = {
            "function": "TIME_SERIES_DAILY",
            "symbol": ticker.upper(),
            "outputsize": outputsize,
            "apikey": self.api_key
        }
        
        async with aiohttp.ClientSession() as session:
            async with session.get(self.BASE_URL, params=params) as response:
                if response.status == 200:
                    data = await response.json()
                    
                    # Check for errors
                    if "Error Message" in data:
                        raise ValueError(f"Historical data for '{ticker}' not found")
                    if "Note" in data:
                        raise Exception("API rate limit exceeded. Please wait a moment.")
                    if "Time Series (Daily)" not in data:
                        raise ValueError(f"No historical data available for '{ticker}'")
                    
                    return self._format_historical_data(data, days)
                else:
                    error_text = await response.text()
                    raise Exception(f"API error: {response.status} - {error_text}")
    
    def _format_quote(self, data: Dict[str, Any], ticker: str) -> Dict[str, Any]:
        """Format quote data from Alpha Vantage API response"""
        quote = data.get("Global Quote", {})
        
        # Alpha Vantage quote fields
        price = float(quote.get("05. price", 0))
        change = float(quote.get("09. change", 0))
        change_percent_str = quote.get("10. change percent", "0%").replace("%", "")
        change_percent = float(change_percent_str)
        
        previous_close = float(quote.get("08. previous close", 0))
        high = float(quote.get("03. high", 0))
        low = float(quote.get("04. low", 0))
        open_price = float(quote.get("02. open", 0))
        volume = int(quote.get("06. volume", 0))
        
        # Get timestamp or use current time
        timestamp_str = quote.get("07. latest trading day", "")
        if timestamp_str:
            timestamp = datetime.strptime(timestamp_str, "%Y-%m-%d").isoformat()
        else:
            timestamp = datetime.now().isoformat()
        
        return {
            "ticker": ticker,
            "price": price,
            "change": change,
            "change_percent": change_percent,
            "volume": volume,
            "high": high,
            "low": low,
            "open": open_price,
            "previous_close": previous_close,
            "timestamp": timestamp
        }
    
    def _format_company_info(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Format company info from Alpha Vantage API response"""
        
        # Convert market cap string to integer (e.g., "2450000000" or "2.45B")
        market_cap_str = data.get("MarketCapitalization", "0")
        try:
            market_cap = int(market_cap_str) if market_cap_str.isdigit() else None
        except:
            market_cap = None
        
        # Convert employees string to integer
        employees_str = data.get("FullTimeEmployees", "0")
        try:
            employees = int(employees_str) if employees_str else None
        except:
            employees = None
        
        return {
            "ticker": data.get("Symbol", "").upper(),
            "name": data.get("Name", ""),
            "description": data.get("Description", ""),
            "sector": data.get("Sector", ""),
            "industry": data.get("Industry", ""),
            "website": data.get("OfficialSite", ""),
            "exchange": data.get("Exchange", ""),
            "market_cap": market_cap,
            "phone": data.get("Phone", ""),
            "employees": employees,
            "country": data.get("Country", "USA"),
            "address": data.get("Address", ""),
            "fiscal_year_end": data.get("FiscalYearEnd", ""),
            "currency": data.get("Currency", "USD")
        }
    
    def _format_historical_data(self, data: Dict[str, Any], days: int) -> List[Dict[str, Any]]:
        """Format historical data from Alpha Vantage API response"""
        time_series = data.get("Time Series (Daily)", {})
        
        formatted = []
        
        # Get the most recent N days
        # Time series is already sorted by date (newest first)
        for date_str, values in list(time_series.items())[:days]:
            formatted.append({
                "date": date_str,
                "open": float(values.get("1. open", 0)),
                "high": float(values.get("2. high", 0)),
                "low": float(values.get("3. low", 0)),
                "close": float(values.get("4. close", 0)),
                "volume": int(values.get("5. volume", 0))
            })
        
        # Sort by date ascending (oldest first)
        formatted.sort(key=lambda x: x["date"])
        
        return formatted


# Global instance
market_data_service = MarketDataService()