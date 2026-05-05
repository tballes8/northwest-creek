"""
Economic cycle phase analyzer.

Reads the macro_indicators table and the latest sector rotation snapshot, then
calls Claude to synthesize which phase of the business cycle (Recovery /
Expansion / Peak / Contraction) the data is consistent with.

This is contextual education, not a trading signal — the prompt is explicit
about that, and the response carries a disclaimer field.
"""
from __future__ import annotations

import json
import logging
from datetime import date as date_cls
from typing import Any, Optional

import httpx
from sqlalchemy import select

from app.config import get_settings
from app.db.models import MacroIndicator
from app.db.session import async_session
from app.services.fred_client import fetch_observations_csv
from app.services.sector_rotation import compute_relative_returns

logger = logging.getLogger(__name__)


PHASE_LABELS = {"Recovery", "Expansion", "Peak", "Contraction"}


async def _load_indicators() -> dict[str, dict[str, Any]]:
    """Load latest stored value for every series_id in macro_indicators."""
    async with async_session() as session:
        result = await session.execute(select(MacroIndicator))
        rows = result.scalars().all()
    return {
        r.series_id: {
            "value": float(r.value),
            "observation_date": r.observation_date.isoformat(),
        }
        for r in rows
    }


async def _compute_cpi_yoy() -> Optional[float]:
    """Compute trailing 12-month CPI change (%) from the raw CPIAUCSL index."""
    obs = await fetch_observations_csv("CPIAUCSL", max_rows=14)
    if len(obs) < 13:
        return None
    latest = obs[-1].value
    twelve_back = obs[-13].value
    if twelve_back == 0:
        return None
    return round((latest / twelve_back - 1.0) * 100, 2)


async def _compute_gdp_qoq_annualized() -> Optional[float]:
    """Compute most recent quarter-over-quarter real GDP growth (annualized %)."""
    obs = await fetch_observations_csv("GDPC1", max_rows=4)
    if len(obs) < 2:
        return None
    latest = obs[-1].value
    prev = obs[-2].value
    if prev == 0:
        return None
    qoq = latest / prev - 1.0
    return round(((1.0 + qoq) ** 4 - 1.0) * 100, 2)


async def gather_cycle_inputs(end_date: date_cls) -> dict[str, Any]:
    """Assemble macro + sector inputs that get pasted into the prompt."""
    indicators = await _load_indicators()
    cpi_yoy = await _compute_cpi_yoy()
    gdp_qoq = await _compute_gdp_qoq_annualized()

    rotation = await compute_relative_returns(end_date, "3M")

    sectors = rotation.get("sectors", [])
    ranked = [s for s in sectors if s.get("vs_spy_pct") is not None]
    ranked.sort(key=lambda s: s["vs_spy_pct"], reverse=True)
    leaders = ranked[:3]
    laggards = ranked[-3:][::-1]

    return {
        "as_of": end_date.isoformat(),
        "indicators": indicators,
        "cpi_yoy_pct": cpi_yoy,
        "gdp_qoq_annualized_pct": gdp_qoq,
        "leaders": leaders,
        "laggards": laggards,
        "spy_3m_return_pct": rotation.get("spy_return_pct"),
    }


def _format_indicator(label: str, indicators: dict[str, Any], series_id: str, suffix: str = "%") -> str:
    raw = indicators.get(series_id)
    if not raw:
        return f"  - {label}: not available"
    return f"  - {label}: {raw['value']:.2f}{suffix} (as of {raw['observation_date']})"


def build_prompt(inputs: dict[str, Any]) -> tuple[str, str]:
    indicators = inputs["indicators"]
    cpi_yoy = inputs["cpi_yoy_pct"]
    gdp_qoq = inputs["gdp_qoq_annualized_pct"]
    leaders = inputs["leaders"]
    laggards = inputs["laggards"]
    spy_3m = inputs["spy_3m_return_pct"]

    indicator_block = "\n".join([
        _format_indicator("10Y minus 2Y Treasury spread", indicators, "T10Y2Y", suffix="%"),
        _format_indicator("Effective federal funds rate", indicators, "FEDFUNDS", suffix="%"),
        _format_indicator("Unemployment rate", indicators, "UNRATE", suffix="%"),
        f"  - CPI year-over-year: {cpi_yoy:.2f}%" if cpi_yoy is not None else "  - CPI year-over-year: not available",
        f"  - Real GDP QoQ annualized: {gdp_qoq:.2f}%" if gdp_qoq is not None else "  - Real GDP QoQ annualized: not available",
    ])

    def _fmt_sector(s: dict) -> str:
        vs = s.get("vs_spy_pct")
        ret = s.get("return_pct")
        vs_str = f"{vs:+.2f}%" if vs is not None else "—"
        ret_str = f"{ret:+.2f}%" if ret is not None else "—"
        return f"    {s['ticker']} ({s['name']}): return {ret_str}, vs SPY {vs_str}"

    leaders_block = "\n".join(_fmt_sector(s) for s in leaders) or "    (no leaders identified)"
    laggards_block = "\n".join(_fmt_sector(s) for s in laggards) or "    (no laggards identified)"
    spy_str = f"{spy_3m:+.2f}%" if spy_3m is not None else "—"

    user_prompt = f"""Macro snapshot (as of {inputs["as_of"]}):
{indicator_block}

3-month sector rotation (vs SPY benchmark = {spy_str}):
  Leaders:
{leaders_block}
  Laggards:
{laggards_block}

The four phases of the business cycle:
  - Recovery: GDP turning positive, low rates, unemployment falling, credit loosening. Early-cycle leaders: Financials, Consumer Discretionary, Industrials, Real Estate.
  - Expansion: Strong GDP growth, rising employment, accelerating consumer/business spending. Leaders: Technology, Communication Services, Consumer Discretionary, Industrials.
  - Peak: Slowing growth, elevated inflation, Fed tightening, flattening/inverting yield curve. Leaders: Energy, Materials, Utilities, Health Care.
  - Contraction: GDP declining, unemployment rising, weak spending, negative earnings revisions. Leaders: Consumer Staples, Health Care, Utilities.

Identify the cycle phase this data is most consistent with. Be honest about mixed signals — if the data doesn't fit cleanly into a single phase (which is common at transitions), say so in the phase label (e.g. "Late Peak / Early Recovery") and set confidence to "mixed".

Respond with ONLY this JSON, no markdown fences, no commentary outside the object:
{{
  "phase": "<phase name; one of Recovery, Expansion, Peak, Contraction, or a hyphenated transition like 'Late Peak / Early Recovery'>",
  "confidence": "<one of: high, moderate, mixed>",
  "summary": "<2-3 sentence narrative explaining what the data is showing and why this phase is the best fit>",
  "supporting_signals": [
    {{"label": "<short signal name>", "value": "<formatted current value>", "interpretation": "<one short clause explaining what this signal says about the phase>"}}
  ],
  "sector_alignment": "<1-2 sentences on whether the actual sector leaders/laggards above match what the framework predicts for this phase>"
}}

Include 3-5 supporting signals drawn from the macro indicators above (yield curve, Fed funds, unemployment, CPI, GDP). Keep all text plain — no markdown, no asterisks, no emoji."""

    system_prompt = (
        "You are an economist explaining the current cycle phase based on macro and sector data. "
        "You synthesize, you do not predict. You do not give buy/sell/hold recommendations and do not "
        "suggest specific portfolio actions. You acknowledge mixed signals plainly when they exist. "
        "Respond with only a valid JSON object — no markdown fences, no text outside the JSON."
    )
    return system_prompt, user_prompt


async def synthesize_cycle_phase(end_date: date_cls) -> Optional[dict[str, Any]]:
    """
    Build the prompt from current macro + sector data, call Claude, parse the JSON
    response, and return a normalized payload. Returns None on any failure — callers
    should treat that as "panel unavailable" and hide it.
    """
    settings = get_settings()
    if not settings.ANTHROPIC_API_KEY:
        logger.info("Cycle phase synthesis skipped: ANTHROPIC_API_KEY not configured")
        return None

    inputs = await gather_cycle_inputs(end_date)
    if not inputs.get("indicators"):
        logger.info("Cycle phase synthesis skipped: no macro indicators in DB yet")
        return None

    system_prompt, user_prompt = build_prompt(inputs)

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                "https://api.anthropic.com/v1/messages",
                headers={
                    "x-api-key": settings.ANTHROPIC_API_KEY,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
                json={
                    "model": "claude-sonnet-4-6",
                    "max_tokens": 700,
                    "system": system_prompt,
                    "messages": [{"role": "user", "content": user_prompt}],
                },
            )
            resp.raise_for_status()
            data = resp.json()
            raw_text = data["content"][0]["text"].strip()
    except Exception as exc:
        logger.warning(f"Anthropic call failed during cycle phase synthesis: {exc}")
        return None

    if raw_text.startswith("```"):
        raw_text = raw_text.split("```")[1]
        if raw_text.startswith("json"):
            raw_text = raw_text[4:]
        raw_text = raw_text.strip()

    try:
        parsed = json.loads(raw_text)
    except Exception as exc:
        logger.warning(f"Cycle phase JSON parse failed: {exc}; raw={raw_text[:300]}")
        return None

    return {
        "phase": str(parsed.get("phase", "Unknown")).strip(),
        "confidence": str(parsed.get("confidence", "moderate")).strip(),
        "summary": str(parsed.get("summary", "")).strip(),
        "supporting_signals": [
            {
                "label": str(s.get("label", "")).strip(),
                "value": str(s.get("value", "")).strip(),
                "interpretation": str(s.get("interpretation", "")).strip(),
            }
            for s in (parsed.get("supporting_signals") or [])
            if isinstance(s, dict)
        ],
        "sector_alignment": str(parsed.get("sector_alignment", "")).strip(),
        "as_of": inputs["as_of"],
        "disclaimer": "Educational context only — not a trading signal or investment recommendation.",
    }
