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

TICKER_TAPE_SYMBOLS = [
    "AAPL", "MSFT", "GOOGL", "AMZN", "NVDA",
    "META", "TSLA", "SPY", "QQQ", "DIA",
]

_ticker_tape_cache = SimpleCache(ttl_seconds=60)


@router.get("/ticker-tape")
async def get_ticker_tape():
    """Cached batch quotes for the public landing page ticker tape."""
    cached = _ticker_tape_cache.get("tape")
    if cached is not None:
        return cached

    try:
        quotes = await market_data_service.get_batch_quotes(TICKER_TAPE_SYMBOLS)
        payload = {
            "data": [quotes[t] for t in TICKER_TAPE_SYMBOLS if t in quotes],
        }
        _ticker_tape_cache.set("tape", payload)
        return payload
    except Exception as e:
        raise HTTPException(status_code=500, detail=_safe_error(e))
