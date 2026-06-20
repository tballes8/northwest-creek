"""
Company Financials Service — Financial Modeling Prep (FMP) integration
Fetches income statements, balance sheets, cash flow statements, ratios,
and key metrics in parallel via httpx.  Returns a unified payload for
frontend consumption and derived DCF-ready suggestions.

FMP Stable endpoints used:
  /stable/income-statement?symbol=X&period=quarter
  /stable/balance-sheet-statement?symbol=X&period=quarter
  /stable/cash-flow-statement?symbol=X&period=quarter
  /stable/ratios-ttm?symbol=X          (pre-computed trailing-twelve-month ratios)
  /stable/key-metrics-ttm?symbol=X     (pre-computed trailing-twelve-month metrics)
"""
import asyncio
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, Optional, List
from app.services.fmp_client import get_fmp_client, API_KEY


def _fmt(value: Optional[float], decimals: int = 2) -> Optional[float]:
    """Round a value if present, else return None."""
    if value is None:
        return None
    try:
        return round(float(value), decimals)
    except (TypeError, ValueError):
        return None


def _pct(numerator: Optional[float], denominator: Optional[float]) -> Optional[float]:
    """Safe percentage: (num / denom) * 100, or None."""
    if numerator is None or denominator is None or denominator == 0:
        return None
    try:
        return round((float(numerator) / float(denominator)) * 100, 2)
    except (TypeError, ValueError, ZeroDivisionError):
        return None


def _sum_quarters(quarters: List[dict], field: str) -> Optional[float]:
    """Sum a field across up to 4 quarters for TTM computation. Returns None if no values."""
    vals = [q.get(field) for q in quarters[:4] if q.get(field) is not None]
    if not vals:
        return None
    return sum(vals)


def compute_peer_fundamentals(income_quarters: List[dict]) -> Dict[str, Optional[float]]:
    """Decision-support context for a peer: TTM YoY revenue growth and gross margin.

    Uses the SAME date-based YoY matching and TTM gross-margin computation as
    `_derive_dcf_suggestions` / the income-statement summary, so the values shown
    in the Relative Valuation peer table match the Financials page for the same
    ticker. Returns a dict with both values (either may be None).
    """
    if not isinstance(income_quarters, list):
        income_quarters = []

    # ── TTM gross margin (4 most-recent quarters) ─────────────────────────
    ttm = income_quarters[:4]
    gross_margin_pct = _pct(_sum_quarters(ttm, "grossProfit"), _sum_quarters(ttm, "revenue"))

    # ── YoY revenue growth — date-based matching (tolerant to quarter gaps) ─
    revenue_growth_yoy = None
    dated = [q for q in income_quarters if q.get("date") and q.get("revenue")]
    if len(dated) >= 2:
        dated_sorted = sorted(dated, key=lambda q: q["date"], reverse=True)
        recent = dated_sorted[0]
        recent_rev = recent.get("revenue")
        try:
            recent_date = datetime.strptime(recent["date"], "%Y-%m-%d")
            target_date = recent_date - timedelta(days=365)
            tolerance = timedelta(days=46)
            yoy_quarter = next(
                (q for q in dated_sorted[1:]
                 if abs(datetime.strptime(q["date"], "%Y-%m-%d") - target_date) <= tolerance),
                None,
            )
            if yoy_quarter:
                yoy_rev = yoy_quarter.get("revenue")
                if recent_rev and yoy_rev and yoy_rev > 0:
                    revenue_growth_yoy = round(((recent_rev - yoy_rev) / yoy_rev) * 100, 2)
        except (ValueError, TypeError):
            pass

    return {
        "revenue_growth_yoy_pct": revenue_growth_yoy,
        "gross_margin_pct": gross_margin_pct,
    }


async def _fetch(path: str, params: dict) -> Any:
    """Fetch a single FMP endpoint, return parsed JSON or empty list on failure."""
    full_params = {"apikey": API_KEY, **params}
    try:
        client = get_fmp_client()
        response = await client.get(path, params=full_params)
        response.raise_for_status()
        return response.json()
    except Exception as e:
        print(f"⚠️ Financials fetch failed for {path}: {e}")
        return []


async def get_company_financials(ticker: str) -> Dict[str, Any]:
    """
    Fetch all financials endpoints in parallel and return unified payload.

    Returns dict with keys:
      ticker, company_name, income_statement, balance_sheet, cash_flow,
      ratios, quarterly_trend, dcf_suggestions, growth_profile
    """
    ticker = ticker.upper()

    # Fire all requests in parallel
    income_quarterly_task = _fetch("income-statement", {
        "symbol": ticker, "period": "quarter", "limit": 12,
    })
    balance_task = _fetch("balance-sheet-statement", {
        "symbol": ticker, "period": "quarter", "limit": 1,
    })
    cashflow_quarterly_task = _fetch("cash-flow-statement", {
        "symbol": ticker, "period": "quarter", "limit": 8,
    })
    ratios_task = _fetch("ratios-ttm", {
        "symbol": ticker,
    })
    key_metrics_task = _fetch("key-metrics-ttm", {
        "symbol": ticker,
    })
    # Profile lookup — get the current entity's CIK for staleness detection
    profile_task = _fetch("profile", {
        "symbol": ticker,
    })

    (
        income_quarters,
        balance_list,
        cashflow_quarters,
        ratios_list,
        key_metrics_list,
        profile_list,
    ) = await asyncio.gather(
        income_quarterly_task,
        balance_task,
        cashflow_quarterly_task,
        ratios_task,
        key_metrics_task,
        profile_task,
    )

    # ── Normalise to lists (FMP returns arrays directly) ──────────────
    if not isinstance(income_quarters, list):
        income_quarters = []
    if not isinstance(balance_list, list):
        balance_list = []
    if not isinstance(cashflow_quarters, list):
        cashflow_quarters = []
    if not isinstance(ratios_list, list):
        ratios_list = []
    if not isinstance(key_metrics_list, list):
        key_metrics_list = []
    if not isinstance(profile_list, list):
        profile_list = []

    # Extract current CIK from profile for staleness detection
    profile = profile_list[0] if profile_list else {}
    current_cik = profile.get("cik")

    # Debug: log what came back from FMP
    print(f"📊 Financials for {ticker}: income={len(income_quarters)}Q, balance={len(balance_list)}, cashflow={len(cashflow_quarters)}Q, ratios={len(ratios_list)}, metrics={len(key_metrics_list)}, profile={len(profile_list)}")

    # FMP returns newest-first by default — that's what we want
    balance = balance_list[0] if balance_list else {}
    ratios = ratios_list[0] if ratios_list else {}
    key_metrics = key_metrics_list[0] if key_metrics_list else {}
    latest_q = income_quarters[0] if income_quarters else {}

    # ── Compute TTM from 4 most recent quarters ──────────────────────
    ttm_inc = income_quarters[:4]   # newest-first, up to 4
    ttm_cf = cashflow_quarters[:4]

    revenue_ttm = _sum_quarters(ttm_inc, "revenue")
    gross_profit_ttm = _sum_quarters(ttm_inc, "grossProfit")
    operating_income_ttm = _sum_quarters(ttm_inc, "operatingIncome")
    net_income_ttm = _sum_quarters(ttm_inc, "netIncome")
    ebitda_ttm = _sum_quarters(ttm_inc, "ebitda")
    eps_diluted_ttm = _sum_quarters(ttm_inc, "epsDiluted")
    rd_ttm = _sum_quarters(ttm_inc, "researchAndDevelopmentExpenses")
    sga_ttm = _sum_quarters(ttm_inc, "sellingGeneralAndAdministrativeExpenses")
    cost_of_revenue_ttm = _sum_quarters(ttm_inc, "costOfRevenue")

    operating_cf_ttm = _sum_quarters(ttm_cf, "operatingCashFlow")
    capex_ttm = _sum_quarters(ttm_cf, "capitalExpenditure")
    fcf_ttm = _sum_quarters(ttm_cf, "freeCashFlow")
    # Fallback: compute FCF if FMP didn't provide it directly
    if fcf_ttm is None and operating_cf_ttm is not None and capex_ttm is not None:
        fcf_ttm = operating_cf_ttm + capex_ttm  # capex is negative

    # ── Income Statement summary (TTM) ────────────────────────────────
    income_statement = {
        "period": "TTM",
        "period_end": latest_q.get("date"),
        "revenue": revenue_ttm,
        "cost_of_revenue": cost_of_revenue_ttm,
        "gross_profit": gross_profit_ttm,
        "gross_margin_pct": _pct(gross_profit_ttm, revenue_ttm),
        "operating_income": operating_income_ttm,
        "operating_margin_pct": _pct(operating_income_ttm, revenue_ttm),
        "net_income": net_income_ttm,
        "net_margin_pct": _pct(net_income_ttm, revenue_ttm),
        "ebitda": ebitda_ttm,
        "diluted_eps": _fmt(eps_diluted_ttm),
        "diluted_shares_outstanding": latest_q.get("weightedAverageShsOutDil"),
        "research_development": rd_ttm,
        "selling_general_administrative": sga_ttm,
    }

    # ── Balance Sheet summary (latest quarter) ────────────────────────
    balance_sheet = {
        "period_end": balance.get("date"),
        "fiscal_year": balance.get("fiscalYear") or balance.get("calendarYear"),
        "fiscal_quarter": balance.get("period"),
        "cash_and_equivalents": balance.get("cashAndCashEquivalents"),
        "short_term_investments": balance.get("shortTermInvestments"),
        "total_current_assets": balance.get("totalCurrentAssets"),
        "total_assets": balance.get("totalAssets"),
        "total_current_liabilities": balance.get("totalCurrentLiabilities"),
        "long_term_debt": balance.get("longTermDebt"),
        "total_debt": balance.get("totalDebt"),
        "net_debt": (
            balance.get("netDebt")
            if balance.get("netDebt") is not None
            else (
                balance.get("totalDebt") - balance.get("cashAndCashEquivalents")
                if balance.get("totalDebt") is not None
                and balance.get("cashAndCashEquivalents") is not None
                else None
            )
        ),
        "total_liabilities": balance.get("totalLiabilities"),
        "total_equity": balance.get("totalStockholdersEquity"),
        "retained_earnings": balance.get("retainedEarnings"),
    }

    # ── Cash Flow summary (TTM) ───────────────────────────────────────
    dividends_ttm = _sum_quarters(ttm_cf, "dividendsPaid")
    investing_ttm = _sum_quarters(ttm_cf, "netCashUsedForInvestingActivites")
    financing_ttm = _sum_quarters(ttm_cf, "netCashUsedProvidedByFinancingActivities")
    da_ttm = _sum_quarters(ttm_cf, "depreciationAndAmortization")

    cash_flow = {
        "period": "TTM",
        "period_end": cashflow_quarters[0].get("date") if cashflow_quarters else None,
        "operating_cash_flow": operating_cf_ttm,
        "capex": capex_ttm,
        "free_cash_flow": fcf_ttm,
        "dividends": dividends_ttm,
        "net_cash_from_investing": investing_ttm,
        "net_cash_from_financing": financing_ttm,
        "depreciation_amortization": da_ttm,
    }

    # ── Ratios (from FMP ratios-ttm + key-metrics-ttm endpoints) ──────
    ratios_summary = {
        "date": latest_q.get("date"),
        "price": None,  # not directly available from these endpoints
        "market_cap": key_metrics.get("marketCap"),
        "enterprise_value": key_metrics.get("enterpriseValueTTM"),
        "pe_ratio": _fmt(ratios.get("priceToEarningsRatioTTM")),
        "ps_ratio": _fmt(ratios.get("priceToSalesRatioTTM")),
        "pb_ratio": _fmt(ratios.get("priceToBookRatioTTM")),
        "price_to_fcf": _fmt(ratios.get("priceToFreeCashFlowRatioTTM")),
        "ev_to_ebitda": _fmt(ratios.get("enterpriseValueMultipleTTM") or key_metrics.get("evToEBITDATTM")),
        "ev_to_sales": _fmt(key_metrics.get("evToSalesTTM")),
        "roe": _fmt(key_metrics.get("returnOnEquityTTM")),
        "roa": _fmt(key_metrics.get("returnOnAssetsTTM")),
        "debt_to_equity": _fmt(ratios.get("debtToEquityRatioTTM")),
        "current_ratio": _fmt(ratios.get("currentRatioTTM")),
        "quick_ratio": _fmt(ratios.get("quickRatioTTM")),
        "dividend_yield": _fmt(ratios.get("dividendYieldTTM"), 4),
        "eps": _fmt(eps_diluted_ttm),
        "fcf": fcf_ttm,
    }

    # ── Quarterly revenue trend (for YoY growth) ──────────────────────
    quarterly_trend = []
    for q in income_quarters:
        quarterly_trend.append({
            "period_end": q.get("date"),
            "fiscal_year": q.get("fiscalYear") or q.get("calendarYear"),
            "fiscal_quarter": q.get("period"),
            "revenue": q.get("revenue"),
            "net_income": q.get("netIncome"),
            "gross_margin_pct": _pct(q.get("grossProfit"), q.get("revenue")),
            "operating_margin_pct": _pct(q.get("operatingIncome"), q.get("revenue")),
            "eps_diluted": _fmt(q.get("epsDiluted")),
            "diluted_shares_outstanding": q.get("weightedAverageShsOutDil"),
        })

    # ── DCF Suggestions (derived from actuals) ────────────────────────
    dcf_suggestions = _derive_dcf_suggestions(
        income_quarters, revenue_ttm, operating_income_ttm, net_income_ttm,
        ebitda_ttm, operating_cf_ttm, capex_ttm, fcf_ttm, ratios
    )

    # ── Growth Profile (3-year trend data for charts) ─────────────────
    growth_profile = _build_growth_profile(
        income_quarters, cashflow_quarters, revenue_ttm, fcf_ttm, current_cik
    )

    # ── Company name from FMP profile ─────────────────────────────────
    company_name = profile.get("companyName") or ticker

    return {
        "ticker": ticker,
        "company_name": company_name,
        "income_statement": income_statement,
        "balance_sheet": balance_sheet,
        "cash_flow": cash_flow,
        "ratios": ratios_summary,
        "quarterly_trend": quarterly_trend,
        "dcf_suggestions": dcf_suggestions,
        "growth_profile": growth_profile,
    }


def _derive_dcf_suggestions(
    income_quarters: List[dict],
    revenue_ttm: Optional[float],
    operating_income_ttm: Optional[float],
    net_income_ttm: Optional[float],
    ebitda_ttm: Optional[float],
    operating_cf_ttm: Optional[float],
    capex_ttm: Optional[float],
    fcf_ttm: Optional[float],
    ratios: dict,
) -> Dict[str, Any]:
    """
    Derive DCF model input suggestions from actual financials.
    These replace generic sector defaults with company-specific values.
    """
    # ── YoY revenue growth from quarterly data ────────────────────────
    # Use date-based matching — index [3] is NOT reliably same Q last year if FMP
    # has gaps (e.g. Broadridge's seasonal data causes a ~17% sequential swing
    # to be mistaken for YoY growth when a quarter is missing from the array).
    revenue_growth_yoy = None
    dated = [q for q in income_quarters if q.get("date") and q.get("revenue")]
    if len(dated) >= 2:
        dated_sorted = sorted(dated, key=lambda q: q["date"], reverse=True)
        recent = dated_sorted[0]
        recent_rev = recent.get("revenue")
        try:
            recent_date = datetime.strptime(recent["date"], "%Y-%m-%d")
            target_date = recent_date - timedelta(days=365)
            tolerance = timedelta(days=46)
            yoy_quarter = next(
                (q for q in dated_sorted[1:]
                 if abs(datetime.strptime(q["date"], "%Y-%m-%d") - target_date) <= tolerance),
                None
            )
            if yoy_quarter:
                yoy_rev = yoy_quarter.get("revenue")
                if recent_rev and yoy_rev and yoy_rev > 0:
                    revenue_growth_yoy = round(((recent_rev - yoy_rev) / yoy_rev) * 100, 2)
        except (ValueError, TypeError):
            pass

    # ── Suggested growth rate: haircut trailing growth ────────────────
    # Discount actual growth by ~20% as a conservative forward projection
    suggested_growth = None
    if revenue_growth_yoy is not None:
        if revenue_growth_yoy > 0:
            suggested_growth = round(revenue_growth_yoy * 0.8, 1)  # 20% discount
        else:
            suggested_growth = round(revenue_growth_yoy * 1.2, 1)  # amplify negative slightly
        # Clamp to reasonable range
        suggested_growth = max(-10, min(suggested_growth, 40))

    # ── Operating margin ──────────────────────────────────────────────
    operating_margin = _pct(operating_income_ttm, revenue_ttm)

    # ── Estimated WACC (simplified) ───────────────────────────────────
    # Uses D/E ratio + assumed cost of debt & equity risk premium
    de_ratio = ratios.get("debtToEquityRatioTTM")
    estimated_wacc = None
    if de_ratio is not None:
        try:
            de = float(de_ratio)
            risk_free = 4.3  # ~10yr treasury yield as of 2025/2026
            equity_premium = 5.5  # historical equity risk premium
            cost_of_equity = risk_free + equity_premium
            cost_of_debt = risk_free + 1.5  # assume ~150bp credit spread
            tax_rate = 0.21  # US corporate rate

            weight_equity = 1 / (1 + de)
            weight_debt = de / (1 + de)
            estimated_wacc = round(
                (weight_equity * cost_of_equity) + (weight_debt * cost_of_debt * (1 - tax_rate)),
                1
            )
            # Clamp
            estimated_wacc = max(6.0, min(estimated_wacc, 20.0))
        except (TypeError, ValueError, ZeroDivisionError):
            pass

    return {
        "revenue_ttm": revenue_ttm,
        "net_income_ttm": net_income_ttm,
        "ebitda_ttm": ebitda_ttm,
        "fcf_ttm": fcf_ttm,
        "revenue_growth_yoy_pct": revenue_growth_yoy,
        "suggested_growth_rate": suggested_growth,
        "operating_margin_pct": operating_margin,
        "net_margin_pct": _pct(net_income_ttm, revenue_ttm),
        "estimated_wacc": estimated_wacc,
        "debt_to_equity": _fmt(de_ratio),
    }


def _build_growth_profile(
    income_quarters: List[dict],
    cashflow_quarters: List[dict],
    revenue_ttm: Optional[float],
    fcf_ttm: Optional[float],
    current_cik: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Build growth profile from extended quarterly data (12Q income, 8Q cash flow).
    Returns trend arrays ordered oldest-first for charting, plus Rule of 40.

    Staleness detection (two layers):
      1. CIK mismatch — financials belong to a different entity than the current ticker
      2. Date check — most recent quarter is older than 9 months (fallback)
    """
    # Reverse to oldest-first for charting
    inc_oldest_first = list(reversed(income_quarters))
    cf_oldest_first = list(reversed(cashflow_quarters))

    def _q_label(q: dict) -> str:
        period = q.get("period", "?")  # FMP uses "Q1", "Q2", etc.
        # FMP /stable/ returns the year under "fiscalYear" (older API used "calendarYear").
        year = q.get("fiscalYear") or q.get("calendarYear")
        if not year and q.get("date"):
            year = q["date"][:4]  # "2024-09-30" -> "2024"
        return f"{period} {year or '?'}"

    # ── Revenue trend (up to 12Q) ─────────────────────────────────────
    revenue_trend = []
    for q in inc_oldest_first:
        revenue_trend.append({
            "period": _q_label(q),
            "period_end": q.get("date"),
            "value": q.get("revenue"),
        })

    # ── Gross margin trend (up to 12Q) ────────────────────────────────
    gross_margin_trend = []
    for q in inc_oldest_first:
        gross_margin_trend.append({
            "period": _q_label(q),
            "period_end": q.get("date"),
            "value": _pct(q.get("grossProfit"), q.get("revenue")),
        })

    # ── EPS trend (up to 12Q) ─────────────────────────────────────────
    eps_trend = []
    for q in inc_oldest_first:
        eps_trend.append({
            "period": _q_label(q),
            "period_end": q.get("date"),
            "value": _fmt(q.get("epsDiluted")),
        })

    # ── FCF trend (up to 8Q, from quarterly cash flow) ────────────────
    fcf_trend = []
    for q in cf_oldest_first:
        qfcf = q.get("freeCashFlow")
        # Fallback: compute from operating CF + capex
        if qfcf is None:
            op_cf = q.get("operatingCashFlow")
            capex = q.get("capitalExpenditure")
            if op_cf is not None and capex is not None:
                qfcf = round(op_cf + capex, 2)
            elif op_cf is not None:
                qfcf = round(op_cf, 2)
        fcf_trend.append({
            "period": _q_label(q),
            "period_end": q.get("date"),
            "value": qfcf,
        })

    # ── YoY revenue growth per quarter (needs 4Q lookback) ────────────
    revenue_growth_trend = []
    for i, q in enumerate(inc_oldest_first):
        yoy_growth = None
        if i >= 4:
            current_rev = q.get("revenue")
            prior_rev = inc_oldest_first[i - 4].get("revenue")
            if current_rev and prior_rev and prior_rev > 0:
                yoy_growth = round(((current_rev - prior_rev) / prior_rev) * 100, 2)
        revenue_growth_trend.append({
            "period": _q_label(q),
            "period_end": q.get("date"),
            "value": yoy_growth,
        })

    # ── Rule of 40: YoY revenue growth % + FCF margin % ──────────────
    rule_of_40 = None
    latest_yoy_growth = None
    fcf_margin = None

    if len(income_quarters) >= 4:
        recent_rev = income_quarters[0].get("revenue")
        prior_rev = income_quarters[3].get("revenue")
        if recent_rev and prior_rev and prior_rev > 0:
            latest_yoy_growth = round(((recent_rev - prior_rev) / prior_rev) * 100, 1)

    if fcf_ttm is not None and revenue_ttm is not None and revenue_ttm > 0:
        fcf_margin = round((fcf_ttm / revenue_ttm) * 100, 1)

    if latest_yoy_growth is not None and fcf_margin is not None:
        rule_of_40 = round(latest_yoy_growth + fcf_margin, 1)

    # ── Rule of 40 trend (rolling TTM basis per quarter) ────────────
    rule_of_40_trend = []
    fcf_by_period = {e["period"]: e["value"] for e in fcf_trend}

    for i, entry in enumerate(revenue_growth_trend):
        period = entry["period"]
        yoy_growth = entry["value"]

        # Need YoY growth (requires i>=4) and 4Q window for TTM (requires i>=3)
        if yoy_growth is None or i < 3:
            rule_of_40_trend.append({
                "period": period,
                "period_end": entry["period_end"],
                "value": None,
                "revenue_growth": yoy_growth,
                "fcf_margin": None,
            })
            continue

        # TTM revenue: sum of 4 quarters ending at current
        ttm_rev_values = [revenue_trend[j]["value"] for j in range(i - 3, i + 1)]
        # TTM FCF: match the same 4 periods by label
        ttm_periods = [revenue_growth_trend[j]["period"] for j in range(i - 3, i + 1)]
        ttm_fcf_values = [fcf_by_period.get(p) for p in ttm_periods]

        if (all(v is not None for v in ttm_rev_values)
                and all(v is not None for v in ttm_fcf_values)):
            ttm_rev_sum = sum(ttm_rev_values)
            ttm_fcf_sum = sum(ttm_fcf_values)
            if ttm_rev_sum > 0:
                q_fcf_margin = round((ttm_fcf_sum / ttm_rev_sum) * 100, 1)
                q_r40 = round(yoy_growth + q_fcf_margin, 1)
                rule_of_40_trend.append({
                    "period": period,
                    "period_end": entry["period_end"],
                    "value": q_r40,
                    "revenue_growth": yoy_growth,
                    "fcf_margin": q_fcf_margin,
                })
                continue

        rule_of_40_trend.append({
            "period": period,
            "period_end": entry["period_end"],
            "value": None,
            "revenue_growth": yoy_growth,
            "fcf_margin": None,
        })

    # Trend direction: compare first and last valid values
    valid_r40 = [e["value"] for e in rule_of_40_trend if e["value"] is not None]
    rule_of_40_trend_direction = None
    if len(valid_r40) >= 2:
        change = valid_r40[-1] - valid_r40[0]
        if change > 5:
            rule_of_40_trend_direction = "improving"
        elif change < -5:
            rule_of_40_trend_direction = "declining"
        else:
            rule_of_40_trend_direction = "stable"

    # Only return profile if we have meaningful data
    has_data = any(p.get("value") is not None for p in revenue_trend)
    if not has_data:
        return None

    # ── Staleness detection ───────────────────────────────────────────
    # Layer 1: CIK mismatch — financials are from a different entity
    # Layer 2: Date check — most recent quarter older than 9 months (fallback)
    is_stale = False
    stale_reason = None
    newest_period_end = None
    financials_cik = None

    if income_quarters:
        newest_period_end = income_quarters[0].get("date")  # desc order, [0] = most recent

        # Extract CIK from financial results (FMP includes it in each result)
        financials_cik = income_quarters[0].get("cik")

        # Layer 1: CIK mismatch
        if current_cik and financials_cik and current_cik != financials_cik:
            is_stale = True
            stale_reason = "cik_mismatch"
            print(f"⚠️ Growth Profile CIK mismatch for ticker: current={current_cik}, financials={financials_cik}")

        # Layer 2: Date check (fallback when CIK comparison isn't possible)
        if not is_stale and newest_period_end:
            try:
                newest_date = datetime.strptime(newest_period_end, "%Y-%m-%d").replace(tzinfo=timezone.utc)
                staleness_threshold = datetime.now(timezone.utc) - timedelta(days=270)  # ~9 months
                if newest_date < staleness_threshold:
                    is_stale = True
                    stale_reason = "date_stale"
            except (ValueError, TypeError):
                pass  # unparseable date — don't flag

    # Suppress Rule of 40 when data is stale — it's meaningless
    if is_stale:
        rule_of_40 = None
        latest_yoy_growth = None
        fcf_margin = None
        rule_of_40_trend = []
        rule_of_40_trend_direction = None

    return {
        "revenue_trend": revenue_trend,
        "gross_margin_trend": gross_margin_trend,
        "eps_trend": eps_trend,
        "fcf_trend": fcf_trend,
        "revenue_growth_trend": revenue_growth_trend,
        "rule_of_40": rule_of_40,
        "rule_of_40_trend": rule_of_40_trend,
        "rule_of_40_trend_direction": rule_of_40_trend_direction,
        "rule_of_40_components": {
            "revenue_growth_yoy": latest_yoy_growth,
            "fcf_margin": fcf_margin,
        },
        "quarters_available": len(income_quarters),
        "fcf_quarters_available": len(cashflow_quarters),
        "is_stale": is_stale,
        "stale_reason": stale_reason,
        "newest_period_end": newest_period_end,
        "financials_cik": financials_cik,
        "current_cik": current_cik,
    }