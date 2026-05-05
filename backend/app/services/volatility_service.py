"""
Volatility service.

Estimates annualized volatility for a ticker, used to size option-pricing
inputs in the DCF Trade-This modal and the Options Calculator. The user's FMP
plan does not include options-chain data, so we cannot read implied volatility
from the market. Instead we compute realized volatility from historical daily
closes — a usable proxy that's typically ~60–80% of true IV for liquid names,
and a meaningful improvement over a hardcoded 30% default.

Returns a dict with:
    value:         float in [0, 5] (e.g., 0.87 = 87% annualized)
    source:        "realized" if computed from history, "default" if fallback
    lookback_days: number of trading-day returns used (None if default)
    as_of:         ISO timestamp of computation
"""
from __future__ import annotations

import logging
import math
from datetime import datetime, timezone
from typing import Any, Optional

from app.services.market_data import market_data_service
from app.utils.cache import SimpleCache

logger = logging.getLogger(__name__)

# Cache per ticker for 15 minutes — realized vol on a 30-day window doesn't move
# meaningfully within that interval and we want to bound FMP fetches.
_vol_cache = SimpleCache(ttl_seconds=15 * 60)

DEFAULT_VOL = 0.30
TRADING_DAYS_PER_YEAR = 252


async def compute_realized_volatility(
    ticker: str,
    lookback_trading_days: int = 30,
) -> Optional[float]:
    """Annualized stdev of daily log returns over the trailing window.
    Returns None on insufficient data or fetch failure."""
    # Fetch ~1.5x calendar days to ensure enough trading days post weekend/holiday filter
    calendar_days = int(lookback_trading_days * 1.5) + 10

    try:
        history = await market_data_service.get_historical_prices(ticker, days=calendar_days)
    except Exception as exc:
        logger.warning(f"Realized vol: get_historical_prices failed for {ticker}: {exc}")
        return None

    if not history or len(history) < 6:
        return None

    closes = [float(h["close"]) for h in history[-lookback_trading_days:] if h.get("close")]
    if len(closes) < 6 or any(c <= 0 for c in closes):
        return None

    log_returns: list[float] = []
    for i in range(1, len(closes)):
        try:
            log_returns.append(math.log(closes[i] / closes[i - 1]))
        except (ValueError, ZeroDivisionError):
            continue

    if len(log_returns) < 5:
        return None

    mean = sum(log_returns) / len(log_returns)
    variance = sum((r - mean) ** 2 for r in log_returns) / (len(log_returns) - 1)
    daily_stdev = math.sqrt(variance)
    annualized = daily_stdev * math.sqrt(TRADING_DAYS_PER_YEAR)

    # Sanity clamp — implausible values usually mean dirty data (splits, etc.)
    if annualized <= 0 or annualized > 5.0:
        logger.warning(f"Realized vol for {ticker} = {annualized:.2f} outside [0, 5], rejecting")
        return None

    return annualized


async def get_volatility_estimate(
    ticker: str,
    lookback_trading_days: int = 30,
) -> dict[str, Any]:
    """Get a usable annualized volatility for a ticker. Always returns a dict;
    falls back to DEFAULT_VOL if realized vol can't be computed."""
    sym = ticker.upper().strip()
    cache_key = f"{sym}:{lookback_trading_days}"
    cached = _vol_cache.get(cache_key)
    if cached is not None:
        return cached

    realized = await compute_realized_volatility(sym, lookback_trading_days)

    if realized is not None:
        payload = {
            "ticker": sym,
            "value": round(realized, 4),
            "source": "realized",
            "lookback_days": lookback_trading_days,
            "as_of": datetime.now(timezone.utc).isoformat(),
        }
    else:
        payload = {
            "ticker": sym,
            "value": DEFAULT_VOL,
            "source": "default",
            "lookback_days": None,
            "as_of": datetime.now(timezone.utc).isoformat(),
        }

    _vol_cache.set(cache_key, payload)
    return payload
