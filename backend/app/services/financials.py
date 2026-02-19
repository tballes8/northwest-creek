"""
Company Financials Service — Massive (Polygon) v1 Financials API
Fetches income statements, balance sheets, cash flow statements, and ratios
in parallel via httpx.  Returns a unified payload for frontend consumption
and derived DCF-ready suggestions.

Endpoints used (Stocks Advanced plan required):
  /stocks/financials/v1/income-statements
  /stocks/financials/v1/balance-sheets
  /stocks/financials/v1/cash-flow-statements
  /stocks/financials/v1/ratios
"""
import asyncio
import httpx
from typing import Dict, Any, Optional, List
from app.config import get_settings

settings = get_settings()

BASE_URL = "https://api.massive.com"
API_KEY = settings.MASSIVE_API_KEY
TIMEOUT = 15.0


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


async def _fetch(client: httpx.AsyncClient, path: str, params: dict) -> dict:
    """Fetch a single Massive endpoint, return parsed JSON or empty dict on failure."""
    url = f"{BASE_URL}{path}"
    full_params = {"apiKey": API_KEY, **params}
    try:
        response = await client.get(url, params=full_params, timeout=TIMEOUT)
        response.raise_for_status()
        return response.json()
    except Exception as e:
        print(f"⚠️ Financials fetch failed for {path}: {e}")
        return {}


async def get_company_financials(ticker: str) -> Dict[str, Any]:
    """
    Fetch all four financials endpoints in parallel and return unified payload.

    Returns dict with keys:
      ticker, company_name, income_statement, balance_sheet, cash_flow,
      ratios, quarterly_trend, dcf_suggestions
    """
    ticker = ticker.upper()

    async with httpx.AsyncClient() as client:
        # Fire all requests in parallel
        income_quarterly_task = _fetch(client, "/stocks/financials/v1/income-statements", {
            "tickers": ticker, "timeframe": "quarterly", "limit": 4, "order": "desc",
        })
        income_ttm_task = _fetch(client, "/stocks/financials/v1/income-statements", {
            "tickers": ticker, "timeframe": "trailing_twelve_months", "limit": 1,
        })
        balance_task = _fetch(client, "/stocks/financials/v1/balance-sheets", {
            "tickers": ticker, "timeframe": "quarterly", "limit": 1, "order": "desc",
        })
        cashflow_ttm_task = _fetch(client, "/stocks/financials/v1/cash-flow-statements", {
            "tickers": ticker, "timeframe": "trailing_twelve_months", "limit": 1,
        })
        ratios_task = _fetch(client, "/stocks/financials/v1/ratios", {
            "ticker": ticker,
        })

        (
            income_quarterly_raw,
            income_ttm_raw,
            balance_raw,
            cashflow_ttm_raw,
            ratios_raw,
        ) = await asyncio.gather(
            income_quarterly_task,
            income_ttm_task,
            balance_task,
            cashflow_ttm_task,
            ratios_task,
        )

    # ── Extract results arrays ────────────────────────────────────────
    income_quarters: List[dict] = income_quarterly_raw.get("results", [])
    income_ttm_list: List[dict] = income_ttm_raw.get("results", [])
    balance_list: List[dict] = balance_raw.get("results", [])
    cashflow_ttm_list: List[dict] = cashflow_ttm_raw.get("results", [])
    ratios_list: List[dict] = ratios_raw.get("results", [])

    income_ttm = income_ttm_list[0] if income_ttm_list else {}
    balance = balance_list[0] if balance_list else {}
    cashflow_ttm = cashflow_ttm_list[0] if cashflow_ttm_list else {}
    ratios = ratios_list[0] if ratios_list else {}

    # Most recent quarter
    latest_q = income_quarters[0] if income_quarters else {}

    # ── Income Statement summary (TTM) ────────────────────────────────
    revenue_ttm = income_ttm.get("revenue")
    gross_profit_ttm = income_ttm.get("gross_profit")
    operating_income_ttm = income_ttm.get("operating_income")
    net_income_ttm = income_ttm.get("net_income_loss_attributable_common_shareholders") or income_ttm.get("consolidated_net_income_loss")
    ebitda_ttm = income_ttm.get("ebitda")
    eps_diluted_ttm = income_ttm.get("diluted_earnings_per_share")
    rd_ttm = income_ttm.get("research_development")
    sga_ttm = income_ttm.get("selling_general_administrative")

    income_statement = {
        "period": "TTM",
        "period_end": income_ttm.get("period_end"),
        "revenue": revenue_ttm,
        "cost_of_revenue": income_ttm.get("cost_of_revenue"),
        "gross_profit": gross_profit_ttm,
        "gross_margin_pct": _pct(gross_profit_ttm, revenue_ttm),
        "operating_income": operating_income_ttm,
        "operating_margin_pct": _pct(operating_income_ttm, revenue_ttm),
        "net_income": net_income_ttm,
        "net_margin_pct": _pct(net_income_ttm, revenue_ttm),
        "ebitda": ebitda_ttm,
        "diluted_eps": _fmt(eps_diluted_ttm),
        "research_development": rd_ttm,
        "selling_general_administrative": sga_ttm,
    }

    # ── Balance Sheet summary (latest quarter) ────────────────────────
    balance_sheet = {
        "period_end": balance.get("period_end"),
        "fiscal_year": balance.get("fiscal_year"),
        "fiscal_quarter": balance.get("fiscal_quarter"),
        "cash_and_equivalents": balance.get("cash_and_equivalents"),
        "short_term_investments": balance.get("short_term_investments"),
        "total_current_assets": balance.get("total_current_assets"),
        "total_assets": balance.get("total_assets"),
        "total_current_liabilities": balance.get("total_current_liabilities"),
        "long_term_debt": balance.get("long_term_debt_and_capital_lease_obligations"),
        "total_liabilities": balance.get("total_liabilities"),
        "total_equity": balance.get("total_equity"),
        "retained_earnings": balance.get("retained_earnings_deficit"),
    }

    # ── Cash Flow summary (TTM) ───────────────────────────────────────
    operating_cf = cashflow_ttm.get("net_cash_from_operating_activities")
    capex = cashflow_ttm.get("purchase_of_property_plant_and_equipment")
    fcf = None
    if operating_cf is not None and capex is not None:
        fcf = operating_cf + capex  # capex is negative

    cash_flow = {
        "period": "TTM",
        "period_end": cashflow_ttm.get("period_end"),
        "operating_cash_flow": operating_cf,
        "capex": capex,
        "free_cash_flow": fcf,
        "dividends": cashflow_ttm.get("dividends"),
        "net_cash_from_investing": cashflow_ttm.get("net_cash_from_investing_activities"),
        "net_cash_from_financing": cashflow_ttm.get("net_cash_from_financing_activities"),
        "depreciation_amortization": cashflow_ttm.get("depreciation_depletion_and_amortization"),
    }

    # ── Ratios (daily-refreshed) ──────────────────────────────────────
    ratios_summary = {
        "date": ratios.get("date"),
        "price": ratios.get("price"),
        "market_cap": ratios.get("market_cap"),
        "enterprise_value": ratios.get("enterprise_value"),
        "pe_ratio": _fmt(ratios.get("price_to_earnings")),
        "ps_ratio": _fmt(ratios.get("price_to_sales")),
        "pb_ratio": _fmt(ratios.get("price_to_book")),
        "price_to_fcf": _fmt(ratios.get("price_to_free_cash_flow")),
        "ev_to_ebitda": _fmt(ratios.get("ev_to_ebitda")),
        "ev_to_sales": _fmt(ratios.get("ev_to_sales")),
        "roe": _fmt(ratios.get("return_on_equity")),
        "roa": _fmt(ratios.get("return_on_assets")),
        "debt_to_equity": _fmt(ratios.get("debt_to_equity")),
        "current_ratio": _fmt(ratios.get("current")),
        "quick_ratio": _fmt(ratios.get("quick")),
        "dividend_yield": _fmt(ratios.get("dividend_yield"), 4),
        "eps": _fmt(ratios.get("earnings_per_share")),
        "fcf": ratios.get("free_cash_flow"),
    }

    # ── Quarterly revenue trend (for YoY growth) ──────────────────────
    quarterly_trend = []
    for q in income_quarters:
        quarterly_trend.append({
            "period_end": q.get("period_end"),
            "fiscal_year": q.get("fiscal_year"),
            "fiscal_quarter": q.get("fiscal_quarter"),
            "revenue": q.get("revenue"),
            "net_income": q.get("net_income_loss_attributable_common_shareholders") or q.get("consolidated_net_income_loss"),
            "gross_margin_pct": _pct(q.get("gross_profit"), q.get("revenue")),
            "operating_margin_pct": _pct(q.get("operating_income"), q.get("revenue")),
            "eps_diluted": _fmt(q.get("diluted_earnings_per_share")),
        })

    # ── DCF Suggestions (derived from actuals) ────────────────────────
    dcf_suggestions = _derive_dcf_suggestions(
        income_quarters, income_ttm, balance, cashflow_ttm, ratios
    )

    # ── Company name from tickers field or fallback ───────────────────
    company_name = None
    for src in [income_ttm, balance, cashflow_ttm]:
        if src.get("company_name"):
            company_name = src["company_name"]
            break

    return {
        "ticker": ticker,
        "company_name": company_name,
        "income_statement": income_statement,
        "balance_sheet": balance_sheet,
        "cash_flow": cash_flow,
        "ratios": ratios_summary,
        "quarterly_trend": quarterly_trend,
        "dcf_suggestions": dcf_suggestions,
    }


def _derive_dcf_suggestions(
    income_quarters: List[dict],
    income_ttm: dict,
    balance: dict,
    cashflow_ttm: dict,
    ratios: dict,
) -> Dict[str, Any]:
    """
    Derive DCF model input suggestions from actual financials.
    These replace generic sector defaults with company-specific values.
    """
    revenue_ttm = income_ttm.get("revenue")
    operating_income_ttm = income_ttm.get("operating_income")
    net_income_ttm = income_ttm.get("net_income_loss_attributable_common_shareholders") or income_ttm.get("consolidated_net_income_loss")
    ebitda_ttm = income_ttm.get("ebitda")

    operating_cf = cashflow_ttm.get("net_cash_from_operating_activities")
    capex = cashflow_ttm.get("purchase_of_property_plant_and_equipment")
    fcf_ttm = None
    if operating_cf is not None and capex is not None:
        fcf_ttm = operating_cf + capex

    # ── YoY revenue growth from quarterly data ────────────────────────
    # Compare most recent quarter to same quarter one year ago
    revenue_growth_yoy = None
    if len(income_quarters) >= 4:
        recent_rev = income_quarters[0].get("revenue")
        yoy_rev = income_quarters[3].get("revenue")  # 4 quarters back = same Q last year
        if recent_rev and yoy_rev and yoy_rev > 0:
            revenue_growth_yoy = round(((recent_rev - yoy_rev) / yoy_rev) * 100, 2)

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
    de_ratio = ratios.get("debt_to_equity")
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