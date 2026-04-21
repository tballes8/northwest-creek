import math
from typing import Optional
from datetime import timezone

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import select, func, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_user
from app.db.models import StockSnapshot, User
from app.db.session import get_db

router = APIRouter()

SORTABLE = {
    "price", "market_cap", "change_percentage", "volume",
    "price_avg_50", "price_avg_200", "symbol", "name",
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
    exchange: Optional[list[str]] = None

    pct_from_52wk_high: Optional[NumericRange] = None
    pct_from_52wk_low: Optional[NumericRange] = None
    dollar_volume: Optional[NumericRange] = None

    golden_cross: Optional[bool] = None
    price_above_50ma: Optional[bool] = None
    price_above_200ma: Optional[bool] = None

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

    pct_from_high = (
        round((price - year_high) / year_high * 100, 2)
        if price and year_high else None
    )
    pct_from_low = (
        round((price - year_low) / year_low * 100, 2)
        if price and year_low else None
    )
    dollar_vol = round(price * volume, 2) if price and volume else None

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
        "last_refreshed": ts.isoformat() if ts else None,
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

    if criteria.exchange:
        conditions.append(StockSnapshot.exchange.in_(criteria.exchange))

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

    sort_col = SORT_COL.get(criteria.sort_by, StockSnapshot.market_cap)
    order = sort_col.desc().nulls_last() if criteria.sort_desc else sort_col.asc().nulls_last()

    has_derived = any([
        criteria.pct_from_52wk_high,
        criteria.pct_from_52wk_low,
        criteria.dollar_volume,
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
        "description": "Stocks up 3%+ today with at least $50M in dollar volume",
        "criteria": {
            "change_percentage": {"min": 3},
            "dollar_volume": {"min": 50_000_000},
            "market_cap": {"min": 200_000_000},
            "sort_by": "change_percentage",
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
]


@router.get("/presets")
async def get_presets():
    return {"presets": _PRESETS}
