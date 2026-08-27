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
import asyncio
import logging
from collections import Counter
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal

import httpx
import pytz
from sqlalchemy import (
    Boolean, Date, Numeric, String, Text, bindparam, delete, func, or_, select, update,
)
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.db.models import StockSnapshot
from app.db.session import async_session
from app.services.market_data import evaluate_dividend, market_data_service

logger = logging.getLogger(__name__)

EASTERN = pytz.timezone("America/New_York")
FMP_BASE = "https://financialmodelingprep.com/stable"
QUOTE_BATCH_SIZE = 1000
MARKET_OPEN = time(9, 30)
MARKET_CLOSE = time(16, 0)

# Company-profile backfill. Runs once per trading day against whatever is still missing,
# so the limit only has to outpace the daily inflow of new universe members plus drain
# the standing backlog within a run or two. At PROFILE_CONCURRENCY=8 a full 5000 costs
# roughly three minutes and ~5000 FMP calls — comfortably inside the rate allowance.
PROFILE_FILL_LIMIT = 5000
PROFILE_CONCURRENCY = 8

# Drift correction budget, spent on rows that ALREADY have a profile. Filling only NULLs
# would freeze whatever was written first, and /stocks/sectors now trusts the stored value
# instead of re-fetching per request — so without this pass a sector that changed at FMP,
# or was wrong when first written, could never be corrected.
#
# Set deliberately above the universe size so the rotation collapses to a single window and
# EVERY stored profile is re-verified on every daily run — accuracy is the priority here,
# and the cost is minor: ~4.4k calls in ~3.5 min at PROFILE_CONCURRENCY=8, against a
# ~3000/min allowance. Lowering this below the row count re-enables the rotating window
# (a full cycle every ceil(populated / this) days) if that trade ever needs revisiting.
PROFILE_REFRESH_LIMIT = 25_000

# Dividend gate concurrency. Only tickers /company-screener reports a nonzero dividend for
# are evaluated: one it reports as zero cannot produce a false *high* yield, which is the
# failure mode being fixed, and this roughly halves the added calls.
DIVIDEND_CONCURRENCY = 8

# Exchanges that count as "US common stock" for the screener universe
US_EXCHANGES = {"NYSE", "NASDAQ", "AMEX"}

# (symbol, name, last_annual_dividend, beta) — fundamentals captured from
# /company-screener on the daily rebuild; None means "don't touch the stored value".
#
# Sector/industry are deliberately NOT sourced here. /company-screener disagrees with
# /stable/profile on some tickers (NFE: screener says Utilities, profile says Energy),
# and the profile is what /company/{ticker} shows the user. One source only — see
# _update_company_profiles.
UniverseRow = tuple[str, str, float | None, float | None]


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
        tickers.append((sym, name, div, beta))

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
    # Fundamentals are None here so intraday refreshes never touch last_annual_dividend
    # or beta; the values captured on the daily rebuild persist untouched (see _fetch_quotes).
    async with async_session() as session:
        rows = (await session.execute(
            select(StockSnapshot.symbol, StockSnapshot.name)
        )).all()
    return [(r.symbol, r.name or "", None, None) for r in rows]


async def _fetch_quotes(
    api_key: str,
    tickers: list[UniverseRow],
    include_fundamentals: bool = False,
) -> list[dict]:
    name_map = {t[0]: t[1] for t in tickers}
    div_map = {t[0]: t[2] for t in tickers}
    beta_map = {t[0]: t[3] for t in tickers}
    symbols = list(name_map)
    # Keyed by symbol so a symbol echoed in more than one batch response collapses to one
    # row. Previously these accumulated in a list, which both inflated the "N symbols"
    # figure in the logs and sent redundant params through the upsert.
    by_symbol: dict[str, dict] = {}
    duplicates = 0
    # Exchange values that failed the US_EXCHANGES gate. Logged so a silent mismatch —
    # FMP returning "NASDAQ Global Select" where we expect "NASDAQ", say — shows up as a
    # dropped-stock count rather than quietly shrinking the screener universe.
    rejected_exchanges: Counter = Counter()
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
                        rejected_exchanges[q.get("exchange")] += 1
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
                        # is_etf is deliberately NOT set here. It used to be hardcoded
                        # False on every row, which was fabricated data — batch-quote
                        # carries no such flag. _update_company_profiles now owns the
                        # column and derives it from /stable/profile. Omitting the key
                        # leaves the stored value untouched, the same way beta and
                        # last_annual_dividend are preserved intraday below.
                    }
                    # Only written on the daily rebuild (include_fundamentals). Every row
                    # in the batch carries these keys so the multi-row upsert stays uniform;
                    # intraday refreshes omit them entirely, preserving the stored values.
                    if include_fundamentals:
                        row["last_annual_dividend"] = div_map.get(sym)
                        row["beta"] = beta_map.get(sym)
                    if sym in by_symbol:
                        duplicates += 1
                    by_symbol[sym] = row
            except Exception as e:
                print(f"⚠️ Batch {i}–{i + QUOTE_BATCH_SIZE} failed: {e}", flush=True)
                logger.warning(f"Batch {i}–{i + QUOTE_BATCH_SIZE} failed: {e}")

    if duplicates:
        msg = f"batch-quote echoed {duplicates} duplicate symbol(s); collapsed to one row each"
        print(f"⚠️ {msg}", flush=True)
        logger.warning(msg)

    if rejected_exchanges:
        top = ", ".join(
            f"{val!r}={cnt}" for val, cnt in rejected_exchanges.most_common(10)
        )
        dropped = sum(rejected_exchanges.values())
        msg = (
            f"{dropped} quote(s) dropped by the {sorted(US_EXCHANGES)} gate — "
            f"top exchanges: {top}"
        )
        print(f"📊 {msg}", flush=True)
        logger.info(msg)

    return list(by_symbol.values())


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


_MISSING_PROFILE = or_(
    StockSnapshot.sector.is_(None),
    StockSnapshot.description.is_(None),
)

_PROFILE_CHUNK = 1_000


async def _missing_profile_count() -> int:
    async with async_session() as session:
        return await session.scalar(
            select(func.count())
            .select_from(StockSnapshot.__table__)
            .where(_MISSING_PROFILE)
        ) or 0


async def _update_company_profiles(
    limit: int = PROFILE_FILL_LIMIT,
    refresh_limit: int = PROFILE_REFRESH_LIMIT,
) -> int | None:
    """
    Fill in missing company profiles (sector, industry, description) from /stable/profile.

    /stable/profile is the ONLY source for stored sector/industry, because it is what
    /company/{ticker} shows in Company Details and what /stocks/sectors reads. Sourcing
    them anywhere else lets the same ticker carry two different sectors.

    Targets rows that are actually missing data rather than a random sample. The previous
    version sampled 200 random symbols per run and so never converged: the universe is
    rebuilt daily and every new member arrives with sector = NULL, replenishing the backlog
    at least as fast as it drained. Ordered by market cap so the symbols users are most
    likely to look at are filled first.

    Symbols FMP has no profile for stay NULL and are retried every run. That is cheap while
    they are few — watch the "still missing" count logged below. If it plateaus well above
    zero, those symbols need excluding from `_MISSING_PROFILE` rather than being retried
    forever.

    A second, smaller pass re-fetches rows that already have a profile, so stored values
    cannot drift permanently out of step with FMP — see `PROFILE_REFRESH_LIMIT`. Pass
    `refresh_limit=0` to skip it when only coverage matters.

    **Returns:** how many symbols still match `_MISSING_PROFILE` afterwards, or None if the
    run failed. `_drain_company_profiles` uses this to stop once the count stops falling.
    Note the refresh pass cannot change that count: COALESCE only ever fills a field, so a
    stored value is never nulled back out.
    """
    try:
        async with async_session() as session:
            missing = list((await session.execute(
                select(StockSnapshot.symbol)
                .where(_MISSING_PROFILE)
                .order_by(StockSnapshot.market_cap.desc().nulls_last())
                .limit(limit)
            )).scalars().all())

            # Rotating drift-correction window over the already-populated rows.
            # `~_MISSING_PROFILE` rather than a separate predicate, so the two pools are
            # provably complementary and cannot drift apart if _MISSING_PROFILE changes.
            # The window advances by day-of-year; if the universe size shifts, a symbol may
            # be covered twice or skipped for a cycle, which is fine for best-effort drift
            # correction.
            refresh: list[str] = []
            if refresh_limit > 0:
                populated = await session.scalar(
                    select(func.count())
                    .select_from(StockSnapshot.__table__)
                    .where(~_MISSING_PROFILE)
                ) or 0
                if populated:
                    cycles = (populated + refresh_limit - 1) // refresh_limit
                    window = datetime.now(timezone.utc).timetuple().tm_yday % cycles
                    refresh = list((await session.execute(
                        select(StockSnapshot.symbol)
                        .where(~_MISSING_PROFILE)
                        .order_by(StockSnapshot.symbol)
                        .limit(refresh_limit)
                        .offset(window * refresh_limit)
                    )).scalars().all())

        # Disjoint by construction — one pool is exactly the complement of the other.
        symbols = missing + refresh

        if not symbols:
            print("📊 Company profiles: nothing to do", flush=True)
            return 0

        print(
            f"📊 Company profiles: filling {len(missing)} missing, "
            f"refreshing {len(refresh)} stored",
            flush=True,
        )

        # Bounded so a 5000-symbol backfill can't open 5000 sockets at once. Matches the
        # concurrency /stocks/sectors uses for the same call.
        sem = asyncio.Semaphore(PROFILE_CONCURRENCY)

        async def _fetch(symbol: str) -> dict | None:
            async with sem:
                try:
                    info = await market_data_service.get_company_info(symbol)
                except Exception as e:
                    logger.debug(f"Failed to fetch profile for {symbol}: {e}")
                    return None

            # get_company_info substitutes "Other" when the profile carries no sector.
            # That must never overwrite a real label, and /stocks/sectors treats it as
            # "no answer" too. None here means "leave whatever is stored alone".
            sector = info.get("sector")
            if not sector or sector == "Other":
                sector = None

            return {
                "b_symbol": symbol,
                "b_sector": sector,
                "b_industry": info.get("industry") or None,
                "b_description": info.get("description") or None,
                # get_company_info sets type == "ETF" exactly when the profile's isEtf
                # is true, so this is a real answer rather than the False that used to be
                # hardcoded into every quote refresh. Always a bool — this dict is only
                # built on a successful profile fetch — so it needs no COALESCE guard.
                "b_is_etf": info.get("type") == "ETF",
            }

        fetched = await asyncio.gather(*(_fetch(s) for s in symbols))
        rows = [
            r for r in fetched
            if r and (r["b_sector"] or r["b_industry"] or r["b_description"])
        ]

        if not rows:
            logger.info("No company profiles resolved")
            return await _missing_profile_count()

        # UPDATE-only — every symbol here came from the universe, so it already has a row,
        # and we must not resurrect one that _prune_universe removed.
        #
        # COALESCE keeps the stored value wherever FMP returned nothing for that field.
        # That is what lets every row carry an identical parameter set, which in turn lets
        # this be one executemany per chunk instead of the previous statement-per-symbol
        # loop — the difference between ~5000 round trips and 5.
        tbl = StockSnapshot.__table__
        stmt = (
            update(tbl)
            .where(tbl.c.symbol == bindparam("b_symbol"))
            .values(
                sector=func.coalesce(bindparam("b_sector", type_=String), tbl.c.sector),
                industry=func.coalesce(bindparam("b_industry", type_=String), tbl.c.industry),
                description=func.coalesce(bindparam("b_description", type_=Text), tbl.c.description),
                is_etf=bindparam("b_is_etf", type_=Boolean),
            )
        )

        async with async_session() as session:
            for i in range(0, len(rows), _PROFILE_CHUNK):
                await session.execute(stmt, rows[i:i + _PROFILE_CHUNK])
            await session.commit()

        remaining = await _missing_profile_count()

        summary = (
            f"Company profiles: resolved {len(rows)}/{len(symbols)} "
            f"({len(missing)} fill + {len(refresh)} refresh), {remaining} still missing"
        )
        print(f"📊 {summary}", flush=True)
        logger.info(summary)
        return remaining
    except Exception as e:
        logger.warning(f"Failed to update company profiles: {e}")
        return None


async def _update_dividends() -> int | None:
    """
    Store recency-gated dividend figures for every ticker that reports a dividend.

    The screener derives its yield from `last_annual_dividend`, FMP's raw trailing
    per-share figure from /company-screener. That column carries no ex-date, so a payer
    that stopped still annualizes against a collapsed price — NFE reported ~124%. The gate
    that fixes this already exists in `evaluate_dividend`, and /dividends/{ticker} and
    portfolio analysis both use it; the screener was the one path bypassing it.

    So rather than reimplement the gate in SQL, this runs the real function and stores its
    output. Yield stays derived live against price in screener.py, so it tracks the 15-min
    quote refresh instead of freezing at fetch time.

    Assignments here are deliberately NOT wrapped in COALESCE, unlike the profile pass: a
    payer that lapses must be able to clear a previously stored figure back to NULL. That
    is the entire point.

    **Returns:** number of tickers evaluated, or None if the run failed.
    """
    try:
        async with async_session() as session:
            payers = (await session.execute(
                select(StockSnapshot.symbol, StockSnapshot.price)
                .where(
                    StockSnapshot.last_annual_dividend.isnot(None),
                    StockSnapshot.last_annual_dividend > 0,
                )
                .order_by(StockSnapshot.market_cap.desc().nulls_last())
            )).all()

        if not payers:
            print("📊 Dividends: no payers to evaluate", flush=True)
            return 0

        print(f"📊 Dividends: evaluating {len(payers)} payers", flush=True)

        sem = asyncio.Semaphore(DIVIDEND_CONCURRENCY)

        async def _fetch(symbol: str, price) -> dict | None:
            async with sem:
                try:
                    info = await market_data_service.get_dividends(symbol)
                except Exception as e:
                    logger.debug(f"Failed to fetch dividends for {symbol}: {e}")
                    return None

            # Price matters: evaluate_dividend reports "unknown" rather than "active"
            # when it has no price to quote a yield against.
            assessment = evaluate_dividend(info.get("dividends") or [], price)

            annual = assessment["annual_dividend"]
            last_ex = assessment["last_ex_date"]
            return {
                "b_symbol": symbol,
                # str() first — the column is Numeric and asyncpg is strict about
                # float-to-numeric coercion.
                "b_dividend_annual": Decimal(str(annual)) if annual is not None else None,
                "b_dividend_status": assessment["dividend_status"],
                "b_dividend_last_ex_date": date.fromisoformat(last_ex) if last_ex else None,
            }

        fetched = await asyncio.gather(*(_fetch(sym, px) for sym, px in payers))
        rows = [r for r in fetched if r]

        if not rows:
            logger.info("No dividends resolved")
            return 0

        tbl = StockSnapshot.__table__
        stmt = (
            update(tbl)
            .where(tbl.c.symbol == bindparam("b_symbol"))
            .values(
                dividend_annual=bindparam("b_dividend_annual", type_=Numeric(18, 4)),
                dividend_status=bindparam("b_dividend_status", type_=String),
                dividend_last_ex_date=bindparam("b_dividend_last_ex_date", type_=Date),
            )
        )

        async with async_session() as session:
            for i in range(0, len(rows), _PROFILE_CHUNK):
                await session.execute(stmt, rows[i:i + _PROFILE_CHUNK])
            await session.commit()

        by_status = Counter(r["b_dividend_status"] for r in rows)
        summary = (
            f"Dividends: evaluated {len(rows)}/{len(payers)} payers — "
            + ", ".join(f"{k}={v}" for k, v in sorted(by_status.items()))
        )
        print(f"📊 {summary}", flush=True)
        logger.info(summary)
        return len(rows)
    except Exception as e:
        logger.warning(f"Failed to update dividends: {e}")
        return None


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

        # Fill in missing company profiles (once per trading day, after the rebuild so
        # the day's new universe members are already in the table and visible to it)
        if should_rebuild:
            await _update_company_profiles()
            # After profiles: needs the price written by _upsert above, and reads
            # last_annual_dividend which the rebuild just refreshed.
            await _update_dividends()

        print(f"✅ Snapshot refresh complete — {len(rows)} symbols", flush=True)
        logger.info(f"Snapshot refresh complete — {len(rows)} symbols")
    except Exception as exc:
        print(f"❌ Snapshot refresh failed: {exc}", flush=True)
        logger.exception("Snapshot refresh failed")


async def _drain_company_profiles() -> None:
    """Run the profile fill repeatedly until coverage stops improving.

    For clearing a standing backlog in one sitting rather than waiting for the daily
    trigger. Stops on no progress, which is the signal that the remaining symbols have no
    profile at FMP — retrying those forever would just burn calls.

    Skips the drift-correction pass (`refresh_limit=0`): it cannot reduce the missing count,
    so on a multi-iteration drain it would re-fetch the same window every pass for nothing.
    The daily job still runs it.

        railway run python -m app.tasks.refresh_stock_snapshots
    """
    from app.services.fmp_client import close_fmp_client, init_fmp_client

    await init_fmp_client()
    try:
        previous: int | None = None
        while True:
            remaining = await _update_company_profiles(refresh_limit=0)
            if remaining is None:
                print("❌ Profile fill failed — see log; stopping", flush=True)
                return
            if remaining == 0:
                print("✅ Company profile coverage complete", flush=True)
                return
            if previous is not None and remaining >= previous:
                print(
                    f"⚠️ No progress — {remaining} symbols have no profile at FMP; stopping",
                    flush=True,
                )
                return
            previous = remaining
    finally:
        await close_fmp_client()


if __name__ == "__main__":
    asyncio.run(_drain_company_profiles())
