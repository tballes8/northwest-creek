"""
Economic cycle phase analyzer.

Reads the macro_indicators table and the latest sector rotation snapshot, then
calls Claude to synthesize which phase of the business cycle (Recovery /
Expansion / Peak / Contraction) the data is consistent with.

This is contextual education, not a trading signal — the prompt is explicit
about that, and the response carries a disclaimer field.

The readings come out on different schedules (the yield curve daily, the Fed
funds rate, unemployment and CPI monthly, GDP quarterly and a month after the
quarter ends), so each supporting signal carries the period it describes.
Claude only chooses which readings to cite, by key, and interprets them; every
label, value and period on the card comes from the data, never from its text.

    python -m app.services.cycle_phase_analyzer --selftest
"""
from __future__ import annotations

import json
import logging
from datetime import date as date_cls
from typing import Any, Optional

import httpx
from sqlalchemy import select

from app.config import get_settings
from app.core.redaction import safe_error
from app.db.models import MacroIndicator
from app.db.session import async_session
from app.services.anthropic_response import extract_text
from app.services.fred_client import fetch_observations_csv
from app.services.sector_rotation import compute_relative_returns

logger = logging.getLogger(__name__)


PHASE_LABELS = {"Recovery", "Expansion", "Peak", "Contraction"}

# The sector rotation window the synthesis reads, and how the prompt names it
SECTOR_WINDOW = "3M"
SECTOR_WINDOW_LABEL = "3-month"

# The readings Claude may cite: (key, card label, release frequency), in prompt order
SIGNALS: tuple[tuple[str, str, str], ...] = (
    ("yield_curve", "10Y minus 2Y Treasury Spread", "daily"),
    ("fed_funds", "Effective Federal Funds Rate", "monthly"),
    ("unemployment", "Unemployment Rate", "monthly"),
    ("cpi_yoy", "CPI Year-over-Year", "monthly"),
    ("gdp_growth", "Real GDP Growth (QoQ annualized)", "quarterly"),
)

# Readings stored as-is by the fetch_macro_indicators job; CPI and GDP are computed here
_STORED_SERIES = {"yield_curve": "T10Y2Y", "fed_funds": "FEDFUNDS", "unemployment": "UNRATE"}

_MONTHS = ("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")

DISCLAIMER = "Educational context only — not a trading signal or investment recommendation."

# A reading: its value and the FRED observation date
Reading = tuple[float, date_cls]


def period_label(observed: date_cls, frequency: str) -> str:
    """
    The period a FRED observation describes, as the card shows it. FRED dates a
    monthly or quarterly observation by the first day of its period (Q3 GDP is
    2026-07-01), so printing that date would read as "July 1".
    """
    month = _MONTHS[observed.month - 1]
    if frequency == "quarterly":
        return f"Q{(observed.month - 1) // 3 + 1} {observed.year}"
    if frequency == "monthly":
        return f"{month} {observed.year}"
    return f"{month} {observed.day}, {observed.year}"


async def _load_stored_readings() -> dict[str, Reading]:
    """Latest stored value and observation date for every series_id in macro_indicators."""
    async with async_session() as session:
        rows = (await session.execute(select(MacroIndicator))).scalars().all()
    return {r.series_id: (float(r.value), r.observation_date) for r in rows}


async def _compute_cpi_yoy() -> Optional[Reading]:
    """Trailing 12-month CPI change (%) from the raw CPIAUCSL index, dated by its latest month."""
    obs = await fetch_observations_csv("CPIAUCSL", max_rows=14)
    if len(obs) < 13:
        return None
    latest, twelve_back = obs[-1], obs[-13]
    if twelve_back.value == 0:
        return None
    return round((latest.value / twelve_back.value - 1.0) * 100, 2), latest.observation_date


async def _compute_gdp_qoq_annualized() -> Optional[Reading]:
    """Most recent quarter-over-quarter real GDP growth (annualized %), dated by that quarter."""
    obs = await fetch_observations_csv("GDPC1", max_rows=4)
    if len(obs) < 2:
        return None
    latest, prev = obs[-1], obs[-2]
    if prev.value == 0:
        return None
    qoq = latest.value / prev.value - 1.0
    return round(((1.0 + qoq) ** 4 - 1.0) * 100, 2), latest.observation_date


def build_signals(readings: dict[str, Optional[Reading]]) -> dict[str, dict[str, str]]:
    """The citable signals by key, as the card shows them. A reading that failed to load is left out."""
    out: dict[str, dict[str, str]] = {}
    for key, label, frequency in SIGNALS:
        reading = readings.get(key)
        if reading is None:
            continue
        value, observed = reading
        out[key] = {
            "key": key,
            "label": label,
            "value": f"{value:.2f}%",
            "period": period_label(observed, frequency),
            "observation_date": observed.isoformat(),
        }
    return out


async def gather_cycle_inputs(end_date: date_cls) -> dict[str, Any]:
    """Assemble macro + sector inputs that get pasted into the prompt."""
    stored = await _load_stored_readings()
    readings: dict[str, Optional[Reading]] = {key: stored.get(sid) for key, sid in _STORED_SERIES.items()}
    readings["cpi_yoy"] = await _compute_cpi_yoy()
    readings["gdp_growth"] = await _compute_gdp_qoq_annualized()

    rotation = await compute_relative_returns(end_date, SECTOR_WINDOW)

    sectors = rotation.get("sectors", [])
    ranked = [s for s in sectors if s.get("vs_spy_pct") is not None]
    ranked.sort(key=lambda s: s["vs_spy_pct"], reverse=True)
    leaders = ranked[:3]
    laggards = ranked[-3:][::-1]

    return {
        "as_of": end_date.isoformat(),
        "has_stored_indicators": bool(stored),
        "signals": build_signals(readings),
        "leaders": leaders,
        "laggards": laggards,
        "spy_return_pct": rotation.get("spy_return_pct"),
        "sector_window": SECTOR_WINDOW,
        # The last trading session in the window, not the calendar date
        "sector_as_of": rotation.get("as_of"),
    }


def build_prompt(inputs: dict[str, Any]) -> tuple[str, str]:
    signals = inputs["signals"]
    leaders = inputs["leaders"]
    laggards = inputs["laggards"]
    spy_return = inputs["spy_return_pct"]

    indicator_block = "\n".join(
        f"  - {key}: {label} {signals[key]['value']} ({signals[key]['period']})"
        if key in signals else f"  - {key}: {label} not available"
        for key, label, _ in SIGNALS
    )

    def _fmt_sector(s: dict) -> str:
        vs = s.get("vs_spy_pct")
        ret = s.get("return_pct")
        vs_str = f"{vs:+.2f}%" if vs is not None else "—"
        ret_str = f"{ret:+.2f}%" if ret is not None else "—"
        return f"    {s['ticker']} ({s['name']}): return {ret_str}, vs SPY {vs_str}"

    leaders_block = "\n".join(_fmt_sector(s) for s in leaders) or "    (no leaders identified)"
    laggards_block = "\n".join(_fmt_sector(s) for s in laggards) or "    (no laggards identified)"
    spy_str = f"{spy_return:+.2f}%" if spy_return is not None else "—"

    user_prompt = f"""Macro readings (key: reading, value, and the period it covers):
{indicator_block}
These series are released on different schedules, so the readings cover different periods; the oldest can predate the recent sector moves.

{SECTOR_WINDOW_LABEL} sector rotation through {inputs["sector_as_of"]} (vs SPY benchmark = {spy_str}):
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
    {{"key": "<the key of one macro reading above, e.g. yield_curve>", "interpretation": "<one short clause explaining what this reading says about the phase>"}}
  ],
  "sector_alignment": "<1-2 sentences on whether the actual sector leaders/laggards above match what the framework predicts for this phase>"
}}

Include 3-5 supporting signals, each a different available reading cited by its key. The reading's name, value and period are shown beside your interpretation, so don't restate them. Keep all text plain — no markdown, no asterisks, no emoji."""

    system_prompt = (
        "You are an economist explaining the current cycle phase based on macro and sector data. "
        "You synthesize, you do not predict. You do not give buy/sell/hold recommendations and do not "
        "suggest specific portfolio actions. You acknowledge mixed signals plainly when they exist. "
        "Respond with only a valid JSON object — no markdown fences, no text outside the JSON."
    )
    return system_prompt, user_prompt


def normalize_response(parsed: dict[str, Any], inputs: dict[str, Any]) -> dict[str, Any]:
    """
    The card's payload from Claude's JSON. A signal keeps only Claude's
    interpretation; its label, value and period come from the data. A signal
    citing an unknown or unavailable reading, or one already cited, is dropped.
    """
    signals = inputs["signals"]
    cited: list[dict[str, str]] = []
    seen: set[str] = set()
    for s in parsed.get("supporting_signals") or []:
        if not isinstance(s, dict):
            continue
        key = str(s.get("key", "")).strip()
        if key not in signals or key in seen:
            continue
        seen.add(key)
        cited.append({**signals[key], "interpretation": str(s.get("interpretation", "")).strip()})

    return {
        "phase": str(parsed.get("phase", "Unknown")).strip(),
        "confidence": str(parsed.get("confidence", "moderate")).strip(),
        "summary": str(parsed.get("summary", "")).strip(),
        "supporting_signals": cited,
        "sector_alignment": str(parsed.get("sector_alignment", "")).strip(),
        "sector_window": inputs["sector_window"],
        "sector_as_of": inputs["sector_as_of"],
        "as_of": inputs["as_of"],
        "disclaimer": DISCLAIMER,
    }


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
    if not inputs["has_stored_indicators"]:
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
                    "model": settings.ANTHROPIC_MODEL,
                    "max_tokens": 700,
                    "system": system_prompt,
                    "messages": [{"role": "user", "content": user_prompt}],
                },
            )
            resp.raise_for_status()
            data = resp.json()
            raw_text = extract_text(data).strip()
    except Exception as exc:
        logger.warning(f"Anthropic call failed during cycle phase synthesis: {safe_error(exc)}")
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
    if not isinstance(parsed, dict):
        logger.warning(f"Cycle phase response is not a JSON object; raw={raw_text[:300]}")
        return None

    return normalize_response(parsed, inputs)


def _selftest() -> None:
    d = date_cls

    # FRED dates a period by its first day; the card names the period
    assert period_label(d(2026, 7, 1), "quarterly") == "Q3 2026"
    assert period_label(d(2026, 1, 1), "quarterly") == "Q1 2026"
    assert period_label(d(2026, 10, 1), "quarterly") == "Q4 2026"
    assert period_label(d(2026, 9, 1), "monthly") == "Sep 2026"
    assert period_label(d(2026, 11, 4), "daily") == "Nov 4, 2026"

    readings: dict[str, Optional[Reading]] = {
        "yield_curve": (-0.12, d(2026, 11, 14)),
        "fed_funds": (3.88, d(2026, 10, 1)),
        "unemployment": None,  # failed to load
        "cpi_yoy": (4.08, d(2026, 9, 1)),
        "gdp_growth": (3.37, d(2026, 7, 1)),
    }
    signals = build_signals(readings)
    assert list(signals) == ["yield_curve", "fed_funds", "cpi_yoy", "gdp_growth"], "missing reading left out"
    assert signals["yield_curve"]["value"] == "-0.12%" and signals["yield_curve"]["period"] == "Nov 14, 2026"
    assert signals["gdp_growth"] == {
        "key": "gdp_growth", "label": "Real GDP Growth (QoQ annualized)", "value": "3.37%",
        "period": "Q3 2026", "observation_date": "2026-07-01",
    }

    inputs = {
        "as_of": "2026-11-17", "has_stored_indicators": True, "signals": signals,
        "leaders": [{"ticker": "XLV", "name": "Health Care", "return_pct": 4.1, "vs_spy_pct": 2.0}],
        "laggards": [], "spy_return_pct": 2.1, "sector_window": "3M", "sector_as_of": "2026-11-14",
    }
    _, prompt = build_prompt(inputs)
    assert "  - gdp_growth: Real GDP Growth (QoQ annualized) 3.37% (Q3 2026)" in prompt
    assert "  - unemployment: Unemployment Rate not available" in prompt
    assert "3-month sector rotation through 2026-11-14" in prompt

    out = normalize_response({
        "phase": " Late Peak ", "confidence": "mixed", "summary": "s", "sector_alignment": "a",
        "supporting_signals": [
            {"key": "gdp_growth", "value": "9.99% (model's own)", "label": "GDP", "interpretation": " solid "},
            {"key": "unemployment", "interpretation": "unavailable reading"},
            {"key": "made_up", "interpretation": "unknown key"},
            {"key": "gdp_growth", "interpretation": "cited twice"},
            "junk",
            {"key": "yield_curve", "interpretation": "flat"},
        ],
    }, inputs)
    assert [s["key"] for s in out["supporting_signals"]] == ["gdp_growth", "yield_curve"]
    gdp = out["supporting_signals"][0]
    assert gdp["value"] == "3.37%" and gdp["label"] == "Real GDP Growth (QoQ annualized)", "data, not the model"
    assert gdp["period"] == "Q3 2026" and gdp["interpretation"] == "solid"
    assert out["phase"] == "Late Peak" and out["as_of"] == "2026-11-17"
    assert out["sector_window"] == "3M" and out["sector_as_of"] == "2026-11-14"
    assert normalize_response({}, inputs)["supporting_signals"] == []
    print("cycle_phase_analyzer selftest OK")


if __name__ == "__main__":
    import sys

    if "--selftest" in sys.argv[1:]:
        _selftest()
    else:
        print("usage: python -m app.services.cycle_phase_analyzer --selftest")
