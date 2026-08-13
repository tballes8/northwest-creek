"""
APScheduler job: refresh stock_snapshots from FMP /stable/batch-quote.

Cadence (enforced inside the job, not by the scheduler):
- Market hours (Mon–Fri 9:30–16:00 ET): runs every invocation (~15 min)
- Off-hours: one run after the most recent market close (to capture closing
  prices), then skips until the next open — prices don't move overnight or
  on weekends, so hourly re-fetches were pure API waste

Initial population: if the table is empty, fetches /stock-list first to build
the universe (US common stocks on NYSE/NASDAQ/AMEX, no ETFs, no warrants).
Subsequent runs only re-fetch quotes for the existing symbol universe.
"""
import logging
from datetime import datetime, time, timedelta, timezone

import httpx
import pytz
from sqlalchemy import delete, func, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.db.models import StockSnapshot
from app.db.session import async_session
from app.services.market_data import market_data_service

logger = logging.getLogger(__name__)

EASTERN = pytz.timezone("America/New_York")
FMP_BASE = "https://financialmodelingprep.com/stable"
QUOTE_BATCH_SIZE = 1000
MARKET_OPEN = time(9, 30)
MARKET_CLOSE = time(16, 0)

# Exchanges that count as "US common stock" for the screener universe
US_EXCHANGES = {"NYSE", "NASDAQ", "AMEX"}

# (symbol, name, last_annual_dividend, beta, sector, industry) — captured from
# /company-screener on the daily rebuild; None means "don't touch the stored value".
UniverseRow = tuple[str, str, float | None, float | None, str | None, str | None]


def _is_market_hours() -> bool:
    now = datetime.now(EASTERN)
    return (
        now.weekday() < 5
        and MARKET_OPEN <= now.time() <= MARKET_CLOSE
    )


def _last_market_close() -> datetime:
    """Most recent weekday 16:00 ET close that has already passed."""
    now = datetime.now(EASTERN)
    d = now.date()
    while True:
        if d.weekday() < 5:
            close = EASTERN.localize(datetime.combine(d, MARKET_CLOSE))
            if close <= now:
                return close
        d -= timedelta(days=1)


async def _last_refresh_ts() -> datetime | None:
    async with async_session() as session:
        result = await session.scalar(select(func.max(StockSnapshot.last_refreshed)))
        if result and result.tzinfo is None:
            result = result.replace(tzinfo=timezone.utc)
        return result


async def _build_universe(api_key: str) -> list[UniverseRow]:
    """Fetch /company-screener and return UniverseRow tuples — US common stocks only, no ETFs/funds.

    Carries the two fundamentals the screener needs but batch-quote doesn't provide:
    last_annual_dividend (trailing per-share $, yield derived live against price) and
    beta. Refreshed here on the daily rebuild only — both change slowly enough that
    once-a-day is frequent enough.

    Also carries sector/industry, which this response already includes at no extra
    API cost. That gives the whole universe a sector every rebuild — /stocks/sectors
    serves it, so the app's sector labels match the Company Details panel.
    """
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

    def _num(raw) -> float | None:
        try:
            return float(raw) if raw is not None else None
        except (TypeError, ValueError):
            return None

    tickers: list[UniverseRow] = []
    for s in (stock_list or []):
        if not isinstance(s, dict):
            continue
        sym = (s.get("symbol") or "").strip()
        if not sym or "." in sym or len(sym) > 10:
            continue
        name = s.get("companyName") or s.get("name") or ""
        div = _num(s.get("lastAnnualDividend"))
        # Guard against FMP's occasional negative/garbage dividend values.
        if div is not None and div < 0:
            div = None
        beta = _num(s.get("beta"))
        sector = (s.get("sector") or "").strip() or None
        industry = (s.get("industry") or "").strip() or None
        tickers.append((sym, name, div, beta, sector, industry))

    print(f"📊 Universe built: {len(tickers)} CS tickers", flush=True)
    logger.info(f"Universe built: {len(tickers)} CS tickers")
    return tickers


async def _prune_universe(tickers: list[UniverseRow]) -> None:
    """Remove DB rows for symbols no longer in the filtered universe (ETFs/funds that slipped in)."""
    current = {t[0] for t in tickers}
    async with async_session() as session:
        db_symbols = set((await session.execute(select(StockSnapshot.symbol))).scalars().all())
        stale = db_symbols - current
        if stale:
            await session.execute(delete(StockSnapshot).where(StockSnapshot.symbol.in_(stale)))
            await session.commit()
            print(f"📊 Pruned {len(stale)} stale/excluded symbols from universe", flush=True)
            logger.info(f"Pruned {len(stale)} stale/excluded symbols from universe")


async def _existing_universe() -> list[UniverseRow]:
    # Fundamentals and profile fields are None here so intraday refreshes never touch
    # last_annual_dividend, beta, sector or industry; the values captured on the daily
    # rebuild persist untouched (see _fetch_quotes).
    async with async_session() as session:
        rows = (await session.execute(
            select(StockSnapshot.symbol, StockSnapshot.name)
        )).all()
    return [(r.symbol, r.name or "", None, None, None, None) for r in rows]


async def _fetch_quotes(
    api_key: str,
    tickers: list[UniverseRow],
    include_fundamentals: bool = False,
) -> list[dict]:
    name_map = {t[0]: t[1] for t in tickers}
    div_map = {t[0]: t[2] for t in tickers}
    beta_map = {t[0]: t[3] for t in tickers}
    sector_map = {t[0]: t[4] for t in tickers}
    industry_map = {t[0]: t[5] for t in tickers}
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
                    row = {
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
                    }
                    # Only written on the daily rebuild (include_fundamentals). Every row
                    # in the batch carries these keys so the multi-row upsert stays uniform;
                    # intraday refreshes omit them entirely, preserving the stored values.
                    if include_fundamentals:
                        row["last_annual_dividend"] = div_map.get(sym)
                        row["beta"] = beta_map.get(sym)
                        row["sector"] = sector_map.get(sym)
                        row["industry"] = industry_map.get(sym)
                    rows.append(row)
            except Exception as e:
                print(f"⚠️ Batch {i}–{i + QUOTE_BATCH_SIZE} failed: {e}", flush=True)
                logger.warning(f"Batch {i}–{i + QUOTE_BATCH_SIZE} failed: {e}")

    return rows


_UPSERT_CHUNK = 1_000  # asyncpg caps params at 32767; 20 cols × 1000 = 20000

# The screener leaves sector/industry blank for a handful of symbols. Coalesce those
# so a blank response never wipes a value we already have.
_PRESERVE_IF_NULL = {"sector", "industry"}


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
                set_={
                    col: (
                        func.coalesce(stmt.excluded[col], getattr(StockSnapshot, col))
                        if col in _PRESERVE_IF_NULL
                        else stmt.excluded[col]
                    )
                    for col in update_cols
                },
            )
            await session.execute(stmt)
        await session.commit()
    logger.info(f"Upserted {len(rows)} snapshots")


async def _update_company_profiles(symbols: list[str], limit: int = 100) -> None:
    """
    Update company descriptions for a random subset of stocks, for keyword search.
    This runs less frequently than price updates since profiles rarely change.

    Sector and industry are NOT written here — the daily rebuild sets those for the
    entire universe from /company-screener (see _build_universe). This job only sees
    a random `limit` symbols per run, and get_company_info falls back to "Other" when
    FMP omits a sector, so letting it write those columns would both undo full
    coverage and risk overwriting a good label with "Other".
    """
    try:
        # Randomly select stocks to update profiles for (to spread the load)
        import random
        symbols_to_update = random.sample(symbols, min(limit, len(symbols)))

        print(f"📊 Updating company descriptions for {len(symbols_to_update)} symbols", flush=True)

        profile_data = []
        for symbol in symbols_to_update:
            try:
                info = await market_data_service.get_company_info(symbol)
                profile_data.append({
                    "symbol": symbol,
                    "description": info.get("description"),
                })
            except Exception as e:
                logger.debug(f"Failed to fetch profile for {symbol}: {e}")
                continue

        if profile_data:
            # UPDATE-only — every symbol here came from the universe, so it already
            # has a row, and we must not resurrect one that _prune_universe removed.
            async with async_session() as session:
                for profile in profile_data:
                    if not profile["description"]:
                        continue
                    await session.execute(
                        update(StockSnapshot)
                        .where(StockSnapshot.symbol == profile["symbol"])
                        .values(description=profile["description"])
                    )
                await session.commit()
            logger.info(f"Updated {len(profile_data)} company descriptions")
    except Exception as e:
        logger.warning(f"Failed to update company profiles: {e}")


async def refresh_stock_snapshots_job(api_key: str) -> None:
    """Entry point called by APScheduler every 15 minutes."""
    if not _is_market_hours():
        last_ts = await _last_refresh_ts()
        # One refresh after the close captures final prices; after that,
        # nothing changes until the next open — skip entirely.
        if last_ts and last_ts >= _last_market_close():
            print("📊 Off-hours throttle: closing snapshot already taken, skipping", flush=True)
            logger.debug("Off-hours throttle: closing snapshot already taken, skipping")
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

        rows = await _fetch_quotes(api_key, tickers, include_fundamentals=should_rebuild)
        await _upsert(rows)

        # Update company profiles periodically (once per day or on rebuild)
        if should_rebuild:
            # Update profiles for a subset of stocks to avoid rate limits
            symbols = [t[0] for t in tickers]
            await _update_company_profiles(symbols, limit=200)

        print(f"✅ Snapshot refresh complete — {len(rows)} symbols", flush=True)
        logger.info(f"Snapshot refresh complete — {len(rows)} symbols")
    except Exception as exc:
        print(f"❌ Snapshot refresh failed: {exc}", flush=True)
        logger.exception("Snapshot refresh failed")
