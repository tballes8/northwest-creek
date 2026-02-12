"""
Company information service using yfinance
Simple, free alternative for basic company data
"""
import yfinance as yf
from typing import Dict, Any, Optional


# Polygon/Massive type codes that indicate a fund product
FUND_TYPE_CODES = {"ETF", "ETS", "ETN", "ETV", "ETD"}


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
    Get basic company information from Yahoo Finance.
    For ETFs/funds, also fetches investment objective, category, fund family,
    expense ratio, inception date, and total assets via yfinance funds_data.
    
    Args:
        ticker: Stock symbol
        
    Returns:
        Dictionary with company info (and fund-specific fields when applicable)
    """
    try:
        stock = yf.Ticker(ticker)
        info = stock.info
        
        sector = info.get('sector', 'Unknown')
        if sector == "Basic Materials":
            sector = "Materials"
        
        result = {
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
            "exchange": info.get('exchange', ''),
            # Fund-specific fields (null for stocks)
            "fund_description": None,
            "fund_category": None,
            "fund_family": None,
            "fund_expense_ratio": None,
            "fund_inception_date": None,
            "fund_total_assets": None,
        }

        # Detect if this is a fund-type ticker via yfinance's quoteType
        quote_type = info.get('quoteType', '')  # e.g. 'ETF', 'MUTUALFUND'
        is_fund = quote_type in ('ETF', 'MUTUALFUND')

        if is_fund:
            # Pick up total assets and inception from .info
            result["fund_total_assets"] = info.get('totalAssets')
            result["fund_category"] = info.get('category')
            result["fund_family"] = info.get('fundFamily')

            raw_inception = info.get('fundInceptionDate')
            if raw_inception and isinstance(raw_inception, (int, float)) and raw_inception > 0:
                from datetime import datetime
                result["fund_inception_date"] = datetime.fromtimestamp(raw_inception).strftime("%Y-%m-%d")

            # Try funds_data for richer info (description, expense ratio)
            try:
                fd = stock.funds_data
                if fd is not None:
                    # Investment objective / description
                    try:
                        desc = fd.description
                        if desc:
                            result["fund_description"] = desc
                    except Exception:
                        pass

                    # Fund overview (category, family, legal type)
                    try:
                        overview = fd.fund_overview
                        if overview and isinstance(overview, dict):
                            if not result["fund_category"]:
                                result["fund_category"] = overview.get("categoryName") or overview.get("category")
                            if not result["fund_family"]:
                                result["fund_family"] = overview.get("fundFamily")
                    except Exception:
                        pass

                    # Fund operations (expense ratio)
                    try:
                        ops = fd.fund_operations
                        if ops and isinstance(ops, dict):
                            er = ops.get("annualReportExpenseRatio")
                            if er and isinstance(er, dict):
                                result["fund_expense_ratio"] = er.get("raw")
                            elif er is not None:
                                try:
                                    result["fund_expense_ratio"] = float(er)
                                except (ValueError, TypeError):
                                    pass
                    except Exception:
                        pass
            except Exception:
                pass

            # Use fund description as main description if Polygon's was empty
            if not result["description"] and result["fund_description"]:
                result["description"] = result["fund_description"]

        return result
        
    except Exception as e:
        print(f"Error fetching company info from yfinance for {ticker}: {e}")
        return {
            "ticker": ticker.upper(),
            "name": ticker,
            "sector": "Unknown",
            "industry": "Unknown",
            "market_cap": 0,
            "current_price": 0,
            "fund_description": None,
            "fund_category": None,
            "fund_family": None,
            "fund_expense_ratio": None,
            "fund_inception_date": None,
            "fund_total_assets": None,
        }