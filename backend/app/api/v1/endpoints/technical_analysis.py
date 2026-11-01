"""
Stock Screener API Endpoints - Filter stocks by technical indicators
⭐ PAID TIERS ONLY ⭐
"""
import asyncio
from fastapi import APIRouter, Depends, Query, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Optional
from app.db.models import User, Watchlist
from app.api.dependencies import get_current_user
from app.core.redaction import print_redacted_exc, safe_error
from app.core.tier_limits import get_review_period, WATCHLIST_SCREEN_MIN_TIERS
from app.core.usage_limits import check_feature_limit, record_feature_usage
from app.db.session import get_db
from app.services.market_data import market_data_service
from app.services.technical_indicators import (
    technical_indicators, generate_summary, build_signal_rows, INDICATOR_HISTORY_DAYS,
)


router = APIRouter()

# The watchlist screens use the page's window (technical_indicators.INDICATOR_HISTORY_DAYS):
# their old 60 days (~41 bars) read a different RSI than the page for the same close,
# and never had the 50 bars SMA-50 needs, so the above-SMA-50 filter and the
# strong-uptrend preset could not match anything.

def require_valid_tier(current_user: User = Depends(get_current_user)):
    """Validate user has a recognized subscription tier for Technical Analysis access.

    Membership only — this says the tier exists, not that the user has quota left,
    and it admits every recognized tier. Routes that burn FMP calls must also draw
    on a quota: check_analysis_limit() for single-stock analysis, and
    check_watchlist_screen_limit() (behind require_watchlist_screening_tier) for
    the far more expensive watchlist screens.
    """
    allowed_tiers = ["beginner", "casual", "active", "professional"]
    if current_user.subscription_tier not in allowed_tiers:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Technical Analysis requires a valid subscription. Current tier: {current_user.subscription_tier.title()}. Please contact support."
        )
    return current_user


async def check_analysis_limit(user: User, db: AsyncSession) -> int:
    """Quota for a single-stock analysis — roughly one FMP fetch."""
    return await check_feature_limit(user, db, "technical_analysis", "Technical Analysis")


async def record_analysis_usage(user: User, db: AsyncSession) -> None:
    await record_feature_usage(user, db, "technical_analysis")


async def check_watchlist_screen_limit(user: User, db: AsyncSession) -> int:
    """Quota for a watchlist screen.

    Priced separately from a single-stock analysis on purpose: one screen fans
    out a historical fetch for EVERY watchlist ticker, so a 75-stock watchlist
    costs ~75x what /analyze does. Charging both against one counter would hide
    that entirely.
    """
    return await check_feature_limit(user, db, "watchlist_screens", "Watchlist screening")


async def record_watchlist_screen_usage(user: User, db: AsyncSession) -> None:
    await record_feature_usage(user, db, "watchlist_screens")


def require_watchlist_screening_tier(current_user: User = Depends(require_valid_tier)):
    """Watchlist screening is an Active-and-above feature.

    A real tier gate, unlike require_valid_tier: it names the tiers rather than
    accepting any recognized one. Matches how saved_screens and indicator_alerts
    are already gated.
    """
    if current_user.subscription_tier not in WATCHLIST_SCREEN_MIN_TIERS:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "message": (
                    "Watchlist screening is available on the Active and Professional plans. "
                    f"Current tier: {current_user.subscription_tier.capitalize()}."
                ),
                "current_usage": 0,
                "max_usage": 0,
                "period": get_review_period(current_user.subscription_tier),
            },
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


def _strip_history(indicator_data):
    """Remove large history arrays from indicator summary (history is in chart_data)."""
    if indicator_data is None:
        return None
    return {k: v for k, v in indicator_data.items() if not k.endswith("_history") and k != "history"}

@router.get("/analyze/{ticker}")
async def analyze_stock(
    ticker: str,
    days: int = Query(INDICATOR_HISTORY_DAYS, ge=30, le=730),
    current_user: User = Depends(require_valid_tier),  # ← Changed
    db: AsyncSession = Depends(get_db)
):
    """
    Get complete technical analysis for a stock
    """
    # Quota first: this route burns a ~275-bar FMP fetch and ~20 indicator
    # computations, so the check happens before any upstream call.
    await check_analysis_limit(current_user, db)

    try:
        # Get company info
        security_type = ""
        try:
            company = await market_data_service.get_company_info(ticker)
            company_name = company.get("name", ticker)
            security_type = company.get("type", "")
        except Exception:
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
        opens = [float(day["open"]) for day in historical]
        highs = [float(day["high"]) for day in historical]
        lows = [float(day["low"]) for day in historical]
        volumes = [float(day["volume"]) for day in historical]
        current_price = prices[-1]
        
        # Calculate indicators — the same calls the alert checker and the
        # watchlist screens make, so all three read one RSI/MACD/SMA/BB. The
        # chart histories below are the series these are the last bar of, so
        # the chart's final point is the headline number too.
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

        # Chart histories
        sma_20_history = technical_indicators.calculate_sma_series(prices, 20)
        sma_50_history = technical_indicators.calculate_sma_series(prices, 50)
        sma_200_history = technical_indicators.calculate_sma_series(prices, 200)
        bb_history = technical_indicators.calculate_bollinger_series(prices)
        rsi_history = technical_indicators.calculate_rsi_series(prices)
        macd_history = technical_indicators.calculate_macd_series(prices)

        # ── Calculate all advanced indicators ──────────────────────────────
        try:
            advanced = technical_indicators.calculate_all_advanced(highs, lows, prices, volumes)
        except Exception as e:
            print(f"Advanced indicators error: {e}")
            advanced = {}

        # The signal rows and the weighted outlook take the SAME inputs, so the
        # rows always reconcile with the outlook's "X of N" count.
        signals = build_signal_rows(rsi, macd_data, ma_data, bb_data, current_price, advanced)

        # Enrich historical data with indicators (existing + advanced)
        n = len(historical)
        enriched_chart_data = []
        for i, day in enumerate(historical):
            entry = {
                **day,
                "sma_20": sma_20_history[i],
                "sma_50": sma_50_history[i],
                "sma_200": sma_200_history[i],
                "bb_upper": bb_history["upper"][i],
                "bb_middle": bb_history["middle"][i],
                "bb_lower": bb_history["lower"][i],
                "rsi": rsi_history[i],
                "macd_line": macd_history["macd"][i],
                "macd_signal": macd_history["signal"][i],
                "macd_histogram": macd_history["histogram"][i],
            }
            # Add advanced indicator histories (safely index each)
            def safe_idx(data, key, idx):
                if data and key in data and data[key] and idx < len(data[key]):
                    return data[key][idx]
                return None
            
            entry["vwap"] = safe_idx(advanced.get("vwap"), "history", i)
            entry["obv"] = safe_idx(advanced.get("obv"), "history", i)
            entry["ad_line"] = safe_idx(advanced.get("ad_line"), "history", i)
            entry["stoch_k"] = safe_idx(advanced.get("stochastic"), "k_history", i)
            entry["stoch_d"] = safe_idx(advanced.get("stochastic"), "d_history", i)
            entry["adx"] = safe_idx(advanced.get("adx"), "adx_history", i)
            entry["plus_di"] = safe_idx(advanced.get("adx"), "plus_di_history", i)
            entry["minus_di"] = safe_idx(advanced.get("adx"), "minus_di_history", i)
            entry["cci"] = safe_idx(advanced.get("cci"), "history", i)
            entry["roc"] = safe_idx(advanced.get("roc"), "history", i)
            entry["atr"] = safe_idx(advanced.get("atr"), "history", i)
            entry["chandelier_long"] = safe_idx(advanced.get("atr_risk"), "chandelier_long_history", i)
            entry["chandelier_short"] = safe_idx(advanced.get("atr_risk"), "chandelier_short_history", i)
            entry["keltner_upper"] = safe_idx(advanced.get("keltner"), "upper_history", i)
            entry["keltner_middle"] = safe_idx(advanced.get("keltner"), "middle_history", i)
            entry["keltner_lower"] = safe_idx(advanced.get("keltner"), "lower_history", i)
            entry["std_dev"] = safe_idx(advanced.get("std_dev"), "history", i)
            entry["sar"] = safe_idx(advanced.get("parabolic_sar"), "sar_history", i)
            entry["sar_trend"] = safe_idx(advanced.get("parabolic_sar"), "trend_history", i)
            entry["ichimoku_tenkan"] = safe_idx(advanced.get("ichimoku"), "tenkan_history", i)
            entry["ichimoku_kijun"] = safe_idx(advanced.get("ichimoku"), "kijun_history", i)
            entry["ichimoku_senkou_a"] = safe_idx(advanced.get("ichimoku"), "senkou_a_history", i)
            entry["ichimoku_senkou_b"] = safe_idx(advanced.get("ichimoku"), "senkou_b_history", i)
            entry["donchian_upper"] = safe_idx(advanced.get("donchian"), "upper_history", i)
            entry["donchian_lower"] = safe_idx(advanced.get("donchian"), "lower_history", i)
            entry["donchian_middle"] = safe_idx(advanced.get("donchian"), "middle_history", i)
            
            enriched_chart_data.append(entry)

        await record_analysis_usage(current_user, db)

        return {
            "ticker": ticker,
            "company_name": company_name,
            "security_type": security_type,  # CS, WARRANT, ETF, etc.
            "current_price": round(current_price, 2),
            "analysis_date": historical[-1]["date"],
            "indicators": {
                "rsi": {
                    "value": round(rsi, 2) if rsi is not None else None,
                    "signal": "oversold" if rsi is not None and rsi < 30 else "overbought" if rsi is not None and rsi > 70 else "neutral",
                    "description": "RSI measures momentum. Below 30 = oversold (buy signal), Above 70 = overbought (sell signal)"
                },
                "macd": {
                    "macd_line": round(macd_data["macd"], 4) if macd_data else None,
                    "signal_line": round(macd_data["signal"], 4) if macd_data else None,
                    "histogram": round(macd_data["histogram"], 4) if macd_data else None,
                    "trend": macd_data["trend"] if macd_data else "neutral",
                    "description": "MACD shows trend direction. Bullish = upward momentum, Bearish = downward momentum"
                },
                "moving_averages": {
                    "sma_20": round(ma_data["sma_20"], 2) if ma_data["sma_20"] is not None else None,
                    "sma_50": round(ma_data["sma_50"], 2) if ma_data["sma_50"] is not None else None,
                    "sma_200": round(ma_data["sma_200"], 2) if ma_data["sma_200"] is not None else None,
                    "above_sma_20": current_price > ma_data["sma_20"] if ma_data["sma_20"] else None,
                    "above_sma_50": current_price > ma_data["sma_50"] if ma_data["sma_50"] else None,
                    "description": "Price above MA = uptrend, Price below MA = downtrend"
                },
                "bollinger_bands": {
                    "upper_band": round(bb_data["upper"], 2) if bb_data else None,
                    "middle_band": round(bb_data["middle"], 2) if bb_data else None,
                    "lower_band": round(bb_data["lower"], 2) if bb_data else None,
                    "position": bb_data["position"] if bb_data else "neutral",
                    "description": "Bands show volatility. Price at edges = potential reversal opportunity"
                },
                "squeeze": technical_indicators.compute_squeeze_state(
                    bb_history["upper"], bb_history["lower"],
                    (advanced.get("keltner") or {}).get("upper_history"),
                    (advanced.get("keltner") or {}).get("lower_history"),
                ) if advanced.get("keltner") else None,
                # ── Advanced Indicators (summaries only — history in chart_data) ──
                "vwap": _strip_history(advanced.get("vwap")),
                "obv": _strip_history(advanced.get("obv")),
                "ad_line": _strip_history(advanced.get("ad_line")),
                "stochastic": _strip_history(advanced.get("stochastic")),
                "adx": _strip_history(advanced.get("adx")),
                "cci": _strip_history(advanced.get("cci")),
                "roc": _strip_history(advanced.get("roc")),
                "atr": _strip_history(advanced.get("atr")),
                "atr_risk": _strip_history(advanced.get("atr_risk")),
                "keltner": _strip_history(advanced.get("keltner")),
                "std_dev": _strip_history(advanced.get("std_dev")),
                "parabolic_sar": _strip_history(advanced.get("parabolic_sar")),
                "ichimoku": _strip_history(advanced.get("ichimoku")),
                "donchian": _strip_history(advanced.get("donchian")),
            },
            "signals": signals,
            "chart_data": enriched_chart_data,
            "summary": generate_summary(rsi, macd_data, ma_data, bb_data, current_price, advanced)
        }    
    except HTTPException:
        raise
    except Exception as e:
        print(f"Analysis error for {ticker}: {safe_error(e)}")
        print_redacted_exc()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Could not analyze {ticker}: {safe_error(e)}"
        )


# Not a route (GET /watchlist had no callers): the presets below call it. Plain None
# defaults, because called as a function FastAPI's Query() defaults are never resolved:
# a filter the preset didn't pass arrived as a truthy Query object, and comparing an RSI
# against it raised for every ticker, so no preset ever matched anything.
async def screen_watchlist(
    *,
    current_user: User,
    db: AsyncSession,
    rsi_below: Optional[float] = None,
    rsi_above: Optional[float] = None,
    macd_bullish: Optional[bool] = None,
    macd_bearish: Optional[bool] = None,
    above_sma_20: Optional[bool] = None,
    above_sma_50: Optional[bool] = None,
    bollinger_oversold: Optional[bool] = None,
    bollinger_overbought: Optional[bool] = None,
):
    """
    Screen the user's watchlist by technical indicators: the shared body of the
    /presets/* routes, which pass the tier-checked user. A filter left as None is
    not applied.

    RSI: rsi_below / rsi_above. MACD: macd_bullish / macd_bearish (trend).
    Moving averages: above_sma_20 / above_sma_50. Bollinger Bands:
    bollinger_oversold (below the lower band) / bollinger_overbought (above the
    upper band).

    ⭐ **Active:** 5 screens/day · **Professional:** 15 screens/day
    """
    # One screen fans out a historical fetch per watchlist ticker, so it draws
    # on the watchlist_screens quota rather than the single-stock one.
    await check_watchlist_screen_limit(current_user, db)

    result = await db.execute(
        select(Watchlist)
        .where(Watchlist.user_id == current_user.id)
    )
    watchlist_items = result.scalars().all()

    # An empty watchlist fetches nothing upstream, so it costs no quota.
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
    
    # Fetch all company names in one batch call, and all price histories in parallel
    tickers = [item.ticker for item in watchlist_items]
    company_quotes, *price_results = await asyncio.gather(
        market_data_service.get_batch_quotes(tickers),
        *(_get_price_history(item.ticker) for item in watchlist_items),
        return_exceptions=True,
    )

    # Build company name lookup — batch-quote gives us symbols; fall back to ticker
    # Company info is only used for display name, so we fetch profiles in parallel too
    async def _safe_company_name(ticker: str) -> str:
        try:
            info = await market_data_service.get_company_info(ticker)
            return info.get("name", ticker)
        except Exception:
            return ticker

    company_names = await asyncio.gather(
        *(_safe_company_name(item.ticker) for item in watchlist_items)
    )

    # Screen each stock using pre-fetched data
    matches = []

    for i, item in enumerate(watchlist_items):
        try:
            price_result = price_results[i]
            if isinstance(price_result, BaseException):
                continue
            prices_data, current_price = price_result
            company_name = company_names[i]

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

        except Exception:
            # Skip stocks that error out
            continue

    await record_watchlist_screen_usage(current_user, db)

    return {
        "matches": matches,
        "total_screened": len(watchlist_items),
        "matches_found": len(matches),
        "filters_applied": _get_filters_description(
            rsi_below, rsi_above, macd_bullish, macd_bearish,
            above_sma_20, above_sma_50, bollinger_oversold, bollinger_overbought
        ),
        "subscription_tier": "professional",
        "professional_perks": "✅ 20 stock screenings daily ✅ 75 watchlist entries ✅  50 alerts"
    }


@router.get("/presets/oversold")
async def screen_oversold(
    current_user: User = Depends(require_watchlist_screening_tier),
    db: AsyncSession = Depends(get_db)
):
    """
    🔒 ACTIVE & PROFESSIONAL - Find oversold stocks in your watchlist
    
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
    current_user: User = Depends(require_watchlist_screening_tier),
    db: AsyncSession = Depends(get_db)
):
    """
    🔒 ACTIVE & PROFESSIONAL - Find overbought stocks in your watchlist
    
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
    current_user: User = Depends(require_watchlist_screening_tier),
    db: AsyncSession = Depends(get_db)
):
    """
    🔒 ACTIVE & PROFESSIONAL - Find stocks in strong uptrends
    
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
    current_user: User = Depends(require_watchlist_screening_tier),
    db: AsyncSession = Depends(get_db)
):
    """
    🔒 ACTIVE & PROFESSIONAL - Find potential reversal candidates
    
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
async def _get_price_history(ticker: str, days: int = INDICATOR_HISTORY_DAYS):
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