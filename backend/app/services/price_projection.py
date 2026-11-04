"""
EXPERIMENTAL: price projection cone. This feature may be removed.

A range of outcomes, not a forecast. Monte Carlo geometric Brownian motion with
zero drift: volatility comes from trailing dividend-adjusted closes, and the
output is the 5/25/50/75/95th percentile of 10,000 simulated paths for each of
the next 252 trading days. The spec is "Projecting a Stock Chart Forward"
(2026-11-04).

Why zero drift: volatility can be estimated from a year of daily data, but the
expected return cannot. Its standard error is sigma/sqrt(years), so a trailing
return used as drift would tilt a hot stock's cone up and a beaten-down one's
down. That is momentum presented as statistics. With zero log drift the median
stays at today's price.

Thin trading biases the volatility estimate in a direction you can't know in
advance: stale prints and zero-return days push it down, bid-ask bounce pushes
it up. Three guards:
  - more than 10% zero-return days: estimate from weekly returns instead (sqrt 52)
  - more than 30% zero-return days: confidence "low" (the UI greys the cone out)
  - median 20-day dollar volume under $100k: confidence "reduced"

To remove the feature, delete:
  - this file
  - api/v1/endpoints/price_projection.py and its include_router line in main.py
  - the "historical-price-eod/dividend-adjusted" entries in
    fmp_endpoint_registry.py and fmp_field_audit.build_sample_params
  - projectionAPI and its types in frontend/src/services/api.ts
  - frontend/src/components/PriceProjection.tsx and its one use in pages/Stocks.tsx
  - the price_projection row in CLAUDE.md

Offline self-test: python -m app.services.price_projection --selftest
"""
from __future__ import annotations

import math
from datetime import date, datetime, timedelta, timezone
from typing import Any, Iterable

import numpy as np
import pandas as pd

HORIZON_DAYS = 252          # one trading year; the UI's 30D/90D views slice this
N_PATHS = 10_000
SEED = 42                   # a fixed seed so the cone doesn't jitter between loads
PERCENTILES = (5, 25, 50, 75, 95)
DRIFT_ANNUAL = 0.0          # log drift; see the module docstring

FETCH_DAYS = 1825           # five years: room for the weekly fallback and a future backtest
LOOKBACK_DAILY = 252        # daily returns used for sigma
MIN_DAILY_RETURNS = 200
LOOKBACK_WEEKLY = 104       # weekly returns used for sigma when trading is thin
MIN_WEEKLY_RETURNS = 52
HISTORY_POINTS = 252        # trailing closes returned for the chart's history line

# Judgment calls from the spec. The literature has no standard cutoffs for these.
ZERO_RETURN_WEEKLY = 0.10
ZERO_RETURN_LOW = 0.30
MIN_DOLLAR_VOLUME = 100_000
DOLLAR_VOLUME_WINDOW = 20


class ProjectionUnavailable(ValueError):
    """The series can't support a volatility estimate (too short, no usable closes)."""


def _clean_series(rows: Iterable[dict[str, Any]]) -> pd.DataFrame:
    """FMP dividend-adjusted rows to an ascending frame of (adj_close, volume).

    Rows with a missing or non-positive close are dropped, never filled: a filled
    day is exactly the fake zero return that shrinks sigma.
    """
    records = []
    for r in rows:
        try:
            d = date.fromisoformat(str(r.get("date", ""))[:10])
            px = float(r.get("adjClose"))
        except (TypeError, ValueError):
            continue
        if not math.isfinite(px) or px <= 0:
            continue
        vol = r.get("volume")
        try:
            vol = float(vol) if vol is not None else np.nan
        except (TypeError, ValueError):
            vol = np.nan
        records.append((pd.Timestamp(d), px, vol))
    if not records:
        return pd.DataFrame(columns=["adj_close", "volume"])
    df = pd.DataFrame(records, columns=["date", "adj_close", "volume"])
    df = df.drop_duplicates("date", keep="last").set_index("date").sort_index()
    return df


def simulate_log_bands(sigma_daily: float, horizon: int = HORIZON_DAYS, *,
                       n_paths: int = N_PATHS, drift_annual: float = DRIFT_ANNUAL,
                       pcts: tuple[int, ...] = PERCENTILES, seed: int = SEED) -> np.ndarray:
    """Percentiles of cumulative log return, shape (len(pcts), horizon).

    Under plain GBM the bands have a closed form, S0*exp(mu*t + z_p*sigma*sqrt(t)).
    The simulation is kept so that bootstrap or fat-tailed shocks can replace the
    normal ones later without changing anything downstream. float32 halves the
    ~20 MB working set and is far finer than the percentile noise.
    """
    rng = np.random.default_rng(seed)
    shocks = rng.standard_normal((n_paths, horizon), dtype=np.float32)
    shocks *= np.float32(sigma_daily)
    shocks += np.float32(drift_annual / 252)
    np.cumsum(shocks, axis=1, out=shocks)
    return np.percentile(shocks, pcts, axis=0)


def build_projection(rows: Iterable[dict[str, Any]], *, horizon: int = HORIZON_DAYS,
                     n_paths: int = N_PATHS) -> dict[str, Any]:
    """The projection payload for one ticker, from FMP dividend-adjusted rows.

    Pure and synchronous (CPU-bound): the endpoint runs it in a worker thread.
    Raises ProjectionUnavailable when there is too little history.
    """
    df = _clean_series(rows)
    if len(df) - 1 < MIN_DAILY_RETURNS:
        raise ProjectionUnavailable(
            f"A projection needs about a year of trading history to estimate volatility. "
            f"This security has {max(len(df), 0)} trading days."
        )
    px = df["adj_close"].astype(float)
    daily = np.log(px).diff().dropna()

    r = daily.iloc[-LOOKBACK_DAILY:]
    zero_frac = float((r == 0).mean())

    dv = (df["adj_close"] * df["volume"]).iloc[-DOLLAR_VOLUME_WINDOW:].dropna()
    median_dollar_volume = float(dv.median()) if len(dv) else None

    notes: list[str] = []
    returns_used = "daily"
    observations = len(r)
    sigma_annual = float(r.std(ddof=1) * math.sqrt(252))
    low = False

    if zero_frac > ZERO_RETURN_WEEKLY:
        weekly = np.log(px.resample("W-FRI").last().dropna()).diff().dropna()
        weekly = weekly.iloc[-LOOKBACK_WEEKLY:]
        if len(weekly) >= MIN_WEEKLY_RETURNS:
            returns_used = "weekly"
            observations = len(weekly)
            sigma_annual = float(weekly.std(ddof=1) * math.sqrt(52))
            notes.append(
                f"{zero_frac:.0%} of trading days in the last year had no price change, "
                f"so volatility is estimated from {observations} weekly returns instead of daily ones."
            )
        else:
            low = True
            notes.append(
                f"{zero_frac:.0%} of trading days in the last year had no price change, and there "
                f"is too little history for a weekly estimate."
            )
    if zero_frac > ZERO_RETURN_LOW:
        low = True
        notes.append("Trading is too thin for a reliable volatility estimate.")
    if median_dollar_volume is not None and median_dollar_volume < MIN_DOLLAR_VOLUME:
        notes.append(
            f"Median daily dollar volume over the last {DOLLAR_VOLUME_WINDOW} sessions is about "
            f"${median_dollar_volume:,.0f}, under ${MIN_DOLLAR_VOLUME:,}. Thin trading makes "
            f"the volatility estimate less reliable."
        )

    if not math.isfinite(sigma_annual) or sigma_annual <= 0:
        raise ProjectionUnavailable("This security's price history shows no usable variation.")

    confidence = "low" if low else ("reduced" if notes else "normal")

    last_date = px.index[-1]
    last_price = float(px.iloc[-1])
    log_bands = simulate_log_bands(sigma_annual / math.sqrt(252), horizon, n_paths=n_paths)
    bands = last_price * np.exp(log_bands.astype(np.float64))
    # Weekdays only. Exchange holidays are ignored, which is fine for a visual.
    future = pd.bdate_range(last_date + pd.Timedelta(days=1), periods=horizon)

    points = [
        {"date": d.date().isoformat(),
         **{f"p{p}": round(float(bands[i, j]), 4) for i, p in enumerate(PERCENTILES)}}
        for j, d in enumerate(future)
    ]
    history = [
        {"date": d.date().isoformat(), "close": round(float(c), 4)}
        for d, c in px.iloc[-HISTORY_POINTS:].items()
    ]

    return {
        "as_of": last_date.date().isoformat(),
        "last_price": round(last_price, 4),
        "method": "gbm_monte_carlo",
        "n_paths": n_paths,
        "horizon_days": horizon,
        "percentiles": list(PERCENTILES),
        "drift_annual": DRIFT_ANNUAL,
        "sigma_annual": round(sigma_annual, 6),
        "returns_used": returns_used,
        "observations": observations,
        "zero_return_frac": round(zero_frac, 4),
        "median_dollar_volume": round(median_dollar_volume, 2) if median_dollar_volume is not None else None,
        "confidence": confidence,
        "confidence_notes": notes,
        "history": history,
        "points": points,
    }


async def fetch_adjusted_rows(ticker: str) -> list[dict[str, Any]]:
    """Five years of FMP dividend-adjusted EOD rows. Raw closes would count every
    ex-dividend and split drop as volatility. Errors propagate (FMPError, httpx);
    the endpoint reports them as "try again", never as "no data"."""
    from app.services.market_data import market_data_service  # settings import; keep the selftest offline

    today = datetime.now(timezone.utc).date()
    data = await market_data_service._fmp_get("historical-price-eod/dividend-adjusted", {
        "symbol": ticker,
        "from": (today - timedelta(days=FETCH_DAYS)).isoformat(),
        "to": today.isoformat(),
    })
    if isinstance(data, dict):
        data = data.get("historical", [])
    return data if isinstance(data, list) else []


# ═══════════════════════════════════════════════════════════════════════════
# Self-test: offline, no network, no DB.
#
#   python -m app.services.price_projection --selftest
# ═══════════════════════════════════════════════════════════════════════════

def _synthetic_rows(returns: np.ndarray, *, start_price: float = 100.0,
                    volume: float = 1_000_000, start: str = "2024-01-02") -> list[dict]:
    dates = pd.bdate_range(start, periods=len(returns) + 1)
    prices = start_price * np.exp(np.concatenate([[0.0], np.cumsum(returns)]))
    return [{"date": d.date().isoformat(), "adjClose": float(p), "volume": volume}
            for d, p in zip(dates, prices)]


def _selftest() -> int:
    # ── Bands match the closed form: sigma 30%, one year, zero drift ─────
    # Spec table: the 90% band at 1Y is 0.61x to 1.64x of today's price.
    sigma_d = 0.30 / math.sqrt(252)
    lb = simulate_log_bands(sigma_d, 252)
    z = {5: -1.6449, 25: -0.6745, 50: 0.0, 75: 0.6745, 95: 1.6449}
    for i, p in enumerate(PERCENTILES):
        for t in (21, 63, 252):
            want = z[p] * 0.30 * math.sqrt(t / 252)
            got = float(lb[i, t - 1])
            assert abs(got - want) < 0.015, (p, t, got, want)
    assert abs(math.exp(lb[0, -1]) - 0.61) < 0.01 and abs(math.exp(lb[4, -1]) - 1.64) < 0.02, \
        (math.exp(lb[0, -1]), math.exp(lb[4, -1]))
    # Width grows with sqrt(t) (checked coarsely: day-to-day percentiles carry MC
    # noise), and the median stays pinned near today's price.
    width = [float(lb[4, t - 1] - lb[0, t - 1]) for t in (21, 63, 126, 252)]
    assert width == sorted(width), width
    assert abs(width[3] / width[1] - 2.0) < 0.08, width   # 4x the horizon, 2x the band
    assert abs(lb[2, -1]) < 0.01
    # Seeded: identical on every call.
    assert np.array_equal(lb, simulate_log_bands(sigma_d, 252))

    rng = np.random.default_rng(7)

    # ── A liquid daily series: normal confidence, sigma recovered ───────
    rets = rng.normal(0, 0.25 / math.sqrt(252), 600)
    out = build_projection(_synthetic_rows(rets), n_paths=4000)
    assert out["returns_used"] == "daily" and out["confidence"] == "normal", out["confidence_notes"]
    assert abs(out["sigma_annual"] - 0.25) < 0.04, out["sigma_annual"]
    assert len(out["points"]) == HORIZON_DAYS and len(out["history"]) == HISTORY_POINTS
    assert out["history"][-1]["close"] == out["last_price"]
    assert out["points"][0]["date"] > out["as_of"]
    assert all(pt["p5"] <= pt["p25"] <= pt["p50"] <= pt["p75"] <= pt["p95"] for pt in out["points"])
    assert out["drift_annual"] == 0.0

    # ── 15% zero-return days: weekly estimate, reduced confidence ───────
    rets = rng.normal(0, 0.30 / math.sqrt(252), 800)
    rets[rng.random(800) < 0.15] = 0.0
    out = build_projection(_synthetic_rows(rets), n_paths=2000)
    assert out["returns_used"] == "weekly", out
    assert out["observations"] == LOOKBACK_WEEKLY, out["observations"]
    assert out["confidence"] == "reduced", out["confidence"]

    # ── 40% zero-return days: low confidence ───────────────────────────
    rets[rng.random(800) < 0.40] = 0.0
    out = build_projection(_synthetic_rows(rets), n_paths=2000)
    assert out["confidence"] == "low" and out["returns_used"] == "weekly", out

    # ── Thin dollar volume alone: reduced ──────────────────────────────
    rets = rng.normal(0, 0.25 / math.sqrt(252), 400)
    out = build_projection(_synthetic_rows(rets, start_price=20.0, volume=2_000), n_paths=2000)
    assert out["confidence"] == "reduced" and out["returns_used"] == "daily", out
    assert out["median_dollar_volume"] < MIN_DOLLAR_VOLUME

    # ── Thin, and too short for 52 weekly returns: daily sigma, low ─────
    rets = rng.normal(0, 0.25 / math.sqrt(252), 220)
    rets[rng.random(220) < 0.2] = 0.0
    out = build_projection(_synthetic_rows(rets), n_paths=2000)
    assert out["returns_used"] == "daily" and out["confidence"] == "low", out

    # ── Too short, junk rows, flat line ────────────────────────────────
    for bad in (_synthetic_rows(rng.normal(0, 0.01, 150)),
                [{"date": "2025-01-02", "adjClose": None}] * 300,
                _synthetic_rows(np.zeros(300))):
        try:
            build_projection(bad, n_paths=500)
        except ProjectionUnavailable:
            pass
        else:
            raise AssertionError("expected ProjectionUnavailable")

    # ── Bad rows are dropped, not filled; duplicates collapse ──────────
    rows = _synthetic_rows(rng.normal(0, 0.01, 300))
    rows.insert(100, {"date": rows[100]["date"], "adjClose": 0, "volume": 5})
    rows.insert(50, {"date": "not a date", "adjClose": 10})
    assert len(_clean_series(rows)) == 301

    print("price_projection selftest: OK")
    return 0


if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1 and sys.argv[1] == "--selftest":
        raise SystemExit(_selftest())
    print("usage: python -m app.services.price_projection --selftest")
    raise SystemExit(2)
