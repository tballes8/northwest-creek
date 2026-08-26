"""
Financial fact block — turns a `get_company_financials(include_raw=True)` payload
into the pre-computed, labelled text block handed to Claude for the AI financials
read, plus the numeral allowlist used to check the model didn't invent figures.

Design rule: **the model does no arithmetic.** Every delta, ratio, streak and
direction is computed here. That is both the hallucination defence and the reason
the summary can say something specific instead of hedging.

Pure functions, no I/O — this is the only part of the feature that is testable
without an FMP key or an Anthropic key, and it is where the bugs live.

Unit convention: everything leaving this module is in percentage points. The
source payload mixes conventions — `*_margin_pct` is already x100 (71.3) while
`ratios.roe` / `roa` / `dividend_yield` are decimals (0.05). Normalisation
happens once, at `_facts()`, and nowhere else.
"""
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Sequence
import re

# ── Notability thresholds (§5.6 of the brief) ─────────────────────────────
# Start strict. A card that only appears when it has something to say builds
# more trust than one that always appears and is sometimes filler.
MARGIN_MOVE_PP = 1.0          # any TTM margin moved at least this many pp
REVENUE_FLAT_BAND_PCT = 2.0   # TTM revenue growth outside +/- this is notable
DEBT_MOVE_PCT = 5.0           # total or net debt moved at least this much
DILUTION_MOVE_PCT = 2.0       # diluted shares moved at least this much in 4Q
CURRENT_RATIO_FLOOR = 1.0
INTEREST_COVERAGE_FLOOR = 3.0
MARGIN_STREAK_QUARTERS = 3

# Below this, there is no TTM at all and the caller suppresses instead.
MIN_QUARTERS = 4
# Below this, prior-TTM comparisons would be built on a partial window.
FULL_HISTORY_QUARTERS = 8



@dataclass
class FactBlock:
    text: str
    numeral_allowlist: set = field(default_factory=set)
    notable: bool = False
    mode: str = "full"                       # "full" | "limited"
    reasons: List[str] = field(default_factory=list)


# ─────────────────────────────────────────────────────────────────────────
# numeric helpers — every one returns None rather than raising or guessing
# ─────────────────────────────────────────────────────────────────────────

def _num(v: Any) -> Optional[float]:
    """Coerce to float, or None. Rejects bools and non-finite values."""
    if v is None or isinstance(v, bool):
        return None
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    if f != f or f in (float("inf"), float("-inf")):  # NaN / inf
        return None
    return f


def _win_sum(quarters: Sequence[dict], start: int, count: int, fld: str) -> Optional[float]:
    """Sum `fld` over a strict window of `count` quarters starting at `start`.

    Strict on purpose: a partial window understates a TTM figure and would make
    every comparison built on it wrong in the flattering direction. Same stance
    `_trailing_pe_by_quarter` already takes on TTM EPS.
    """
    if len(quarters) < start + count:
        return None
    vals = [_num(quarters[i].get(fld)) for i in range(start, start + count)]
    if any(v is None for v in vals):
        return None
    return sum(vals)


def _at(quarters: Sequence[dict], idx: int, fld: str) -> Optional[float]:
    if idx >= len(quarters):
        return None
    return _num(quarters[idx].get(fld))


def _pct_change(new: Optional[float], old: Optional[float]) -> Optional[float]:
    """Percent change. None when the base is <= 0 — a percentage off a negative
    or zero base reads as a real number but means nothing."""
    if new is None or old is None or old <= 0:
        return None
    return (new - old) / old * 100.0


def _safe_ratio(num: Optional[float], den: Optional[float]) -> Optional[float]:
    """Ratio, guarded. None when the denominator is <= 0.

    This is the sign-flip guard: -5bn / -2bn = 2.5x looks like healthy coverage
    and is the easiest way to ship a summary that is confidently wrong.
    """
    if num is None or den is None or den <= 0:
        return None
    return num / den


def _pp(new: Optional[float], old: Optional[float]) -> Optional[float]:
    """Change in percentage points."""
    if new is None or old is None:
        return None
    return new - old


def _margin(numerator: Optional[float], revenue: Optional[float]) -> Optional[float]:
    """Margin as percentage points. None when revenue is <= 0."""
    if numerator is None or revenue is None or revenue <= 0:
        return None
    return numerator / revenue * 100.0


def _streak(values: Sequence[Optional[float]]) -> tuple[int, Optional[str]]:
    """Consecutive same-direction moves at the newest end of a newest-first series.

    Returns (count_of_quarters_moved, "higher"|"lower"|None). A count of 3 means
    three consecutive quarter-over-quarter moves in one direction.
    """
    vals = [v for v in values if v is not None]
    if len(vals) < 2:
        return 0, None
    direction = None
    count = 0
    for i in range(len(vals) - 1):
        delta = vals[i] - vals[i + 1]        # newer minus older
        if delta == 0:
            break
        step = "higher" if delta > 0 else "lower"
        if direction is None:
            direction = step
        elif step != direction:
            break
        count += 1
    return count, direction


def _declining_streak(values: Sequence[Optional[float]]) -> int:
    """Consecutive quarters of sequential decline at the newest end (newest-first)."""
    vals = [v for v in values if v is not None]
    count = 0
    for i in range(len(vals) - 1):
        if vals[i] < vals[i + 1]:
            count += 1
        else:
            break
    return count


def _trajectory(series_oldest_first: Sequence[Optional[float]]) -> Optional[str]:
    """Classify the last four YoY growth readings.

    Deliberately coarse — comparing endpoints with a spread check, not testing
    monotonicity, which is too brittle on quarterly data to be worth reporting.
    """
    vals = [v for v in series_oldest_first if v is not None][-4:]
    if len(vals) < 3:
        return None
    spread = max(vals) - min(vals)
    delta = vals[-1] - vals[0]
    if spread > 15.0 and abs(delta) <= 5.0:
        return "erratic"
    if delta > 2.0:
        return "accelerating"
    if delta < -2.0:
        return "decelerating"
    return "stable"


# ─────────────────────────────────────────────────────────────────────────
# formatting — one place where a number becomes text, so the allowlist
# cannot drift away from what was actually rendered
# ─────────────────────────────────────────────────────────────────────────

class _Render:
    """Formats values and records every magnitude it emitted."""

    def __init__(self) -> None:
        self.allow: set = set()

    def _reg(self, *values: float) -> None:
        for v in values:
            self.allow.add(round(abs(v), 6))

    def money(self, v: Optional[float]) -> str:
        if v is None:
            return "unavailable"
        a = abs(v)
        if a >= 1e12:
            mant, suf = v / 1e12, "T"
        elif a >= 1e9:
            mant, suf = v / 1e9, "B"
        elif a >= 1e6:
            mant, suf = v / 1e6, "M"
        elif a >= 1e3:
            mant, suf = v / 1e3, "K"
        else:
            mant, suf = v, ""
        # Register the true magnitude ("$63.7 billion") and the bare mantissa
        # ("63.70B" -> 63.70), since either can appear in the summary text.
        self._reg(v, mant)
        return f"{mant:,.2f}{suf}"

    def pct(self, v: Optional[float], signed: bool = True) -> str:
        if v is None:
            return "unavailable"
        self._reg(v)
        return f"{v:+.1f}%" if signed else f"{v:.1f}%"

    def pp(self, v: Optional[float]) -> str:
        if v is None:
            return "unavailable"
        self._reg(v)
        return f"{v:+.1f} pp"

    def mult(self, v: Optional[float]) -> str:
        if v is None:
            return "unavailable"
        self._reg(v)
        return f"{v:.2f}x"

    def num(self, v: Optional[float], decimals: int = 2) -> str:
        if v is None:
            return "unavailable"
        self._reg(v)
        return f"{v:.{decimals}f}"

    def count(self, v: Optional[int]) -> str:
        if v is None:
            return "unavailable"
        return str(int(v))          # small integers are not allowlisted; §4.2 ignores 0-12


class _Block:
    """Accumulates the rendered text."""

    LABEL_WIDTH = 33

    def __init__(self) -> None:
        self._lines: List[str] = []

    def header(self, text: str) -> None:
        self._lines.append(text)

    def blank(self) -> None:
        if self._lines and self._lines[-1] != "":
            self._lines.append("")

    def section(self, name: str) -> None:
        self.blank()
        self._lines.append(name)

    def row(self, label: str, value: str, note: str = "") -> None:
        line = f"  {label.ljust(self.LABEL_WIDTH)}{value}"
        if note:
            line = f"{line}   {note}"
        self._lines.append(line.rstrip())

    def text(self) -> str:
        return "\n".join(self._lines).strip() + "\n"


# ─────────────────────────────────────────────────────────────────────────
# fact computation
# ─────────────────────────────────────────────────────────────────────────

def _facts(financials: Dict[str, Any]) -> Dict[str, Any]:
    """Compute every derived fact. Values are floats or None; percentages are
    always in percentage points."""
    raw = financials.get("_raw") or {}
    inc: List[dict] = [q for q in (raw.get("income_quarters") or []) if isinstance(q, dict)]
    bal: List[dict] = [q for q in (raw.get("balance_quarters") or []) if isinstance(q, dict)]
    cf: List[dict] = [q for q in (raw.get("cashflow_quarters") or []) if isinstance(q, dict)]

    income = financials.get("income_statement") or {}
    balance = financials.get("balance_sheet") or {}
    cash_flow = financials.get("cash_flow") or {}
    ratios = financials.get("ratios") or {}
    growth = financials.get("growth_profile") or {}
    trend: List[dict] = financials.get("quarterly_trend") or []

    n_inc = len(inc)
    full = n_inc >= FULL_HISTORY_QUARTERS

    f: Dict[str, Any] = {}
    f["mode"] = "full" if full else "limited"
    f["quarters_income"] = n_inc
    f["quarters_balance"] = len(bal)
    f["quarters_cashflow"] = len(cf)
    f["period_end"] = growth.get("newest_period_end") or income.get("period_end")

    # ── scale ────────────────────────────────────────────────────────────
    revenue_ttm = _num(income.get("revenue"))
    f["revenue_ttm"] = revenue_ttm
    f["market_cap"] = _num(ratios.get("market_cap"))
    cash = _num(balance.get("cash_and_equivalents"))
    sti = _num(balance.get("short_term_investments"))
    f["liquid_assets"] = None if cash is None else cash + (sti or 0.0)
    f["total_debt"] = _num(balance.get("total_debt"))

    # ── growth ───────────────────────────────────────────────────────────
    rev_ttm_win = _win_sum(inc, 0, 4, "revenue")
    rev_prior_win = _win_sum(inc, 4, 4, "revenue") if full else None
    f["revenue_growth_ttm"] = _pct_change(rev_ttm_win, rev_prior_win)

    growth_series = [_num(p.get("value")) for p in (growth.get("revenue_growth_trend") or [])]
    latest_yoy = next((v for v in reversed(growth_series) if v is not None), None)
    f["revenue_yoy_latest"] = latest_yoy
    f["revenue_trajectory"] = _trajectory(growth_series) if full else None
    f["revenue_declining_streak"] = _declining_streak(
        [_num(q.get("revenue")) for q in inc]
    )

    # ── margins ──────────────────────────────────────────────────────────
    margin_specs = (
        ("gross", "grossProfit", "gross_margin_pct"),
        ("operating", "operatingIncome", "operating_margin_pct"),
        ("net", "netIncome", None),
    )
    for name, fmp_field, trend_key in margin_specs:
        ttm = _margin(_win_sum(inc, 0, 4, fmp_field), rev_ttm_win)
        prior = _margin(_win_sum(inc, 4, 4, fmp_field), rev_prior_win) if full else None
        f[f"{name}_margin"] = ttm
        f[f"{name}_margin_prior"] = prior
        f[f"{name}_margin_change_pp"] = _pp(ttm, prior)

        if trend_key:
            series = [_num(q.get(trend_key)) for q in trend]          # newest-first
        else:
            series = [_margin(_num(q.get("netIncome")), _num(q.get("revenue"))) for q in inc]
        streak, direction = _streak(series)
        f[f"{name}_margin_streak"] = streak
        f[f"{name}_margin_streak_dir"] = direction
        present = [v for v in series if v is not None]
        f[f"{name}_margin_min"] = min(present) if present else None
        f[f"{name}_margin_max"] = max(present) if present else None

    # ── earnings quality ─────────────────────────────────────────────────
    net_income_ttm = _num(income.get("net_income"))
    op_cf_ttm = _num(cash_flow.get("operating_cash_flow"))
    fcf_ttm = _num(cash_flow.get("free_cash_flow"))
    f["net_income_ttm"] = net_income_ttm
    f["operating_cf_ttm"] = op_cf_ttm
    f["fcf_ttm"] = fcf_ttm
    f["fcf_conversion"] = _safe_ratio(fcf_ttm, net_income_ttm)
    prior_ni = _win_sum(inc, 4, 4, "netIncome") if full else None
    prior_fcf = _win_sum(cf, 4, 4, "freeCashFlow") if len(cf) >= 8 else None
    f["fcf_conversion_prior"] = _safe_ratio(prior_fcf, prior_ni)
    # Positive == operating cash flow exceeds reported earnings == higher quality.
    # Stated in this direction on purpose: the reverse subtraction renders a
    # healthy company as a negative number and reads as a red flag.
    f["accrual_gap"] = (
        None if net_income_ttm is None or op_cf_ttm is None
        else op_cf_ttm - net_income_ttm
    )

    ni_series = [_num(q.get("netIncome")) for q in inc[:8]]
    f["loss_quarters"] = sum(1 for v in ni_series if v is not None and v < 0)
    f["loss_quarters_window"] = len([v for v in ni_series if v is not None])

    f["loss_trajectory"] = None
    last4 = [_num(q.get("netIncome")) for q in inc[:4]]
    if net_income_ttm is not None and net_income_ttm < 0 and all(v is not None for v in last4):
        if all(v < 0 for v in last4):
            newest, oldest = abs(last4[0]), abs(last4[3])
            if oldest > 0:
                if newest > oldest * 1.05:
                    f["loss_trajectory"] = "widening"
                elif newest < oldest * 0.95:
                    f["loss_trajectory"] = "narrowing"
                else:
                    f["loss_trajectory"] = "stable"
        else:
            f["loss_trajectory"] = "mixed"

    # ── leverage & liquidity ─────────────────────────────────────────────
    debt_now = _at(bal, 0, "totalDebt")
    debt_prior = _at(bal, 4, "totalDebt")
    f["debt_change_pct"] = _pct_change(debt_now, debt_prior)

    net_debt_now = _at(bal, 0, "netDebt")
    net_debt_prior = _at(bal, 4, "netDebt")
    f["net_debt_change_abs"] = (
        None if net_debt_now is None or net_debt_prior is None
        else net_debt_now - net_debt_prior
    )
    f["net_debt_change_pct"] = _pct_change(net_debt_now, net_debt_prior)

    ebitda_ttm = _win_sum(inc, 0, 4, "ebitda")
    ebitda_prior = _win_sum(inc, 4, 4, "ebitda") if full else None
    f["debt_to_ebitda"] = _safe_ratio(debt_now, ebitda_ttm)
    f["debt_to_ebitda_prior"] = _safe_ratio(debt_prior, ebitda_prior)

    # Interest coverage = EBIT / interest expense, and FMP's `operatingIncome` is
    # NOT EBIT: it is revenue - costAndExpenses, which folds in non-operating
    # items. The `ebit` field is the real thing, provably so — for PFE FY2025 it
    # satisfies the defining identity while operatingIncome does not:
    #
    #     ebit - interestExpense =  10.191 - 2.671 =  7.520 = incomeBeforeTax  OK
    #     opIncome - interest    =  15.437 - 2.671 = 12.766 != 7.520           NO
    #     ebitda - D&A           =  15.096 - 4.905 = 10.191 = ebit             OK
    #
    # The identity holds per-quarter too (Q2 FY2026: 0.014 - 0.668 = -0.654 =
    # pretax), so summing `ebit` over a strict 4-quarter window is sound.
    #
    # Do NOT substitute FMP's own `interestCoverageRatio` from /stable/ratios: it
    # is operatingIncome-based. For PFE Q2 FY2026 it reports 7.06x where true
    # coverage was 0.02x — EBIT that quarter was 14M against 668M of interest.
    # A 335x overstatement, in the flattering direction, on a leverage metric.
    #
    # Operating *margin* above deliberately stays on `operatingIncome`, because
    # that is what the Financial Summary panel renders and the AI read must not
    # contradict the card beneath it.
    ebit_ttm = _win_sum(inc, 0, 4, "ebit")
    if ebit_ttm is None:
        ebit_ttm = _num(income.get("operating_income"))
    int_exp_ttm = _win_sum(inc, 0, 4, "interestExpense")
    f["interest_coverage"] = _safe_ratio(
        ebit_ttm, None if int_exp_ttm is None else abs(int_exp_ttm)
    )

    f["current_ratio"] = _num(ratios.get("current_ratio"))
    f["quick_ratio"] = _num(ratios.get("quick_ratio"))

    def _working_capital(idx: int) -> Optional[float]:
        ca = _at(bal, idx, "totalCurrentAssets")
        cl = _at(bal, idx, "totalCurrentLiabilities")
        return None if ca is None or cl is None else ca - cl

    wc_now, wc_prior = _working_capital(0), _working_capital(4)
    f["working_capital"] = wc_now
    f["working_capital_change_abs"] = (
        None if wc_now is None or wc_prior is None else wc_now - wc_prior
    )

    eq_now = _at(bal, 0, "totalStockholdersEquity")
    eq_prior = _at(bal, 4, "totalStockholdersEquity")
    f["equity_change_abs"] = (
        None if eq_now is None or eq_prior is None else eq_now - eq_prior
    )

    # Cash runway only means something while the company is burning cash.
    f["cash_runway_quarters"] = None
    if fcf_ttm is not None and fcf_ttm < 0 and f["liquid_assets"] is not None:
        f["cash_runway_quarters"] = f["liquid_assets"] / (abs(fcf_ttm) / 4.0)

    # ── dilution ─────────────────────────────────────────────────────────
    sh_now = _at(inc, 0, "weightedAverageShsOutDil")
    f["shares_change_4q_pct"] = _pct_change(sh_now, _at(inc, 4, "weightedAverageShsOutDil"))
    f["shares_change_8q_pct"] = _pct_change(sh_now, _at(inc, 8, "weightedAverageShsOutDil"))

    # ── capital return ───────────────────────────────────────────────────
    dividends_ttm = _num(cash_flow.get("dividends"))
    f["dividend_coverage"] = (
        _safe_ratio(abs(dividends_ttm), fcf_ttm) if dividends_ttm else None
    )
    capex_ttm = _num(cash_flow.get("capex"))
    f["capex_intensity"] = (
        _safe_ratio(abs(capex_ttm), revenue_ttm) * 100.0
        if capex_ttm is not None and _safe_ratio(abs(capex_ttm), revenue_ttm) is not None
        else None
    )
    capex_prior = _win_sum(cf, 4, 4, "capitalExpenditure") if len(cf) >= 8 else None
    prior_intensity = _safe_ratio(abs(capex_prior), rev_prior_win) if capex_prior is not None else None
    f["capex_intensity_prior"] = prior_intensity * 100.0 if prior_intensity is not None else None

    # ── returns (decimal -> percentage points; see module docstring) ──────
    roe = _num(ratios.get("roe"))
    roa = _num(ratios.get("roa"))
    f["roe_pct"] = None if roe is None else roe * 100.0
    f["roa_pct"] = None if roa is None else roa * 100.0

    # ── composite ────────────────────────────────────────────────────────
    f["rule_of_40"] = _num(growth.get("rule_of_40"))
    f["rule_of_40_direction"] = growth.get("rule_of_40_trend_direction")

    return f


# ─────────────────────────────────────────────────────────────────────────
# notability
# ─────────────────────────────────────────────────────────────────────────

def _notability(f: Dict[str, Any]) -> List[str]:
    """Which thresholds fired. Empty list => suppress without calling Claude."""
    hits: List[str] = []

    for name in ("gross", "operating", "net"):
        chg = f.get(f"{name}_margin_change_pp")
        if chg is not None and abs(chg) >= MARGIN_MOVE_PP:
            hits.append(f"{name}_margin_moved_{chg:+.1f}pp")
        streak = f.get(f"{name}_margin_streak") or 0
        if streak >= MARGIN_STREAK_QUARTERS:
            hits.append(f"{name}_margin_streak_{streak}q_{f.get(f'{name}_margin_streak_dir')}")

    growth_ttm = f.get("revenue_growth_ttm")
    if growth_ttm is not None and abs(growth_ttm) > REVENUE_FLAT_BAND_PCT:
        hits.append(f"revenue_growth_{growth_ttm:+.1f}pct")

    for key, label in (("debt_change_pct", "total_debt"), ("net_debt_change_pct", "net_debt")):
        v = f.get(key)
        if v is not None and abs(v) >= DEBT_MOVE_PCT:
            hits.append(f"{label}_moved_{v:+.1f}pct")

    dilution = f.get("shares_change_4q_pct")
    if dilution is not None and abs(dilution) >= DILUTION_MOVE_PCT:
        hits.append(f"share_count_moved_{dilution:+.1f}pct")

    conv, conv_prior = f.get("fcf_conversion"), f.get("fcf_conversion_prior")
    if conv is not None and conv_prior is not None and (conv - 1.0) * (conv_prior - 1.0) < 0:
        hits.append("fcf_conversion_crossed_1x")

    if (f.get("loss_quarters") or 0) > 0:
        hits.append(f"loss_making_quarters_{f['loss_quarters']}")

    cr = f.get("current_ratio")
    if cr is not None and cr < CURRENT_RATIO_FLOOR:
        hits.append(f"current_ratio_{cr:.2f}")

    ic = f.get("interest_coverage")
    if ic is not None and ic < INTEREST_COVERAGE_FLOOR:
        hits.append(f"interest_coverage_{ic:.2f}x")

    return hits


# ─────────────────────────────────────────────────────────────────────────
# rendering
# ─────────────────────────────────────────────────────────────────────────

def _render(ticker: str, company_name: str, f: Dict[str, Any]) -> tuple[str, set]:
    r = _Render()
    b = _Block()
    limited = f["mode"] == "limited"

    b.header(f"FINANCIAL FACT BLOCK — {ticker} ({company_name})")
    b.header(
        f"Fiscal data through {f.get('period_end') or 'unknown'}. "
        f"{f['quarters_income']} quarters income statement, "
        f"{f['quarters_cashflow']} quarters cash flow, "
        f"{f['quarters_balance']} quarters balance sheet available."
    )
    b.header("All percentages are percentage points.")
    if limited:
        b.header(
            f"Limited history: {f['quarters_income']} quarters. Trend comparisons "
            "across years are unavailable."
        )

    b.section("SCALE")
    b.row("TTM revenue", r.money(f["revenue_ttm"]))
    b.row("Market cap", r.money(f["market_cap"]))
    b.row("Cash + short-term investments", r.money(f["liquid_assets"]))
    b.row("Total debt", r.money(f["total_debt"]))

    b.section("GROWTH")
    if not limited:
        b.row("TTM revenue vs prior TTM", r.pct(f["revenue_growth_ttm"]))
    b.row("Latest quarter YoY", r.pct(f["revenue_yoy_latest"]))
    if not limited:
        b.row("Trajectory (last 4 quarters)", f.get("revenue_trajectory") or "unavailable")
    b.row("Consecutive declining quarters", r.count(f["revenue_declining_streak"]))

    b.section("MARGINS (change in percentage points, TTM vs prior TTM)")
    for name, label in (("gross", "Gross margin"), ("operating", "Operating margin"), ("net", "Net margin")):
        notes = []
        if not limited:
            notes.append(f"({r.pp(f[f'{name}_margin_change_pp'])})")
        streak = f.get(f"{name}_margin_streak") or 0
        direction = f.get(f"{name}_margin_streak_dir")
        if streak >= 2 and direction:
            notes.append(f"{streak} quarters {direction}")
        lo, hi = f.get(f"{name}_margin_min"), f.get(f"{name}_margin_max")
        if lo is not None and hi is not None and hi - lo > 0.5:
            notes.append(f"range {r.pct(lo, signed=False)} – {r.pct(hi, signed=False)}")
        b.row(label, r.pct(f[f"{name}_margin"], signed=False), "   ".join(notes))
    b.row("Return on equity", r.pct(f["roe_pct"], signed=False))
    b.row("Return on assets", r.pct(f["roa_pct"], signed=False))

    b.section("EARNINGS QUALITY")
    b.row("Net income TTM", r.money(f["net_income_ttm"]))
    b.row("Operating cash flow TTM", r.money(f["operating_cf_ttm"]))
    b.row("Free cash flow TTM", r.money(f["fcf_ttm"]))
    conv_note = ""
    if f["fcf_conversion_prior"] is not None:
        conv_note = f"(prior TTM {r.mult(f['fcf_conversion_prior'])})"
    b.row("FCF / net income", r.mult(f["fcf_conversion"]), conv_note)
    b.row("Operating CF minus net income", r.money(f["accrual_gap"]))
    b.row(
        f"Loss-making quarters (last {f['loss_quarters_window']})",
        r.count(f["loss_quarters"]),
    )
    if f.get("loss_trajectory"):
        b.row("Loss trajectory", f["loss_trajectory"])

    b.section("LEVERAGE & LIQUIDITY")
    b.row("Total debt vs 4Q ago", r.pct(f["debt_change_pct"]))
    b.row("Net debt vs 4Q ago", r.money(f["net_debt_change_abs"]))
    ebitda_note = ""
    if f["debt_to_ebitda_prior"] is not None:
        ebitda_note = f"(4Q ago {r.mult(f['debt_to_ebitda_prior'])})"
    b.row("Debt / EBITDA", r.mult(f["debt_to_ebitda"]), ebitda_note)
    b.row("Interest coverage", r.mult(f["interest_coverage"]))
    b.row("Current ratio", r.num(f["current_ratio"]))
    b.row("Quick ratio", r.num(f["quick_ratio"]))
    b.row("Working capital", r.money(f["working_capital"]))
    b.row("Working capital vs 4Q ago", r.money(f["working_capital_change_abs"]))
    b.row("Equity vs 4Q ago", r.money(f["equity_change_abs"]))
    if f.get("cash_runway_quarters") is not None:
        b.row("Cash runway at current burn", f"{r.num(f['cash_runway_quarters'], 1)} quarters")

    b.section("DILUTION")
    b.row("Diluted shares vs 4Q ago", r.pct(f["shares_change_4q_pct"]))
    b.row("Diluted shares vs 8Q ago", r.pct(f["shares_change_8q_pct"]))

    b.section("CAPITAL RETURN")
    b.row("Dividends / FCF coverage", r.mult(f["dividend_coverage"]))
    capex_note = ""
    if f["capex_intensity_prior"] is not None:
        capex_note = f"(prior TTM {r.pct(f['capex_intensity_prior'], signed=False)})"
    b.row("Capex / revenue", r.pct(f["capex_intensity"], signed=False), capex_note)

    if f.get("rule_of_40") is not None:
        b.section("COMPOSITE")
        b.row(
            "Rule of 40",
            r.num(f["rule_of_40"], 1),
            f"(direction: {f.get('rule_of_40_direction') or 'unknown'})",
        )

    return b.text(), r.allow


# ─────────────────────────────────────────────────────────────────────────
# public API
# ─────────────────────────────────────────────────────────────────────────

def build_fact_block(financials: Dict[str, Any]) -> FactBlock:
    """Build the prompt fact block from a `get_company_financials(include_raw=True)`
    payload. Caller is responsible for the §5 suppression checks that come first."""
    ticker = financials.get("ticker") or "?"
    company_name = financials.get("company_name") or ticker

    f = _facts(financials)
    reasons = _notability(f)
    text, allow = _render(ticker, company_name, f)

    return FactBlock(
        text=text,
        numeral_allowlist=allow,
        notable=bool(reasons),
        mode=f["mode"],
        reasons=reasons,
    )


# ── numeral validation (§4.2 — log-only in v1) ───────────────────────────

_SUFFIX_SCALE = {
    "": 1.0, "%": 1.0, "x": 1.0,
    "k": 1e3, "thousand": 1e3,
    "m": 1e6, "million": 1e6,
    "b": 1e9, "billion": 1e9,
    "t": 1e12, "trillion": 1e12,
}

_NUMERAL_RE = re.compile(
    r"(?<![\w.])"
    r"([+-]?\d{1,3}(?:,\d{3})+(?:\.\d+)?|[+-]?\d+(?:\.\d+)?)"
    r"\s*"
    r"(%|x\b|trillion|billion|million|thousand|[KMBT]\b)?",
    re.IGNORECASE,
)

# Small integers are ordinary prose ("three consecutive quarters"), not claims.
_IGNORE_BELOW = 13


def find_unsupported_numerals(summary: str, allowlist: set) -> List[str]:
    """Numerals in `summary` that cannot be traced to the fact block.

    Log-only in v1. A blocking version would reject "$63.7 billion" against a
    rendered "63.70B", or "two and a half times" against "2.54x" — the false
    positive rate has to be measured on real output before this gates anything.
    """
    if not summary:
        return []

    misses: List[str] = []
    for match in _NUMERAL_RE.finditer(summary):
        raw, suffix = match.group(1), (match.group(2) or "")
        digits = raw.replace(",", "")
        try:
            mantissa = float(digits)
        except ValueError:
            continue
        scale = _SUFFIX_SCALE.get(suffix.strip().lower(), 1.0)
        value = abs(mantissa) * scale
        places = len(digits.partition(".")[2])

        if abs(mantissa) < _IGNORE_BELOW and scale == 1.0 and float(mantissa).is_integer():
            continue

        # Two chances: against the true magnitude ("63.28B" -> 6.328e10) and against
        # the bare mantissa, which is how a rounded long-form figure ("$63.3 billion")
        # traces back to a rendered "63.28B".
        if not _traceable(value, allowlist, places) and not _traceable(
            abs(mantissa), allowlist, places
        ):
            misses.append(match.group(0).strip())

    return misses


def _traceable(value: float, allowlist: set, places: int) -> bool:
    """Is `value` a faithful rendering of something in the allowlist?

    The tolerance is deliberately *directional*: a summary figure may be a rounded
    form of a block figure (71% for 71.3%), so we round the allowed value to the
    precision the summary actually used and require equality. A symmetric
    tolerance would let 4.7% match a block value of 5.0% at zero decimal places,
    which is exactly the invented-number case this is meant to catch.
    """
    for allowed in allowlist:
        if abs(value - allowed) < 1e-6:
            return True
        if abs(round(allowed, places) - value) < 1e-6:
            return True
    return False
