import math
from typing import Literal, Optional
from datetime import date, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select, func, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import load_only

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
    # ETF-mode columns. A sort key missing from this map falls back silently to
    # market_cap below, so the arrow flips while the order does not change — which
    # reads as a broken sort rather than an error. Anything the UI offers as a
    # sortable header must be here.
    "expense_ratio": StockSnapshot.expense_ratio,
    "aum": StockSnapshot.aum,
    "holdings_count": StockSnapshot.holdings_count,
    "nav": StockSnapshot.nav,
    "inception_date": StockSnapshot.inception_date,
}

# Default sort per universe. ETF mode cannot default to market_cap: batch-quote is
# sparse on marketCap for funds, so with .nulls_last() the result order would be
# effectively arbitrary. Applied only when the caller did not choose a sort, so a
# saved screen written before ETF mode still gets a sensible default for its universe.
_DEFAULT_SORT = {"stocks": "market_cap", "etfs": "aum", "all": "market_cap"}


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

    # Which slice of stock_snapshots to screen — the Stocks|ETFs mode toggle.
    universe: Literal["stocks", "etfs", "all"] = "stocks"
    # DEPRECATED, superseded by `universe`. Kept because saved screens written before
    # ETF mode carry it in their JSONB criteria, and RelativeValuation.tsx still sends
    # exclude_etfs: true when pulling peers. Optional[bool] rather than the old
    # `bool = True` so "not sent" stays distinguishable from "sent as false" —
    # _resolve_universe depends on that distinction.
    exclude_etfs: Optional[bool] = None

    # ETF-only filters. Null on common stock, so applying one in stock mode would
    # return nothing — the frontend omits them outside ETF mode and so does
    # _resolve_universe's caller. expense_ratio is a percent (max 0.10 = a fee of
    # 0.10% or less); see market_data.normalize_expense_ratio for the unit.
    expense_ratio: Optional[NumericRange] = None
    aum: Optional[NumericRange] = None          # raw $, from etf/info
    holdings_count: Optional[NumericRange] = None
    asset_class: Optional[list[str]] = None     # Equity | Fixed Income | Commodity | ...
    etf_company: Optional[list[str]] = None     # issuer
    # "at least N years since inception". Sent as a count of years rather than a cutoff
    # date so the date arithmetic stays server-side — one fewer timezone off-by-one.
    min_age_years: Optional[float] = None

    # Industry and sector filters
    sector: Optional[list[str]] = None
    industry: Optional[list[str]] = None
    keywords: Optional[str] = None  # Keywords to search in description

    page: int = Field(1, ge=1)
    page_size: int = Field(50, ge=1, le=200)
    sort_by: str = "market_cap"
    sort_desc: bool = True


def _resolve_universe(c: "ScreenerCriteria") -> str:
    """Which slice of stock_snapshots this screen runs against.

    `universe` is the current field; `exclude_etfs` is what pre-ETF-mode clients send.
    An explicit `universe` always wins.

    When only `exclude_etfs` arrives, exclude_etfs=False maps to "all", not "etfs" — it
    only ever meant "don't filter funds out", never "funds only". Both absent gives
    "stocks", which is exactly the old `exclude_etfs: bool = True` default, so every
    saved screen written before ETF mode returns the result set it always returned.
    """
    if "universe" in c.model_fields_set:
        return c.universe
    if c.exclude_etfs is False:
        return "all"
    return "stocks"


def _f(val) -> Optional[float]:
    return float(val) if val is not None else None


# Exactly the columns _build_row reads, for the load_only() in run_screener.
#
# Keep in lockstep with _build_row. A column read there but missing here is NOT an
# error — SQLAlchemy silently lazy-loads it, one SELECT per row per attribute, which
# turns one query into thousands on the derived-filter path. The test below the
# module guards this; if you add a field to _build_row, add it here too.
_ROW_COLS = (
    StockSnapshot.symbol,
    StockSnapshot.name,
    StockSnapshot.price,
    StockSnapshot.change_percentage,
    StockSnapshot.volume,
    StockSnapshot.avg_volume,
    StockSnapshot.market_cap,
    StockSnapshot.day_high,
    StockSnapshot.day_low,
    StockSnapshot.year_high,
    StockSnapshot.year_low,
    StockSnapshot.price_avg_50,
    StockSnapshot.price_avg_200,
    StockSnapshot.exchange,
    StockSnapshot.open_price,
    StockSnapshot.previous_close,
    StockSnapshot.dividend_annual,
    StockSnapshot.dividend_status,
    StockSnapshot.beta,
    StockSnapshot.last_refreshed,
    StockSnapshot.is_etf,
    StockSnapshot.squeeze_state,
    StockSnapshot.squeeze_bars,
    StockSnapshot.squeeze_ratio,
    StockSnapshot.expense_ratio,
    StockSnapshot.aum,
    StockSnapshot.nav,
    StockSnapshot.holdings_count,
    StockSnapshot.asset_class,
    StockSnapshot.etf_company,
    StockSnapshot.inception_date,
)


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
        # Fund metadata — null on common stock. expense_ratio is a percent.
        "expense_ratio": _f(row.expense_ratio),
        "aum": _f(row.aum),
        "nav": _f(row.nav),
        "holdings_count": row.holdings_count,
        "asset_class": row.asset_class,
        "etf_company": row.etf_company,
        "inception_date": row.inception_date.isoformat() if row.inception_date else None,
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

    # ETF-only. All push down to SQL, so _passes_derived needs no change.
    add_range(StockSnapshot.expense_ratio, criteria.expense_ratio)
    add_range(StockSnapshot.aum, criteria.aum)
    add_range(StockSnapshot.holdings_count, criteria.holdings_count)

    if criteria.asset_class:
        conditions.append(StockSnapshot.asset_class.in_(criteria.asset_class))

    if criteria.etf_company:
        conditions.append(StockSnapshot.etf_company.in_(criteria.etf_company))

    if criteria.min_age_years is not None:
        # "has a track record of at least N years". Computed here rather than in the
        # browser so the cutoff is derived once, from the server's clock.
        cutoff = date.today() - timedelta(days=criteria.min_age_years * 365.25)
        conditions.append(StockSnapshot.inception_date.isnot(None))
        conditions.append(StockSnapshot.inception_date <= cutoff)

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

    universe = _resolve_universe(criteria)
    if universe == "stocks":
        # NULL still reads as "not an ETF". is_etf is stamped at universe-build time
        # now, so NULL should not occur, but the tolerance costs nothing and keeps the
        # pre-ETF-mode behaviour exactly.
        conditions.append(
            or_(StockSnapshot.is_etf.is_(None), StockSnapshot.is_etf == False)
        )
    elif universe == "etfs":
        conditions.append(StockSnapshot.is_etf.is_(True))
    # "all": no predicate

    # Fall back to the universe's default rather than market_cap, so an unrecognised
    # sort key in ETF mode doesn't silently order funds by a mostly-NULL column.
    default_sort = _DEFAULT_SORT[universe]
    sort_by = criteria.sort_by if "sort_by" in criteria.model_fields_set else default_sort
    sort_col = SORT_COL.get(sort_by, SORT_COL[default_sort])
    order = sort_col.desc().nulls_last() if criteria.sort_desc else sort_col.asc().nulls_last()

    has_derived = any([
        criteria.pct_from_52wk_high,
        criteria.pct_from_52wk_low,
        criteria.dollar_volume,
        criteria.gap_percent,
    ])

    # load_only because the derived-filter branch below materializes the WHOLE filtered
    # set into Python, and a full entity load drags the `description` Text column
    # (~1-3KB/row) that _build_row never reads. Naming the columns _build_row actually
    # touches cuts the transfer by roughly an order of magnitude on that path.
    base_q = select(StockSnapshot).options(load_only(*_ROW_COLS))
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
        "universe": "stocks",
        "description": "Stocks trading within 10% of their 52-week high with market cap above $1B",
        "criteria": {
            "universe": "stocks",
            "pct_from_52wk_high": {"min": -10},
            "market_cap": {"min": 1_000_000_000},
            "sort_by": "market_cap",
            "sort_desc": True,
        },
    },
    {
        "id": "oversold_quality",
        "name": "Oversold Quality",
        "universe": "stocks",
        "description": "Large-cap stocks near 52-week lows but still trading above their 200-day MA",
        "criteria": {
            "universe": "stocks",
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
        "universe": "stocks",
        "description": "Stocks where the 50-day MA has crossed above the 200-day MA and price is above both",
        "criteria": {
            "universe": "stocks",
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
        "universe": "stocks",
        "description": (
            "Stocks up 3%+ today that have already traded a full average day's volume, "
            "with at least $50M in dollar volume"
        ),
        "criteria": {
            "universe": "stocks",
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
        "universe": "stocks",
        "description": (
            "Stocks that have already traded 2x an average day's volume — direction-agnostic, "
            "so it catches accumulation and capitulation alike"
        ),
        "criteria": {
            "universe": "stocks",
            "rvol": {"min": 2},
            "market_cap": {"min": 200_000_000},
            "sort_by": "rvol",
            "sort_desc": True,
        },
    },
    {
        "id": "momentum_leaders",
        "name": "Momentum Leaders",
        "universe": "stocks",
        "description": "Large-cap stocks trading above both moving averages with positive momentum today",
        "criteria": {
            "universe": "stocks",
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
        "universe": "stocks",
        "description": "Stocks trading within 10% of their 52-week low — contrarian and value hunter territory",
        "criteria": {
            "universe": "stocks",
            "pct_from_52wk_low": {"max": 10},
            "market_cap": {"min": 1_000_000_000},
            "sort_by": "market_cap",
            "sort_desc": True,
        },
    },
    {
        "id": "death_cross",
        "name": "Death Cross",
        "universe": "stocks",
        "description": "Stocks where the 50-day MA has crossed below the 200-day MA — bearish technical signal",
        "criteria": {
            "universe": "stocks",
            "death_cross": True,
            "market_cap": {"min": 500_000_000},
            "sort_by": "market_cap",
            "sort_desc": True,
        },
    },
    {
        "id": "gap_up",
        "name": "Gap Up (2%+)",
        "universe": "stocks",
        "description": "Stocks that opened at least 2% above the prior close — momentum and catalyst plays",
        "criteria": {
            "universe": "stocks",
            "gap_percent": {"min": 2},
            "market_cap": {"min": 200_000_000},
            "sort_by": "change_percentage",
            "sort_desc": True,
        },
    },
    {
        "id": "gap_down",
        "name": "Gap Down (2%+)",
        "universe": "stocks",
        "description": "Stocks that opened at least 2% below the prior close — potential reversals or continued selling",
        "criteria": {
            "universe": "stocks",
            "gap_percent": {"max": -2},
            "market_cap": {"min": 200_000_000},
            "sort_by": "change_percentage",
            "sort_desc": False,
        },
    },
    {
        "id": "dividend_income",
        "name": "Dividend Income",
        "universe": "stocks",
        "description": "Established companies yielding 3%+ with a market cap above $2B — a starting universe for income investors.",
        "criteria": {
            "universe": "stocks",
            "dividend_yield": {"min": 3},
            "market_cap": {"min": 2_000_000_000},
            "sort_by": "dividend_yield",
            "sort_desc": True,
        },
    },
    {
        "id": "in_squeeze",
        "name": "In Squeeze",
        "universe": "stocks",
        "description": "Volatility is coiling — Bollinger Bands are inside the Keltner Channels. A breakout often follows.",
        "criteria": {
            "universe": "stocks",
            "squeeze_on": True,
            "market_cap": {"min": 250_000_000},
            "sort_by": "market_cap",
            "sort_desc": True,
        },
    },
    {
        "id": "squeeze_fired",
        "name": "Squeeze Fired (3d)",
        "universe": "stocks",
        "description": "A volatility squeeze released in the last 3 trading days — potential breakout underway.",
        "criteria": {
            "universe": "stocks",
            "squeeze_fired_within_days": 3,
            "market_cap": {"min": 250_000_000},
            "sort_by": "market_cap",
            "sort_desc": True,
        },
    },
    # --- ETF mode ---------------------------------------------------------
    # Deliberately only three. The asset_class and issuer dropdowns already cover
    # "bond ETFs" / "Vanguard funds" in one click, so a preset that is just a single
    # dropdown value is chip-row clutter.
    {
        "id": "etf_low_cost_core",
        "name": "Low-Cost Core",
        "universe": "etfs",
        "description": "Funds with at least $1B under management charging 0.10% or less — the cheap end of the core building blocks",
        "criteria": {
            "universe": "etfs",
            "expense_ratio": {"max": 0.10},
            "aum": {"min": 1_000_000_000},
            "sort_by": "aum",
            "sort_desc": True,
        },
    },
    {
        "id": "etf_income",
        "name": "ETF Income",
        "universe": "etfs",
        "description": "Funds yielding 4%+ with at least $250M under management. Yield is derived live against price and gated on distribution recency, so a fund that stopped paying drops out",
        "criteria": {
            "universe": "etfs",
            "dividend_yield": {"min": 4},
            "aum": {"min": 250_000_000},
            "sort_by": "dividend_yield",
            "sort_desc": True,
        },
    },
    {
        "id": "etf_momentum",
        "name": "ETF Momentum",
        "universe": "etfs",
        "description": "Liquid funds trading above both moving averages and up on the day",
        "criteria": {
            "universe": "etfs",
            "price_above_50ma": True,
            "price_above_200ma": True,
            "change_percentage": {"min": 0.5},
            "aum": {"min": 250_000_000},
            "sort_by": "change_percentage",
            "sort_desc": True,
        },
    },
]


@router.get("/filter-options")
async def get_filter_options(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Distinct dropdown values present in the snapshot universe.

    Drives the screener's dropdowns so the UI only ever offers values that actually
    exist in the data — picking one always returns matches. Stock mode gets
    sectors/industries, ETF mode gets asset classes and issuers, and both get the
    exchange list rather than a hardcoded one (funds list on venues common stock
    does not).

    One endpoint rather than two: the UI fetches this once on mount, and a second
    round trip for two more dropdowns is not worth it.
    """
    result = await db.execute(
        select(StockSnapshot.sector, StockSnapshot.industry)
        # is_etf guard is belt-and-braces: funds are excluded from the profile pass so
        # they carry no sector anyway. It pins the invariant against a stray write —
        # a fund appearing as a sector option would also answer a stock-mode screen.
        .where(StockSnapshot.sector.isnot(None), StockSnapshot.is_etf.isnot(True))
        .distinct()
    )
    by_sector: dict[str, set] = {}
    for sector, industry in result.all():
        if not sector:
            continue
        bucket = by_sector.setdefault(sector, set())
        if industry:
            bucket.add(industry)

    asset_classes = (await db.execute(
        select(StockSnapshot.asset_class)
        .where(StockSnapshot.is_etf.is_(True), StockSnapshot.asset_class.isnot(None))
        .distinct()
    )).scalars().all()

    # Ordered by fund count so the issuers users actually want (iShares, Vanguard,
    # SPDR) sit at the top of a long select rather than wherever the alphabet puts
    # them. Returned in full — truncating hides the smaller issuers entirely, and the
    # whole list is only a few KB.
    issuers = (await db.execute(
        select(StockSnapshot.etf_company, func.count())
        .where(StockSnapshot.is_etf.is_(True), StockSnapshot.etf_company.isnot(None))
        .group_by(StockSnapshot.etf_company)
        .order_by(func.count().desc(), StockSnapshot.etf_company)
    )).all()

    exchanges = (await db.execute(
        select(StockSnapshot.exchange)
        .where(StockSnapshot.exchange.isnot(None))
        .distinct()
        .order_by(StockSnapshot.exchange)
    )).scalars().all()

    return {
        "sectors": sorted(by_sector.keys()),
        "industries_by_sector": {s: sorted(v) for s, v in by_sector.items()},
        "asset_classes": sorted(a for a in asset_classes if a),
        "etf_companies": [c for c, _ in issuers if c],
        "exchanges": [e for e in exchanges if e],
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
