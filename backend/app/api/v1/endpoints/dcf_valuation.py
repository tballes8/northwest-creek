"""
DCF Valuation API Endpoints - Discounted Cash Flow Analysis
⭐ PAID TIERS ONLY
"""
import asyncio
import re
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, Query, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func as sa_func
from typing import Optional, Dict, Any
from app.db.models import User, FeatureUsage
from app.api.dependencies import get_current_user
from app.db.session import get_db
from app.services.market_data import market_data_service
from app.services.financials_service import get_company_financials
from app.services.edgar_identity import is_contradicted
from app.services.fmp_client import get_fmp_client, API_KEY
from app.services.dcf_service import compute_dcf, calculate_reverse_dcf
from app.core.tier_limits import get_tier_limit, get_review_period, get_upgrade_tier


def _safe_error(e: Exception) -> str:
    """Strip API keys and sensitive params from error messages."""
    msg = str(e)
    msg = re.sub(r'apiKey=[^&\s\'"]+', 'apiKey=***', msg)
    msg = re.sub(r'api_key=[^&\s\'"]+', 'api_key=***', msg)
    msg = re.sub(r'token=[^&\s\'"]+', 'token=***', msg)
    return msg

router = APIRouter()


async def _fetch_fmp_dcf(ticker: str) -> Dict[str, Any]:
    """
    Fetch FMP's pre-calculated DCF benchmarks (simple, levered, and advanced).
    Returns a dict with all three, or empty values on failure.
    """
    result: Dict[str, Any] = {
        "dcf": None,
        "levered_dcf": None,
        "stock_price": None,
        "wacc": None,
        "equity_value_per_share": None,
        "terminal_value": None,
        "enterprise_value": None,
    }
    try:
        client = get_fmp_client()
        params = {"symbol": ticker, "apikey": API_KEY}

        # Fetch all three DCF endpoints in parallel
        simple_resp, levered_resp, adv_resp = await asyncio.gather(
            client.get("discounted-cash-flow", params=params),
            client.get("levered-discounted-cash-flow", params=params),
            client.get("custom-discounted-cash-flow", params=params),
        )

        simple_resp.raise_for_status()
        simple_data = simple_resp.json()
        if simple_data and isinstance(simple_data, list) and len(simple_data) > 0:
            result["dcf"] = simple_data[0].get("dcf")
            result["stock_price"] = simple_data[0].get("Stock Price")

        levered_resp.raise_for_status()
        levered_data = levered_resp.json()
        if levered_data and isinstance(levered_data, list) and len(levered_data) > 0:
            result["levered_dcf"] = levered_data[0].get("dcf")

        adv_resp.raise_for_status()
        adv_data = adv_resp.json()
        if adv_data and isinstance(adv_data, list) and len(adv_data) > 0:
            latest = adv_data[0]  # newest projected year
            result["wacc"] = latest.get("wacc")
            result["equity_value_per_share"] = latest.get("equityValuePerShare")
            result["terminal_value"] = latest.get("terminalValue")
            result["enterprise_value"] = latest.get("enterpriseValue")

    except Exception as e:
        print(f"⚠️ FMP DCF fetch failed for {ticker}: {e}")

    return result


async def _fetch_shares_outstanding(ticker: str) -> Optional[int]:
    """
    Fetch outstanding shares from FMP /stable/shares-float endpoint.
    Returns the outstandingShares count or None on failure.
    """
    try:
        client = get_fmp_client()
        resp = await client.get(
            "shares-float",
            params={"symbol": ticker.upper(), "apikey": API_KEY},
        )
        resp.raise_for_status()
        data = resp.json()
        if data and isinstance(data, list) and len(data) > 0:
            outstanding = data[0].get("outstandingShares")
            if outstanding and outstanding > 0:
                return int(outstanding)
    except Exception as e:
        print(f"⚠️ Shares float fetch failed for {ticker}: {e}")
    return None


def require_valid_tier(current_user: User = Depends(get_current_user)):
    """Validate user has a recognized subscription tier for DCF Valuation access"""
    allowed_tiers = ["beginner", "casual", "active", "professional"]
    if current_user.subscription_tier not in allowed_tiers:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"DCF Valuation requires a valid subscription. Current tier: {current_user.subscription_tier.title()}. Please contact support."
        )
    return current_user


async def check_dcf_limit(user: User, db: AsyncSession) -> int:
    """Check if user has reached their DCF valuation limit for the current period.

    Returns the current usage count. Raises 403 if the limit is exceeded.
    """
    limit = get_tier_limit(user.subscription_tier, "dcf_valuations")
    period = get_review_period(user.subscription_tier)

    now = datetime.now(timezone.utc)
    if period == "day":
        window_start = now - timedelta(days=1)
    else:  # "week"
        window_start = now - timedelta(weeks=1)

    result = await db.execute(
        select(sa_func.count(FeatureUsage.id))
        .where(
            FeatureUsage.user_id == user.id,
            FeatureUsage.feature == "dcf_valuations",
            FeatureUsage.used_at >= window_start,
        )
    )
    current_count = result.scalar() or 0

    if current_count >= limit:
        next_tier = get_upgrade_tier(user.subscription_tier)
        if next_tier:
            next_limit = get_tier_limit(next_tier, "dcf_valuations")
            upgrade_msg = f" Upgrade to {next_tier.capitalize()} for {next_limit} DCF valuations per {get_review_period(next_tier)}."
        else:
            upgrade_msg = ""

        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "message": f"DCF valuation limit reached. {user.subscription_tier.capitalize()} tier allows {limit} per {period}.{upgrade_msg}",
                "current_usage": current_count,
                "max_usage": limit,
                "period": period,
            }
        )

    return current_count


async def record_dcf_usage(user: User, db: AsyncSession) -> None:
    """Record a DCF valuation usage event."""
    usage = FeatureUsage(user_id=user.id, feature="dcf_valuations")
    db.add(usage)
    await db.commit()


@router.get("/suggestions/{ticker}")
async def get_dcf_suggestions(
    ticker: str,
    current_user: User = Depends(require_valid_tier),
    db: AsyncSession = Depends(get_db)
):
    """
    🔒 PAID TIERS ONLY - Get AI-suggested DCF parameters for a stock
    
    Returns intelligent default parameters based on:
    - Company sector and industry
    - Market capitalization
    - Growth characteristics
    
    **Returns:**
    - Suggested growth rate, terminal growth, discount rate, and projection years
    - Reasoning for each parameter
    - Company information
    """
    try:
        # Fetch quote, company info, financials, FMP DCF, and shares in parallel
        quote, company, fin_result, fmp_dcf, shares_outstanding = await asyncio.gather(
            market_data_service.get_quote(ticker),
            market_data_service.get_company_info(ticker),
            get_company_financials(ticker),
            _fetch_fmp_dcf(ticker.upper()),
            _fetch_shares_outstanding(ticker),
            return_exceptions=True,
        )

        # Quote and company are required — re-raise if they failed
        if isinstance(quote, BaseException):
            raise quote
        if isinstance(company, BaseException):
            raise company

        company_name = company.get("name", ticker)
        market_cap = company.get("market_cap") or 0
        current_price = float(quote.get('price', 0))
        industry = company.get("industry", "Unknown")
        sector = company.get("sector", "Other")
        security_type = company.get("type", "")

        # Normalize optional results that may have failed
        if isinstance(fin_result, BaseException):
            fin_result = None
        if isinstance(fmp_dcf, BaseException):
            fmp_dcf = {}
        if isinstance(shares_outstanding, BaseException):
            shares_outstanding = None

        if current_price == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Could not fetch price data for {ticker}"
            )
        
        # Determine company size category
        if market_cap >= 200_000_000_000:
            size_category = "mega_cap"
        elif market_cap >= 10_000_000_000:
            size_category = "large_cap"
        elif market_cap >= 2_000_000_000:
            size_category = "mid_cap"
        elif market_cap >= 300_000_000:
            size_category = "small_cap"
        else:
            size_category = "micro_cap"
        
        # Sector-based growth and risk profiles
        sector_profiles = {
            "Technology": {
                "growth": 0.15, "terminal": 0.03, "discount": 0.12, "years": 7,
                "growth_reasoning": "Tech companies typically show high growth potential",
                "terminal_reasoning": "Mature tech companies stabilize around GDP growth",
                "discount_reasoning": "Higher risk due to rapid innovation and competition",
                "years_reasoning": "Longer projection captures growth runway"
            },
            "Healthcare": {
                "growth": 0.08, "terminal": 0.025, "discount": 0.09, "years": 5,
                "growth_reasoning": "Healthcare shows steady, predictable growth",
                "terminal_reasoning": "Aging demographics support steady long-term growth",
                "discount_reasoning": "Moderate risk with regulatory considerations",
                "years_reasoning": "Standard period for stable industries"
            },
            "Financial Services": {
                "growth": 0.06, "terminal": 0.02, "discount": 0.11, "years": 5,
                "growth_reasoning": "Financial services grow with economic expansion",
                "terminal_reasoning": "Long-term growth tied to GDP",
                "discount_reasoning": "Higher risk due to economic sensitivity",
                "years_reasoning": "Standard period for cyclical industries"
            },
            "Consumer Cyclical": {
                "growth": 0.07, "terminal": 0.025, "discount": 0.10, "years": 5,
                "growth_reasoning": "Growth linked to consumer spending trends",
                "terminal_reasoning": "Mature markets stabilize near GDP growth",
                "discount_reasoning": "Moderate risk with economic cycles",
                "years_reasoning": "Captures full economic cycle"
            },
            "Consumer Defensive": {
                "growth": 0.05, "terminal": 0.02, "discount": 0.08, "years": 5,
                "growth_reasoning": "Defensive sectors show stable, lower growth",
                "terminal_reasoning": "Stable demand supports steady terminal growth",
                "discount_reasoning": "Lower risk due to consistent demand",
                "years_reasoning": "Standard period for stable sectors"
            },
            "Energy": {
                "growth": 0.04, "terminal": 0.015, "discount": 0.12, "years": 5,
                "growth_reasoning": "Energy sector faces transition challenges",
                "terminal_reasoning": "Long-term growth uncertainty due to energy transition",
                "discount_reasoning": "Higher risk from commodity prices and regulation",
                "years_reasoning": "Captures near-term trends"
            },
            "Industrials": {
                "growth": 0.06, "terminal": 0.025, "discount": 0.09, "years": 5,
                "growth_reasoning": "Industrial growth follows economic expansion",
                "terminal_reasoning": "Mature industrials stabilize with GDP",
                "discount_reasoning": "Moderate risk with economic sensitivity",
                "years_reasoning": "Standard period for cyclical industries"
            },
            "Real Estate": {
                "growth": 0.04, "terminal": 0.02, "discount": 0.09, "years": 5,
                "growth_reasoning": "Real estate shows stable, dividend-focused returns",
                "terminal_reasoning": "Long-term growth tied to population and GDP",
                "discount_reasoning": "Moderate risk with interest rate sensitivity",
                "years_reasoning": "Standard period for income-focused assets"
            },
            "Utilities": {
                "growth": 0.03, "terminal": 0.02, "discount": 0.07, "years": 5,
                "growth_reasoning": "Utilities show very stable, regulated growth",
                "terminal_reasoning": "Long-term growth matches population and usage",
                "discount_reasoning": "Low risk due to regulated monopolies",
                "years_reasoning": "Standard period for stable sectors"
            },
            "Communication Services": {
                "growth": 0.08, "terminal": 0.025, "discount": 0.10, "years": 6,
                "growth_reasoning": "Communications show steady digital transformation growth",
                "terminal_reasoning": "Mature markets stabilize near GDP growth",
                "discount_reasoning": "Moderate risk with technology evolution",
                "years_reasoning": "Longer period captures digital shift"
            },
            "Materials": {
                "growth": 0.05, "terminal": 0.02, "discount": 0.10, "years": 5,
                "growth_reasoning": "Materials growth linked to industrial demand",
                "terminal_reasoning": "Commodity nature limits long-term growth",
                "discount_reasoning": "Moderate risk from commodity cycles",
                "years_reasoning": "Captures commodity cycle"
            }
        }

        profile = sector_profiles.get(sector, {
            "growth": 0.06, "terminal": 0.025, "discount": 0.10, "years": 5,
            "growth_reasoning": "Conservative growth estimate for unclassified sector",
            "terminal_reasoning": "Standard terminal growth near GDP growth",
            "discount_reasoning": "Moderate risk assessment",
            "years_reasoning": "Standard projection period"
        })
        
        # Adjust for company size
        size_adjustments = {
            "mega_cap": {"growth": -0.01, "discount": -0.01, "growth_note": "adjusted down for large cap stability"},
            "large_cap": {"growth": 0, "discount": 0, "growth_note": ""},
            "mid_cap": {"growth": 0.01, "discount": 0.01, "growth_note": "adjusted up for mid-cap growth potential"},
            "small_cap": {"growth": 0.02, "discount": 0.02, "growth_note": "adjusted for small-cap growth and risk"},
            "micro_cap": {"growth": 0.03, "discount": 0.03, "growth_note": "adjusted for micro-cap high growth and risk"}
        }
        
        adjustment = size_adjustments.get(size_category, size_adjustments["large_cap"])
        
        suggested_growth = max(0.01, min(0.30, profile["growth"] + adjustment["growth"]))
        suggested_discount = max(0.06, min(0.20, profile["discount"] + adjustment["discount"]))
        suggested_terminal = profile["terminal"]
        suggested_years = profile["years"]
        
        growth_reasoning = profile["growth_reasoning"]
        if adjustment["growth_note"]:
            growth_reasoning += f" ({adjustment['growth_note']})"
        
        discount_reasoning = profile["discount_reasoning"]
        if adjustment["growth_note"]:
            discount_reasoning += f" ({adjustment['growth_note']})"
        
        # ── Use pre-fetched financials ───────
        actuals = None
        dcf_sug = None
        growth_profile = None
        entity_trust = None
        try:
            if fin_result is None:
                raise ValueError("Financials not available")
            fin_data = fin_result
            entity_trust = fin_data.get("entity_trust")
            dcf_sug = fin_data.get("dcf_suggestions") or {}
            income = fin_data.get("income_statement") or {}
            cash_flow_data = fin_data.get("cash_flow") or {}
            ratios_data = fin_data.get("ratios") or {}
            growth_profile = fin_data.get("growth_profile")

            def _fmt_big(val):
                if val is None:
                    return None
                aval = abs(val)
                if aval >= 1e12:
                    return f"${val / 1e12:.2f}T"
                if aval >= 1e9:
                    return f"${val / 1e9:.2f}B"
                if aval >= 1e6:
                    return f"${val / 1e6:.1f}M"
                if aval >= 1e3:
                    return f"${val / 1e3:.1f}K"
                return f"${val:.2f}"

            actuals = {
                "revenue_ttm": income.get("revenue"),
                "revenue_ttm_fmt": _fmt_big(income.get("revenue")),
                "net_income_ttm": income.get("net_income"),
                "net_income_ttm_fmt": _fmt_big(income.get("net_income")),
                "fcf_ttm": cash_flow_data.get("free_cash_flow"),
                "fcf_ttm_fmt": _fmt_big(cash_flow_data.get("free_cash_flow")),
                "operating_cf_ttm": cash_flow_data.get("operating_cash_flow"),
                "operating_cf_ttm_fmt": _fmt_big(cash_flow_data.get("operating_cash_flow")),
                "gross_margin_pct": income.get("gross_margin_pct"),
                "operating_margin_pct": income.get("operating_margin_pct"),
                "net_margin_pct": income.get("net_margin_pct"),
                "revenue_growth_yoy_pct": dcf_sug.get("revenue_growth_yoy_pct"),
                "pe_ratio": ratios_data.get("pe_ratio"),
                "ev_to_ebitda": ratios_data.get("ev_to_ebitda"),
                "debt_to_equity": ratios_data.get("debt_to_equity"),
                "current_ratio": ratios_data.get("current_ratio"),
                "roe": ratios_data.get("roe"),
                "diluted_eps": income.get("diluted_eps"),
            }

            has_actuals = actuals["revenue_ttm"] is not None or actuals["fcf_ttm"] is not None
            if not has_actuals:
                actuals = None

            # Override sector defaults with actual-derived values when available
            growth_from_actuals = False
            growth_from_consensus = False
            discount_from_actuals = False
            if dcf_sug:
                if dcf_sug.get("suggested_growth_rate") is not None:
                    suggested_growth = max(-0.10, min(0.30, dcf_sug["suggested_growth_rate"] / 100))
                    basis = dcf_sug.get("suggested_growth_basis")
                    if basis in ("consensus_yoy", "consensus_vs_ttm"):
                        est_year = dcf_sug.get("consensus_estimate_year")
                        n_analysts = dcf_sug.get("consensus_num_analysts")
                        growth_reasoning = (
                            f"Analyst consensus revenue growth of "
                            f"{dcf_sug['consensus_growth_pct']:.1f}%"
                            + (f" for FY{est_year}" if est_year else "")
                            + (f" ({n_analysts} analysts)" if n_analysts else "")
                        )
                        growth_from_consensus = True
                    elif dcf_sug.get("revenue_growth_yoy_pct") is not None:
                        growth_reasoning = f"Based on trailing revenue growth of {dcf_sug['revenue_growth_yoy_pct']:.1f}%, conservatively adjusted"
                    growth_from_actuals = True
                if dcf_sug.get("estimated_wacc") is not None:
                    suggested_discount = max(0.06, min(0.20, dcf_sug["estimated_wacc"] / 100))
                    discount_reasoning = f"Estimated WACC based on D/E ratio of {dcf_sug['debt_to_equity']:.2f}" if dcf_sug.get("debt_to_equity") is not None else discount_reasoning
                    discount_from_actuals = True

        except Exception as fin_err:
            print(f"⚠️ Could not fetch financials for DCF suggestions ({ticker}): {_safe_error(fin_err)}")
            growth_from_actuals = False
            growth_from_consensus = False
            discount_from_actuals = False

        # On a positive identity contradiction, nothing derived from the
        # vendor's filings may be presented — not the pre-filled parameters,
        # not the "actuals", not the source tags that render as green
        # confirmation badges, and not FMP's own DCF benchmark (computed from
        # the same wrong entity). A caveat under an affirmative green check
        # loses to the green check for a user who trusts the platform.
        if is_contradicted(entity_trust):
            if entity_trust.get("edgar_company_name"):
                company_name = entity_trust["edgar_company_name"]

            # Sector defaults survive a contradiction, but only when the
            # vendor's *profile* independently agrees with EDGAR on identity.
            # That distinction is real: for the motivating case (TE) only the
            # statement rows were stale — the profile already pointed at the
            # right CIK — so sector, industry and size describe the correct
            # company and a sector default is genuinely about it. When the
            # profile is also wrong, the sector feeding those defaults is the
            # wrong company's and they are withheld too.
            profile_trusted = (
                entity_trust.get("fmp_profile_cik") is not None
                and entity_trust.get("fmp_profile_cik") == entity_trust.get("edgar_cik")
            )
            return {
                "ticker": ticker.upper(),
                "company_name": company_name,
                "sector": sector,
                "industry": industry,
                "current_price": round(current_price, 2),
                "market_cap": market_cap,
                "size_category": size_category,
                "security_type": security_type,
                # Symbol-keyed and current (shares-float), not read off the
                # stale filings — but still a vendor figure, so it is tagged an
                # estimate below and the user can override it.
                "shares_outstanding": shares_outstanding if profile_trusted else None,
                "suggestions": {
                    "growth_rate": round(suggested_growth, 4),
                    "terminal_growth": round(suggested_terminal, 4),
                    "discount_rate": round(suggested_discount, 4),
                    "projection_years": suggested_years,
                } if profile_trusted else None,
                "sources": {
                    "growth_rate": "sector_default",
                    "discount_rate": "sector_default",
                    "terminal_growth": "sector_default",
                    "projection_years": "sector_default",
                    "shares_outstanding": "estimated",
                } if profile_trusted else None,
                "reasoning": {
                    "growth_rate": growth_reasoning,
                    "terminal_growth": profile["terminal_reasoning"],
                    "discount_rate": discount_reasoning,
                    "projection_years": profile["years_reasoning"],
                } if profile_trusted else None,
                # No entity figures and no vendor DCF: `actuals` is the wrong
                # company's TTM, and FMP's benchmark is built on it.
                "actuals": None,
                "growth_profile": None,
                "fmp_benchmark": None,
                "entity_trust": entity_trust,
                # Free cash flow has no legitimate source in this state. It is
                # also the input that determines a DCF's answer, so the user
                # must supply it — see `fcf_override` on /calculate.
                "requires_manual_fcf": True,
            }

        return {
            "ticker": ticker.upper(),
            "company_name": company_name,
            "sector": sector,
            "industry": industry,
            "current_price": round(current_price, 2),
            "market_cap": market_cap,
            "size_category": size_category,
            "security_type": security_type,
            "shares_outstanding": shares_outstanding,
            "suggestions": {
                "growth_rate": round(suggested_growth, 4),
                "terminal_growth": round(suggested_terminal, 4),
                "discount_rate": round(suggested_discount, 4),
                "projection_years": suggested_years
            },
            "sources": {
                # analyst_consensus > sec_filings (trailing actuals) > sector_default
                "growth_rate": (
                    "analyst_consensus" if growth_from_consensus
                    else "sec_filings" if growth_from_actuals
                    else "sector_default"
                ),
                "discount_rate": "sec_filings" if discount_from_actuals else "sector_default",
                "terminal_growth": "sector_default",
                "projection_years": "sector_default",
            },
            "reasoning": {
                "growth_rate": growth_reasoning,
                "terminal_growth": profile["terminal_reasoning"],
                "discount_rate": discount_reasoning,
                "projection_years": profile["years_reasoning"]
            },
            "actuals": actuals,
            "growth_profile": growth_profile,
            "entity_trust": entity_trust,
            "fmp_benchmark": {
                "dcf_value": fmp_dcf.get("dcf"),
                "levered_dcf_value": fmp_dcf.get("levered_dcf"),
                "equity_value_per_share": fmp_dcf.get("equity_value_per_share"),
                "wacc": fmp_dcf.get("wacc"),
                "source": "FMP Discounted Cash Flow model",
            },
        }
    
    except HTTPException:
        raise
    except Exception as e:
        print(f"DCF suggestions error for {ticker}: {_safe_error(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Could not generate suggestions for {ticker}: {_safe_error(e)}"
        )


@router.get("/calculate/{ticker}")
async def calculate_dcf(
    ticker: str,
    growth_rate: float = Query(0.05, ge=-0.5, le=1.0, description="Expected growth rate (decimal, e.g., 0.05 = 5%)"),
    terminal_growth: float = Query(0.025, ge=0, le=0.10, description="Terminal growth rate (decimal)"),
    discount_rate: float = Query(0.10, ge=0.01, le=0.30, description="Discount rate / WACC (decimal)"),
    projection_years: int = Query(5, ge=3, le=10, description="Years to project"),
    fcf_override: Optional[float] = Query(
        None, description="User-supplied trailing free cash flow (absolute dollars). "
                          "Takes precedence over the vendor figure. REQUIRED when the "
                          "entity-identity verdict is a contradiction, because free "
                          "cash flow then has no trustworthy source."
    ),
    shares_override: Optional[float] = Query(
        None, gt=0, description="User-supplied diluted shares outstanding (absolute count). "
                                "Takes precedence over the vendor figure."
    ),
    current_user: User = Depends(require_valid_tier),
    db: AsyncSession = Depends(get_db)
):
    """
    🔒 PAID TIERS ONLY - Calculate DCF Valuation for a stock
    
    **Discounted Cash Flow (DCF) Analysis:**
    
    Estimates intrinsic value based on projected future cash flows discounted to present value.
    
    **Parameters:**
    - `ticker` - Stock symbol to analyze
    - `growth_rate` - Expected annual growth rate (default: 5%)
    - `terminal_growth` - Perpetual growth rate after projection period (default: 2.5%)
    - `discount_rate` - WACC / Required rate of return (default: 10%)
    - `projection_years` - Number of years to project (default: 5)
    
    **Returns:**
    - Projected cash flows
    - Discounted present values
    - Terminal value
    - Intrinsic value per share
    - Current price vs intrinsic value comparison
    - Buy/Hold/Sell recommendation
    
    ⭐ **Professional Feature:** 20 DCF valuations daily with customizable assumptions!
    """
    # Enforce tier-based usage limit before doing any work
    await check_dcf_limit(current_user, db)

    try:
        # Fetch quote, company, financials, shares, and FMP DCF in parallel
        quote_r, company_r, fin_r, shares_r, fmp_dcf = await asyncio.gather(
            market_data_service.get_quote(ticker),
            market_data_service.get_company_info(ticker),
            get_company_financials(ticker),
            _fetch_shares_outstanding(ticker),
            _fetch_fmp_dcf(ticker.upper()),
            return_exceptions=True,
        )

        # Quote is required
        if isinstance(quote_r, BaseException):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Could not fetch current price for {ticker}"
            )
        current_price = float(quote_r.get('price', 0))

        # Company info — graceful fallback
        if isinstance(company_r, BaseException):
            company_name = ticker
            market_cap = None
            security_type = ""
        else:
            company_name = company_r.get("name", ticker)
            market_cap = company_r.get("market_cap")
            security_type = company_r.get("type", "")

        # Normalize optional results
        if isinstance(fin_r, BaseException):
            fin_r = None
        if isinstance(shares_r, BaseException):
            shares_r = None
        if isinstance(fmp_dcf, BaseException):
            fmp_dcf = {}

        # ── Entity identity gate ──────────────────────────────────────────
        # Refuse before any figure is read. Un-gated, this endpoint produced
        # the worst output in the codebase: an intrinsic value per share and a
        # Buy/Sell rating computed from another company's cash flows and
        # labelled `fcf_source = "actual_ttm"`. FMP's own DCF benchmark is
        # withheld for the same reason — it is built on the same filings.
        #
        # Usage is deliberately NOT recorded: a user must not spend DCF quota
        # to be told the vendor attached the wrong company's data to a ticker.
        entity_trust = fin_r.get("entity_trust") if fin_r is not None else None

        # A contradiction is escapable, but only by supplying the one input that
        # decides the answer. Left to fall back on the vendor path, FCF becomes
        # `market_cap * 5%`, which makes intrinsic value ~0.76x market cap at
        # sector defaults — i.e. ~0.76x price, a "Sell, ~24% overvalued" verdict
        # for every blocked ticker regardless of the business. That number
        # encodes the heuristic, not the company, and it is worse than no answer
        # because it looks like one. Sector-default *assumptions* are fine here
        # (see /suggestions); a guessed *cash flow* is not.
        if is_contradicted(entity_trust) and fcf_override is None:
            if entity_trust.get("edgar_company_name"):
                company_name = entity_trust["edgar_company_name"]
            return {
                "ticker": ticker,
                "company_name": company_name,
                "security_type": security_type,
                "current_price": round(current_price, 2),
                "assumptions": None,
                "projections": None,
                "terminal_value": None,
                "valuation": None,
                "recommendation": None,
                "reverse_dcf": None,
                "fmp_benchmark": None,
                "entity_trust": entity_trust,
                "requires_manual_fcf": True,
            }

        # ── Extract financials from pre-fetched data ──────────────────────
        current_fcf = None
        shares_outstanding = None
        fcf_source = None
        shares_source = None
        cash_and_equivalents = None
        total_debt = None

        if fin_r is not None:
            cash_flow_data = fin_r.get("cash_flow") or {}
            income_data = fin_r.get("income_statement") or {}
            balance_sheet = fin_r.get("balance_sheet") or {}

            actual_fcf = cash_flow_data.get("free_cash_flow")
            if actual_fcf is not None:
                current_fcf = actual_fcf
                fcf_source = "actual_ttm"
            else:
                operating_cf = cash_flow_data.get("operating_cash_flow")
                if operating_cf is not None:
                    current_fcf = operating_cf
                    fcf_source = "operating_cf"

            diluted_shares = income_data.get("diluted_shares_outstanding")
            if diluted_shares is not None and diluted_shares > 0:
                shares_outstanding = diluted_shares
                shares_source = "sec_filings"

            cash_and_equivalents = balance_sheet.get("cash_and_equivalents") or balance_sheet.get("cash")
            total_debt = balance_sheet.get("total_debt") or balance_sheet.get("long_term_debt")

        # Fallback: use pre-fetched shares-float if SEC filings didn't have shares
        if shares_outstanding is None and shares_r:
            shares_outstanding = shares_r
            shares_source = "fmp_shares_float"

        # Priority 3: Market cap estimate (fallback when no filings exist)
        if current_fcf is None:
            if market_cap:
                current_fcf = market_cap * 0.05
                fcf_source = "estimated_market_cap"
            else:
                current_fcf = current_price * 1000000
                fcf_source = "estimated_price"

        # Shares outstanding final fallback
        if shares_outstanding is None:
            if market_cap and current_price > 0:
                shares_outstanding = market_cap / current_price
                shares_source = "estimated_market_cap"
            else:
                shares_outstanding = 1000000
                shares_source = "estimated_default"

        # ── User-supplied overrides ───────────────────────────────────
        # Applied after every vendor path and fallback so they always win. This
        # is the escape hatch from an identity contradiction: sector-default
        # assumptions plus figures the user read off the correct entity's own
        # filings is a legitimate rough DCF, where a guessed cash flow is not.
        # `user_supplied` also keeps the frontend's "Low Confidence — Estimated
        # Data" banner from firing, since these are not estimates.
        if fcf_override is not None:
            current_fcf = fcf_override
            fcf_source = "user_supplied"
        if shares_override is not None:
            shares_outstanding = shares_override
            shares_source = "user_supplied"

        # ── Equity bridge: Enterprise Value + Cash - Debt ─────────────
        net_debt_adjustment = 0
        has_equity_bridge = False
        if cash_and_equivalents is not None and total_debt is not None:
            net_debt_adjustment = cash_and_equivalents - total_debt
            has_equity_bridge = True

        # Forward DCF — the discounting math lives in services/dcf_service.py so
        # the reverse solver can run the identical engine instead of a copy.
        dcf = compute_dcf(
            current_fcf=current_fcf,
            growth_rate=growth_rate,
            discount_rate=discount_rate,
            terminal_growth=terminal_growth,
            projection_years=projection_years,
            shares_outstanding=shares_outstanding,
            net_debt_adjustment=net_debt_adjustment,
        )
        projected_cash_flows = dcf["projections"]
        terminal_value = dcf["terminal_value"]
        terminal_pv = dcf["terminal_pv"]
        sum_pv_cash_flows = dcf["sum_pv_cash_flows"]
        enterprise_value = dcf["enterprise_value"]
        equity_value = dcf["equity_value"]
        intrinsic_value = dcf["intrinsic_value_per_share"]

        # ── Reverse DCF: what growth rate does the current price imply? ──────
        # Runs automatically on the same inputs — no extra user parameters, and
        # no extra usage charge. Failures here must never break the forward DCF.
        try:
            reverse_dcf = calculate_reverse_dcf(
                current_price=current_price,
                fcf=current_fcf,
                discount_rate=discount_rate,
                terminal_growth=terminal_growth,
                projection_years=projection_years,
                shares=shares_outstanding,
                net_debt_adjustment=net_debt_adjustment,
                security_type=security_type,
                fcf_source=fcf_source,
            )
        except Exception as rev_err:
            print(f"⚠️ Reverse DCF failed for {ticker}: {_safe_error(rev_err)}")
            reverse_dcf = {
                "converged": False,
                "implied_growth_low": None,
                "implied_growth_mid": None,
                "implied_growth_high": None,
                "band_low": None,
                "band_high": None,
                "extreme_growth_flag": False,
                "solved_points": [],
                "reason_if_unavailable": "no_convergence",
            }


        # Calculate margin of safety
        margin_of_safety = ((intrinsic_value - current_price) / current_price) * 100
        
        # Determine recommendation
        if margin_of_safety > 20:
            recommendation = "Strong Buy"
            recommendation_color = "green"
            recommendation_message = f"Stock appears undervalued by {abs(margin_of_safety):.1f}%. Consider buying."
        elif margin_of_safety > 10:
            recommendation = "Buy"
            recommendation_color = "green"
            recommendation_message = f"Stock appears undervalued by {abs(margin_of_safety):.1f}%."
        elif margin_of_safety > -10:
            recommendation = "Hold"
            recommendation_color = "yellow"
            recommendation_message = "Stock is fairly valued. Hold current position."
        elif margin_of_safety > -20:
            recommendation = "Sell"
            recommendation_color = "red"
            recommendation_message = f"Stock appears overvalued by {abs(margin_of_safety):.1f}%."
        else:
            recommendation = "Strong Sell"
            recommendation_color = "red"
            recommendation_message = f"Stock appears significantly overvalued by {abs(margin_of_safety):.1f}%."
        
        dcf_result = {
            "ticker": ticker,
            "company_name": company_name,
            "security_type": security_type,
            "current_price": round(current_price, 2),
            "assumptions": {
                "growth_rate": growth_rate,
                "terminal_growth": terminal_growth,
                "discount_rate": discount_rate,
                "projection_years": projection_years,
                "current_fcf": round(current_fcf, 2),
                "shares_outstanding": round(shares_outstanding, 0),
                "fcf_source": fcf_source,
                "shares_source": shares_source
            },
            "projections": projected_cash_flows,
            "terminal_value": {
                "value": round(terminal_value, 2),
                "present_value": round(terminal_pv, 2),
                "growth_rate": terminal_growth
            },
            "valuation": {
                "sum_pv_cash_flows": round(sum_pv_cash_flows, 2),
                "terminal_pv": round(terminal_pv, 2),
                "enterprise_value": round(enterprise_value, 2),
                "equity_bridge": {
                    "cash": round(cash_and_equivalents, 2) if cash_and_equivalents is not None else None,
                    "debt": round(total_debt, 2) if total_debt is not None else None,
                    "net_debt_adjustment": round(net_debt_adjustment, 2),
                    "has_equity_bridge": has_equity_bridge,
                },
                "equity_value": round(equity_value, 2),
                "intrinsic_value_per_share": round(intrinsic_value, 2),
                "current_price": round(current_price, 2),
                "margin_of_safety": round(margin_of_safety, 2)
            },
            "recommendation": {
                "rating": recommendation,
                "color": recommendation_color,
                "message": recommendation_message
            },
            "reverse_dcf": reverse_dcf,
            "entity_trust": entity_trust,
            "fmp_benchmark": {
                "dcf_value": fmp_dcf.get("dcf"),
                "levered_dcf_value": fmp_dcf.get("levered_dcf"),
                "equity_value_per_share": fmp_dcf.get("equity_value_per_share"),
                "wacc": fmp_dcf.get("wacc"),
                "terminal_value": fmp_dcf.get("terminal_value"),
                "enterprise_value": fmp_dcf.get("enterprise_value"),
                "source": "FMP Discounted Cash Flow model",
            },
        }

        # Record usage only after a successful calculation
        await record_dcf_usage(current_user, db)

        return dcf_result

    except HTTPException:
        raise
    except Exception as e:
        print(f"DCF calculation error for {ticker}: {_safe_error(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Could not calculate DCF for {ticker}: {_safe_error(e)}"
        )