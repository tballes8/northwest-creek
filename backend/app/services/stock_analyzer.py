"""
Stock AI analysis service — builds a focused prompt from technical indicator data
and calls the Anthropic Claude API to generate a plain-language summary.
"""
import httpx
import json
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
                    "model": "claude-sonnet-4-6",
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


async def forecast_stock_price(
    ticker: str,
    current_price: float,
    analyst_consensus: float | None,
    analyst_low: float | None,
    analyst_high: float | None,
    dcf_value: float | None,
    tech_support: float | None,
    tech_resistance: float | None,
    tech_score: int | None,
    tech_outlook: str | None,
) -> Dict[str, Any] | None:
    """
    Generate a bear/base/bull 3-month price forecast by triangulating DCF,
    technical range, and analyst consensus via Claude.

    Returns a dict with keys: bear, base, bull, rationale.
    Returns None if the call fails or the response cannot be parsed.
    """
    settings = get_settings()

    if not settings.ANTHROPIC_API_KEY:
        return None

    # Build the data snapshot — omit any unavailable inputs gracefully
    analyst_line = ""
    if analyst_consensus is not None:
        analyst_line = f"Analyst consensus target: ${analyst_consensus:.2f}"
        if analyst_low is not None and analyst_high is not None:
            analyst_line += f"  (range ${analyst_low:.0f}–${analyst_high:.0f})"
    else:
        analyst_line = "Analyst consensus target: not available"

    dcf_line = (
        f"DCF intrinsic value:      ${dcf_value:.2f}  (FMP simple DCF)"
        if dcf_value is not None
        else "DCF intrinsic value:      not available"
    )

    tech_range_line = (
        f"Technical range:          ${tech_support:.2f}–${tech_resistance:.2f}  (indicator-derived support/resistance)"
        if tech_support is not None and tech_resistance is not None
        else "Technical range:          not available"
    )

    momentum_line = (
        f"Momentum score:           {tech_score} / 10  ({tech_outlook})"
        if tech_score is not None and tech_outlook is not None
        else "Momentum score:           not available"
    )

    prompt = f"""3-month price forecast synthesis for {ticker} (current: ${current_price:.2f}):

{analyst_line}
{dcf_line}
{tech_range_line}
{momentum_line}

Triangulate a 3-month bear/base/bull range. Rules:
  - Bear: where technical support fails and bearish momentum persists
  - Base: fair value between DCF, technical midpoint, and analyst consensus
  - Bull: momentum carries to technical resistance, sentiment aligns with analyst targets
  - All three values must be > 0 and strictly in bear < base < bull order
  - Values should be rounded to the nearest dollar

Respond with ONLY this JSON (no markdown, no explanation outside the object):
{{"bear": <number>, "base": <number>, "bull": <number>, "rationale": "<1-2 sentence explanation of the triangulation>"}}"""

    system_prompt = (
        "You are a quantitative analyst synthesizing multiple valuation frameworks. "
        "Respond with only a valid JSON object, no markdown fences, no explanation outside the JSON."
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
                    "model": "claude-sonnet-4-6",
                    "max_tokens": 200,
                    "system": system_prompt,
                    "messages": [{"role": "user", "content": prompt}],
                },
            )
            response.raise_for_status()
            data = response.json()
            raw_text = data["content"][0]["text"].strip()

            # Strip any accidental markdown fences
            if raw_text.startswith("```"):
                raw_text = raw_text.split("```")[1]
                if raw_text.startswith("json"):
                    raw_text = raw_text[4:]
                raw_text = raw_text.strip()

            result = json.loads(raw_text)

            bear = float(result["bear"])
            base = float(result["base"])
            bull = float(result["bull"])
            rationale = str(result.get("rationale", ""))

            # Enforce ordering — if Claude returns out-of-order values, sort them
            values = sorted([bear, base, bull])
            return {
                "bear": round(values[0], 2),
                "base": round(values[1], 2),
                "bull": round(values[2], 2),
                "rationale": rationale,
            }
    except Exception:
        return None
