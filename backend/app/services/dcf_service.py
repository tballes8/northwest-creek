"""
DCF Engine — forward intrinsic value and the reverse (implied growth) solver.

`compute_dcf()` is the single source of truth for the discounting math. It was
extracted verbatim from the inline block that used to live in
`api/v1/endpoints/dcf_valuation.py::calculate_dcf`, including its rounding
behaviour (see the notes in the function body) so that the forward DCF response
is numerically unchanged.

`calculate_reverse_dcf()` does NOT reimplement any of that math — it runs
`compute_dcf()` as the objective of a root find, solving for the FCF growth rate
that makes intrinsic value equal the current market price.
"""
import math
from typing import Any, Dict, List, Optional

# ── Reverse-DCF solver configuration ─────────────────────────────────────────
# Bracket is deliberately narrow. A stock implying >50% or <-20% sustained FCF
# growth is not something this model should quietly bless — we report
# "no_convergence" rather than widening the bracket to manufacture an answer.
GROWTH_BRACKET_LOW = -0.20
GROWTH_BRACKET_HIGH = 0.50
SOLVER_TOLERANCE = 1e-4
SOLVER_MAX_ITERATIONS = 200

# Advisory only — does not suppress the result.
EXTREME_GROWTH_THRESHOLD = 0.40

# Discount-rate offset for the three band points.
BAND_OFFSET = 0.01

# Security types for which a cash-flow DCF is meaningless. Mirrors the
# frontend's API-driven check (`security_type === 'WARRANT'`), widened to the
# other non-operating-company types Polygon reports.
UNSUITABLE_SECURITY_TYPES = {
    "WARRANT", "RIGHT", "UNIT", "ETF", "FUND", "ETN", "ETV", "ETS", "INDEX",
}

# `fcf_source` values that mean "no filings were available, so this number was
# invented". Distinct from "actual_ttm"/"operating_cf", which are real reported
# figures. See the suppression note in calculate_reverse_dcf().
ESTIMATED_FCF_SOURCES = {"estimated_market_cap", "estimated_price"}


def compute_dcf(
    *,
    current_fcf: float,
    growth_rate: float,
    discount_rate: float,
    terminal_growth: float,
    projection_years: int,
    shares_outstanding: float,
    net_debt_adjustment: float = 0.0,
) -> Dict[str, Any]:
    """Project FCF, discount it, and bridge to an intrinsic value per share.

    Extracted unchanged from the original inline implementation. Two rounding
    quirks are preserved intentionally, because changing them would shift every
    existing forward-DCF result:
      1. Terminal value is derived from the *rounded* final-year cash flow.
      2. `sum_pv_cash_flows` sums the *rounded* per-year present values.

    Caller is responsible for validating `discount_rate > terminal_growth` and
    `shares_outstanding > 0`.
    """
    projected_cash_flows: List[Dict[str, Any]] = []
    for year in range(1, projection_years + 1):
        fcf = current_fcf * ((1 + growth_rate) ** year)
        pv = fcf / ((1 + discount_rate) ** year)
        projected_cash_flows.append({
            "year": year,
            "cash_flow": round(fcf, 2),
            "present_value": round(pv, 2),
            "discount_factor": round(1 / ((1 + discount_rate) ** year), 4),
        })

    # Terminal value off the rounded final-year FCF — see docstring note 1.
    final_year_fcf = projected_cash_flows[-1]["cash_flow"]
    terminal_value = (final_year_fcf * (1 + terminal_growth)) / (discount_rate - terminal_growth)
    terminal_pv = terminal_value / ((1 + discount_rate) ** projection_years)

    # Sum of rounded PVs — see docstring note 2.
    sum_pv_cash_flows = sum(cf["present_value"] for cf in projected_cash_flows)
    enterprise_value = sum_pv_cash_flows + terminal_pv

    equity_value = enterprise_value + net_debt_adjustment
    intrinsic_value_per_share = equity_value / shares_outstanding

    return {
        "projections": projected_cash_flows,
        "terminal_value": terminal_value,
        "terminal_pv": terminal_pv,
        "sum_pv_cash_flows": sum_pv_cash_flows,
        "enterprise_value": enterprise_value,
        "equity_value": equity_value,
        "intrinsic_value_per_share": intrinsic_value_per_share,
    }


def _intrinsic_value_at_growth(
    growth: float,
    *,
    current_fcf: float,
    discount_rate: float,
    terminal_growth: float,
    projection_years: int,
    shares_outstanding: float,
    net_debt_adjustment: float,
) -> float:
    """Thin adapter so the solver's objective runs the real forward engine."""
    return compute_dcf(
        current_fcf=current_fcf,
        growth_rate=growth,
        discount_rate=discount_rate,
        terminal_growth=terminal_growth,
        projection_years=projection_years,
        shares_outstanding=shares_outstanding,
        net_debt_adjustment=net_debt_adjustment,
    )["intrinsic_value_per_share"]


def _bisect(objective, low: float, high: float, tolerance: float) -> Optional[float]:
    """Find a root of `objective` in [low, high], or None if there isn't one.

    Bisection rather than `scipy.optimize.brentq`: intrinsic value is strictly
    monotonic in the growth rate for positive FCF, so bisection converges
    deterministically in ~13 iterations at this tolerance and costs no
    dependency. Returning None on "no sign change in the bracket" reproduces the
    condition brentq signals by raising ValueError.
    """
    try:
        f_low = objective(low)
        f_high = objective(high)
    except (ZeroDivisionError, OverflowError, ValueError):
        return None

    if not (math.isfinite(f_low) and math.isfinite(f_high)):
        return None
    if f_low == 0.0:
        return low
    if f_high == 0.0:
        return high
    if f_low * f_high > 0:
        # No sign change — the price lies outside the range this bracket spans.
        return None

    for _ in range(SOLVER_MAX_ITERATIONS):
        if (high - low) < tolerance:
            break
        mid = (low + high) / 2.0
        try:
            f_mid = objective(mid)
        except (ZeroDivisionError, OverflowError, ValueError):
            return None
        if not math.isfinite(f_mid):
            return None
        if f_mid == 0.0:
            return mid
        if f_low * f_mid <= 0:
            high = mid
        else:
            low, f_low = mid, f_mid

    return (low + high) / 2.0


def _unavailable(reason: str) -> Dict[str, Any]:
    """Structured 'no result' payload — never None, never a bare float."""
    return {
        "converged": False,
        "implied_growth_low": None,
        "implied_growth_mid": None,
        "implied_growth_high": None,
        "band_low": None,
        "band_high": None,
        "extreme_growth_flag": False,
        "solved_points": [],
        "reason_if_unavailable": reason,
    }


def calculate_reverse_dcf(
    *,
    current_price: float,
    fcf: float,
    discount_rate: float,
    terminal_growth: float,
    projection_years: int,
    shares: float,
    net_debt_adjustment: float = 0.0,
    security_type: Optional[str] = None,
    fcf_source: Optional[str] = None,
) -> Dict[str, Any]:
    """Solve for the FCF growth rate the market is implying at `current_price`.

    Runs the forward engine three times — at WACC-1%, WACC, and WACC+1% — and
    reports the result as a band. `net_debt_adjustment` must match the value the
    forward DCF used, otherwise the solved growth would not reproduce the price
    under the model the user is actually looking at.

    `fcf_source` is required to tell reported cash flow apart from an estimate;
    omitting it lets a fabricated FCF through (see the suppression note below).
    """
    # ── Suppression: non-operating security types ────────────────────────────
    if security_type and security_type.upper() in UNSUITABLE_SECURITY_TYPES:
        return _unavailable("invalid_ticker_type")

    # ── Suppression: fabricated FCF (no filings available) ───────────────────
    # When there are no filings the caller estimates FCF as a fixed fraction of
    # market cap (and shares as market_cap / price). Both terms are then
    # proportional to the price we are solving against, so they cancel: the
    # implied growth collapses to a function of discount rate, terminal growth
    # and projection years alone. Every such ticker returns an identical band —
    # an authoritative-looking number carrying no company-specific information.
    # Refuse rather than fabricate.
    if fcf_source in ESTIMATED_FCF_SOURCES:
        return _unavailable("estimated_fcf")

    # ── Suppression: negative / zero trailing FCF ────────────────────────────
    # No positive growth rate turns negative cash flow into positive value, so
    # there is nothing to solve. Do not attempt it.
    if fcf is None or fcf <= 0:
        return _unavailable("negative_fcf")

    # Defensive guards — the caller's fallbacks should make these unreachable.
    if not current_price or current_price <= 0 or not shares or shares <= 0:
        return _unavailable("no_convergence")

    # ── Solve at three discount rates ────────────────────────────────────────
    # Mapping sanity check: a LOWER discount rate discounts future cash flows
    # less, producing a HIGHER intrinsic value at any given growth rate. To land
    # back on the same fixed market price, it therefore needs a LOWER growth
    # rate. So:
    #     discount_rate - 1%  ->  lowest  implied growth  (band bottom)
    #     discount_rate + 1%  ->  highest implied growth  (band top)
    # (The brief's field comments assert the opposite pairing; the arithmetic
    # above is the correct one. `band_low`/`band_high` are min/max of whatever
    # converged, so the band is right either way.)
    solve_order = [
        ("implied_growth_low", discount_rate - BAND_OFFSET),
        ("implied_growth_mid", discount_rate),
        ("implied_growth_high", discount_rate + BAND_OFFSET),
    ]

    solved: Dict[str, Optional[float]] = {
        "implied_growth_low": None,
        "implied_growth_mid": None,
        "implied_growth_high": None,
    }
    solved_points: List[Dict[str, float]] = []

    for key, rate in solve_order:
        # Gordon growth breaks down once the discount rate meets terminal
        # growth. Skip that point rather than emit a negative terminal value.
        # Note the -1% point can cross this line even when the user's WACC
        # doesn't, which is exactly the tight-spread edge case.
        if rate <= terminal_growth:
            continue

        def objective(growth: float, _rate: float = rate) -> float:
            return _intrinsic_value_at_growth(
                growth,
                current_fcf=fcf,
                discount_rate=_rate,
                terminal_growth=terminal_growth,
                projection_years=projection_years,
                shares_outstanding=shares,
                net_debt_adjustment=net_debt_adjustment,
            ) - current_price

        root = _bisect(objective, GROWTH_BRACKET_LOW, GROWTH_BRACKET_HIGH, SOLVER_TOLERANCE)
        if root is not None:
            solved[key] = root
            solved_points.append({"discount_rate": rate, "implied_growth": root})

    # Only unavailable if ALL three failed; a partial band is still reported.
    if not solved_points:
        return _unavailable("no_convergence")

    growths = [p["implied_growth"] for p in solved_points]
    band_low = min(growths)
    band_high = max(growths)

    # Advisory flag — never suppresses. Prefer the midpoint; fall back to the
    # top of the band when the mid solve was one of the ones that failed.
    reference = solved["implied_growth_mid"]
    if reference is None:
        reference = band_high
    extreme_growth_flag = reference > EXTREME_GROWTH_THRESHOLD

    return {
        "converged": True,
        "implied_growth_low": solved["implied_growth_low"],
        "implied_growth_mid": solved["implied_growth_mid"],
        "implied_growth_high": solved["implied_growth_high"],
        "band_low": band_low,
        "band_high": band_high,
        "extreme_growth_flag": extreme_growth_flag,
        # Drives the "solved at ...%" sub-line so the UI never presents a
        # single converged point as though it were a band.
        "solved_points": solved_points,
        "reason_if_unavailable": None,
    }
