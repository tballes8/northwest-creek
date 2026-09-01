"""
Analyst consensus estimates — the single source for FMP /stable/analyst-estimates.

Every consumer of forward EPS / revenue / EBITDA consensus reads through here so
the DCF growth suggestion, Relative Valuation and the /stocks endpoint can never
disagree about what consensus says, and so a field rename is one fix rather than
three. Mirrors the rationale behind `email_service` being the only outbound mail
path.

FMP stable dropped the `estimated` prefix on this endpoint (estimatedEpsAvg ->
epsAvg) and requires an explicit period param. Old names are kept as fallbacks in
case FMP reverts, via `_pick`.
"""
import math
from datetime import date, datetime
from typing import Any, Dict, List, Optional

from app.services.fmp_client import get_fmp_client, API_KEY

# A single forward estimate row is only comparable to TTM revenue if the estimate's
# fiscal year end is far enough past the last reported quarter to represent roughly
# a full year of growth. Below this, TTM already overlaps most of the estimate
# period and the implied growth is badly understated.
_MIN_TTM_FORWARD_GAP_DAYS = 300


def _pick(d: dict, *keys):
    """Return d[k] for the first PRESENT key (not first truthy), so a legit 0 /
    negative value isn't skipped."""
    for k in keys:
        if k in d:
            return d[k]
    return None


def _num(value) -> Optional[float]:
    """Coerce to a finite float, or None. Rejects bools and NaN/inf."""
    if value is None or isinstance(value, bool):
        return None
    try:
        f = float(value)
    except (TypeError, ValueError):
        return None
    return f if math.isfinite(f) else None


def _int(value) -> Optional[int]:
    """Analyst counts are inherently whole numbers — keep them int so the UI renders
    "12 analysts", not "12.0 analysts"."""
    f = _num(value)
    return int(f) if f is not None else None


def _year_of(value) -> Optional[int]:
    try:
        return int(str(value)[:4])
    except (TypeError, ValueError):
        return None


def _parse_date(value) -> Optional[date]:
    try:
        return datetime.strptime(str(value)[:10], "%Y-%m-%d").date()
    except (TypeError, ValueError):
        return None


def normalize_estimate_row(entry: dict) -> Optional[Dict[str, Any]]:
    """Flatten one FMP estimate row to snake_case, or None if it has no usable date.

    Carries the low/high bands and both analyst counts even though the DCF growth
    suggestion only needs `revenue_avg` — they arrive in the same payload, so
    parsing them here costs nothing and keeps the schema knowledge in one place.
    """
    year = _year_of(entry.get("date"))
    if year is None:
        return None
    return {
        "year": year,
        "date": str(entry.get("date"))[:10],
        "revenue_avg": _num(_pick(entry, "revenueAvg", "estimatedRevenueAvg")),
        "revenue_low": _num(_pick(entry, "revenueLow", "estimatedRevenueLow")),
        "revenue_high": _num(_pick(entry, "revenueHigh", "estimatedRevenueHigh")),
        "eps_avg": _num(_pick(entry, "epsAvg", "estimatedEpsAvg")),
        "eps_low": _num(_pick(entry, "epsLow", "estimatedEpsLow")),
        "eps_high": _num(_pick(entry, "epsHigh", "estimatedEpsHigh")),
        "ebitda_avg": _num(_pick(entry, "ebitdaAvg", "estimatedEbitdaAvg")),
        "ebitda_low": _num(_pick(entry, "ebitdaLow", "estimatedEbitdaLow")),
        "ebitda_high": _num(_pick(entry, "ebitdaHigh", "estimatedEbitdaHigh")),
        "num_analysts_eps": _int(_pick(entry, "numAnalystsEps", "numberAnalystsEps",
                                       "numberAnalystEstimatedEps")),
        "num_analysts_revenue": _int(_pick(entry, "numAnalystsRevenue", "numberAnalystsRevenue")),
    }


def forward_rows(data: Any, today: Optional[date] = None) -> List[Dict[str, Any]]:
    """Normalized estimate rows for fiscal years >= the current year, OLDEST-FIRST.

    FMP's ordering isn't guaranteed, so rows are sorted explicitly rather than
    trusting position.
    """
    if not isinstance(data, list):
        return []
    current_year = (today or date.today()).year
    rows = [r for r in (normalize_estimate_row(e) for e in data if isinstance(e, dict)) if r]
    return sorted((r for r in rows if r["year"] >= current_year), key=lambda r: r["date"])


async def fetch_estimates(ticker: str, limit: int = 4) -> Dict[str, Any]:
    """Fetch annual consensus estimates for `ticker`.

    Returns `{"rows": [...forward rows, oldest-first...]}` plus the nearest-forward
    convenience aggregates. Never raises — on failure `rows` is empty and every
    aggregate is None, so callers degrade instead of erroring.
    """
    out: Dict[str, Any] = {
        "rows": [],
        "forward_eps": None,
        "forward_eps_low": None,
        "forward_eps_high": None,
        "forward_revenue": None,
        "forward_ebitda": None,
        "estimate_year": None,
        "num_analysts_eps": None,
        "num_analysts_revenue": None,
    }
    try:
        client = get_fmp_client()
        resp = await client.get(
            "analyst-estimates",
            params={"symbol": ticker.upper().strip(), "apikey": API_KEY,
                    "period": "annual", "limit": limit},
        )
        resp.raise_for_status()
        rows = forward_rows(resp.json())
    except Exception as e:  # noqa: BLE001 - degrade, never break the caller
        print(f"Analyst estimates fetch failed for {ticker}: {e}")
        return out

    out["rows"] = rows
    if rows:
        near = rows[0]
        out.update({
            "forward_eps": near["eps_avg"],
            "forward_eps_low": near["eps_low"],
            "forward_eps_high": near["eps_high"],
            "forward_revenue": near["revenue_avg"],
            "forward_ebitda": near["ebitda_avg"],
            "estimate_year": near["year"],
            "num_analysts_eps": near["num_analysts_eps"],
            "num_analysts_revenue": near["num_analysts_revenue"],
        })
    return out


def derive_consensus_growth(
    rows: List[Dict[str, Any]],
    revenue_ttm: Optional[float] = None,
    latest_quarter_date: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    """Forward revenue growth % implied by analyst consensus, or None if not derivable.

    Preference order, most reliable first:

      1. `consensus_yoy` — two consecutive forward estimate years. A pure
         forward-on-forward rate: immune to any fiscal-calendar misalignment
         between TTM and the estimate period.
      2. `consensus_vs_ttm` — one forward year against TTM revenue, used only when
         the estimate's year end is >= `_MIN_TTM_FORWARD_GAP_DAYS` past the last
         reported quarter (see the constant).

    Unlike the trailing fallback in `financials_service`, the result is NOT
    haircut: consensus is already a forward estimate, so discounting it would
    reintroduce the arbitrary constant this replaces.
    """
    usable = [r for r in rows if r.get("revenue_avg") is not None]

    if len(usable) >= 2:
        base, nxt = usable[0], usable[1]
        if base["revenue_avg"] > 0:
            return {
                "growth_pct": ((nxt["revenue_avg"] / base["revenue_avg"]) - 1) * 100,
                "basis": "consensus_yoy",
                "from_year": base["year"],
                "estimate_year": nxt["year"],
                "num_analysts": nxt["num_analysts_revenue"] or base["num_analysts_revenue"],
            }
        return None

    if len(usable) == 1:
        ttm = _num(revenue_ttm)
        est = usable[0]
        est_date = _parse_date(est["date"])
        q_date = _parse_date(latest_quarter_date)
        if ttm and ttm > 0 and est_date and q_date:
            if (est_date - q_date).days >= _MIN_TTM_FORWARD_GAP_DAYS:
                return {
                    "growth_pct": ((est["revenue_avg"] / ttm) - 1) * 100,
                    "basis": "consensus_vs_ttm",
                    "from_year": None,
                    "estimate_year": est["year"],
                    "num_analysts": est["num_analysts_revenue"],
                }
    return None
