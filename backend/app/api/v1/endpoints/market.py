"""
Public market data endpoints — no auth required.
Used by the marketing landing page for the live ticker tape.
"""
import re
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import StockSnapshot
from app.db.session import get_db
from app.services.market_data import market_data_service
from app.utils.cache import SimpleCache


def _safe_error(e: Exception) -> str:
    msg = str(e)
    msg = re.sub(r'apiKey=[^&\s\'"]+', 'apiKey=***', msg)
    msg = re.sub(r'api_key=[^&\s\'"]+', 'api_key=***', msg)
    return msg


router = APIRouter()

TICKER_TAPE_LIMIT = 15
SCREENS_TAPE_LIMIT = 15
SCREENS_BREAKOUT_MAX = 8
SCREENS_SQUEEZE_MIN_BARS = 3   # skip 1–2 day blips; only show established coils

# Corporate boilerplate + share-class designators ignored when comparing company
# names, so share classes (GOOG/GOOGL, FOX/FOXA) collapse to one tape slot.
_NAME_NOISE_RE = re.compile(
    r"\b(?:class\s+[a-z]|series\s+[a-z]|inc|incorporated|corp|corporation"
    r"|company|co|ltd|plc|holdings?|group)\b"
)


def _company_key(name, symbol: str) -> str:
    if not name:
        return symbol
    key = re.sub(r"[^a-z0-9\s]", " ", name.lower())
    key = _NAME_NOISE_RE.sub(" ", key)
    return " ".join(key.split()) or symbol

_ticker_tape_cache = SimpleCache(ttl_seconds=60)
_screens_tape_cache = SimpleCache(ttl_seconds=60)


@router.get("/ticker-tape")
async def get_ticker_tape():
    """Most-active US tickers (sorted by volume) for the public landing tape."""
    cached = _ticker_tape_cache.get("tape")
    if cached is not None:
        return cached

    try:
        # FMP /stable/most-actives returns symbols sorted by volume.
        raw = await market_data_service._fmp_get("most-actives")
        if not isinstance(raw, list):
            raw = []

        items = []
        for item in raw:
            ticker = item.get("symbol", "")
            if not ticker or market_data_service._is_warrant_ticker(ticker):
                continue
            price = item.get("price")
            change_pct = item.get("changesPercentage")
            if price is None or change_pct is None:
                continue
            items.append({
                "ticker": ticker,
                "price": float(price),
                "change_percent": round(float(change_pct), 2),
            })
            if len(items) >= TICKER_TAPE_LIMIT:
                break

        payload = {"data": items}
        _ticker_tape_cache.set("tape", payload)
        return payload
    except Exception as e:
        raise HTTPException(status_code=500, detail=_safe_error(e))


@router.get("/ticker-tape/screens")
async def get_screens_ticker_tape(db: AsyncSession = Depends(get_db)):
    """Tickers from the 'High Volume Breakout' and 'In Squeeze' quick-screens.

    Mirrors the screener presets of the same names (see screener.py _PRESETS),
    including their implicit ETF exclusion — except squeeze picks rank by
    bandwidth ratio (tightest coil first) instead of the preset's market-cap
    sort, require a few bars in squeeze, and share classes of the same company
    collapse to a single entry.
    """
    cached = _screens_tape_cache.get("tape")
    if cached is not None:
        return cached

    try:
        no_etf = or_(StockSnapshot.is_etf.is_(None), StockSnapshot.is_etf == False)

        # Over-fetch both screens slightly to absorb dedupe/warrant drops.
        breakout_q = (
            select(StockSnapshot.symbol, StockSnapshot.name,
                   StockSnapshot.price, StockSnapshot.change_percentage)
            .where(
                StockSnapshot.change_percentage >= 3,
                StockSnapshot.price * StockSnapshot.volume >= 50_000_000,
                StockSnapshot.market_cap >= 200_000_000,
                no_etf,
            )
            .order_by(StockSnapshot.change_percentage.desc())
            .limit(SCREENS_BREAKOUT_MAX + 4)
        )
        squeeze_q = (
            select(StockSnapshot.symbol, StockSnapshot.name,
                   StockSnapshot.price, StockSnapshot.change_percentage)
            .where(
                StockSnapshot.squeeze_state == 'on',
                StockSnapshot.squeeze_bars >= SCREENS_SQUEEZE_MIN_BARS,
                StockSnapshot.market_cap >= 250_000_000,
                StockSnapshot.price.isnot(None),
                StockSnapshot.change_percentage.isnot(None),
                no_etf,
            )
            .order_by(StockSnapshot.squeeze_ratio.asc().nulls_last())
            .limit(SCREENS_TAPE_LIMIT + 4)
        )
        breakout_rows = (await db.execute(breakout_q)).all()
        squeeze_rows = (await db.execute(squeeze_q)).all()

        items = []
        seen = set()
        seen_companies = set()

        def add(row, tag, cap):
            if len(items) >= cap or row.symbol in seen:
                return
            if market_data_service._is_warrant_ticker(row.symbol):
                return
            company = _company_key(row.name, row.symbol)
            if company in seen_companies:
                return
            seen.add(row.symbol)
            seen_companies.add(company)
            items.append({
                "ticker": row.symbol,
                "price": float(row.price),
                "change_percent": round(float(row.change_percentage), 2),
                "tag": tag,
            })

        # Breakouts first (they keep their tag on overlap), squeeze backfills.
        for row in breakout_rows:
            add(row, "breakout", SCREENS_BREAKOUT_MAX)
        for row in squeeze_rows:
            add(row, "squeeze", SCREENS_TAPE_LIMIT)

        payload = {"data": items}
        _screens_tape_cache.set("tape", payload)
        return payload
    except Exception as e:
        raise HTTPException(status_code=500, detail=_safe_error(e))
