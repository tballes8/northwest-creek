"""
Company information service using yfinance
Simple, free alternative for basic company data
"""
import yfinance as yf
from typing import Dict, Any, Optional


def get_sector_from_yfinance(ticker: str) -> str:
    """
    Get sector information from Yahoo Finance
    
    Args:
        ticker: Stock symbol
        
    Returns:
        Standardized sector name
    """
    try:
        stock = yf.Ticker(ticker)
        info = stock.info
        
        # Get sector directly from yfinance
        sector = info.get('sector', 'Unknown')
        
        # yfinance returns standard sectors like:
        # - Technology
        # - Healthcare
        # - Financial Services
        # - Consumer Cyclical
        # - Consumer Defensive
        # - Energy
        # - Industrials
        # - Real Estate
        # - Utilities
        # - Communication Services
        # - Basic Materials
        
        # Map "Basic Materials" to "Materials" for consistency
        if sector == "Basic Materials":
            sector = "Materials"
        
        return sector
        
    except Exception as e:
        print(f"Error fetching sector from yfinance for {ticker}: {e}")
        return "Unknown"


def get_company_basics(ticker: str) -> Dict[str, Any]:
    """
    Get basic company information from Yahoo Finance
    
    Args:
        ticker: Stock symbol
        
    Returns:
        Dictionary with company info
    """
    try:
        stock = yf.Ticker(ticker)
        info = stock.info
        
        sector = info.get('sector', 'Unknown')
        if sector == "Basic Materials":
            sector = "Materials"
        
        return {
            "ticker": ticker.upper(),
            "name": info.get('longName', ticker),
            "sector": sector,
            "industry": info.get('industry', 'Unknown'),
            "market_cap": info.get('marketCap', 0),
            "current_price": info.get('currentPrice', 0),
            "website": info.get('website', ''),
            "description": info.get('longBusinessSummary', ''),
            "employees": info.get('fullTimeEmployees'),
            "country": info.get('country', 'US'),
            "exchange": info.get('exchange', '')
        }
        
    except Exception as e:
        print(f"Error fetching company info from yfinance for {ticker}: {e}")
        return {
            "ticker": ticker.upper(),
            "name": ticker,
            "sector": "Unknown",
            "industry": "Unknown",
            "market_cap": 0,
            "current_price": 0
        }