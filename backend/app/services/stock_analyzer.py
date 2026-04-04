"""
Stock AI analysis service — builds a focused prompt from technical indicator data
and calls the Anthropic Claude API to generate a plain-language summary.
"""
import httpx
from typing import Dict, Any, List, Optional
from app.config import get_settings


async def analyze_stock(
    ticker: str,
    summary: Dict[str, Any],
    indicators: Dict[str, Any],
) -> str:
    """
    Generate a plain-language AI summary of a stock's technical indicators.

    ticker: stock symbol
    summary: dict from generate_summary() with outlook, score, breakdown, price_range, etc.
    indicators: dict of computed indicator values (rsi, macd, moving_averages, bollinger_bands, adx, stochastic, etc.)
    """
    settings = get_settings()

    if not settings.ANTHROPIC_API_KEY:
        return "AI analysis is not configured. Please contact support."

    # ── Build prompt from technical data ──────────────────────────────────
    outlook = summary.get("outlook", "neutral")
    score = summary.get("score", 0)
    bullish_count = summary.get("bullish_count", 0)
    bearish_count = summary.get("bearish_count", 0)

    breakdown_lines = ""
    for item in summary.get("breakdown", []):
        breakdown_lines += f"  - {item['indicator']}: {item['direction']} (weight {item['weight']})\n"

    # RSI
    rsi_data = indicators.get("rsi", {})
    rsi_val = rsi_data.get("value")
    rsi_line = f"RSI: {rsi_val:.1f}" if rsi_val is not None else "RSI: N/A"

    # MACD
    macd_data = indicators.get("macd", {})
    macd_trend = macd_data.get("trend", "N/A")
    macd_histogram = macd_data.get("histogram")
    macd_line = f"MACD trend: {macd_trend}, histogram: {macd_histogram}" if macd_histogram is not None else f"MACD trend: {macd_trend}"

    # Bollinger Bands
    bb_data = indicators.get("bollinger_bands", {})
    bb_position = bb_data.get("position", "N/A")
    bb_line = f"Bollinger Band position: {bb_position}"

    # Stochastic
    stoch = indicators.get("stochastic")
    stoch_line = f"Stochastic signal: {stoch['signal']} (%K: {stoch['k']:.1f}, %D: {stoch['d']:.1f})" if stoch else "Stochastic: N/A"

    # ADX
    adx_data = indicators.get("adx")
    adx_line = f"ADX: {adx_data['adx']:.1f} (strength: {adx_data['strength']}, direction: {adx_data['direction']})" if adx_data else "ADX: N/A"

    # Moving averages vs current price
    ma_data = indicators.get("moving_averages", {})
    current_price_val = indicators.get("_current_price")
    ma_lines = []
    for label in ("sma_20", "sma_50", "sma_200"):
        val = ma_data.get(label)
        if val is not None and current_price_val is not None:
            relation = "above" if current_price_val > val else "below"
            ma_lines.append(f"  - Price {relation} {label.upper().replace('_', ' ')}: ${val:.2f}")
    ma_block = "\n".join(ma_lines) if ma_lines else "  - Moving average data unavailable"

    # Price range
    price_range = summary.get("price_range")
    range_line = ""
    if price_range:
        support = price_range.get("support")
        resistance = price_range.get("resistance")
        if support is not None and resistance is not None:
            range_line = f"Technical support/resistance range: ${support:.2f} – ${resistance:.2f}"

    prompt = f"""Technical analysis snapshot for {ticker}:
- Overall outlook: {outlook}
- Composite score: {score}
- Bullish indicators: {bullish_count}, Bearish indicators: {bearish_count}

Indicator breakdown:
{breakdown_lines.strip() if breakdown_lines.strip() else "  - No breakdown available"}

Key indicators:
- {rsi_line}
- {macd_line}
- {bb_line}
- {stoch_line}
- {adx_line}

Price vs moving averages (current: ${current_price_val:.2f} ):
{ma_block}

{range_line}

Summarize what these indicators suggest about this stock's momentum, trend strength, and near-term price behavior in plain language."""

    system_prompt = (
        "You are a technical analysis assistant. Summarize what the current indicators "
        "suggest about this stock's momentum, trend strength, and near-term price behavior "
        "in plain language. Do not give buy, sell, or hold recommendations. Do not predict "
        "price targets or suggest specific actions. Keep your response to 2-5 sentences."
    )

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                "https://api.anthropic.com/v1/messages",
                headers={
                    "x-api-key": settings.ANTHROPIC_API_KEY,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
                json={
                    "model": "claude-sonnet-4-20250514",
                    "max_tokens": 400,
                    "system": system_prompt,
                    "messages": [{"role": "user", "content": prompt}],
                },
            )
            response.raise_for_status()
            data = response.json()
            return data["content"][0]["text"]
    except Exception:
        return (
            "Unable to generate AI analysis at this time. "
            "Please try again in a moment."
        )
