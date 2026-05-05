"""
FRED (Federal Reserve Economic Data) client.

Pulls a small set of macroeconomic indicators used by the AI economic-cycle
synthesis on the Sector Heatmap page. Uses the FRED API when FRED_API_KEY is
set, otherwise falls back to the unauthenticated fredgraph CSV endpoint
(which doesn't require a key but is less stable).

Indicators tracked:
    T10Y2Y    — 10y minus 2y Treasury yield spread (daily)
    FEDFUNDS  — Effective federal funds rate (monthly)
    CPIAUCSL  — CPI for All Urban Consumers (monthly, raw index — caller computes YoY)
    UNRATE    — Unemployment rate (monthly)
    GDPC1     — Real GDP, chained 2017 dollars (quarterly — caller computes growth)
"""
from __future__ import annotations

import csv
import io
import logging
from dataclasses import dataclass
from datetime import date as date_cls
from typing import Optional

import httpx

from app.config import get_settings

logger = logging.getLogger(__name__)

FRED_API_BASE = "https://api.stlouisfed.org/fred"
FREDGRAPH_CSV_BASE = "https://fred.stlouisfed.org/graph/fredgraph.csv"

# Series we ingest. Keep this list small — every entry adds to the daily fetch budget.
MACRO_SERIES: tuple[str, ...] = (
    "T10Y2Y",
    "FEDFUNDS",
    "CPIAUCSL",
    "UNRATE",
    "GDPC1",
)


@dataclass(frozen=True)
class FredObservation:
    series_id: str
    observation_date: date_cls
    value: float


async def _fetch_via_api(client: httpx.AsyncClient, series_id: str, api_key: str) -> Optional[FredObservation]:
    """Fetch latest observation via authenticated FRED JSON API."""
    resp = await client.get(
        f"{FRED_API_BASE}/series/observations",
        params={
            "series_id": series_id,
            "api_key": api_key,
            "file_type": "json",
            "sort_order": "desc",
            "limit": 1,
        },
    )
    resp.raise_for_status()
    data = resp.json()
    obs_list = data.get("observations") or []
    for obs in obs_list:
        raw = obs.get("value")
        if raw is None or raw == "." or raw == "":
            continue
        try:
            return FredObservation(
                series_id=series_id,
                observation_date=date_cls.fromisoformat(obs["date"]),
                value=float(raw),
            )
        except (ValueError, KeyError):
            continue
    return None


async def _fetch_via_csv(client: httpx.AsyncClient, series_id: str) -> Optional[FredObservation]:
    """Fetch latest observation via unauthenticated fredgraph CSV endpoint."""
    resp = await client.get(FREDGRAPH_CSV_BASE, params={"id": series_id})
    resp.raise_for_status()
    reader = csv.reader(io.StringIO(resp.text))
    rows = list(reader)
    if len(rows) < 2:
        return None
    # Walk from bottom up — last non-blank row wins
    for row in reversed(rows[1:]):
        if len(row) < 2:
            continue
        date_str, raw = row[0], row[1]
        if not raw or raw == "." or raw.strip() == "":
            continue
        try:
            return FredObservation(
                series_id=series_id,
                observation_date=date_cls.fromisoformat(date_str.strip()),
                value=float(raw.strip()),
            )
        except (ValueError, KeyError):
            continue
    return None


async def fetch_latest_observation(series_id: str) -> Optional[FredObservation]:
    """
    Get the most recent value for a single FRED series.
    Returns None on any failure — caller logs and continues to the next series.
    """
    settings = get_settings()
    api_key = settings.FRED_API_KEY

    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            if api_key:
                try:
                    return await _fetch_via_api(client, series_id, api_key)
                except Exception as api_err:
                    logger.warning(f"FRED API fetch failed for {series_id}, falling back to CSV: {api_err}")
            return await _fetch_via_csv(client, series_id)
    except Exception as exc:
        logger.warning(f"FRED fetch failed for {series_id}: {exc}")
        return None


async def fetch_observations_csv(series_id: str, max_rows: int = 24) -> list[FredObservation]:
    """
    Pull the trailing window of observations for a series via the CSV endpoint.
    Used to compute YoY (CPI) and QoQ-annualized (GDP) growth from raw index values.
    Returns observations sorted ascending by date.
    """
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await client.get(FREDGRAPH_CSV_BASE, params={"id": series_id})
            resp.raise_for_status()
    except Exception as exc:
        logger.warning(f"FRED CSV bulk fetch failed for {series_id}: {exc}")
        return []

    reader = csv.reader(io.StringIO(resp.text))
    rows = list(reader)
    if len(rows) < 2:
        return []
    out: list[FredObservation] = []
    for row in rows[1:]:
        if len(row) < 2:
            continue
        date_str, raw = row[0], row[1]
        if not raw or raw == "." or raw.strip() == "":
            continue
        try:
            out.append(FredObservation(
                series_id=series_id,
                observation_date=date_cls.fromisoformat(date_str.strip()),
                value=float(raw.strip()),
            ))
        except (ValueError, KeyError):
            continue
    out.sort(key=lambda o: o.observation_date)
    return out[-max_rows:] if max_rows else out
