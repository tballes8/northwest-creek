import math
from typing import Literal, Optional
from datetime import timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select, func, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_user
from app.core.tier_limits import get_tier_limit
from app.db.models import SavedScreen, StockSnapshot, User
from app.db.session import get_db

router = APIRouter()

# Dividend yield is derived, not stored: annual dividend $ ÷ current price, so it tracks
# the 15-min quote refresh rather than freezing at fetch time.
#
# Sourced from `dividend_annual`, which holds the output of market_data.evaluate_dividend()
# written by the daily rebuild — NOT from `last_annual_dividend`, FMP's raw trailing figure.
# That raw column carries no ex-date, so a payer that stopped kept annualizing against a
# collapsed price (NFE reported ~124%). A suspended payer now has dividend_annual = NULL and
# so reads as 0%, with `dividend_status` on the row saying why.
#
# coalesce(dividend, 0) so non-payers read as 0% (a "max yield" screen includes them,
# a "min yield" screen excludes them); nullif guards the rare zero/NULL price.
DIV_YIELD_EXPR = (
    func.coalesce(StockSnapshot.dividend_annual, 0)
    / func.nullif(StockSnapshot.price, 0)
    * 100
)

# Relative volume: today's volume against a normal full day. avg_volume comes from
# /stable/profile on the daily rebuild (see refresh_stock_snapshots._update_company_profiles).
#
# Derived in SQL, not in _passes_derived, so an RVOL screen stays a pushdown WHERE instead
# of loading the whole table into Python the way the pct_from_52wk/gap filters do.
#
# NULL semantics differ deliberately from DIV_YIELD_EXPR: there is no coalesce to 0 here.
# A missing avg_volume means "unknown", not "no relative volume" — nullif makes the quotient
# NULL, and a NULL fails both >= and <=, so unknown-volume rows drop out of any RVOL screen
# rather than being scored as zero.
#
# Read it as "share of an average day traded so far": mid-session a normal day sits well
# below 1.0 and climbs toward it by the close, so RVOL >= 1 means a full average day's
# volume is already done — unusual at any hour, and the reason the presets below key off 1.0
# rather than a multiple that only becomes reachable late in the session.
RVOL_EXPR = StockSnapshot.volume / func.nullif(StockSnapshot.avg_volume, 0)

SORTABLE = {
    "price", "market_cap", "change_percentage", "volume",
    "price_avg_50", "price_avg_200", "symbol", "name", "dividend_yield", "beta",
    "avg_volume", "rvol",
}

SORT_COL = {
    "price": StockSnapshot.price,
    "market_cap": StockSnapshot.market_cap,
    "change_percentage": StockSnapshot.change_percentage,
    "volume": StockSnapshot.volume,
    "price_avg_50": StockSnapshot.price_avg_50,
    "price_avg_200": StockSnapshot.price_avg_200,
    "symbol": StockSnapshot.symbol,
    "name": StockSnapshot.name,
    "dividend_yield": DIV_YIELD_EXPR,
    "beta": StockSnapshot.beta,
    "avg_volume": StockSnapshot.avg_volume,
    "rvol": RVOL_EXPR,
}


class NumericRange(BaseModel):
    min: Optional[float] = None
    max: Optional[float] = None


class ScreenerCriteria(BaseModel):
    price: Optional[NumericRange] = None
    market_cap: Optional[NumericRange] = None
    change_percentage: Optional[NumericRange] = None
    volume: Optional[NumericRange] = None
    price_avg_50: Optional[NumericRange] = None
    price_avg_200: Optional[NumericRange] = None
    dividend_yield: Optional[NumericRange] = None  # percent, e.g. min 3 = ≥3% yield
    beta: Optional[NumericRange] = None  # e.g. max 1 = defensive, min 1.5 = high-beta
    exchange: Optional[list[str]] = None

    pct_from_52wk_high: Optional[NumericRange] = None
    pct_from_52wk_low: Optional[NumericRange] = None
    dollar_volume: Optional[NumericRange] = None
    gap_percent: Optional[NumericRange] = None
    # Relative volume, e.g. min 1 = an average day's volume already traded. See RVOL_EXPR.
    rvol: Optional[NumericRange] = None

    golden_cross: Optional[bool] = None
    death_cross: Optional[bool] = None
    price_above_50ma: Optional[bool] = None
    price_above_200ma: Optional[bool] = None
    squeeze_on: Optional[bool] = None
    squeeze_fired_within_days: Optional[int] = None
    squeeze_min_bars: Optional[int] = None
    squeeze_max_ratio: Optional[float] = None
    exclude_etfs: bool = True

    # Industry and sector filters
    sector: Optional[list[str]] = None
    industry: Optional[list[str]] = None
    keywords: Optional[str] = None  # Keywords to search in description

    page: int = Field(1, ge=1)
    page_size: int = Field(50, ge=1, le=200)
    sort_by: str = "market_cap"
    sort_desc: bool = True


def _f(val) -> Optional[float]:
    return float(val) if val is not None else None


def _build_row(row: StockSnapshot) -> dict:
    price = _f(row.price)
    year_high = _f(row.year_high)
    year_low = _f(row.year_low)
    volume = _f(row.volume)
    avg_vol = _f(row.avg_volume)
    open_p = _f(row.open_price)
    prev_c = _f(row.previous_close)

    pct_from_high = (
        round((price - year_high) / year_high * 100, 2)
        if price and year_high else None
    )
    pct_from_low = (
        round((price - year_low) / year_low * 100, 2)
        if price and year_low else None
    )
    dollar_vol = round(price * volume, 2) if price and volume else None
    gap_pct = round((open_p - prev_c) / prev_c * 100, 2) if open_p and prev_c else None

    # Gated figure — NULL for a suspended or unannualizable payer, so they show no yield
    # rather than a stale one. dividend_status below tells the UI which case it is.
    annual_div = _f(row.dividend_annual)
    # None (—) for non-payers; only payers get a yield number shown in the table.
    div_yield = round(annual_div / price * 100, 2) if annual_div and price else None

    ts = row.last_refreshed
    if ts and ts.tzinfo is None:
        ts = ts.replace(tzinfo=timezone.utc)

    return {
        "symbol": row.symbol,
        "name": row.name,
        "price": price,
        "change_percentage": _f(row.change_percentage),
        "volume": _f(row.volume),
        "market_cap": _f(row.market_cap),
        "day_high": _f(row.day_high),
        "day_low": _f(row.day_low),
        "year_high": year_high,
        "year_low": year_low,
        "price_avg_50": _f(row.price_avg_50),
        "price_avg_200": _f(row.price_avg_200),
        "exchange": row.exchange,
        "pct_from_52wk_high": pct_from_high,
        "pct_from_52wk_low": pct_from_low,
        "dollar_volume": dollar_vol,
        "gap_percent": gap_pct,
        "avg_volume": avg_vol,
        # Mirrors RVOL_EXPR — None when avg_volume is unknown, matching the SQL filter's
        # behaviour rather than showing a fabricated 0.
        "rvol": round(volume / avg_vol, 2) if volume and avg_vol else None,
        "dividend_yield": div_yield,
        "dividend_status": row.dividend_status,
        "beta": _f(row.beta),
        "last_refreshed": ts.isoformat() if ts else None,
        "is_etf": row.is_etf,
        "squeeze_state": row.squeeze_state,
        "squeeze_bars": row.squeeze_bars,
        "squeeze_ratio": _f(row.squeeze_ratio),
    }


def _passes_derived(row_dict: dict, c: ScreenerCriteria) -> bool:
    def check_range(val, rng: Optional[NumericRange]) -> bool:
        if rng is None:
            return True
        if val is None:
            return False
        if rng.min is not None and val < rng.min:
            return False
        if rng.max is not None and val > rng.max:
            return False
        return True

    return (
        check_range(row_dict["pct_from_52wk_high"], c.pct_from_52wk_high)
        and check_range(row_dict["pct_from_52wk_low"], c.pct_from_52wk_low)
        and check_range(row_dict["dollar_volume"], c.dollar_volume)
        and check_range(row_dict["gap_percent"], c.gap_percent)
    )


@router.post("/run")
async def run_screener(
    criteria: ScreenerCriteria,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    conditions = []

    def add_range(col, rng: Optional[NumericRange]):
        if rng is None:
            return
        if rng.min is not None:
            conditions.append(col >= rng.min)
        if rng.max is not None:
            conditions.append(col <= rng.max)

    add_range(StockSnapshot.price, criteria.price)
    add_range(StockSnapshot.market_cap, criteria.market_cap)
    add_range(StockSnapshot.change_percentage, criteria.change_percentage)
    add_range(StockSnapshot.volume, criteria.volume)
    add_range(StockSnapshot.price_avg_50, criteria.price_avg_50)
    add_range(StockSnapshot.price_avg_200, criteria.price_avg_200)
    add_range(DIV_YIELD_EXPR, criteria.dividend_yield)
    add_range(StockSnapshot.beta, criteria.beta)
    add_range(RVOL_EXPR, criteria.rvol)

    if criteria.exchange:
        conditions.append(StockSnapshot.exchange.in_(criteria.exchange))

    # Add sector filter
    if criteria.sector:
        conditions.append(StockSnapshot.sector.in_(criteria.sector))

    # Add industry filter
    if criteria.industry:
        conditions.append(StockSnapshot.industry.in_(criteria.industry))

    # Add keyword search in description
    if criteria.keywords:
        # Use ILIKE for simple keyword matching
        keyword_pattern = f"%{criteria.keywords}%"
        conditions.append(
            or_(
                StockSnapshot.description.ilike(keyword_pattern),
                StockSnapshot.industry.ilike(keyword_pattern),
                StockSnapshot.sector.ilike(keyword_pattern),
            )
        )

    if criteria.golden_cross is True:
        conditions.append(StockSnapshot.price_avg_50 > StockSnapshot.price_avg_200)
        conditions.append(StockSnapshot.price_avg_50.isnot(None))
        conditions.append(StockSnapshot.price_avg_200.isnot(None))
    elif criteria.golden_cross is False:
        conditions.append(
            or_(
                StockSnapshot.price_avg_50 <= StockSnapshot.price_avg_200,
                StockSnapshot.price_avg_50.is_(None),
                StockSnapshot.price_avg_200.is_(None),
            )
        )

    if criteria.death_cross is True:
        conditions.append(StockSnapshot.price_avg_50 < StockSnapshot.price_avg_200)
        conditions.append(StockSnapshot.price_avg_50.isnot(None))
        conditions.append(StockSnapshot.price_avg_200.isnot(None))

    if criteria.price_above_50ma is True:
        conditions.append(StockSnapshot.price > StockSnapshot.price_avg_50)
        conditions.append(StockSnapshot.price_avg_50.isnot(None))
    elif criteria.price_above_50ma is False:
        conditions.append(
            or_(
                StockSnapshot.price <= StockSnapshot.price_avg_50,
                StockSnapshot.price_avg_50.is_(None),
            )
        )

    if criteria.price_above_200ma is True:
        conditions.append(StockSnapshot.price > StockSnapshot.price_avg_200)
        conditions.append(StockSnapshot.price_avg_200.isnot(None))
    elif criteria.price_above_200ma is False:
        conditions.append(
            or_(
                StockSnapshot.price <= StockSnapshot.price_avg_200,
                StockSnapshot.price_avg_200.is_(None),
            )
        )

    if criteria.squeeze_on is True:
        conditions.append(StockSnapshot.squeeze_state == 'on')
    elif criteria.squeeze_on is False:
        conditions.append(
            or_(
                StockSnapshot.squeeze_state != 'on',
                StockSnapshot.squeeze_state.is_(None),
            )
        )

    if criteria.squeeze_fired_within_days is not None:
        conditions.append(StockSnapshot.squeeze_state == 'fired')
        conditions.append(StockSnapshot.squeeze_bars <= criteria.squeeze_fired_within_days)

    if criteria.squeeze_min_bars is not None:
        conditions.append(StockSnapshot.squeeze_state == 'on')
        conditions.append(StockSnapshot.squeeze_bars >= criteria.squeeze_min_bars)

    if criteria.squeeze_max_ratio is not None:
        conditions.append(StockSnapshot.squeeze_ratio.isnot(None))
        conditions.append(StockSnapshot.squeeze_ratio <= criteria.squeeze_max_ratio)

    if criteria.exclude_etfs:
        conditions.append(
            or_(StockSnapshot.is_etf.is_(None), StockSnapshot.is_etf == False)
        )

    sort_col = SORT_COL.get(criteria.sort_by, StockSnapshot.market_cap)
    order = sort_col.desc().nulls_last() if criteria.sort_desc else sort_col.asc().nulls_last()

    has_derived = any([
        criteria.pct_from_52wk_high,
        criteria.pct_from_52wk_low,
        criteria.dollar_volume,
        criteria.gap_percent,
    ])

    base_q = select(StockSnapshot)
    if conditions:
        base_q = base_q.where(and_(*conditions))

    if has_derived:
        rows_result = await db.execute(base_q.order_by(order))
        all_rows = rows_result.scalars().all()
        all_dicts = [_build_row(r) for r in all_rows]
        filtered = [d for d in all_dicts if _passes_derived(d, criteria)]
        total = len(filtered)
        offset = (criteria.page - 1) * criteria.page_size
        page_dicts = filtered[offset: offset + criteria.page_size]
    else:
        count_q = select(func.count(StockSnapshot.id))
        if conditions:
            count_q = count_q.where(and_(*conditions))
        count_result = await db.execute(count_q)
        total = count_result.scalar() or 0

        offset = (criteria.page - 1) * criteria.page_size
        rows_result = await db.execute(
            base_q.order_by(order).offset(offset).limit(criteria.page_size)
        )
        page_dicts = [_build_row(r) for r in rows_result.scalars().all()]

    data_as_of = None
    if page_dicts:
        data_as_of = page_dicts[0]["last_refreshed"]

    return {
        "results": page_dicts,
        "total": total,
        "page": criteria.page,
        "page_size": criteria.page_size,
        "total_pages": math.ceil(total / criteria.page_size) if total else 0,
        "data_as_of": data_as_of,
    }


_PRESETS = [
    {
        "id": "near_52wk_high",
        "name": "Near 52-Week High",
        "description": "Stocks trading within 10% of their 52-week high with market cap above $1B",
        "criteria": {
            "pct_from_52wk_high": {"min": -10},
            "market_cap": {"min": 1_000_000_000},
            "sort_by": "market_cap",
            "sort_desc": True,
        },
    },
    {
        "id": "oversold_quality",
        "name": "Oversold Quality",
        "description": "Large-cap stocks near 52-week lows but still trading above their 200-day MA",
        "criteria": {
            "pct_from_52wk_low": {"max": 15},
            "price_above_200ma": True,
            "market_cap": {"min": 500_000_000},
            "sort_by": "market_cap",
            "sort_desc": True,
        },
    },
    {
        "id": "golden_cross",
        "name": "Golden Cross",
        "description": "Stocks where the 50-day MA has crossed above the 200-day MA and price is above both",
        "criteria": {
            "golden_cross": True,
            "price_above_50ma": True,
            "market_cap": {"min": 500_000_000},
            "sort_by": "market_cap",
            "sort_desc": True,
        },
    },
    {
        "id": "high_volume_breakout",
        "name": "High Volume Breakout",
        "description": (
            "Stocks up 3%+ today that have already traded a full average day's volume, "
            "with at least $50M in dollar volume"
        ),
        "criteria": {
            "change_percentage": {"min": 3},
            # Dollar volume stays as the tradability floor; RVOL is what makes the
            # participation actually unusual rather than just large.
            "dollar_volume": {"min": 50_000_000},
            "rvol": {"min": 1},
            "market_cap": {"min": 200_000_000},
            "sort_by": "rvol",
            "sort_desc": True,
        },
    },
    {
        "id": "unusual_volume",
        "name": "Unusual Volume",
        "description": (
            "Stocks that have already traded 2x an average day's volume — direction-agnostic, "
            "so it catches accumulation and capitulation alike"
        ),
        "criteria": {
            "rvol": {"min": 2},
            "market_cap": {"min": 200_000_000},
            "sort_by": "rvol",
            "sort_desc": True,
        },
    },
    {
        "id": "momentum_leaders",
        "name": "Momentum Leaders",
        "description": "Large-cap stocks trading above both moving averages with positive momentum today",
        "criteria": {
            "price_above_50ma": True,
            "price_above_200ma": True,
            "change_percentage": {"min": 0.5},
            "market_cap": {"min": 1_000_000_000},
            "sort_by": "market_cap",
            "sort_desc": True,
        },
    },
    {
        "id": "near_52wk_low",
        "name": "Near 52-Week Low",
        "description": "Stocks trading within 10% of their 52-week low — contrarian and value hunter territory",
        "criteria": {
            "pct_from_52wk_low": {"max": 10},
            "market_cap": {"min": 1_000_000_000},
            "sort_by": "market_cap",
            "sort_desc": True,
        },
    },
    {
        "id": "death_cross",
        "name": "Death Cross",
        "description": "Stocks where the 50-day MA has crossed below the 200-day MA — bearish technical signal",
        "criteria": {
            "death_cross": True,
            "market_cap": {"min": 500_000_000},
            "sort_by": "market_cap",
            "sort_desc": True,
        },
    },
    {
        "id": "gap_up",
        "name": "Gap Up (2%+)",
        "description": "Stocks that opened at least 2% above the prior close — momentum and catalyst plays",
        "criteria": {
            "gap_percent": {"min": 2},
            "market_cap": {"min": 200_000_000},
            "sort_by": "change_percentage",
            "sort_desc": True,
        },
    },
    {
        "id": "gap_down",
        "name": "Gap Down (2%+)",
        "description": "Stocks that opened at least 2% below the prior close — potential reversals or continued selling",
        "criteria": {
            "gap_percent": {"max": -2},
            "market_cap": {"min": 200_000_000},
            "sort_by": "change_percentage",
            "sort_desc": False,
        },
    },
    {
        "id": "dividend_income",
        "name": "Dividend Income",
        "description": "Established companies yielding 3%+ with a market cap above $2B — a starting universe for income investors.",
        "criteria": {
            "dividend_yield": {"min": 3},
            "market_cap": {"min": 2_000_000_000},
            "sort_by": "dividend_yield",
            "sort_desc": True,
        },
    },
    {
        "id": "in_squeeze",
        "name": "In Squeeze",
        "description": "Volatility is coiling — Bollinger Bands are inside the Keltner Channels. A breakout often follows.",
        "criteria": {
            "squeeze_on": True,
            "market_cap": {"min": 250_000_000},
            "sort_by": "market_cap",
            "sort_desc": True,
        },
    },
    {
        "id": "squeeze_fired",
        "name": "Squeeze Fired (3d)",
        "description": "A volatility squeeze released in the last 3 trading days — potential breakout underway.",
        "criteria": {
            "squeeze_fired_within_days": 3,
            "market_cap": {"min": 250_000_000},
            "sort_by": "market_cap",
            "sort_desc": True,
        },
    },
]


@router.get("/filter-options")
async def get_filter_options(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Distinct sectors and their industries present in the snapshot universe.

    Drives the screener's Sector / Industry dropdowns so the UI only ever offers
    values that actually exist in the data — picking one always returns matches.
    """
    result = await db.execute(
        select(StockSnapshot.sector, StockSnapshot.industry)
        .where(StockSnapshot.sector.isnot(None))
        .distinct()
    )
    by_sector: dict[str, set] = {}
    for sector, industry in result.all():
        if not sector:
            continue
        bucket = by_sector.setdefault(sector, set())
        if industry:
            bucket.add(industry)
    return {
        "sectors": sorted(by_sector.keys()),
        "industries_by_sector": {s: sorted(v) for s, v in by_sector.items()},
    }


@router.get("/presets")
async def get_presets():
    return {"presets": _PRESETS}


SavedKind = Literal["screener", "search"]


class SaveScreenBody(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    criteria: dict
    # "screener" = screener filter payload; "search" = Stock Search keyword query.
    kind: SavedKind = "screener"


def _serialize_saved(s: SavedScreen) -> dict:
    ts = s.created_at
    if ts and ts.tzinfo is None:
        ts = ts.replace(tzinfo=timezone.utc)
    return {
        "id": str(s.id),
        "name": s.name,
        "kind": s.kind or "screener",
        "criteria": s.criteria,
        "created_at": ts.isoformat() if ts else None,
    }


@router.post("/saved", status_code=201)
async def save_screen(
    body: SaveScreenBody,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if body.kind == "search":
        query = (body.criteria or {}).get("query")
        if not isinstance(query, str) or not query.strip():
            raise HTTPException(status_code=422, detail="criteria.query is required for a saved search")
        if len(query) > 200:
            raise HTTPException(status_code=422, detail="Search query is too long (200 characters max)")
        body.criteria = {"query": query.strip()}

    tier = current_user.subscription_tier or "beginner"
    limit = get_tier_limit(tier, "saved_screens")
    # Screens and searches draw from one shared allowance, so the count is unfiltered by kind.
    count_result = await db.execute(
        select(func.count(SavedScreen.id)).where(SavedScreen.user_id == current_user.id)
    )
    count = count_result.scalar() or 0
    if count >= limit:
        noun = "search" if body.kind == "search" else "screen"
        raise HTTPException(
            status_code=403,
            detail=(
                f"Saved screen limit reached ({limit} for {tier} plan) — saved screens and "
                f"searches share this limit. Upgrade to save more than {limit}."
                if limit
                else f"Saving a {noun} is not available on the {tier} plan. Upgrade to save screens and searches."
            ),
        )
    screen = SavedScreen(
        user_id=current_user.id,
        name=body.name.strip(),
        kind=body.kind,
        criteria=body.criteria,
    )
    db.add(screen)
    await db.commit()
    await db.refresh(screen)
    return _serialize_saved(screen)


@router.get("/saved")
async def get_saved_screens(
    kind: SavedKind = "screener",
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Rows predating the kind column are NULL and belong to the screener tab.
    kind_filter = (
        or_(SavedScreen.kind == "screener", SavedScreen.kind.is_(None))
        if kind == "screener"
        else SavedScreen.kind == kind
    )
    result = await db.execute(
        select(SavedScreen)
        .where(SavedScreen.user_id == current_user.id, kind_filter)
        .order_by(SavedScreen.created_at.desc())
    )
    return {"screens": [_serialize_saved(s) for s in result.scalars().all()]}


@router.delete("/saved/{screen_id}", status_code=204)
async def delete_saved_screen(
    screen_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(SavedScreen).where(
            SavedScreen.id == screen_id,
            SavedScreen.user_id == current_user.id,
        )
    )
    screen = result.scalar_one_or_none()
    if not screen:
        raise HTTPException(status_code=404, detail="Screen not found")
    await db.delete(screen)
    await db.commit()
