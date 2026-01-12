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


def _determine_bb_position(price: float, upper: float | None, lower: float | None) -> str:
    """Determine if price is above, below, or within Bollinger Bands"""
    if upper is None or lower is None:
        return "neutral"
    
    if price > upper:
        return "above_upper"
    elif price < lower:
        return "below_lower"
    else:
        return "within_bands"        

@router.get("/analyze/{ticker}")
async def analyze_stock(
    ticker: str,
    days: int = Query(360, ge=30, le=365, description="Days of historical data"),
    current_user: User = Depends(get_current_user)
):
    """
    Get complete technical analysis for a stock
    """
    try:
        # Get company info
        try:
            company = await market_data_service.get_company_info(ticker)
            company_name = company.get("name", ticker)
        except:
            company_name = ticker
        
        # Get historical prices
        historical = await market_data_service.get_historical_prices(ticker, days)
        if not historical or len(historical) == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"No historical data available for {ticker}"
            )
        
        # ADD THIS DEBUG LINE
        print(f"DEBUG: Fetched {len(historical)} days of data for {ticker}")

        prices = [float(day["close"]) for day in historical]
        current_price = prices[-1]
        
        # Calculate indicators
        try:
            rsi = technical_indicators.calculate_rsi(prices)
        except Exception as e:
            print(f"RSI calculation error: {e}")
            rsi = None
        
        try:
            macd_data = technical_indicators.calculate_macd(prices)
        except Exception as e:
            print(f"MACD calculation error: {e}")
            macd_data = None
        
        try:
            ma_data = technical_indicators.calculate_moving_averages(prices)
        except Exception as e:
            print(f"MA calculation error: {e}")
            ma_data = {"sma_20": None, "sma_50": None, "sma_200": None}
        
        try:
            bb_data = technical_indicators.calculate_bollinger_bands(prices)
        except Exception as e:
            print(f"BB calculation error: {e}")
            bb_data = None
        
        # Calculate historical moving averages for charting
        sma_20_history = []
        sma_50_history = []
        sma_200_history = []
        bb_upper_history = []
        bb_lower_history = []
        bb_middle_history = []
        rsi_history = []
        macd_history = []
        macd_signal_history = []
        macd_histogram_history = []

        for i in range(len(prices)):
            # SMA 20
            if i >= 19:
                sma_20_history.append(sum(prices[i-19:i+1]) / 20)
            else:
                sma_20_history.append(None)
            
            # SMA 50
            if i >= 49:
                sma_50_history.append(sum(prices[i-49:i+1]) / 50)
            else:
                sma_50_history.append(None)
            
            # SMA 200
            if i >= 199:
                sma_200_history.append(sum(prices[i-199:i+1]) / 200)
            else:
                sma_200_history.append(None)
            
            # Bollinger Bands
            if i >= 19:
                period_prices = prices[i-19:i+1]
                sma = sum(period_prices) / 20
                variance = sum((p - sma) ** 2 for p in period_prices) / 20
                std_dev = variance ** 0.5
                bb_middle_history.append(sma)
                bb_upper_history.append(sma + (2 * std_dev))
                bb_lower_history.append(sma - (2 * std_dev))
            else:
                bb_middle_history.append(None)
                bb_upper_history.append(None)
                bb_lower_history.append(None)

            # RSI (14-period)
            if i >= 14:
                period_prices = prices[i-14:i+1]
                gains = []
                losses = []
                
                for j in range(1, len(period_prices)):
                    change = period_prices[j] - period_prices[j-1]
                    if change > 0:
                        gains.append(change)
                        losses.append(0)
                    else:
                        gains.append(0)
                        losses.append(abs(change))
                
                avg_gain = sum(gains) / len(gains)
                avg_loss = sum(losses) / len(losses)
                
                if avg_loss == 0:
                    rsi_value = 100
                else:
                    rs = avg_gain / avg_loss
                    rsi_value = 100 - (100 / (1 + rs))
                
                rsi_history.append(rsi_value)
            else:
                rsi_history.append(None)

            # MACD (12, 26, 9)
            if i >= 33:  # Need at least 26 + 9 - 1 = 34 periods
                # Calculate 12-period EMA
                ema_12_values = prices[max(0, i-11):i+1]
                multiplier_12 = 2 / (12 + 1)
                ema_12 = ema_12_values[0]
                for price in ema_12_values[1:]:
                    ema_12 = (price - ema_12) * multiplier_12 + ema_12
                
                # Calculate 26-period EMA
                ema_26_values = prices[max(0, i-25):i+1]
                multiplier_26 = 2 / (26 + 1)
                ema_26 = ema_26_values[0]
                for price in ema_26_values[1:]:
                    ema_26 = (price - ema_26) * multiplier_26 + ema_26
                
                # MACD line
                macd_line = ema_12 - ema_26
                
                # Signal line (9-period EMA of MACD)
                if len(macd_history) >= 8:  # Need 9 MACD values for signal
                    recent_macd = [m for m in macd_history[-8:] if m is not None] + [macd_line]
                    multiplier_9 = 2 / (9 + 1)
                    signal_line = recent_macd[0]
                    for macd_val in recent_macd[1:]:
                        signal_line = (macd_val - signal_line) * multiplier_9 + signal_line
                    
                    histogram = macd_line - signal_line
                    
                    macd_history.append(macd_line)
                    macd_signal_history.append(signal_line)
                    macd_histogram_history.append(histogram)
                else:
                    macd_history.append(macd_line)
                    macd_signal_history.append(None)
                    macd_histogram_history.append(None)
            else:
                macd_history.append(None)
                macd_signal_history.append(None)
                macd_histogram_history.append(None)                    
        
        # Generate trading signals
        signals = []
        if rsi is not None:
            if rsi < 30:
                signals.append({
                    "type": "buy", 
                    "indicator": "RSI", 
                    "message": f"Oversold (RSI: {rsi:.1f}) - potential buying opportunity"
                })
            elif rsi > 70:
                signals.append({
                    "type": "sell", 
                    "indicator": "RSI", 
                    "message": f"Overbought (RSI: {rsi:.1f}) - consider taking profits"
                })
        
        if macd_data and isinstance(macd_data, dict):
            if macd_data.get("trend") == "bullish":
                signals.append({
                    "type": "buy", 
                    "indicator": "MACD", 
                    "message": "Bullish momentum detected"
                })
            elif macd_data.get("trend") == "bearish":
                signals.append({
                    "type": "sell", 
                    "indicator": "MACD", 
                    "message": "Bearish momentum detected"
                })
        
        if bb_data and isinstance(bb_data, dict):
            if bb_data.get("position") == "below_lower":
                signals.append({
                    "type": "buy", 
                    "indicator": "Bollinger Bands", 
                    "message": "Below lower band - potential bounce opportunity"
                })
            elif bb_data.get("position") == "above_upper":
                signals.append({
                    "type": "sell", 
                    "indicator": "Bollinger Bands", 
                    "message": "Above upper band - overbought territory"
                })
        
        # Enrich historical data with indicators
        enriched_chart_data = []
        for i, day in enumerate(historical):
            enriched_chart_data.append({
                **day,
                "sma_20": sma_20_history[i],
                "sma_50": sma_50_history[i],
                "sma_200": sma_200_history[i],
                "bb_upper": bb_upper_history[i],
                "bb_middle": bb_middle_history[i],
                "bb_lower": bb_lower_history[i],
                "rsi": rsi_history[i],
                "macd_line": macd_history[i],
                "macd_signal": macd_signal_history[i],
                "macd_histogram": macd_histogram_history[i],
            })

        return {
            "ticker": ticker,
            "company_name": company_name,
            "current_price": round(current_price, 2),
            "analysis_date": historical[-1]["date"],
            "indicators": {
                "rsi": {
                    "value": round(rsi_history[-1], 2) if rsi_history[-1] is not None else None,  # ← Use last RSI from history
                    "signal": "oversold" if rsi_history[-1] and rsi_history[-1] < 30 else "overbought" if rsi_history[-1] and rsi_history[-1] > 70 else "neutral",
                    "description": "RSI measures momentum. Below 30 = oversold (buy signal), Above 70 = overbought (sell signal)"
                },
                "macd": {
                    "macd_line": round(macd_history[-1], 4) if macd_history[-1] is not None else None,  # ← Use last MACD from history
                    "signal_line": round(macd_signal_history[-1], 4) if macd_signal_history[-1] is not None else None,
                    "histogram": round(macd_histogram_history[-1], 4) if macd_histogram_history[-1] is not None else None,
                    "trend": "bullish" if macd_histogram_history[-1] and macd_histogram_history[-1] > 0 else "bearish" if macd_histogram_history[-1] and macd_histogram_history[-1] < 0 else "neutral",
                    "description": "MACD shows trend direction. Bullish = upward momentum, Bearish = downward momentum"
                },
                "moving_averages": {
                    "sma_20": round(sma_20_history[-1], 2) if sma_20_history[-1] is not None else None,  # ← Use last SMA20 from history
                    "sma_50": round(sma_50_history[-1], 2) if sma_50_history[-1] is not None else None,  # ← Use last SMA50 from history
                    "sma_200": round(sma_200_history[-1], 2) if sma_200_history[-1] is not None else None,  # ← Use last SMA200 from history
                    "above_sma_20": current_price > sma_20_history[-1] if sma_20_history[-1] else None,
                    "above_sma_50": current_price > sma_50_history[-1] if sma_50_history[-1] else None,
                    "description": "Price above MA = uptrend, Price below MA = downtrend"
                },
                "bollinger_bands": {
                    "upper_band": round(bb_upper_history[-1], 2) if bb_upper_history[-1] is not None else None,  # ← Use last BB Upper from history
                    "middle_band": round(bb_middle_history[-1], 2) if bb_middle_history[-1] is not None else None,  # ← Use last BB Middle from history
                    "lower_band": round(bb_lower_history[-1], 2) if bb_lower_history[-1] is not None else None,  # ← Use last BB Lower from history
                    "position": _determine_bb_position(current_price, bb_upper_history[-1], bb_lower_history[-1]),
                    "description": "Bands show volatility. Price at edges = potential reversal opportunity"
                }
            },
            "signals": signals,
            "chart_data": enriched_chart_data,
            "summary": _generate_summary(
                rsi_history[-1] if rsi_history[-1] is not None else None,
                {
                    "trend": "bullish" if macd_histogram_history[-1] and macd_histogram_history[-1] > 0 else "bearish" if macd_histogram_history[-1] and macd_histogram_history[-1] < 0 else "neutral",
                    "histogram": macd_histogram_history[-1]
                } if macd_histogram_history[-1] is not None else None,
                {
                    "sma_20": sma_20_history[-1],
                    "sma_50": sma_50_history[-1],
                    "sma_200": sma_200_history[-1]
                },
                {
                    "upper_band": bb_upper_history[-1],
                    "middle_band": bb_middle_history[-1],
                    "lower_band": bb_lower_history[-1],
                    "position": _determine_bb_position(current_price, bb_upper_history[-1], bb_lower_history[-1])
                } if bb_upper_history[-1] is not None else None,
                current_price
            )
        }    
    except HTTPException:
        raise
    except Exception as e:
        print(f"Analysis error for {ticker}: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Could not analyze {ticker}: {str(e)}"
        )
    
def _generate_summary(rsi, macd_data, ma_data, bb_data, current_price):
    """Generate overall trading summary"""
    bullish_signals = 0
    bearish_signals = 0
    
    # RSI signals
    if rsi is not None:
        if rsi < 30:
            bullish_signals += 1
        elif rsi > 70:
            bearish_signals += 1
    
    # MACD signals
    if macd_data and isinstance(macd_data, dict):
        if macd_data.get("trend") == "bullish":
            bullish_signals += 1
        elif macd_data.get("trend") == "bearish":
            bearish_signals += 1
    
    # Moving average signals
    if ma_data and isinstance(ma_data, dict):
        sma_20 = ma_data.get("sma_20")
        if sma_20:
            if current_price > sma_20:
                bullish_signals += 1
            elif current_price < sma_20:
                bearish_signals += 1
    
    # Bollinger signals
    if bb_data and isinstance(bb_data, dict):
        position = bb_data.get("position")
        if position == "below_lower":
            bullish_signals += 1
        elif position == "above_upper":
            bearish_signals += 1
    
    if bullish_signals > bearish_signals:
        return {
            "outlook": "bullish", 
            "strength": bullish_signals, 
            "message": f"Multiple bullish indicators detected ({bullish_signals} signals)"
        }
    elif bearish_signals > bullish_signals:
        return {
            "outlook": "bearish", 
            "strength": bearish_signals, 
            "message": f"Multiple bearish indicators detected ({bearish_signals} signals)"
        }
    else:
        return {
            "outlook": "neutral", 
            "strength": 0, 
            "message": "Mixed signals - wait for clearer trend"
        }
    

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