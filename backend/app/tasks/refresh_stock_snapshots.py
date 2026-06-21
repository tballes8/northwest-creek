"""
APScheduler job: refresh stock_snapshots from FMP /stable/batch-quote.

Cadence (enforced inside the job, not by the scheduler):
- Market hours (Mon–Fri 9:30–16:00 ET): runs every invocation (~15 min)
- Off-hours: skips if last refresh < 55 minutes ago (effectively hourly)

Initial population: if the table is empty, fetches /stock-list first to build
the universe (US common stocks on NYSE/NASDAQ/AMEX, no ETFs, no warrants).
Subsequent runs only re-fetch quotes for the existing symbol universe.
"""
import logging
from datetime import datetime, time, timedelta, timezone

import httpx
import pytz
from sqlalchemy import delete, func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.db.models import StockSnapshot
from app.db.session import async_session
from app.services.market_data import market_data_service

logger = logging.getLogger(__name__)

EASTERN = pytz.timezone("America/New_York")
FMP_BASE = "https://financialmodelingprep.com/stable"
QUOTE_BATCH_SIZE = 500
MARKET_OPEN = time(9, 30)
MARKET_CLOSE = time(16, 0)

# Exchanges that count as "US common stock" for the screener universe
US_EXCHANGES = {"NYSE", "NASDAQ", "AMEX"}


def _is_market_hours() -> bool:
    now = datetime.now(EASTERN)
    return (
        now.weekday() < 5
        and MARKET_OPEN <= now.time() <= MARKET_CLOSE
    )


async def _last_refresh_ts() -> datetime | None:
    async with async_session() as session:
        result = await session.scalar(select(func.max(StockSnapshot.last_refreshed)))
        if result and result.tzinfo is None:
            result = result.replace(tzinfo=timezone.utc)
        return result


async def _build_universe(api_key: str) -> list[tuple[str, str]]:
    """Fetch /company-screener and return (symbol, name) pairs — US common stocks only, no ETFs/funds."""
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.get(
            f"{FMP_BASE}/company-screener",
            params={
                "isEtf": "false",
                "isFund": "false",
                "isActivelyTrading": "true",
                "country": "US",
                "limit": 10000,
                "apikey": api_key,
            },
        )
        resp.raise_for_status()
        stock_list = resp.json()

    print(f"📊 company-screener raw count: {len(stock_list) if isinstance(stock_list, list) else type(stock_list).__name__}", flush=True)

    tickers: list[tuple[str, str]] = []
    for s in (stock_list or []):
        if not isinstance(s, dict):
            continue
        sym = (s.get("symbol") or "").strip()
        if not sym or "." in sym or len(sym) > 10:
            continue
        name = s.get("companyName") or s.get("name") or ""
        tickers.append((sym, name))

    print(f"📊 Universe built: {len(tickers)} CS tickers", flush=True)
    logger.info(f"Universe built: {len(tickers)} CS tickers")
    return tickers


async def _prune_universe(tickers: list[tuple[str, str]]) -> None:
    """Remove DB rows for symbols no longer in the filtered universe (ETFs/funds that slipped in)."""
    current = {sym for sym, _ in tickers}
    async with async_session() as session:
        db_symbols = set((await session.execute(select(StockSnapshot.symbol))).scalars().all())
        stale = db_symbols - current
        if stale:
            await session.execute(delete(StockSnapshot).where(StockSnapshot.symbol.in_(stale)))
            await session.commit()
            print(f"📊 Pruned {len(stale)} stale/excluded symbols from universe", flush=True)
            logger.info(f"Pruned {len(stale)} stale/excluded symbols from universe")


async def _existing_universe() -> list[tuple[str, str]]:
    async with async_session() as session:
        rows = (await session.execute(
            select(StockSnapshot.symbol, StockSnapshot.name)
        )).all()
    return [(r.symbol, r.name or "") for r in rows]


async def _fetch_quotes(
    api_key: str,
    tickers: list[tuple[str, str]],
) -> list[dict]:
    name_map = {sym: name for sym, name in tickers}
    symbols = list(name_map)
    rows: list[dict] = []
    now_utc = datetime.now(timezone.utc)

    async with httpx.AsyncClient(timeout=20.0) as client:
        for i in range(0, len(symbols), QUOTE_BATCH_SIZE):
            batch = symbols[i:i + QUOTE_BATCH_SIZE]
            try:
                resp = await client.get(
                    f"{FMP_BASE}/batch-quote",
                    params={"symbols": ",".join(batch), "apikey": api_key},
                )
                resp.raise_for_status()
                quotes = resp.json()
                if not isinstance(quotes, list):
                    continue

                for q in quotes:
                    sym = q.get("symbol", "")
                    if not sym or "." in sym or len(sym) > 10:
                        continue
                    if q.get("exchange") not in US_EXCHANGES:
                        continue
                    ts_raw = q.get("timestamp")
                    fmp_ts = (
                        datetime.fromtimestamp(ts_raw, tz=timezone.utc)
                        if isinstance(ts_raw, (int, float))
                        else None
                    )
                    rows.append({
                        "symbol": sym,
                        "name": name_map.get(sym) or q.get("name") or "",
                        "price": q.get("price"),
                        "change_percentage": q.get("changePercentage"),
                        "change": q.get("change"),
                        "volume": q.get("volume"),
                        # NOTE: batch-quote has no avgVolume; the avg_volume column
                        # has no consumer (volume-surge scanner was removed), so we
                        # don't write it. See scripts/audit_fmp_fields.py.
                        "day_low": q.get("dayLow"),
                        "day_high": q.get("dayHigh"),
                        "year_high": q.get("yearHigh"),
                        "year_low": q.get("yearLow"),
                        "market_cap": q.get("marketCap"),
                        "price_avg_50": q.get("priceAvg50"),
                        "price_avg_200": q.get("priceAvg200"),
                        "exchange": q.get("exchange"),
                        "open_price": q.get("open"),
                        "previous_close": q.get("previousClose"),
                        "fmp_timestamp": fmp_ts,
                        "last_refreshed": now_utc,
                        "is_etf": False,
                    })
            except Exception as e:
                print(f"⚠️ Batch {i}–{i + QUOTE_BATCH_SIZE} failed: {e}", flush=True)
                logger.warning(f"Batch {i}–{i + QUOTE_BATCH_SIZE} failed: {e}")

    return rows


_UPSERT_CHUNK = 1_000  # asyncpg caps params at 32767; 18 cols × 1000 = 18000

async def _upsert(rows: list[dict]) -> None:
    if not rows:
        return
    update_cols = [c for c in rows[0] if c != "symbol"]
    async with async_session() as session:
        for i in range(0, len(rows), _UPSERT_CHUNK):
            chunk = rows[i:i + _UPSERT_CHUNK]
            stmt = pg_insert(StockSnapshot).values(chunk)
            stmt = stmt.on_conflict_do_update(
                index_elements=["symbol"],
                set_={col: stmt.excluded[col] for col in update_cols},
            )
            await session.execute(stmt)
        await session.commit()
    logger.info(f"Upserted {len(rows)} snapshots")


async def _update_company_profiles(symbols: list[str], limit: int = 100) -> None:
    """
    Update company profiles (sector, industry, description) for a subset of stocks.
    This runs less frequently than price updates since profiles rarely change.
    """
    try:
        # Randomly select stocks to update profiles for (to spread the load)
        import random
        symbols_to_update = random.sample(symbols, min(limit, len(symbols)))

        print(f"📊 Updating company profiles for {len(symbols_to_update)} symbols", flush=True)

        profile_data = []
        for symbol in symbols_to_update:
            try:
                info = await market_data_service.get_company_info(symbol)
                profile_data.append({
                    "symbol": symbol,
                    "sector": info.get("sector"),
                    "industry": info.get("industry"),
                    "description": info.get("description"),
                })
            except Exception as e:
                logger.debug(f"Failed to fetch profile for {symbol}: {e}")
                continue

        if profile_data:
            # Update only the profile fields for these stocks
            async with async_session() as session:
                for profile in profile_data:
                    await session.execute(
                        select(StockSnapshot)
                        .where(StockSnapshot.symbol == profile["symbol"])
                        .execution_options(synchronize_session="fetch")
                    )
                    stmt = pg_insert(StockSnapshot).values(profile)
                    stmt = stmt.on_conflict_do_update(
                        index_elements=["symbol"],
                        set_={
                            "sector": stmt.excluded.sector,
                            "industry": stmt.excluded.industry,
                            "description": stmt.excluded.description,
                        },
                    )
                    await session.execute(stmt)
                await session.commit()
            logger.info(f"Updated {len(profile_data)} company profiles")
    except Exception as e:
        logger.warning(f"Failed to update company profiles: {e}")


async def refresh_stock_snapshots_job(api_key: str) -> None:
    """Entry point called by APScheduler every 15 minutes."""
    if not _is_market_hours():
        last_ts = await _last_refresh_ts()
        if last_ts:
            age = datetime.now(timezone.utc) - last_ts
            if age < timedelta(minutes=55):
                print("📊 Off-hours throttle: snapshot fresh, skipping", flush=True)
                logger.debug("Off-hours throttle: snapshot fresh, skipping")
                return

    print("📊 Starting stock snapshot refresh…", flush=True)
    logger.info("Starting stock snapshot refresh…")
    try:
        last_ts = await _last_refresh_ts()
        now_et = datetime.now(EASTERN)
        # Rebuild universe once per trading day (first refresh of a new day) or if table is empty
        should_rebuild = (
            last_ts is None
            or last_ts.astimezone(EASTERN).date() < now_et.date()
        )

        if should_rebuild:
            tickers = await _build_universe(api_key)
            await _prune_universe(tickers)
        else:
            tickers = await _existing_universe()

        rows = await _fetch_quotes(api_key, tickers)
        await _upsert(rows)

        # Update company profiles periodically (once per day or on rebuild)
        if should_rebuild:
            # Update profiles for a subset of stocks to avoid rate limits
            symbols = [sym for sym, _ in tickers]
            await _update_company_profiles(symbols, limit=200)

        print(f"✅ Snapshot refresh complete — {len(rows)} symbols", flush=True)
        logger.info(f"Snapshot refresh complete — {len(rows)} symbols")
    except Exception as exc:
        print(f"❌ Snapshot refresh failed: {exc}", flush=True)
        logger.exception("Snapshot refresh failed")
