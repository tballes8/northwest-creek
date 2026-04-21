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
from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.db.models import StockSnapshot
from app.db.session import async_session

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
    """Fetch /stock-list and return filtered (symbol, name) pairs."""
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.get(
            f"{FMP_BASE}/stock-list",
            params={"apikey": api_key},
        )
        resp.raise_for_status()
        stock_list = resp.json()

    tickers: list[tuple[str, str]] = []
    for s in (stock_list or []):
        sym = s.get("symbol", "")
        ex = s.get("exchangeShortName", "")
        asset_type = s.get("type", "")
        if not sym or "." in sym or len(sym) > 10:
            continue
        if ex not in US_EXCHANGES:
            continue
        if asset_type in ("ETF", "WARRANT"):
            continue
        tickers.append((sym, s.get("name") or ""))

    print(f"📊 Universe built: {len(tickers)} US CS tickers", flush=True)
    logger.info(f"Universe built: {len(tickers)} US CS tickers")
    return tickers


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
                    })
            except Exception as e:
                print(f"⚠️ Batch {i}–{i + QUOTE_BATCH_SIZE} failed: {e}", flush=True)
                logger.warning(f"Batch {i}–{i + QUOTE_BATCH_SIZE} failed: {e}")

    return rows


async def _upsert(rows: list[dict]) -> None:
    if not rows:
        return
    update_cols = [c for c in rows[0] if c != "symbol"]
    async with async_session() as session:
        stmt = pg_insert(StockSnapshot).values(rows)
        stmt = stmt.on_conflict_do_update(
            index_elements=["symbol"],
            set_={col: stmt.excluded[col] for col in update_cols},
        )
        await session.execute(stmt)
        await session.commit()
    logger.info(f"Upserted {len(rows)} snapshots")


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
        async with async_session() as session:
            count = await session.scalar(select(func.count(StockSnapshot.id)))

        if count == 0:
            tickers = await _build_universe(api_key)
        else:
            tickers = await _existing_universe()

        rows = await _fetch_quotes(api_key, tickers)
        await _upsert(rows)
        print(f"✅ Snapshot refresh complete — {len(rows)} symbols", flush=True)
        logger.info(f"Snapshot refresh complete — {len(rows)} symbols")
    except Exception as exc:
        print(f"❌ Snapshot refresh failed: {exc}", flush=True)
        logger.exception("Snapshot refresh failed")
