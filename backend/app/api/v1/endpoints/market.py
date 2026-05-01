"""
Public market data endpoints — no auth required.
Used by the marketing landing page for the live ticker tape.
"""
import re
from fastapi import APIRouter, HTTPException
from app.services.market_data import market_data_service
from app.utils.cache import SimpleCache


def _safe_error(e: Exception) -> str:
    msg = str(e)
    msg = re.sub(r'apiKey=[^&\s\'"]+', 'apiKey=***', msg)
    msg = re.sub(r'api_key=[^&\s\'"]+', 'api_key=***', msg)
    return msg


router = APIRouter()

TICKER_TAPE_LIMIT = 15

_ticker_tape_cache = SimpleCache(ttl_seconds=60)


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
