"""
Daily job: precompute BB/KC "squeeze" state for the screener universe.

Strategy (cheap, ~0 recurring FMP calls):
  1. Maintain — append today's OHLC bar for each ticker, harvested from the
     StockSnapshot row the 15-min refresh already populates (open/high/low/close).
  2. Seed    — for tickers without enough history (first run = all; later = only
     new universe members), backfill ~60 days via the same per-ticker historical
     endpoint the Price History chart uses. Throttled; self-limits after run one.
  3. Prune   — drop bars older than the retention window.
  4. Compute — run compute_squeeze_from_ohlc over each ticker's recent bars and
     write squeeze_state / squeeze_bars back onto StockSnapshot.

Run manually:  python -m app.tasks.compute_squeeze
"""
import asyncio
import logging
from datetime import datetime, timezone, timedelta

import pytz
from sqlalchemy import select, delete, func, update, bindparam
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.db.models import StockSnapshot, TickerDailyBar
from app.db.session import async_session
from app.services.market_data import market_data_service
from app.services.technical_indicators import technical_indicators

logger = logging.getLogger(__name__)

EASTERN = pytz.timezone("America/New_York")

MIN_BARS_FOR_SEED = 25      # below this a ticker gets backfilled
SEED_DAYS = 60              # calendar days of history to backfill (≈ 40 trading bars)
RETENTION_DAYS = 60         # prune bars older than this
SEED_CONCURRENCY = 15       # parallel historical fetches during backfill
_UPSERT_CHUNK = 1_000


def _to_float(v):
    return float(v) if v is not None else None


async def _maintain_today_bars() -> int:
    """Append today's bar for every snapshot that has usable OHLC."""
    async with async_session() as session:
        rows = (await session.execute(
            select(
                StockSnapshot.symbol,
                StockSnapshot.open_price,
                StockSnapshot.day_high,
                StockSnapshot.day_low,
                StockSnapshot.price,
                StockSnapshot.fmp_timestamp,
                StockSnapshot.last_refreshed,
            )
        )).all()

        bars = []
        for r in rows:
            close = _to_float(r.price)
            if close is None:
                continue
            ts = r.fmp_timestamp or r.last_refreshed
            if ts is None:
                continue
            if ts.tzinfo is None:
                ts = ts.replace(tzinfo=timezone.utc)
            bar_date = ts.astimezone(EASTERN).date()
            high = _to_float(r.day_high)
            low = _to_float(r.day_low)
            bars.append({
                "symbol": r.symbol,
                "bar_date": bar_date,
                "open": _to_float(r.open_price),
                "high": high if high is not None else close,
                "low": low if low is not None else close,
                "close": close,
            })

        for i in range(0, len(bars), _UPSERT_CHUNK):
            chunk = bars[i:i + _UPSERT_CHUNK]
            stmt = pg_insert(TickerDailyBar).values(chunk)
            stmt = stmt.on_conflict_do_update(
                index_elements=["symbol", "bar_date"],
                set_={
                    "open": stmt.excluded.open,
                    "high": stmt.excluded.high,
                    "low": stmt.excluded.low,
                    "close": stmt.excluded.close,
                },
            )
            await session.execute(stmt)
        await session.commit()
    return len(bars)


async def _symbols_needing_seed() -> list[str]:
    async with async_session() as session:
        counts = dict((await session.execute(
            select(TickerDailyBar.symbol, func.count(TickerDailyBar.id))
            .group_by(TickerDailyBar.symbol)
        )).all())
        all_symbols = (await session.execute(select(StockSnapshot.symbol))).scalars().all()
    return [s for s in all_symbols if counts.get(s, 0) < MIN_BARS_FOR_SEED]


async def _seed_symbol(symbol: str, sem: asyncio.Semaphore) -> list[dict]:
    async with sem:
        try:
            history = await market_data_service.get_historical_prices(symbol, days=SEED_DAYS)
        except Exception as e:
            logger.debug(f"seed {symbol} failed: {e}")
            return []
    out = []
    for h in history:
        d = h.get("date", "")[:10]
        if not d:
            continue
        try:
            bar_date = datetime.strptime(d, "%Y-%m-%d").date()
        except ValueError:
            continue
        out.append({
            "symbol": symbol,
            "bar_date": bar_date,
            "open": _to_float(h.get("open")),
            "high": _to_float(h.get("high")),
            "low": _to_float(h.get("low")),
            "close": _to_float(h.get("close")),
        })
    return out


async def _seed_missing() -> int:
    symbols = await _symbols_needing_seed()
    if not symbols:
        return 0
    print(f"📊 Squeeze: seeding history for {len(symbols)} tickers…", flush=True)
    sem = asyncio.Semaphore(SEED_CONCURRENCY)
    results = await asyncio.gather(*[_seed_symbol(s, sem) for s in symbols])
    bars = [b for sub in results for b in sub]
    if not bars:
        return 0
    async with async_session() as session:
        for i in range(0, len(bars), _UPSERT_CHUNK):
            chunk = bars[i:i + _UPSERT_CHUNK]
            stmt = pg_insert(TickerDailyBar).values(chunk)
            stmt = stmt.on_conflict_do_update(
                index_elements=["symbol", "bar_date"],
                set_={
                    "open": stmt.excluded.open,
                    "high": stmt.excluded.high,
                    "low": stmt.excluded.low,
                    "close": stmt.excluded.close,
                },
            )
            await session.execute(stmt)
        await session.commit()
    return len(bars)


async def _prune() -> None:
    cutoff = (datetime.now(EASTERN).date() - timedelta(days=RETENTION_DAYS))
    async with async_session() as session:
        await session.execute(delete(TickerDailyBar).where(TickerDailyBar.bar_date < cutoff))
        await session.commit()


async def _compute_and_store() -> int:
    """Compute squeeze per symbol from stored bars; write back to StockSnapshot."""
    async with async_session() as session:
        rows = (await session.execute(
            select(
                TickerDailyBar.symbol,
                TickerDailyBar.bar_date,
                TickerDailyBar.high,
                TickerDailyBar.low,
                TickerDailyBar.close,
            ).order_by(TickerDailyBar.symbol, TickerDailyBar.bar_date)
        )).all()

    # Group bars by symbol (already date-ascending)
    by_symbol: dict[str, list] = {}
    for r in rows:
        by_symbol.setdefault(r.symbol, []).append(r)

    now = datetime.now(timezone.utc)
    params = []
    for symbol, bars in by_symbol.items():
        highs = [_to_float(b.high) for b in bars]
        lows = [_to_float(b.low) for b in bars]
        closes = [_to_float(b.close) for b in bars]
        if any(c is None for c in closes):
            # drop bars with no close
            keep = [(h, l, c) for h, l, c in zip(highs, lows, closes) if c is not None]
            highs = [h if h is not None else c for h, l, c in keep]
            lows = [l if l is not None else c for h, l, c in keep]
            closes = [c for h, l, c in keep]

        sq = technical_indicators.compute_squeeze_from_ohlc(highs, lows, closes)
        if not sq or sq["state"] == "none":
            state, nbars = "none", None
        elif sq["state"] == "on":
            state, nbars = "on", sq["bars_in_squeeze"]
        else:  # fired
            state, nbars = "fired", sq["bars_since_fire"]
        params.append({"b_symbol": symbol, "b_state": state, "b_bars": nbars, "b_at": now})

    if not params:
        return 0

    # Core table UPDATE (not the ORM entity) executed as an executemany — bypasses
    # the ORM bulk-update machinery, which rejects a keyed bulk update with WHERE.
    tbl = StockSnapshot.__table__
    stmt = (
        tbl.update()
        .where(tbl.c.symbol == bindparam("b_symbol"))
        .values(
            squeeze_state=bindparam("b_state"),
            squeeze_bars=bindparam("b_bars"),
            squeeze_computed_at=bindparam("b_at"),
        )
    )
    async with async_session() as session:
        for i in range(0, len(params), _UPSERT_CHUNK):
            await session.execute(stmt, params[i:i + _UPSERT_CHUNK])
        await session.commit()
    return len(params)


async def compute_squeeze_job(api_key: str | None = None) -> None:
    """Entry point — called daily by APScheduler (post US close)."""
    print("📊 Squeeze precompute starting…", flush=True)
    try:
        appended = await _maintain_today_bars()
        seeded = await _seed_missing()
        await _prune()
        computed = await _compute_and_store()
        print(
            f"✅ Squeeze precompute complete — {appended} bars appended, "
            f"{seeded} seeded, {computed} tickers scored",
            flush=True,
        )
        logger.info(f"Squeeze precompute: appended={appended} seeded={seeded} scored={computed}")
    except Exception as exc:
        print(f"❌ Squeeze precompute failed: {exc}", flush=True)
        logger.exception("Squeeze precompute failed")
        raise  # surface the failure so the process exits non-zero (Railway shows red)


if __name__ == "__main__":
    from app.services.fmp_client import init_fmp_client, close_fmp_client

    async def _main():
        await init_fmp_client()
        try:
            await compute_squeeze_job()
        finally:
            await close_fmp_client()

    asyncio.run(_main())
    print("✅ Squeeze job completed - exiting")
