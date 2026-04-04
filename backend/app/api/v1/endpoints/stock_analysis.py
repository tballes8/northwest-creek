"""
Stock AI analysis endpoint — on-demand plain-language summary of a stock's
technical indicators.  Shares the same ai_analysis usage pool as portfolio analysis.
"""
import re
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime, timezone

from app.db.session import get_db
from app.api.dependencies import get_current_user
from app.db.models import User, FeatureUsage
from app.services.market_data import market_data_service
from app.services.technical_indicators import technical_indicators, generate_summary
from app.services.stock_analyzer import analyze_stock
from app.api.v1.endpoints.portfolio_analysis import check_ai_analysis_access

router = APIRouter()


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
