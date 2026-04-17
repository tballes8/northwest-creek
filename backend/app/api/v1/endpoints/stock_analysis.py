"""
Stock AI analysis endpoint — on-demand plain-language summary of a stock's
technical indicators.  Shares the same ai_analysis usage pool as portfolio analysis.
"""
import re
import time
import asyncio
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime, timezone

from app.db.session import get_db
from app.api.dependencies import get_current_user
from app.db.models import User, FeatureUsage
from app.services.market_data import market_data_service
from app.services.technical_indicators import technical_indicators, generate_summary
from app.services.stock_analyzer import analyze_stock, forecast_stock_price
from app.api.v1.endpoints.portfolio_analysis import check_ai_analysis_access
from app.services.fmp_client import get_fmp_client, API_KEY

router = APIRouter()

# In-memory cache for price forecasts: ticker -> (timestamp, result_dict)
_forecast_cache: dict[str, tuple[float, dict]] = {}
_FORECAST_TTL = 6 * 3600  # 6 hours


def _safe_error(e: Exception) -> str:
    """Strip API keys and sensitive params from error messages."""
    msg = str(e)
    msg = re.sub(r'apiKey=[^&\s\'"]+', 'apiKey=***', msg)
    msg = re.sub(r'api_key=[^&\s\'"]+', 'api_key=***', msg)
    msg = re.sub(r'token=[^&\s\'"]+', 'token=***', msg)
    return msg


def _determine_bb_position(price: float, upper: float | None, lower: float | None) -> str:
    if upper is None or lower is None:
        return "neutral"
    if price > upper:
        return "above_upper"
    if price < lower:
        return "below_lower"
    return "within_bands"


def _strip_history(indicator_data):
    """Remove large history arrays from indicator data."""
    if indicator_data is None:
        return None
    return {k: v for k, v in indicator_data.items() if not k.endswith("_history") and k != "history"}


@router.get("/stocks/{ticker}/ai-analysis")
async def stock_ai_analysis(
    ticker: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Generate an AI plain-language summary of a stock's technical indicators."""

    await check_ai_analysis_access(current_user, db)

    try:
        # Fetch historical prices server-side (250 days for reliable indicator calc)
        historical = await market_data_service.get_historical_prices(ticker.upper(), 250)
        if not historical or len(historical) == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"No historical data available for {ticker.upper()}",
            )

        prices = [float(day["close"]) for day in historical]
        highs = [float(day["high"]) for day in historical]
        lows = [float(day["low"]) for day in historical]
        volumes = [float(day["volume"]) for day in historical]
        current_price = prices[-1]

        # ── Calculate indicators ──────────────────────────────────────────
        rsi = technical_indicators.calculate_rsi(prices)
        macd_data = technical_indicators.calculate_macd(prices)
        ma_data = technical_indicators.calculate_moving_averages(prices)
        bb_data = technical_indicators.calculate_bollinger_bands(prices)

        advanced = {}
        try:
            advanced = technical_indicators.calculate_all_advanced(highs, lows, prices, volumes)
        except Exception:
            pass

        # ── Build summary (same logic as /technical-analysis/analyze) ─────
        # Compute last-period values for MACD/BB from raw data for generate_summary
        # We need inline history for the last values (same as technical_analysis.py)
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
            sma_20_history.append(sum(prices[i - 19:i + 1]) / 20 if i >= 19 else None)
            sma_50_history.append(sum(prices[i - 49:i + 1]) / 50 if i >= 49 else None)
            sma_200_history.append(sum(prices[i - 199:i + 1]) / 200 if i >= 199 else None)

            if i >= 19:
                period_prices = prices[i - 19:i + 1]
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

            if i >= 14:
                period_prices = prices[i - 14:i + 1]
                gains, losses = [], []
                for j in range(1, len(period_prices)):
                    change = period_prices[j] - period_prices[j - 1]
                    gains.append(max(change, 0))
                    losses.append(abs(min(change, 0)))
                avg_gain = sum(gains) / len(gains)
                avg_loss = sum(losses) / len(losses)
                rsi_history.append(100 if avg_loss == 0 else 100 - (100 / (1 + avg_gain / avg_loss)))
            else:
                rsi_history.append(None)

            if i >= 33:
                ema_12_values = prices[max(0, i - 11):i + 1]
                mult_12 = 2 / 13
                ema_12 = ema_12_values[0]
                for p in ema_12_values[1:]:
                    ema_12 = (p - ema_12) * mult_12 + ema_12

                ema_26_values = prices[max(0, i - 25):i + 1]
                mult_26 = 2 / 27
                ema_26 = ema_26_values[0]
                for p in ema_26_values[1:]:
                    ema_26 = (p - ema_26) * mult_26 + ema_26

                macd_line = ema_12 - ema_26
                if len(macd_history) >= 8:
                    recent = [m for m in macd_history[-8:] if m is not None] + [macd_line]
                    mult_9 = 2 / 10
                    signal_line = recent[0]
                    for mv in recent[1:]:
                        signal_line = (mv - signal_line) * mult_9 + signal_line
                    macd_history.append(macd_line)
                    macd_signal_history.append(signal_line)
                    macd_histogram_history.append(macd_line - signal_line)
                else:
                    macd_history.append(macd_line)
                    macd_signal_history.append(None)
                    macd_histogram_history.append(None)
            else:
                macd_history.append(None)
                macd_signal_history.append(None)
                macd_histogram_history.append(None)

        summary = generate_summary(
            rsi_history[-1] if rsi_history[-1] is not None else None,
            {
                "trend": "bullish" if macd_histogram_history[-1] and macd_histogram_history[-1] > 0 else "bearish" if macd_histogram_history[-1] and macd_histogram_history[-1] < 0 else "neutral",
                "histogram": macd_histogram_history[-1],
            } if macd_histogram_history[-1] is not None else None,
            {"sma_20": sma_20_history[-1], "sma_50": sma_50_history[-1], "sma_200": sma_200_history[-1]},
            {
                "upper_band": bb_upper_history[-1],
                "middle_band": bb_middle_history[-1],
                "lower_band": bb_lower_history[-1],
                "position": _determine_bb_position(current_price, bb_upper_history[-1], bb_lower_history[-1]),
            } if bb_upper_history[-1] is not None else None,
            current_price,
            advanced,
        )

        # ── Assemble flat indicator dict for the AI prompt ────────────────
        indicators_for_prompt = {
            "_current_price": current_price,
            "rsi": {
                "value": round(rsi_history[-1], 2) if rsi_history[-1] is not None else None,
                "signal": "oversold" if rsi_history[-1] and rsi_history[-1] < 30 else "overbought" if rsi_history[-1] and rsi_history[-1] > 70 else "neutral",
            },
            "macd": {
                "trend": "bullish" if macd_histogram_history[-1] and macd_histogram_history[-1] > 0 else "bearish" if macd_histogram_history[-1] and macd_histogram_history[-1] < 0 else "neutral",
                "histogram": round(macd_histogram_history[-1], 4) if macd_histogram_history[-1] is not None else None,
            },
            "bollinger_bands": {
                "position": _determine_bb_position(current_price, bb_upper_history[-1], bb_lower_history[-1]),
            },
            "moving_averages": {
                "sma_20": round(sma_20_history[-1], 2) if sma_20_history[-1] is not None else None,
                "sma_50": round(sma_50_history[-1], 2) if sma_50_history[-1] is not None else None,
                "sma_200": round(sma_200_history[-1], 2) if sma_200_history[-1] is not None else None,
            },
            "stochastic": _strip_history(advanced.get("stochastic")),
            "adx": _strip_history(advanced.get("adx")),
        }

        ai_summary = await analyze_stock(
            ticker=ticker.upper(),
            summary=summary,
            indicators=indicators_for_prompt,
        )

        # Record usage (shared ai_analysis pool)
        db.add(FeatureUsage(user_id=current_user.id, feature="ai_analysis"))
        await db.commit()

        return {
            "summary": ai_summary,
            "generated_at": datetime.now(timezone.utc).isoformat(),
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Could not generate AI analysis for {ticker.upper()}: {_safe_error(e)}",
        )


async def _fetch_forecast_inputs(ticker: str) -> dict:
    """
    Fetch DCF value and analyst price targets from FMP in parallel.
    Returns a dict with dcf_value, analyst_consensus, analyst_low, analyst_high.
    All values may be None on failure.
    """
    sym = ticker.upper()
    result = {
        "dcf_value": None,
        "analyst_consensus": None,
        "analyst_low": None,
        "analyst_high": None,
    }
    try:
        client = get_fmp_client()
        dcf_resp, targets_resp = await asyncio.gather(
            client.get("discounted-cash-flow", params={"symbol": sym, "apikey": API_KEY}),
            client.get("price-target-consensus", params={"symbol": sym, "apikey": API_KEY}),
            return_exceptions=True,
        )

        if not isinstance(dcf_resp, Exception) and dcf_resp.status_code == 200:
            dcf_data = dcf_resp.json()
            if dcf_data and isinstance(dcf_data, list) and len(dcf_data) > 0:
                result["dcf_value"] = dcf_data[0].get("dcf")

        if not isinstance(targets_resp, Exception) and targets_resp.status_code == 200:
            targets_data = targets_resp.json()
            if targets_data and isinstance(targets_data, list) and len(targets_data) > 0:
                t = targets_data[0]
                result["analyst_consensus"] = t.get("targetConsensus")
                result["analyst_low"] = t.get("targetLow")
                result["analyst_high"] = t.get("targetHigh")
    except Exception as e:
        print(f"⚠️ Forecast input fetch failed for {ticker}: {e}")

    return result


@router.get("/stocks/{ticker}/price-forecast")
async def stock_price_forecast(
    ticker: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Generate a 3-month bear/base/bull price forecast by triangulating DCF intrinsic value,
    technical support/resistance range, and analyst consensus target via Claude.

    Results are cached in memory per ticker for 6 hours to avoid consuming rate-limit
    credits on every page view.
    """
    sym = ticker.upper()

    # ── Serve from cache if fresh ─────────────────────────────────────────
    cached = _forecast_cache.get(sym)
    if cached is not None:
        ts, payload = cached
        if time.time() - ts < _FORECAST_TTL:
            return payload

    # No rate-limit check — the 6h per-ticker cache bounds cost sufficiently.

    try:
        # ── Fetch historical prices for technical analysis ────────────────
        historical = await market_data_service.get_historical_prices(sym, 250)
        if not historical or len(historical) == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"No historical data available for {sym}",
            )

        prices = [float(day["close"]) for day in historical]
        highs = [float(day["high"]) for day in historical]
        lows = [float(day["low"]) for day in historical]
        volumes = [float(day["volume"]) for day in historical]
        current_price = prices[-1]

        # ── Fetch DCF + analyst targets from FMP in parallel ─────────────
        fmp_inputs = await _fetch_forecast_inputs(sym)

        # ── Compute advanced technical indicators (synchronous) ───────────
        advanced = {}
        try:
            advanced = technical_indicators.calculate_all_advanced(highs, lows, prices, volumes)
        except Exception:
            pass

        # ── Compute summary indicators (support/resistance + score) ───────
        # Minimal history arrays needed for generate_summary
        sma_20_h, sma_50_h, sma_200_h = [], [], []
        bb_upper_h, bb_lower_h, bb_middle_h = [], [], []
        rsi_h = []
        macd_h, macd_sig_h, macd_hist_h = [], [], []

        for i in range(len(prices)):
            sma_20_h.append(sum(prices[i - 19:i + 1]) / 20 if i >= 19 else None)
            sma_50_h.append(sum(prices[i - 49:i + 1]) / 50 if i >= 49 else None)
            sma_200_h.append(sum(prices[i - 199:i + 1]) / 200 if i >= 199 else None)

            if i >= 19:
                seg = prices[i - 19:i + 1]
                sma = sum(seg) / 20
                std = (sum((p - sma) ** 2 for p in seg) / 20) ** 0.5
                bb_middle_h.append(sma)
                bb_upper_h.append(sma + 2 * std)
                bb_lower_h.append(sma - 2 * std)
            else:
                bb_middle_h.append(None)
                bb_upper_h.append(None)
                bb_lower_h.append(None)

            if i >= 14:
                seg = prices[i - 14:i + 1]
                gains = [max(seg[j] - seg[j - 1], 0) for j in range(1, len(seg))]
                losses = [abs(min(seg[j] - seg[j - 1], 0)) for j in range(1, len(seg))]
                ag = sum(gains) / len(gains)
                al = sum(losses) / len(losses)
                rsi_h.append(100 if al == 0 else 100 - (100 / (1 + ag / al)))
            else:
                rsi_h.append(None)

            if i >= 33:
                e12 = prices[max(0, i - 11):i + 1]
                m12 = 2 / 13
                ema12 = e12[0]
                for p in e12[1:]:
                    ema12 = (p - ema12) * m12 + ema12

                e26 = prices[max(0, i - 25):i + 1]
                m26 = 2 / 27
                ema26 = e26[0]
                for p in e26[1:]:
                    ema26 = (p - ema26) * m26 + ema26

                ml = ema12 - ema26
                if len(macd_h) >= 8:
                    recent = [m for m in macd_h[-8:] if m is not None] + [ml]
                    m9 = 2 / 10
                    sig = recent[0]
                    for mv in recent[1:]:
                        sig = (mv - sig) * m9 + sig
                    macd_h.append(ml)
                    macd_sig_h.append(sig)
                    macd_hist_h.append(ml - sig)
                else:
                    macd_h.append(ml)
                    macd_sig_h.append(None)
                    macd_hist_h.append(None)
            else:
                macd_h.append(None)
                macd_sig_h.append(None)
                macd_hist_h.append(None)

        last_macd_hist = macd_hist_h[-1] if macd_hist_h else None
        last_bb_upper = bb_upper_h[-1] if bb_upper_h else None
        last_bb_lower = bb_lower_h[-1] if bb_lower_h else None
        last_bb_mid = bb_middle_h[-1] if bb_middle_h else None

        def _bb_pos(price: float, upper, lower) -> str:
            if upper is None or lower is None:
                return "neutral"
            if price > upper:
                return "above_upper"
            if price < lower:
                return "below_lower"
            return "within_bands"

        summary = generate_summary(
            rsi_h[-1] if rsi_h[-1] is not None else None,
            {
                "trend": "bullish" if last_macd_hist and last_macd_hist > 0 else "bearish" if last_macd_hist and last_macd_hist < 0 else "neutral",
                "histogram": last_macd_hist,
            } if last_macd_hist is not None else None,
            {"sma_20": sma_20_h[-1], "sma_50": sma_50_h[-1], "sma_200": sma_200_h[-1]},
            {
                "upper_band": last_bb_upper,
                "middle_band": last_bb_mid,
                "lower_band": last_bb_lower,
                "position": _bb_pos(current_price, last_bb_upper, last_bb_lower),
            } if last_bb_upper is not None else None,
            current_price,
            advanced if isinstance(advanced, dict) else {},
        )

        price_range = summary.get("price_range")
        tech_support = price_range.get("support") if price_range else None
        tech_resistance = price_range.get("resistance") if price_range else None
        tech_score = summary.get("score")
        tech_outlook = summary.get("outlook")

        # ── Call Claude ───────────────────────────────────────────────────
        forecast = await forecast_stock_price(
            ticker=sym,
            current_price=current_price,
            analyst_consensus=fmp_inputs.get("analyst_consensus"),
            analyst_low=fmp_inputs.get("analyst_low"),
            analyst_high=fmp_inputs.get("analyst_high"),
            dcf_value=fmp_inputs.get("dcf_value"),
            tech_support=tech_support,
            tech_resistance=tech_resistance,
            tech_score=tech_score,
            tech_outlook=tech_outlook,
        )

        if forecast is None:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Unable to generate price forecast at this time.",
            )

        # ── Build and cache response ──────────────────────────────────────
        result = {
            "ticker": sym,
            "bear": forecast["bear"],
            "base": forecast["base"],
            "bull": forecast["bull"],
            "horizon": "3 months",
            "rationale": forecast["rationale"],
            "generated_at": datetime.now(timezone.utc).isoformat(),
        }
        _forecast_cache[sym] = (time.time(), result)

        return result

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Could not generate price forecast for {sym}: {_safe_error(e)}",
        )
