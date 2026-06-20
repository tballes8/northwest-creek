"""
Relative Valuation API Endpoints — peer-multiple price-target range
⭐ CASUAL TIER AND ABOVE

Operationalizes the "How to Calculate Your Own Price Target" blog post and the
verified BB_Price_Target_Model.xlsx reference. Computes a target-price *range*
via three multiple-based methods (P/E, P/S, EV/EBITDA) applied to forward
estimates, using outlier-resistant peer-MEDIAN multiples.

The output is a RANGE, not a single number — the spread between methods is the
point. P/S is the central estimate for low-earnings names; the P/E method is
flagged unreliable when the trailing multiple is extreme.
"""
import asyncio
import re
from datetime import datetime, timedelta, timezone, date
from statistics import median
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select, func as sa_func
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_user
from app.db.session import get_db
from app.db.models import User, FeatureUsage
from app.services.market_data import market_data_service
from app.services.financials_service import get_company_financials
from app.services.fmp_client import get_fmp_client, API_KEY
from app.core.tier_limits import get_tier_limit, get_review_period, get_upgrade_tier


# ── Tier gating ──────────────────────────────────────────────────────────
# Single point of change for the minimum tier that can use Relative Valuation.
RELVAL_MIN_TIER = "casual"

# Rank order for "tier >= RELVAL_MIN_TIER" comparisons.
_TIER_RANK = {"beginner": 0, "casual": 1, "active": 2, "professional": 3}


def _safe_error(e: Exception) -> str:
    """Strip API keys and sensitive params from error messages."""
    msg = str(e)
    msg = re.sub(r'apiKey=[^&\s\'"]+', 'apiKey=***', msg)
    msg = re.sub(r'api_key=[^&\s\'"]+', 'api_key=***', msg)
    msg = re.sub(r'token=[^&\s\'"]+', 'token=***', msg)
    return msg


router = APIRouter()


def require_relval_tier(current_user: User = Depends(get_current_user)) -> User:
    """Validate the user's tier is at or above RELVAL_MIN_TIER."""
    user_rank = _TIER_RANK.get(current_user.subscription_tier, -1)
    if user_rank < _TIER_RANK[RELVAL_MIN_TIER]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                f"Relative Valuation requires the {RELVAL_MIN_TIER.capitalize()} tier or "
                f"higher. Current tier: {current_user.subscription_tier.title()}."
            ),
        )
    return current_user


async def check_relval_limit(user: User, db: AsyncSession) -> int:
    """Check the user's relative-valuation usage for the current period.

    Returns the current usage count. Raises 403 if the limit is exceeded.
    """
    limit = get_tier_limit(user.subscription_tier, "relval_valuations")
    period = get_review_period(user.subscription_tier)

    now = datetime.now(timezone.utc)
    window_start = now - (timedelta(days=1) if period == "day" else timedelta(weeks=1))

    result = await db.execute(
        select(sa_func.count(FeatureUsage.id)).where(
            FeatureUsage.user_id == user.id,
            FeatureUsage.feature == "relval_valuations",
            FeatureUsage.used_at >= window_start,
        )
    )
    current_count = result.scalar() or 0

    if current_count >= limit:
        next_tier = get_upgrade_tier(user.subscription_tier)
        if next_tier:
            next_limit = get_tier_limit(next_tier, "relval_valuations")
            upgrade_msg = (
                f" Upgrade to {next_tier.capitalize()} for {next_limit} relative "
                f"valuations per {get_review_period(next_tier)}."
            )
        else:
            upgrade_msg = ""

        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "message": (
                    f"Relative valuation limit reached. "
                    f"{user.subscription_tier.capitalize()} tier allows {limit} per {period}."
                    f"{upgrade_msg}"
                ),
                "current_usage": current_count,
                "max_usage": limit,
                "period": period,
            },
        )

    return current_count


async def record_relval_usage(user: User, db: AsyncSession) -> None:
    """Record a relative-valuation usage event."""
    db.add(FeatureUsage(user_id=user.id, feature="relval_valuations"))
    await db.commit()


# ── Forward estimates (mirrors stocks.py:get_analyst_estimates) ──────────
async def _fetch_forward_estimates(ticker: str) -> Dict[str, Any]:
    """Fetch forward EPS / revenue / EBITDA consensus from FMP analyst-estimates.

    Picks the first estimate row whose fiscal year is >= the current year so the
    figures are genuinely forward-looking. Returns empty dict values on failure.
    """
    out: Dict[str, Any] = {
        "forward_eps": None,
        "forward_revenue": None,
        "forward_ebitda": None,
        "estimate_year": None,
    }
    try:
        client = get_fmp_client()
        resp = await client.get(
            "analyst-estimates",
            params={"symbol": ticker, "apikey": API_KEY, "limit": 4},
        )
        resp.raise_for_status()
        data = resp.json()
        if isinstance(data, list) and data:
            current_year = date.today().year
            for entry in data:
                try:
                    entry_year = int(str(entry.get("date", ""))[:4])
                except (ValueError, TypeError):
                    continue
                if entry_year >= current_year:
                    out["forward_eps"] = entry.get("estimatedEpsAvg")
                    out["forward_revenue"] = entry.get("estimatedRevenueAvg")
                    out["forward_ebitda"] = entry.get("estimatedEbitdaAvg")
                    out["estimate_year"] = entry_year
                    break
    except Exception as e:
        print(f"⚠️ Forward estimates fetch failed for {ticker}: {_safe_error(e)}")
    return out


@router.get("/inputs/{ticker}")
async def get_relval_inputs(
    ticker: str,
    current_user: User = Depends(require_relval_tier),
):
    """
    🔒 CASUAL+ — Pre-filled, user-editable inputs for the Relative Valuation model.

    Each value carries a `source` tag so the UI can badge it:
      - "estimate" → analyst consensus (forward-looking)
      - "actual"   → from filings (balance sheet / income statement)
      - "live"     → live quote
      - None       → no data; user must supply it
    """
    sym = ticker.upper().strip()
    try:
        quote, company, fin, estimates = await asyncio.gather(
            market_data_service.get_quote(sym),
            market_data_service.get_company_info(sym),
            get_company_financials(sym),
            _fetch_forward_estimates(sym),
            return_exceptions=True,
        )

        if isinstance(quote, BaseException):
            quote = {}
        if isinstance(company, BaseException):
            company = {}
        if isinstance(fin, BaseException):
            fin = {}
        if isinstance(estimates, BaseException):
            estimates = {}

        current_price = None
        try:
            cp = float(quote.get("price", 0)) if quote else 0
            current_price = cp if cp > 0 else None
        except (TypeError, ValueError):
            current_price = None

        income = (fin or {}).get("income_statement") or {}
        balance = (fin or {}).get("balance_sheet") or {}
        ratios = (fin or {}).get("ratios") or {}
        company_name = (fin or {}).get("company_name") or sym

        fwd_eps = estimates.get("forward_eps")
        fwd_rev = estimates.get("forward_revenue")
        fwd_ebitda = estimates.get("forward_ebitda")

        # Net debt (in $B). Prefer the explicit net_debt field, else total_debt - cash.
        net_debt = balance.get("net_debt")
        if net_debt is None:
            total_debt = balance.get("total_debt")
            cash = balance.get("cash_and_equivalents")
            if total_debt is not None and cash is not None:
                net_debt = total_debt - cash

        diluted_shares = income.get("diluted_shares_outstanding")

        def _to_b(val):
            return round(val / 1e9, 4) if val is not None else None

        def _to_m(val):
            return round(val / 1e6, 4) if val is not None else None

        return {
            "ticker": sym,
            "company_name": (company or {}).get("name") or company_name,
            "sector": (company or {}).get("sector"),
            "industry": (company or {}).get("industry"),
            "estimate_year": estimates.get("estimate_year"),
            "inputs": {
                "forward_eps": round(fwd_eps, 4) if fwd_eps is not None else None,
                "forward_revenue_b": _to_b(fwd_rev),
                "forward_ebitda_b": _to_b(fwd_ebitda),
                "net_debt_b": _to_b(net_debt),
                "diluted_shares_m": _to_m(diluted_shares),
                "current_price": round(current_price, 2) if current_price else None,
            },
            "sources": {
                "forward_eps": "estimate" if fwd_eps is not None else None,
                "forward_revenue_b": "estimate" if fwd_rev is not None else None,
                "forward_ebitda_b": "estimate" if fwd_ebitda is not None else None,
                "net_debt_b": "actual" if net_debt is not None else None,
                "diluted_shares_m": "actual" if diluted_shares is not None else None,
                "current_price": "live" if current_price else None,
            },
            "trailing_pe": ratios.get("pe_ratio"),
        }

    except Exception as e:
        print(f"Relval inputs error for {sym}: {_safe_error(e)}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Could not load relative-valuation inputs for {sym}: {_safe_error(e)}",
        )


# ── Peer ratios ──────────────────────────────────────────────────────────
class PeerRatiosBody(BaseModel):
    tickers: List[str] = Field(..., min_length=1, max_length=30)


async def _fetch_peer_ratio(sym: str) -> Dict[str, Any]:
    """Fetch one peer's TTM P/E, P/S, EV/EBITDA plus name/sector/industry.

    Uses the same FMP fields the Financials page reads. Missing multiples are
    returned as None so the UI can render "—" and the median can skip them.
    """
    row: Dict[str, Any] = {
        "ticker": sym,
        "name": None,
        "sector": None,
        "industry": None,
        "pe": None,
        "ps": None,
        "ev_ebitda": None,
    }
    try:
        client = get_fmp_client()
        ratios_resp, profile_resp = await asyncio.gather(
            client.get("ratios-ttm", params={"symbol": sym, "apikey": API_KEY}),
            client.get("profile", params={"symbol": sym, "apikey": API_KEY}),
            return_exceptions=True,
        )

        if not isinstance(ratios_resp, BaseException):
            ratios_resp.raise_for_status()
            rd = ratios_resp.json()
            if isinstance(rd, list) and rd:
                r = rd[0]
                row["pe"] = r.get("priceToEarningsRatioTTM")
                row["ps"] = r.get("priceToSalesRatioTTM")
                row["ev_ebitda"] = r.get("enterpriseValueMultipleTTM") or r.get("evToEBITDATTM")

        if not isinstance(profile_resp, BaseException):
            profile_resp.raise_for_status()
            pd = profile_resp.json()
            if isinstance(pd, list) and pd:
                p = pd[0]
                row["name"] = p.get("companyName")
                row["sector"] = p.get("sector")
                row["industry"] = p.get("industry")
    except Exception as e:
        print(f"⚠️ Peer ratio fetch failed for {sym}: {_safe_error(e)}")
    return row


@router.post("/peer-ratios")
async def get_peer_ratios(
    body: PeerRatiosBody,
    current_user: User = Depends(require_relval_tier),
):
    """
    🔒 CASUAL+ — TTM P/E, P/S, EV/EBITDA for a list of peer tickers.

    The user pulls comps (via the screener or manual entry), reviews the per-peer
    multiples, and hand-cuts bad comps before medians are computed client-side.
    """
    # De-dupe, normalize, preserve order.
    seen = set()
    syms: List[str] = []
    for t in body.tickers:
        s = (t or "").upper().strip()
        if s and s not in seen:
            seen.add(s)
            syms.append(s)

    if not syms:
        raise HTTPException(status_code=400, detail="No valid tickers provided.")

    peers = await asyncio.gather(*(_fetch_peer_ratio(s) for s in syms))
    return {"peers": list(peers)}


# ── Calculate ────────────────────────────────────────────────────────────
class CalculateBody(BaseModel):
    fwd_eps: float
    fwd_revenue_b: float = Field(..., description="Forward revenue in $B")
    fwd_ebitda_b: float = Field(..., description="Forward EBITDA in $B")
    net_debt_b: float = Field(..., description="Net debt in $B (positive = net debt)")
    diluted_shares_m: float = Field(..., gt=0, description="Diluted shares in millions")
    current_price: Optional[float] = None
    median_pe: float
    median_ps: float
    median_ev_ebitda: float
    trailing_pe: Optional[float] = None


# Sensitivity grid steps applied to the P/S target.
_SENS_STEPS = [-0.10, -0.05, 0.0, 0.05, 0.10]


def compute_relative_valuation(b: CalculateBody) -> Dict[str, Any]:
    """Pure relative-valuation engine — matches BB_Price_Target_Model.xlsx exactly.

    All $ amounts in $B; shares in millions. `× 1000` converts $B equity → $M so
    that `$M / shares_M = $/share`.
    """
    shares_m = b.diluted_shares_m

    # P/E: target = median P/E × forward EPS
    pe_target = b.median_pe * b.fwd_eps

    # P/S: equity_$B = median P/S × fwd revenue_$B ; per-share = equity × 1000 / shares_M
    ps_equity_b = b.median_ps * b.fwd_revenue_b
    ps_target = ps_equity_b * 1000 / shares_m

    # EV/EBITDA: EV_$B = median × fwd EBITDA_$B ; equity = EV − net debt ; per-share
    ev_b = b.median_ev_ebitda * b.fwd_ebitda_b
    ev_equity_b = ev_b - b.net_debt_b  # the net-debt subtraction people skip
    ev_target = ev_equity_b * 1000 / shares_m

    targets = {
        "pe": round(pe_target, 2),
        "ps": round(ps_target, 2),
        "ev_ebitda": round(ev_target, 2),
    }
    target_values = [pe_target, ps_target, ev_target]
    range_low = round(min(target_values), 2)
    range_high = round(max(target_values), 2)

    # P/E method reliability — extreme trailing multiple or near-zero forward EPS.
    pe_method_reliable = True
    pe_warning = None
    if b.trailing_pe is not None and b.trailing_pe > 50:
        pe_method_reliable = False
        pe_warning = (
            f"Trailing P/E of {b.trailing_pe:.0f}× is extreme — the P/E method is "
            f"unreliable for this name. Lean on the P/S estimate instead."
        )
    elif abs(b.fwd_eps) <= 0.01:
        pe_method_reliable = False
        pe_warning = (
            "Forward EPS is near zero — the P/E method is unreliable for low-earnings "
            "names. Lean on the P/S estimate instead."
        )

    # ±10% sensitivity grid on the P/S target (rows = revenue, cols = P/S multiple).
    sensitivity = {
        "revenue_steps": _SENS_STEPS,
        "multiple_steps": _SENS_STEPS,
        "rows": [],
    }
    for rev_step in _SENS_STEPS:
        rev_adj = b.fwd_revenue_b * (1 + rev_step)
        cells = []
        for mult_step in _SENS_STEPS:
            ps_adj = b.median_ps * (1 + mult_step)
            cell = (ps_adj * rev_adj) * 1000 / shares_m
            cells.append(round(cell, 2))
        sensitivity["rows"].append({"revenue_step": rev_step, "cells": cells})

    upside_pct = None
    if b.current_price and b.current_price > 0:
        mid = (range_low + range_high) / 2
        upside_pct = round((mid - b.current_price) / b.current_price * 100, 1)

    return {
        "targets": targets,
        "central_estimate": "ps",  # P/S is the central estimate for low-earnings names
        "range": {"low": range_low, "high": range_high},
        "current_price": b.current_price,
        "upside_to_midpoint_pct": upside_pct,
        "pe_method_reliable": pe_method_reliable,
        "pe_warning": pe_warning,
        "sensitivity": sensitivity,
        "disclaimer": (
            "This is a valuation RANGE, not a guaranteed price target. It reflects what "
            "the market currently pays for comparable companies applied to forward "
            "estimates — assumptions you should pressure-test yourself."
        ),
    }


@router.post("/calculate")
async def calculate_relval(
    body: CalculateBody,
    current_user: User = Depends(require_relval_tier),
    db: AsyncSession = Depends(get_db),
):
    """
    🔒 CASUAL+ — Compute the peer-multiple price-target range (usage-tracked).

    Accepts the peer-MEDIAN multiples directly (medians are computed client-side as
    the user cuts bad comps). Returns the three method targets, the MIN/MAX range,
    the P/E-reliability flag, and a ±10% sensitivity grid on the P/S target.
    """
    await check_relval_limit(current_user, db)

    try:
        result = compute_relative_valuation(body)
    except ZeroDivisionError:
        raise HTTPException(status_code=400, detail="Diluted shares must be greater than zero.")
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=f"Could not compute relative valuation: {_safe_error(e)}",
        )

    await record_relval_usage(current_user, db)
    return result
