"""
Stock Screener API Endpoints - Filter stocks by technical indicators
⭐ ENTERPRISE TIER ONLY ⭐
"""
from fastapi import APIRouter, Depends, Query, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Optional

from app.db.models import User, Watchlist
from app.api.dependencies import get_current_user
from app.db.session import get_db
from app.services.market_data import market_data_service
from app.services.technical_indicators import technical_indicators

router = APIRouter()


def require_enterprise(current_user: User = Depends(get_current_user)):
    """Require Enterprise tier for screener access"""
    if current_user.subscription_tier != "enterprise":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Stock Screener is an Enterprise-only feature! Current tier: {current_user.subscription_tier.title()}. Upgrade to Enterprise ($99/month) for unlimited screening capabilities, unlimited watchlists, and unlimited alerts!"
        )
    return current_user


class ScreenerResult:
    """Screener result item"""
    def __init__(self, ticker: str, company_name: str, current_price: float, 
                 rsi: Optional[float] = None, macd_trend: Optional[str] = None,
                 above_sma_20: Optional[bool] = None, above_sma_50: Optional[bool] = None,
                 bollinger_position: Optional[str] = None, match_reason: str = ""):
        self.ticker = ticker
        self.company_name = company_name
        self.current_price = current_price
        self.rsi = rsi
        self.macd_trend = macd_trend
        self.above_sma_20 = above_sma_20
        self.above_sma_50 = above_sma_50
        self.bollinger_position = bollinger_position
        self.match_reason = match_reason


@router.get("/analyze/{ticker}")
async def analyze_stock(
    ticker: str,
    days: int = Query(60, ge=30, le=365, description="Days of historical data"),
    current_user: User = Depends(get_current_user)
):
    """
    Get complete technical analysis for a stock
    
    **Returns:**
    - Current price and basic info
    - RSI (Relative Strength Index)
    - MACD (Moving Average Convergence Divergence)
    - Moving Averages (20-day, 50-day, 200-day)
    - Bollinger Bands
    - Trading signals and recommendations
    - Historical price data for charting
    """
    try:
        # Get company info
        company = await market_data_service.get_company_info(ticker)
        
        # Get historical prices
        historical = await market_data_service.get_historical_prices(ticker, days)
        prices = [float(day["close"]) for day in historical]
        current_price = prices[-1]
        
        # Calculate all indicators
        rsi = technical_indicators.calculate_rsi(prices)
        macd_data = technical_indicators.calculate_macd(prices)
        ma_data = technical_indicators.calculate_moving_averages(prices)
        bb_data = technical_indicators.calculate_bollinger_bands(prices)
        
        # Generate trading signals
        signals = []
        if rsi and rsi < 30:
            signals.append({"type": "buy", "indicator": "RSI", "message": "Oversold - potential buying opportunity"})
        elif rsi and rsi > 70:
            signals.append({"type": "sell", "indicator": "RSI", "message": "Overbought - consider taking profits"})
        
        if macd_data and macd_data["trend"] == "bullish":
            signals.append({"type": "buy", "indicator": "MACD", "message": "Bullish momentum"})
        elif macd_data and macd_data["trend"] == "bearish":
            signals.append({"type": "sell", "indicator": "MACD", "message": "Bearish momentum"})
        
        if bb_data and bb_data["position"] == "below_lower":
            signals.append({"type": "buy", "indicator": "Bollinger Bands", "message": "Below lower band - potential bounce"})
        elif bb_data and bb_data["position"] == "above_upper":
            signals.append({"type": "sell", "indicator": "Bollinger Bands", "message": "Above upper band - overbought"})
        
        return {
            "ticker": ticker,
            "company_name": company.get("name", ticker),
            "current_price": round(current_price, 2),
            "analysis_date": historical[-1]["date"],
            "indicators": {
                "rsi": {
                    "value": round(rsi, 2) if rsi else None,
                    "signal": "oversold" if rsi and rsi < 30 else "overbought" if rsi and rsi > 70 else "neutral",
                    "description": "RSI measures momentum. Below 30 = oversold (buy signal), Above 70 = overbought (sell signal)"
                },
                "macd": {
                    "macd_line": round(macd_data["macd_line"], 4) if macd_data else None,
                    "signal_line": round(macd_data["signal_line"], 4) if macd_data else None,
                    "histogram": round(macd_data["histogram"], 4) if macd_data else None,
                    "trend": macd_data["trend"] if macd_data else None,
                    "description": "MACD shows trend direction. Bullish = upward momentum, Bearish = downward momentum"
                },
                "moving_averages": {
                    "sma_20": round(ma_data["sma_20"], 2) if ma_data["sma_20"] else None,
                    "sma_50": round(ma_data["sma_50"], 2) if ma_data["sma_50"] else None,
                    "sma_200": round(ma_data["sma_200"], 2) if ma_data["sma_200"] else None,
                    "above_sma_20": current_price > ma_data["sma_20"] if ma_data["sma_20"] else None,
                    "above_sma_50": current_price > ma_data["sma_50"] if ma_data["sma_50"] else None,
                    "description": "Price above MA = uptrend, Price below MA = downtrend"
                },
                "bollinger_bands": {
                    "upper_band": round(bb_data["upper_band"], 2) if bb_data else None,
                    "middle_band": round(bb_data["middle_band"], 2) if bb_data else None,
                    "lower_band": round(bb_data["lower_band"], 2) if bb_data else None,
                    "position": bb_data["position"] if bb_data else None,
                    "description": "Bands show volatility. Price at edges = potential reversal opportunity"
                }
            },
            "signals": signals,
            "chart_data": historical,  # Full historical data for charting
            "summary": _generate_summary(rsi, macd_data, ma_data, bb_data, current_price)
        }
    
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Could not analyze {ticker}: {str(e)}"
        )


def _generate_summary(rsi, macd_data, ma_data, bb_data, current_price):
    """Generate overall trading summary"""
    bullish_signals = 0
    bearish_signals = 0
    
    if rsi and rsi < 30: bullish_signals += 1
    if rsi and rsi > 70: bearish_signals += 1
    
    if macd_data and macd_data["trend"] == "bullish": bullish_signals += 1
    if macd_data and macd_data["trend"] == "bearish": bearish_signals += 1
    
    if ma_data["sma_20"] and current_price > ma_data["sma_20"]: bullish_signals += 1
    if ma_data["sma_20"] and current_price < ma_data["sma_20"]: bearish_signals += 1
    
    if bb_data and bb_data["position"] == "below_lower": bullish_signals += 1
    if bb_data and bb_data["position"] == "above_upper": bearish_signals += 1
    
    if bullish_signals > bearish_signals:
        return {"outlook": "bullish", "strength": bullish_signals, "message": "Multiple bullish indicators detected"}
    elif bearish_signals > bullish_signals:
        return {"outlook": "bearish", "strength": bearish_signals, "message": "Multiple bearish indicators detected"}
    else:
        return {"outlook": "neutral", "strength": 0, "message": "Mixed signals - wait for clearer trend"}
    

@router.get("/watchlist")
async def screen_watchlist(
    rsi_below: Optional[float] = Query(None, ge=0, le=100, description="RSI below this value"),
    rsi_above: Optional[float] = Query(None, ge=0, le=100, description="RSI above this value"),
    macd_bullish: Optional[bool] = Query(None, description="MACD bullish trend"),
    macd_bearish: Optional[bool] = Query(None, description="MACD bearish trend"),
    above_sma_20: Optional[bool] = Query(None, description="Price above 20-day SMA"),
    above_sma_50: Optional[bool] = Query(None, description="Price above 50-day SMA"),
    bollinger_oversold: Optional[bool] = Query(None, description="Below lower Bollinger Band"),
    bollinger_overbought: Optional[bool] = Query(None, description="Above upper Bollinger Band"),
    current_user: User = Depends(require_enterprise),  # CHANGED THIS LINE!
    db: AsyncSession = Depends(get_db)
):
    """
    🔒 ENTERPRISE ONLY - Screen your watchlist by technical indicators
    
    **Find trading opportunities in your watchlist:**
    
    **RSI Filters:**
    - `rsi_below=30` - Find oversold stocks (potential buys)
    - `rsi_above=70` - Find overbought stocks (potential sells)
    
    **MACD Filters:**
    - `macd_bullish=true` - Bullish momentum
    - `macd_bearish=true` - Bearish momentum
    
    **Moving Average Filters:**
    - `above_sma_20=true` - Above 20-day average (short-term uptrend)
    - `above_sma_50=true` - Above 50-day average (medium-term uptrend)
    
    **Bollinger Bands:**
    - `bollinger_oversold=true` - Price below lower band
    - `bollinger_overbought=true` - Price above upper band
    
    **Examples:**
    - `/screener/watchlist?rsi_below=30` → Oversold stocks
    - `/screener/watchlist?macd_bullish=true&above_sma_50=true` → Strong uptrends
    - `/screener/watchlist?bollinger_oversold=true` → Potential bounce opportunities
    
    ⭐ **Enterprise Feature:** Unlimited screening on unlimited watchlist stocks!
    """
    # Get user's watchlist (no limit for Enterprise!)
    result = await db.execute(
        select(Watchlist)
        .where(Watchlist.user_id == current_user.id)
    )
    watchlist_items = result.scalars().all()
    
    if not watchlist_items:
        return {
            "matches": [],
            "total_screened": 0,
            "matches_found": 0,
            "filters_applied": _get_filters_description(
                rsi_below, rsi_above, macd_bullish, macd_bearish,
                above_sma_20, above_sma_50, bollinger_oversold, bollinger_overbought
            ),
            "message": "Add stocks to your watchlist to start screening!"
        }
    
    # Screen each stock
    matches = []
    
    for item in watchlist_items:
        try:
            # Get historical data
            prices_data, current_price = await _get_price_history(item.ticker, 60)
            
            # Get company name
            try:
                company = await market_data_service.get_company_info(item.ticker)
                company_name = company.get("name", item.ticker)
            except:
                company_name = item.ticker
            
            # Calculate indicators
            rsi_value = technical_indicators.calculate_rsi(prices_data)
            macd_data = technical_indicators.calculate_macd(prices_data)
            ma_data = technical_indicators.calculate_moving_averages(prices_data)
            bb_data = technical_indicators.calculate_bollinger_bands(prices_data)
            
            # Check filters
            match_reasons = []
            is_match = True
            
            # RSI filters
            if rsi_below is not None:
                if rsi_value is None or rsi_value >= rsi_below:
                    is_match = False
                else:
                    match_reasons.append(f"RSI {rsi_value:.1f} < {rsi_below}")
            
            if rsi_above is not None:
                if rsi_value is None or rsi_value <= rsi_above:
                    is_match = False
                else:
                    match_reasons.append(f"RSI {rsi_value:.1f} > {rsi_above}")
            
            # MACD filters
            if macd_bullish is not None:
                if macd_data is None or macd_data["trend"] != "bullish":
                    is_match = False
                else:
                    match_reasons.append(f"MACD Bullish ({macd_data['histogram']:.2f})")
            
            if macd_bearish is not None:
                if macd_data is None or macd_data["trend"] != "bearish":
                    is_match = False
                else:
                    match_reasons.append(f"MACD Bearish ({macd_data['histogram']:.2f})")
            
            # Moving average filters
            if above_sma_20 is not None:
                above_20 = ma_data["sma_20"] and current_price > ma_data["sma_20"]
                if above_sma_20 != above_20:
                    is_match = False
                elif above_20:
                    match_reasons.append(f"Above SMA20 (${ma_data['sma_20']:.2f})")
            
            if above_sma_50 is not None:
                above_50 = ma_data["sma_50"] and current_price > ma_data["sma_50"]
                if above_sma_50 != above_50:
                    is_match = False
                elif above_50:
                    match_reasons.append(f"Above SMA50 (${ma_data['sma_50']:.2f})")
            
            # Bollinger filters
            if bollinger_oversold is not None:
                if bb_data is None or bb_data["position"] != "below_lower":
                    is_match = False
                else:
                    match_reasons.append(f"Below Bollinger Lower Band")
            
            if bollinger_overbought is not None:
                if bb_data is None or bb_data["position"] != "above_upper":
                    is_match = False
                else:
                    match_reasons.append(f"Above Bollinger Upper Band")
            
            # If all filters pass, add to matches
            if is_match:
                matches.append({
                    "ticker": item.ticker,
                    "company_name": company_name,
                    "current_price": round(current_price, 2),
                    "rsi": round(rsi_value, 2) if rsi_value else None,
                    "macd_trend": macd_data["trend"] if macd_data else None,
                    "above_sma_20": ma_data["sma_20"] and current_price > ma_data["sma_20"],
                    "above_sma_50": ma_data["sma_50"] and current_price > ma_data["sma_50"],
                    "bollinger_position": bb_data["position"] if bb_data else None,
                    "match_reasons": match_reasons
                })
        
        except Exception as e:
            # Skip stocks that error out
            continue
    
    return {
        "matches": matches,
        "total_screened": len(watchlist_items),
        "matches_found": len(matches),
        "filters_applied": _get_filters_description(
            rsi_below, rsi_above, macd_bullish, macd_bearish,
            above_sma_20, above_sma_50, bollinger_oversold, bollinger_overbought
        ),
        "subscription_tier": "Enterprise",
        "enterprise_perks": "✅ Unlimited screening ✅ Unlimited watchlist ✅ Unlimited alerts"
    }


@router.get("/presets/oversold")
async def screen_oversold(
    current_user: User = Depends(require_enterprise),  # CHANGED!
    db: AsyncSession = Depends(get_db)
):
    """
    🔒 ENTERPRISE ONLY - Find oversold stocks in your watchlist
    
    **Criteria:**
    - RSI < 30 (oversold)
    - Price below lower Bollinger Band
    
    **Perfect for:** Finding potential buying opportunities
    """
    return await screen_watchlist(
        rsi_below=30,
        bollinger_oversold=True,
        current_user=current_user,
        db=db
    )


@router.get("/presets/overbought")
async def screen_overbought(
    current_user: User = Depends(require_enterprise),  # CHANGED!
    db: AsyncSession = Depends(get_db)
):
    """
    🔒 ENTERPRISE ONLY - Find overbought stocks in your watchlist
    
    **Criteria:**
    - RSI > 70 (overbought)
    - Price above upper Bollinger Band
    
    **Perfect for:** Taking profits or avoiding overextended stocks
    """
    return await screen_watchlist(
        rsi_above=70,
        bollinger_overbought=True,
        current_user=current_user,
        db=db
    )


@router.get("/presets/strong-uptrend")
async def screen_strong_uptrend(
    current_user: User = Depends(require_enterprise),  # CHANGED!
    db: AsyncSession = Depends(get_db)
):
    """
    🔒 ENTERPRISE ONLY - Find stocks in strong uptrends
    
    **Criteria:**
    - MACD bullish
    - Price above 20-day SMA
    - Price above 50-day SMA
    
    **Perfect for:** Momentum trading, riding trends
    """
    return await screen_watchlist(
        macd_bullish=True,
        above_sma_20=True,
        above_sma_50=True,
        current_user=current_user,
        db=db
    )


@router.get("/presets/reversal-candidates")
async def screen_reversal_candidates(
    current_user: User = Depends(require_enterprise),  # CHANGED!
    db: AsyncSession = Depends(get_db)
):
    """
    🔒 ENTERPRISE ONLY - Find potential reversal candidates
    
    **Criteria:**
    - RSI < 30 (oversold)
    - MACD bullish (momentum turning)
    
    **Perfect for:** Catching bounces, swing trading
    """
    return await screen_watchlist(
        rsi_below=30,
        macd_bullish=True,
        current_user=current_user,
        db=db
    )


# Helper functions
async def _get_price_history(ticker: str, days: int = 60):
    """Get price history and current price"""
    historical = await market_data_service.get_historical_prices(ticker, days)
    if not historical:
        raise ValueError(f"No data for {ticker}")
    prices = [float(day["close"]) for day in historical]
    return prices, historical[-1]["close"]


def _get_filters_description(rsi_below, rsi_above, macd_bullish, macd_bearish,
                             above_sma_20, above_sma_50, bollinger_oversold, bollinger_overbought):
    """Generate human-readable filter description"""
    filters = []
    if rsi_below: filters.append(f"RSI < {rsi_below}")
    if rsi_above: filters.append(f"RSI > {rsi_above}")
    if macd_bullish: filters.append("MACD Bullish")
    if macd_bearish: filters.append("MACD Bearish")
    if above_sma_20: filters.append("Above 20-day SMA")
    if above_sma_50: filters.append("Above 50-day SMA")
    if bollinger_oversold: filters.append("Below Bollinger Lower Band")
    if bollinger_overbought: filters.append("Above Bollinger Upper Band")
    return ", ".join(filters) if filters else "No filters applied"