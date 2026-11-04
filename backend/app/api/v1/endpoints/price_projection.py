"""
EXPERIMENTAL: price projection cone. This feature may be removed; the removal
list is in services/price_projection.py.

GET /projection/{ticker}: percentile bands of a zero-drift GBM Monte Carlo over
the next 252 trading days, plus the trailing year of dividend-adjusted closes
for the chart's history line.
"""
import asyncio
import re

import httpx
from fastapi import APIRouter, Depends, HTTPException, status

from app.api.dependencies import get_current_user
from app.core.redaction import safe_error
from app.services.market_data import FMPError
from app.services.price_projection import (
    ProjectionUnavailable, build_projection, fetch_adjusted_rows,
)
from app.utils.cache import SimpleCache

# Every route needs a live subscription (licensed FMP data; shared FMP quota).
# Not metered: one FMP call per ticker per hour, shared by everyone through the cache.
router = APIRouter(dependencies=[Depends(get_current_user)])

_TICKER_RE = re.compile(r"^[A-Z0-9][A-Z0-9.\-]{0,11}$")

# One hour, not a day: FMP's newest row is today's partial bar during market
# hours, so a day-long cache would freeze the cone at the morning's price.
_cache = SimpleCache(ttl_seconds=3600)


@router.get("/{ticker}")
async def get_price_projection(ticker: str):
    symbol = ticker.strip().upper()
    if not _TICKER_RE.match(symbol):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Invalid ticker symbol.")

    cached = _cache.get(symbol)
    if cached is not None:
        return cached

    try:
        rows = await fetch_adjusted_rows(symbol)
    except (FMPError, httpx.HTTPError) as e:
        print(f"projection/{symbol}: price history fetch failed ({safe_error(e)})")
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Price history is temporarily unavailable. Please try again shortly.",
        )
    if not rows:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=f"No price history for {symbol}.")

    try:
        result = await asyncio.to_thread(build_projection, rows)
    except ProjectionUnavailable as e:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e))

    result["ticker"] = symbol
    _cache.set(symbol, result)
    return result
