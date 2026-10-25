"""
APScheduler job: refresh stock_snapshots from FMP /stable/batch-quote.

Cadence (enforced inside the job, not by the scheduler):
- Market hours (Mon–Fri 9:30–16:00 ET): runs every invocation (~15 min)
- Off-hours: one run after the most recent market close (to capture closing
  prices), then skips until the next open — prices don't move overnight or
  on weekends, so hourly re-fetches were pure API waste

Universe: /company-screener is called twice on the daily rebuild — isEtf=false for
common stocks and isEtf=true for ETFs, both restricted to symbols LISTED on a US exchange
(not US-domiciled; see _SCREENER_EXCHANGES). Mutual funds and CEFs are excluded from
both legs. Which leg a symbol arrives on is the definition of stock_snapshots.is_etf,
which is what the screener's Stocks|ETFs mode filters on. Subsequent intraday runs
only re-fetch quotes for the existing symbol universe.

Daily enrichment runs in a fixed order after the upsert: company profiles (stocks
only), then ETF metadata (funds only), then dividends (universe-wide), then valuation
multiples (stocks only, after profiles because it reads the CIK they store).
"""
import asyncio
import logging
import re
from collections import Counter
from datetime import date, datetime, time, timedelta, timezone
from typing import NamedTuple
from decimal import Decimal

import httpx
import pytz
from sqlalchemy import (
    BigInteger, Date, DateTime, Integer, Numeric, String, Text, bindparam, delete, func, or_, select,
    update,
)
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.db.models import StockSnapshot
from app.db.session import async_session
from app.services.edgar_identity import (
    CANNOT_RESOLVE, CONTRADICTION, build_entity_trust, normalize_cik,
    resolve_contradiction, resolve_fund_ticker, resolve_ticker_cik, warm_ticker_map,
)
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

# ETF metadata pass. One etf/info call per fund, ~4.7k of them, once per trading day.
# No rotation window: the whole fund universe fits in a single daily run, which is what
# makes etf_info_refreshed_at readable as staleness rather than as a rotation artifact.
ETF_INFO_CONCURRENCY = 8
ETF_INFO_LIMIT = 8_000  # runaway guard, same spirit as PROFILE_FILL_LIMIT

# Dividend gate concurrency. Only tickers /company-screener reports a nonzero dividend for
# are evaluated: one it reports as zero cannot produce a false *high* yield, which is the
# failure mode being fixed, and this roughly halves the added calls.
DIVIDEND_CONCURRENCY = 8

# Valuation pass: one /stable/ratios-ttm call per stock, ~4.4k a day. Same budget and
# concurrency as the profile pass, which it runs after.
VALUATION_CONCURRENCY = 8

# Anything at or past this is a vendor artefact, not a multiple (a P/E of a billion means
# earnings rounded to ~0). Dropped so it costs that field rather than overflowing the
# Numeric(14, 4) column and failing the whole batch UPDATE.
_MULTIPLE_CEILING = 1e9
# Floors, applied in clean_multiple: below these a multiple is a data artifact, not a
# bargain, and is stored as NULL like a negative one. Measured on the 2026-10-25 local
# rebuild (4,642 stocks):
# - P/E < 1 (33 rows) was SPAC trust interest against a $10 share, a one-time gain
#   (Sabre's unit sale, Aimco's asset sales) or a CVR. Earning more than the whole
#   market cap in twelve months is an event, not a valuation.
# - P/B < 0.1 (97 rows) was FMP's book value mis-scaled: Atlantic Union Bankshares at
#   0.001, Alpha and Omega Semiconductor at 0.001, Cable One at 0.084. A bank trades
#   at 0.3x book in a crisis, never 0.001x. 0.1 keeps the distressed REITs and BDCs.
# - EV/EBITDA < 1 (107 rows) was almost entirely negative EV over negative EBITDA,
#   two minus signs cancelling into a "cheap" positive on cash-rich biotechs.
_PE_FLOOR = 1.0
_PB_FLOOR = 0.1
_EV_EBITDA_FLOOR = 1.0

# Exchanges that count as a US listing for the screener universe.
#
# These are batch-quote's `exchange` values, which are NOT what /company-screener
# reports for the same symbol — the screener says "New York Stock Exchange Arca" and
# "Chicago Board Options Exchange" where batch-quote says "AMEX" and "CBOE". The gate
# below reads batch-quote, so it must be spelled batch-quote's way.
#
# CBOE is here because Cboe BZX lists ~14% of US ETFs (measured over a 1000-symbol
# sample by scripts/probe_etf_universe.py: AMEX 644, NASDAQ 202, CBOE 143, NYSE 10).
# Without it those funds are fetched and then silently dropped — the ETF screener
# would just be missing ~675 funds with nothing in the logs to say why.
#
# OTC is deliberately NOT here. It was 1 symbol in that sample, and since this gate
# applies to every row, adding it would also admit OTC common stock to the stock
# screener — a change to stock-side behaviour that buys one fund.
US_EXCHANGES = {"NYSE", "NASDAQ", "AMEX", "CBOE"}

# Compared case-insensitively: the gate drops silently, so a vendor-side casing or
# whitespace change ("Nasdaq", "NYSE ") would quietly shrink the universe.
_US_EXCHANGES_NORM = {e.upper() for e in US_EXCHANGES}

# The universe is "listed on a US exchange", asked of /company-screener by exchange.
#
# It used to be country=US, but FMP's `country` is where the company is domiciled, not
# where it trades. Measured 2026-10-25: that left out 1,396 US-listed stocks, 233 of them
# over $10B — TSM, ASML, Toyota, Shopify, Royal Bank, and S&P 500 members domiciled in
# Ireland, the UK, Switzerland or Bermuda (Accenture, Medtronic, Linde, Chubb, Eaton).
# The exchange filter keeps every domestic name the old filter had, bar one stock the
# screener had already moved to OTC. On the ETF leg it adds one fund (GDLC, Cayman).
#
# The `exchange` parameter takes the same short names batch-quote reports (each value
# verified to return only its own exchangeShortName; CBOE carries one stock and ~1,600
# ETFs), so this is derived from US_EXCHANGES rather than kept as a second list that
# could drift. One comma-separated call returns exactly the union of per-exchange calls.
_SCREENER_EXCHANGES = ",".join(sorted(US_EXCHANGES))

# /company-screener page size. The request is unpaginated, so a universe that outgrows
# this is silently clipped — there is no error, the response is just short.
#
# Raised from 10_000 after measuring: the stock leg returns ~9,105 rows, which was 91%
# of the old cap. Verified that FMP honours a larger limit and that ~9,104 is the real
# universe size rather than a truncation — limit=20000 and limit=50000 both return the
# same count. So this is headroom, not a bigger fetch.
#
# Two guards below, because arriving AT the cap means data has already been lost:
# _screener_leg warns at SCREENER_WARN_FRACTION (before clipping) and again at the cap
# itself. Either warning is the signal to start passing `page`.
SCREENER_LIMIT = 20_000

# Warn when a leg's response reaches this share of SCREENER_LIMIT — early enough to act
# before the universe actually starts being clipped.
SCREENER_WARN_FRACTION = 0.9

# Share of the stored universe _prune_universe may delete in one run. A truncated or
# partially-served company-screener response is indistinguishable from a mass delisting,
# and the prune takes those symbols out of the screener until a later rebuild puts them
# back. Past this share the delete is skipped for a human to look at; real daily churn is
# a handful of rows.
PRUNE_MAX_DELETE_FRACTION = 0.10

# Fundamentals captured from /company-screener on the daily rebuild; None means
# "don't touch the stored value".
#
# Sector/industry are deliberately NOT sourced here. /company-screener disagrees with
# /stable/profile on some tickers (NFE: screener says Utilities, profile says Energy),
# and the profile is what /company/{ticker} shows the user. One source only — see
# _update_company_profiles.
#
# A NamedTuple rather than a plain tuple so is_etf could be added without touching the
# positional unpacking that already existed.
class UniverseRow(NamedTuple):
    symbol: str
    name: str
    last_annual_dividend: float | None
    beta: float | None
    # Which /company-screener leg this symbol arrived on. That IS the definition of
    # stock_snapshots.is_etf — see _build_universe.
    is_etf: bool


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


# Instruments /company-screener's stock leg returns that are not common stock: warrants,
# SPAC units and rights, preferreds and depositary shares, exchange-traded notes and
# baby bonds, and synthetic trust certificates. FMP has no instrument-type field on the
# screener and the symbol alone is not enough: most carry a plain five-letter ticker
# (ACGCW warrants, IDACU units, CGABL notes), so the name is checked too. Measured
# 2026-10-25: 286 of 4,642 stock-leg rows, none of them common stock, many listed with
# the parent's market cap (a Bank of America note at $175B). They passed every screen
# and, carrying junk multiples, led every P/E-ascending sort.
_NON_COMMON_SYMBOL = re.compile(r"-(P[A-Z]?|WT|WS|UN?|RI?)$")   # -PA preferred, -WT warrant, -UN unit, -RI rights
# "Depositary shares" means a preferred stake only when it is not "American Depositary
# Shares": an ADR is the US line of a foreign company's common stock (ARM, $224B, is
# named "Arm Holdings plc American Depositary Shares"). Every depositary name on the
# 2026-10-25 universe was an ADR; preferred depositaries are also caught by
# _PREFERRED_CONTEXT and their -P symbol suffixes.
_NON_COMMON_NAME = re.compile(
    r"\b(warrants?|units?|rights?|contingent value|pfd|(?<!american )depositary (shares?|receipts?)|"
    r"debentures?|subordinated|senior notes?|notes? due|bonds? due|trust certificates?|"
    r"synthetic fixed-income|strats|corts|saturns|pplus)\b",
    re.I,
)
# "Preferred" alone is a real company name (Preferred Bank, Preferred Apartment
# Communities); a preferred security's name also carries a coupon, series or share word.
_PREFERRED_WORD = re.compile(r"\bpreferred\b", re.I)
_PREFERRED_CONTEXT = re.compile(r"%|\b(series|stock|shares?|pfd|cum|non-?cum|perpetual|depositary|redeemable)\b", re.I)
# Nasdaq's fifth letter is an instrument code: W is a warrant, U a unit. FMP names most
# of these after the parent ("NioCorp Developments Ltd." for NIOBW, "Gores Holdings XI"
# for GHXIU), so the name rule above cannot see them; the shape alone can. Measured
# 2026-10-25 over 4,642 stock-leg rows: 22 five-letter-W symbols, all warrants; 84
# five-letter-U, all SPAC units; no common stock of either shape.
_UNIT_OR_WARRANT_SYMBOL = re.compile(r"^[A-Z]{4}[UW]$")
# Rights (fifth letter R) are rarer and a five-letter common could end in R, so they
# stay gated on a SPAC-shaped name. No trailing boundary: "Acquisitions Corp." and
# "Acquisition1 Corp" are both real names.
_SPAC_RIGHT_SYMBOL = re.compile(r"^[A-Z]{4}R$")
_SPAC_NAME = re.compile(r"\b(acquisition|merger|spac)", re.I)


def _is_common_stock(symbol: str, name: str) -> bool:
    """False for any instrument the screener's stock universe should not carry."""
    name = name or ""
    if _NON_COMMON_SYMBOL.search(symbol):
        return False
    if _NON_COMMON_NAME.search(name):
        return False
    if _PREFERRED_WORD.search(name) and _PREFERRED_CONTEXT.search(name):
        return False
    if _UNIT_OR_WARRANT_SYMBOL.match(symbol):
        return False
    if _SPAC_RIGHT_SYMBOL.match(symbol) and _SPAC_NAME.search(name):
        return False
    return True


async def _screener_leg(client, api_key: str, *, is_etf: bool) -> list[UniverseRow]:
    """One /company-screener call — the stock leg or the ETF leg.

    Both legs return the identical response shape, so the symbol filtering, numeric
    coercion and clipping check below are written once and used twice.
    """
    leg = "ETF" if is_etf else "CS"
    resp = await client.get(
        f"{FMP_BASE}/company-screener",
        params={
            "isEtf": "true" if is_etf else "false",
            # Excluded on BOTH legs. isFund pulls in mutual funds and closed-end funds,
            # which strike NAV once daily — batch-quote has nothing useful for them, so
            # the 15-minute refresh premise breaks. Most are absent from etf/info too, so
            # every fund-metadata column would be NULL. A "Stocks | ETFs" toggle does not
            # mean them. (The probe counted ~4.3k of them, if that ever changes.)
            "isFund": "false",
            "isActivelyTrading": "true",
            # By listing, not domicile — see _SCREENER_EXCHANGES. The "." filter below
            # and the US_EXCHANGES gate in _fetch_quotes still keep foreign home-market
            # lines (SHOP.TO, HSBA.L) out.
            "exchange": _SCREENER_EXCHANGES,
            "limit": SCREENER_LIMIT,
            "apikey": api_key,
        },
    )
    resp.raise_for_status()
    rows = resp.json()

    print(f"📊 company-screener {leg} raw count: "
          f"{len(rows) if isinstance(rows, list) else type(rows).__name__}", flush=True)

    if isinstance(rows, list) and len(rows) >= SCREENER_LIMIT:
        msg = (
            f"company-screener {leg} leg returned {len(rows)} rows, at the {SCREENER_LIMIT} "
            "limit — the universe IS being clipped; add `page` pagination to the request"
        )
        print(f"⚠️ {msg}", flush=True)
        logger.warning(msg)
    elif isinstance(rows, list) and len(rows) >= SCREENER_LIMIT * SCREENER_WARN_FRACTION:
        msg = (
            f"company-screener {leg} leg returned {len(rows)} rows, over "
            f"{SCREENER_WARN_FRACTION:.0%} of the {SCREENER_LIMIT} limit — not clipped "
            "yet, but raise SCREENER_LIMIT or add `page` before it is"
        )
        print(f"⚠️ {msg}", flush=True)
        logger.warning(msg)

    def _num(raw) -> float | None:
        try:
            return float(raw) if raw is not None else None
        except (TypeError, ValueError):
            return None

    out: list[UniverseRow] = []
    excluded = 0
    for r in (rows or []):
        if not isinstance(r, dict):
            continue
        sym = (r.get("symbol") or "").strip()
        if not sym or "." in sym or len(sym) > 10:
            continue
        name = r.get("companyName") or r.get("name") or ""
        if not is_etf and not _is_common_stock(sym, name):
            excluded += 1
            continue
        div = _num(r.get("lastAnnualDividend"))
        # Guard against FMP's occasional negative/garbage dividend values.
        if div is not None and div < 0:
            div = None
        beta = _num(r.get("beta"))
        out.append(UniverseRow(sym, name, div, beta, is_etf))

    if excluded:
        msg = (f"company-screener {leg} leg: excluded {excluded} non-common instruments "
               "(warrants, units, rights, preferreds, notes)")
        print(f"📊 {msg}", flush=True)
        logger.info(msg)
    return out


async def _build_universe(api_key: str) -> list[UniverseRow]:
    """Fetch /company-screener twice and return UniverseRow tuples — US common stocks
    plus US ETFs, no mutual funds or CEFs.

    Carries the two fundamentals the screener needs but batch-quote doesn't provide:
    last_annual_dividend (trailing per-share $, yield derived live against price) and
    beta. Refreshed here on the daily rebuild only — both change slowly enough that
    once-a-day is frequent enough. Measured coverage on the ETF leg is 81% for
    lastAnnualDividend and 96% for beta, so funds get real values for both rather than
    needing a separate pass.

    Both legs must succeed. If either raises, the exception propagates, nothing is
    written, and — because should_rebuild is derived from max(last_refreshed) — the next
    15-minute tick retries the whole rebuild. A universe that survived with one leg
    missing would look complete while silently holding no ETFs (or no stocks), and
    _prune_universe would then delete the other half on the following run.
    """
    async with httpx.AsyncClient(timeout=30.0) as client:
        stocks = await _screener_leg(client, api_key, is_etf=False)
        etfs = await _screener_leg(client, api_key, is_etf=True)

    tickers = stocks + etfs

    # A symbol on both legs would be a vendor contradiction about what it is. Dedupe
    # deterministically (stock leg wins, being first) rather than letting the later
    # upsert decide, and say so — silently picking one would hide the disagreement.
    seen: dict[str, UniverseRow] = {}
    collisions: list[str] = []
    for row in tickers:
        if row.symbol in seen:
            collisions.append(row.symbol)
            continue
        seen[row.symbol] = row
    if collisions:
        msg = (f"{len(collisions)} symbol(s) returned by BOTH company-screener legs, "
               f"kept as CS: {', '.join(collisions[:10])}")
        print(f"⚠️ {msg}", flush=True)
        logger.warning(msg)
    tickers = list(seen.values())

    n_etf = sum(1 for t in tickers if t.is_etf)
    print(f"📊 Universe built: {len(tickers) - n_etf} CS + {n_etf} ETF = {len(tickers)}", flush=True)
    logger.info(f"Universe built: {len(tickers) - n_etf} CS + {n_etf} ETF = {len(tickers)}")
    return tickers


async def _prune_universe(tickers: list[UniverseRow]) -> None:
    """Remove DB rows for symbols no longer in the filtered universe (ETFs/funds that slipped in).

    Bounded by PRUNE_MAX_DELETE_FRACTION — see the constant for why. When the bound trips
    the universe is left intact and the run continues: quotes still refresh for whatever
    the screener did return, so the unmatched rows simply keep the prices they had rather
    than disappearing from the screener.
    """
    current = {t[0] for t in tickers}
    async with async_session() as session:
        db_symbols = set((await session.execute(select(StockSnapshot.symbol))).scalars().all())
        stale = db_symbols - current
        if not stale:
            return
        share = len(stale) / len(db_symbols)
        if share > PRUNE_MAX_DELETE_FRACTION:
            msg = (
                f"Prune skipped: {len(stale)} of {len(db_symbols)} stored symbols ({share:.0%}) "
                f"are missing from a {len(current)}-symbol company-screener response, over the "
                f"{PRUNE_MAX_DELETE_FRACTION:.0%} cap — reads as a partial response, not a "
                "delisting. Universe left intact; investigate before forcing a rebuild."
            )
            print(f"⚠️ {msg}", flush=True)
            logger.warning(msg)
            return
        await session.execute(delete(StockSnapshot).where(StockSnapshot.symbol.in_(stale)))
        await session.commit()
        print(f"📊 Pruned {len(stale)} stale/excluded symbols from universe", flush=True)
        logger.info(f"Pruned {len(stale)} stale/excluded symbols from universe")


async def _existing_universe() -> list[UniverseRow]:
    # Fundamentals are None here so intraday refreshes never touch last_annual_dividend
    # or beta; the values captured on the daily rebuild persist untouched (see _fetch_quotes).
    async with async_session() as session:
        rows = (await session.execute(
            select(StockSnapshot.symbol, StockSnapshot.name, StockSnapshot.is_etf)
        )).all()
    return [UniverseRow(r.symbol, r.name or "", None, None, bool(r.is_etf)) for r in rows]


async def _fetch_quotes(
    api_key: str,
    tickers: list[UniverseRow],
    include_fundamentals: bool = False,
) -> list[dict]:
    name_map = {t.symbol: t.name for t in tickers}
    div_map = {t.symbol: t.last_annual_dividend for t in tickers}
    beta_map = {t.symbol: t.beta for t in tickers}
    etf_map = {t.symbol: t.is_etf for t in tickers}
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
                    if (q.get("exchange") or "").strip().upper() not in _US_EXCHANGES_NORM:
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
                    }
                    # Only written on the daily rebuild (include_fundamentals). Every row
                    # in the batch carries these keys so the multi-row upsert stays uniform;
                    # intraday refreshes omit them entirely, preserving the stored values.
                    if include_fundamentals:
                        row["last_annual_dividend"] = div_map.get(sym)
                        row["beta"] = beta_map.get(sym)
                        # is_etf is owned here and nowhere else: which company-screener
                        # leg a symbol arrived on IS the definition. It used to be
                        # written by the profile pass from /stable/profile, which meant
                        # a new fund sat at NULL — read by the screener's stock-mode
                        # predicate as "not an ETF" — until that pass happened to reach
                        # it. Writing it with the rest of the rebuild closes that window.
                        row["is_etf"] = etf_map.get(sym, False)
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


_UPSERT_CHUNK = 1_000  # asyncpg caps params at 32767; rebuild rows carry 21 cols,
                       # so 21 × 1000 = 21000. Ceiling is 1560 rows/chunk.

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

# ETFs are excluded from the profile pass entirely.
#
# Not because /stable/profile fails on them — it does not. Measured over an issuer
# sample (scripts/probe_etf_universe.py), profile returns a sector and a description
# for 100% of funds. The reasons are:
#
#   1. It is redundant. _update_etf_metadata already fetches etf/info for every fund,
#      and that response carries `description` and `avgVolume` — the only two fields
#      the profile pass would contribute that anything reads. Running both doubles the
#      daily fund call budget (~4.7k extra calls) for nothing.
#   2. The sector it would write is noise. Every ETF comes back as "Financial Services"
#      regardless of what the fund holds, so a bond fund and a semiconductor fund get
#      the same label. Stored, it would pad the sector dropdown and make funds answer a
#      stock-mode sector screen if the is_etf predicate ever slipped.
#
# isnot(True) renders `is_etf IS NOT true`, which is TRUE for NULL — so a row the
# rebuild has not stamped yet still gets a profile rather than being stranded.
_STOCK_ONLY = StockSnapshot.is_etf.isnot(True)

_PROFILE_CHUNK = 1_000


async def _missing_profile_count() -> int:
    async with async_session() as session:
        return await session.scalar(
            select(func.count())
            .select_from(StockSnapshot.__table__)
            .where(_MISSING_PROFILE, _STOCK_ONLY)
        ) or 0


async def _check_etf_coverage(tickers: list[UniverseRow]) -> None:
    """Warn loudly if the exchange gate swallowed the ETF leg.

    The gate in _fetch_quotes drops quotes silently — a rejected venue produces no
    error, just a smaller universe. That is survivable for a handful of stocks and fatal
    for funds: if FMP renames a venue or starts reporting one we do not list, the whole
    ETF mode goes empty and the only visible symptom is a screener that returns nothing.

    Cboe BZX is the live example. It carries ~14% of US ETFs and reports as "CBOE",
    which the original {NYSE, NASDAQ, AMEX} gate did not include.

    Warn rather than raise: a partial ETF universe is still worth having, and the stock
    side of the run is unaffected.
    """
    expected = sum(1 for t in tickers if t.is_etf)
    if not expected:
        return
    async with async_session() as session:
        stored = await session.scalar(
            select(func.count())
            .select_from(StockSnapshot.__table__)
            .where(StockSnapshot.is_etf.is_(True))
        ) or 0
    share = stored / expected
    if share < 0.8:
        msg = (
            f"ETF coverage {stored}/{expected} ({share:.0%}) — the universe returned "
            f"{expected} funds but only {stored} landed. Check the {sorted(US_EXCHANGES)} "
            "exchange gate in _fetch_quotes against the 'dropped by the gate' line above; "
            "a venue we do not list is the usual cause."
        )
        print(f"❌ {msg}", flush=True)
        logger.error(msg)
    else:
        print(f"📊 ETF coverage {stored}/{expected} ({share:.0%})", flush=True)


async def _update_company_profiles(
    limit: int = PROFILE_FILL_LIMIT,
    refresh_limit: int = PROFILE_REFRESH_LIMIT,
) -> int | None:
    """
    Fill in missing company profiles (sector, industry, description, avg_volume) from
    /stable/profile.

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
                .where(_MISSING_PROFILE, _STOCK_ONLY)
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
                    .where(~_MISSING_PROFILE, _STOCK_ONLY)
                ) or 0
                if populated:
                    cycles = (populated + refresh_limit - 1) // refresh_limit
                    window = datetime.now(timezone.utc).timetuple().tm_yday % cycles
                    refresh = list((await session.execute(
                        select(StockSnapshot.symbol)
                        .where(~_MISSING_PROFILE, _STOCK_ONLY)
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

            # avg_volume rides along on this pass because /stable/profile is the only
            # universe-wide source for it (batch-quote has none) and this pass already
            # fetches every symbol's profile daily — so it costs zero extra FMP calls.
            # Coerced to int for the Numeric(20, 0) column rather than letting Postgres
            # round a float; <= 0 is treated as no answer, since it can only produce a
            # meaningless RVOL denominator.
            raw_avg_vol = info.get("average_volume")
            try:
                avg_vol = int(float(raw_avg_vol)) if raw_avg_vol is not None else None
            except (TypeError, ValueError):
                avg_vol = None
            if avg_vol is not None and avg_vol <= 0:
                avg_vol = None

            return {
                "b_symbol": symbol,
                "b_sector": sector,
                "b_avg_volume": avg_vol,
                "b_industry": info.get("industry") or None,
                "b_description": info.get("description") or None,
                # Read by _update_valuations' identity check. normalize_cik because FMP
                # sends it as a zero-padded string ("0000320193").
                "b_fmp_cik": normalize_cik(info.get("cik")),
                # is_etf is NOT written here. _fetch_quotes owns it, from which
                # company-screener leg the symbol arrived on. Two writers was a real
                # hazard: FMP flags some ETNs and closed-end funds as isFund rather than
                # isEtf, so this pass could flip a row out of ETF mode hours after the
                # universe put it in.
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
                avg_volume=func.coalesce(bindparam("b_avg_volume", type_=Numeric), tbl.c.avg_volume),
                fmp_cik=func.coalesce(bindparam("b_fmp_cik", type_=BigInteger), tbl.c.fmp_cik),
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


async def _update_etf_metadata() -> int | None:
    """Store fund metadata from /stable/etf/info for every ETF in the universe.

    Fills the columns the screener's ETF mode filters and sorts on — expense_ratio, aum,
    asset_class, etf_company — plus nav, holdings_count and inception_date.

    Also writes `description` and `avg_volume`, which are already in the etf/info payload
    and so cost nothing extra. They are the reason funds can skip the profile pass
    entirely (see _STOCK_ONLY): description is what makes the screener's keyword filter
    work for funds, and avg_volume is the RVOL denominator.

    COALESCE on every data field, matching _update_company_profiles: etf/info returns
    null for individual fields intermittently, and blanking a good expense ratio is worse
    than serving one that is a day stale. etf_info_refreshed_at is written UNGUARDED, so
    a field that has been null for a week stays distinguishable from one never fetched.

    **Returns:** how many symbols were written, or None if the run failed.
    """
    try:
        async with async_session() as session:
            symbols = list((await session.execute(
                select(StockSnapshot.symbol)
                .where(StockSnapshot.is_etf.is_(True))
                # Largest funds first, so a run that dies partway through has still
                # covered what users actually look at.
                .order_by(
                    StockSnapshot.aum.desc().nulls_last(),
                    StockSnapshot.market_cap.desc().nulls_last(),
                )
                .limit(ETF_INFO_LIMIT)
            )).scalars().all())

        if not symbols:
            print("📊 ETF metadata: no ETFs in the universe yet", flush=True)
            return 0

        print(f"📊 ETF metadata: fetching {len(symbols)} funds", flush=True)

        sem = asyncio.Semaphore(ETF_INFO_CONCURRENCY)

        def _count_or_none(raw) -> int | None:
            """Non-negative int, or None. Zero is KEPT: a physically-backed trust
            genuinely holds no securities (GLD reports holdingsCount 0), and storing
            that as NULL would claim the figure is unknown rather than zero."""
            try:
                val = int(float(raw)) if raw is not None else None
            except (TypeError, ValueError):
                return None
            return val if val is not None and val >= 0 else None

        def _volume_or_none(raw) -> int | None:
            """Positive int, or None. Zero is DROPPED here, unlike a holdings count:
            avg_volume is the RVOL denominator, so a zero can only produce a
            meaningless quotient. Matches _update_company_profiles' handling."""
            try:
                val = int(float(raw)) if raw is not None else None
            except (TypeError, ValueError):
                return None
            return val if val is not None and val > 0 else None

        def _date_or_none(raw) -> date | None:
            # FMP returns "1993-01-22" for SPY, but the format is not guaranteed for
            # every fund and a bad value must cost this field only, not the row.
            if not raw or not isinstance(raw, str):
                return None
            try:
                return date.fromisoformat(raw[:10])
            except ValueError:
                return None

        async def _fetch(symbol: str) -> dict | None:
            async with sem:
                try:
                    # use_cache=False: this touches every fund once a day and would
                    # otherwise pin ~4.7k entries in a process-lifetime dict.
                    info = await market_data_service.get_etf_info(symbol, use_cache=False)
                except Exception as e:
                    logger.debug(f"Failed to fetch etf/info for {symbol}: {e}")
                    return None
            if not info:
                # Not an error: some symbols flagged as ETFs are ETNs or trusts that
                # FMP has no fund record for.
                return None

            expense = info.get("expense_ratio")  # already normalized to a percent
            return {
                "b_symbol": symbol,
                "b_expense_ratio": Decimal(str(expense)) if expense is not None else None,
                "b_aum": info.get("aum"),
                "b_nav": info.get("nav"),
                "b_holdings_count": _count_or_none(info.get("holdings_count")),
                "b_asset_class": info.get("asset_class") or None,
                "b_etf_company": info.get("etf_company") or None,
                "b_inception_date": _date_or_none(info.get("inception_date")),
                "b_description": info.get("description") or None,
                "b_avg_volume": _volume_or_none(info.get("avg_volume")),
                "b_refreshed_at": datetime.now(timezone.utc),
            }

        fetched = await asyncio.gather(*(_fetch(s) for s in symbols))
        rows = [
            r for r in fetched
            if r and (
                r["b_expense_ratio"] is not None
                or r["b_aum"] is not None
                or r["b_asset_class"]
                or r["b_etf_company"]
                or r["b_description"]
            )
        ]

        if not rows:
            logger.info("No ETF metadata resolved")
            return 0

        # UPDATE-only, like the profile pass: every symbol came from the universe, so a
        # row already exists and we must not resurrect one _prune_universe removed.
        tbl = StockSnapshot.__table__
        stmt = (
            update(tbl)
            .where(tbl.c.symbol == bindparam("b_symbol"))
            .values(
                expense_ratio=func.coalesce(
                    bindparam("b_expense_ratio", type_=Numeric), tbl.c.expense_ratio),
                aum=func.coalesce(bindparam("b_aum", type_=Numeric), tbl.c.aum),
                nav=func.coalesce(bindparam("b_nav", type_=Numeric), tbl.c.nav),
                holdings_count=func.coalesce(
                    bindparam("b_holdings_count", type_=Integer), tbl.c.holdings_count),
                asset_class=func.coalesce(
                    bindparam("b_asset_class", type_=String), tbl.c.asset_class),
                etf_company=func.coalesce(
                    bindparam("b_etf_company", type_=String), tbl.c.etf_company),
                inception_date=func.coalesce(
                    bindparam("b_inception_date", type_=Date), tbl.c.inception_date),
                description=func.coalesce(
                    bindparam("b_description", type_=Text), tbl.c.description),
                avg_volume=func.coalesce(
                    bindparam("b_avg_volume", type_=Numeric), tbl.c.avg_volume),
                # Unguarded on purpose — this is the staleness signal.
                etf_info_refreshed_at=bindparam("b_refreshed_at", type_=DateTime(timezone=True)),
            )
        )

        async with async_session() as session:
            for i in range(0, len(rows), _PROFILE_CHUNK):
                await session.execute(stmt, rows[i:i + _PROFILE_CHUNK])
            await session.commit()

        summary = f"ETF metadata: resolved {len(rows)}/{len(symbols)} funds"
        print(f"📊 {summary}", flush=True)
        logger.info(summary)
        return len(rows)
    except Exception as e:
        logger.warning(f"Failed to update ETF metadata: {e}")
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

        # A failed fetch is skipped, never written, so the row keeps yesterday's figures.
        # get_dividends swallows its own errors and returns an empty history, which
        # evaluate_dividend reads as "none": on 2026-10-25 a burst of 429s turned 2,186
        # payers into non-payers that way. It now flags the failure instead.
        skipped = Counter()
        retries_before = market_data_service.throttle_retries

        async def _fetch(symbol: str, price) -> dict | None:
            async with sem:
                try:
                    info = await market_data_service.get_dividends(symbol)
                except Exception as e:
                    skipped["fetch failed"] += 1
                    logger.debug(f"Failed to fetch dividends for {symbol}: {e}")
                    return None
            if info.get("fetch_failed"):
                skipped["fetch failed"] += 1
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

        retries = market_data_service.throttle_retries - retries_before
        if skipped["fetch failed"]:
            warn = (f"Dividends: {skipped['fetch failed']} of {len(payers)} fetches failed "
                    f"after {retries} 429 retries; those rows were left untouched")
            print(f"⚠️ {warn}", flush=True)
            logger.warning(warn)

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
            + (f"; skipped {skipped['fetch failed']} (fetch failed)" if skipped else "")
            + (f"; {retries} 429 retries" if retries else "")
        )
        print(f"📊 {summary}", flush=True)
        logger.info(summary)
        return len(rows)
    except Exception as e:
        logger.warning(f"Failed to update dividends: {e}")
        return None


def clean_multiple(raw, floor: float = 0.0) -> Decimal | None:
    """A valuation multiple as stored, or None.

    None for anything non-positive: a negative P/E, P/B or EV/EBITDA means negative
    earnings, book value or EBITDA, which is "not meaningful", not "cheap". Kept as a
    number it would pass every "at most N" screen. None also below `floor` (see
    _PE_FLOOR and friends: a P/E of 0.03 is an artifact, and it would otherwise lead
    every ascending sort) and for garbage: non-numeric, NaN, infinite, or at/past
    _MULTIPLE_CEILING.
    """
    try:
        val = float(raw)
    except (TypeError, ValueError):
        return None
    if val != val or val <= 0 or val < floor or val >= _MULTIPLE_CEILING:  # val != val catches NaN
        return None
    return Decimal(str(round(val, 4)))


async def _identity_verdict(symbol: str, fmp_cik: int | None) -> str:
    """The edgar_identity verdict for one ticker, from the stored profile CIK.

    The same build_entity_trust / resolve_contradiction pair financials_service uses, so
    identity is never re-derived here. The EDGAR ticker map is one cached file, so the
    common path makes no network call. Only a contradiction fetches submissions, to tell
    a successor registrant (kept) from genuine reuse (suppressed).
    """
    edgar = await resolve_ticker_cik(symbol)
    fund = None if edgar else await resolve_fund_ticker(symbol)
    trust = build_entity_trust(symbol, edgar, None, fmp_cik, fund=fund)
    if trust["verdict"] == CONTRADICTION:
        trust = await resolve_contradiction(trust)
    return trust["verdict"]


async def _update_valuations() -> int | None:
    """Store P/E, P/B and EV/EBITDA from /stable/ratios-ttm for every stock.

    Stocks only (_STOCK_ONLY): a fund has no earnings or EBITDA of its own, and the
    screener's ETF mode does not offer these filters.

    Runs after _update_company_profiles so fmp_cik is current. Each ticker's figures are
    gated on its identity verdict before they are written. On a contradiction all three
    are stored as NULL, matching how financials_service nulls entity-scoped keys at
    source. A successor registrant or an unresolvable ticker keeps its figures, per the
    edgar_identity contract.

    Writes are unguarded (no COALESCE), like _update_dividends, so a stock that swings
    to a loss clears its P/E. A failed fetch skips the row instead of blanking it.

    **Returns:** how many stocks were written, or None if the run failed.
    """
    try:
        async with async_session() as session:
            targets = (await session.execute(
                select(StockSnapshot.symbol, StockSnapshot.fmp_cik)
                .where(_STOCK_ONLY)
                .order_by(StockSnapshot.market_cap.desc().nulls_last())
            )).all()

        if not targets:
            print("📊 Valuations: no stocks in the universe yet", flush=True)
            return 0

        print(f"📊 Valuations: fetching ratios for {len(targets)} stocks", flush=True)

        # Probe EDGAR once. If the ticker map cannot load, every per-ticker lookup below
        # would retry the download against SEC's shared 8 req/s throttle, thousands of
        # times. Unverifiable never blocks, so skipping the check loses nothing that a
        # degraded per-ticker check would have caught.
        await warm_ticker_map()
        edgar_up = await resolve_ticker_cik("AAPL") is not None
        if not edgar_up:
            msg = "Valuations: EDGAR ticker map unavailable, identity recorded as cannot_resolve this run"
            print(f"⚠️ {msg}", flush=True)
            logger.warning(msg)

        sem = asyncio.Semaphore(VALUATION_CONCURRENCY)
        # Why a row was skipped. A failed fetch leaves the stored figures untouched and
        # must never be written as "no multiples". Counted so the summary says how much
        # of the universe the run actually covered: on 2026-10-25 a silent burst of
        # 429s left the top 2,000 market caps NULL with nothing in the log.
        skipped = Counter()
        retries_before = market_data_service.throttle_retries

        async def _fetch(symbol: str, fmp_cik) -> dict | None:
            async with sem:
                try:
                    data = await market_data_service._fmp_get("ratios-ttm", {"symbol": symbol})
                except Exception as e:
                    status = getattr(getattr(e, "response", None), "status_code", None)
                    skipped["throttled (429)" if status == 429 else "fetch failed"] += 1
                    logger.debug(f"Failed to fetch ratios-ttm for {symbol}: {e}")
                    return None
            if not data or not isinstance(data, list) or not isinstance(data[0], dict):
                skipped["no data"] += 1
                return None
            r = data[0]

            try:
                verdict = (
                    await _identity_verdict(symbol, normalize_cik(fmp_cik))
                    if edgar_up else CANNOT_RESOLVE
                )
            except Exception as e:
                # Never fail the pass over identity. Unverifiable does not block.
                logger.debug(f"Identity check failed for {symbol}: {e}")
                verdict = CANNOT_RESOLVE
            blocked = verdict == CONTRADICTION

            return {
                "b_symbol": symbol,
                "b_pe": None if blocked else clean_multiple(r.get("priceToEarningsRatioTTM"), _PE_FLOOR),
                "b_pb": None if blocked else clean_multiple(r.get("priceToBookRatioTTM"), _PB_FLOOR),
                "b_ev": None if blocked else clean_multiple(r.get("enterpriseValueMultipleTTM"), _EV_EBITDA_FLOOR),
                "b_trust": verdict,
                "b_refreshed_at": datetime.now(timezone.utc),
            }

        fetched = await asyncio.gather(*(_fetch(sym, cik) for sym, cik in targets))
        rows = [r for r in fetched if r]

        retries = market_data_service.throttle_retries - retries_before
        failed = skipped["throttled (429)"] + skipped["fetch failed"]
        if failed:
            warn = (f"Valuations: {failed} of {len(targets)} fetches failed "
                    f"({skipped['throttled (429)']} still throttled after {retries} retries); "
                    "those rows were left untouched")
            print(f"⚠️ {warn}", flush=True)
            logger.warning(warn)

        if not rows:
            logger.info("No valuations resolved")
            return 0

        # UPDATE-only, like every other enrichment pass.
        tbl = StockSnapshot.__table__
        stmt = (
            update(tbl)
            .where(tbl.c.symbol == bindparam("b_symbol"))
            .values(
                pe_ratio=bindparam("b_pe", type_=Numeric(14, 4)),
                pb_ratio=bindparam("b_pb", type_=Numeric(14, 4)),
                ev_to_ebitda=bindparam("b_ev", type_=Numeric(14, 4)),
                valuation_trust=bindparam("b_trust", type_=String),
                valuation_refreshed_at=bindparam("b_refreshed_at", type_=DateTime(timezone=True)),
            )
        )

        async with async_session() as session:
            for i in range(0, len(rows), _PROFILE_CHUNK):
                await session.execute(stmt, rows[i:i + _PROFILE_CHUNK])
            await session.commit()

        by_trust = Counter(r["b_trust"] for r in rows)
        with_pe = sum(1 for r in rows if r["b_pe"] is not None)
        summary = (
            f"Valuations: wrote {len(rows)}/{len(targets)} stocks, {with_pe} with a "
            "positive P/E; identity " + ", ".join(f"{k}={v}" for k, v in sorted(by_trust.items()))
            + ("; skipped " + ", ".join(f"{k}={v}" for k, v in sorted(skipped.items())) if skipped else "")
            + (f"; {retries} 429 retries" if retries else "")
        )
        print(f"📊 {summary}", flush=True)
        logger.info(summary)
        return len(rows)
    except Exception as e:
        logger.warning(f"Failed to update valuations: {e}")
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

        if should_rebuild:
            await _check_etf_coverage(tickers)

        # Fill in missing company profiles (once per trading day, after the rebuild so
        # the day's new universe members are already in the table and visible to it)
        if should_rebuild:
            await _update_company_profiles()
            # Needs is_etf stamped by _upsert above, which is what selects its symbols.
            # Stocks and funds are disjoint here — profiles skip ETFs (_STOCK_ONLY),
            # this skips everything else — so the two never touch the same row.
            await _update_etf_metadata()
            # After both: needs the price written by _upsert above, and reads
            # last_annual_dividend which the rebuild just refreshed. Universe-wide, so
            # ETF payers are picked up automatically — company-screener reports
            # lastAnnualDividend for ~81% of funds, so no separate gate is needed.
            await _update_dividends()
            # After profiles: reads the fmp_cik that pass just refreshed.
            await _update_valuations()

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


async def _backfill_valuations() -> None:
    """Fill the valuation columns now instead of waiting for the next daily rebuild.

    Runs the full profile pass first (stores fmp_cik for the identity check), then the
    valuation pass. Roughly 4k + 4k FMP calls, a few minutes each.

        railway run python -m app.tasks.refresh_stock_snapshots --valuations
    """
    from app.services.edgar_client import close_edgar_client, init_edgar_client
    from app.services.fmp_client import close_fmp_client, init_fmp_client

    await init_fmp_client()
    await init_edgar_client()
    try:
        await _update_company_profiles()
        written = await _update_valuations()
        if written is None:
            print("❌ Valuation pass failed, see log", flush=True)
        else:
            print(f"✅ Valuations backfilled for {written} stocks", flush=True)
    finally:
        await close_edgar_client()
        await close_fmp_client()


def _selftest() -> None:
    """Offline checks for the pure helpers:
        python -m app.tasks.refresh_stock_snapshots --selftest
    """
    # clean_multiple: sign, floor, ceiling, garbage
    assert clean_multiple(39.74) == Decimal("39.74")
    assert clean_multiple(-5) is None and clean_multiple(0) is None
    for junk in ("nan", "abc", None, float("inf"), _MULTIPLE_CEILING):
        assert clean_multiple(junk) is None, junk
    assert clean_multiple(0.39, _PE_FLOOR) is None              # SPAC trust interest
    assert clean_multiple(1.0, _PE_FLOOR) == Decimal("1.0")      # floor is inclusive
    assert clean_multiple(2.78, _PE_FLOOR) == Decimal("2.78")
    assert clean_multiple(0.001, _PB_FLOOR) is None             # mis-scaled book value
    assert clean_multiple(0.25, _PB_FLOOR) == Decimal("0.25")    # distressed, kept
    assert clean_multiple(0.26, _EV_EBITDA_FLOOR) is None
    # _is_common_stock: real companies, share classes and awkward names stay in
    for sym, name in [
        ("AAPL", "Apple Inc."), ("BRK-B", "Berkshire Hathaway Inc."), ("BF-B", "Brown-Forman Corporation"),
        ("MKC-V", "McCormick & Company, Incorporated"), ("PFBC", "Preferred Bank"),
        ("APTS", "Preferred Apartment Communities, Inc."), ("IPHX", "Inflection Point Acquisition Corp. VIII"),
        ("UAL", "United Airlines Holdings, Inc."), ("ACQU", "Acquire Holdings"),
        ("GOOGL", "Alphabet Inc."), ("LBTYA", "Liberty Global Ltd."), ("SHOW", "ShowBiz Inc."),
        ("ARM", "Arm Holdings plc American Depositary Shares"), ("TSM", "Taiwan Semiconductor Manufacturing Company Limited"),
        ("ACN", "Accenture plc"), ("PBR-A", "Petróleo Brasileiro S.A. - Petrobras"),
        ("JOYY", "JOYY, Inc. Sponsored ADR Class A"),
    ]:
        assert _is_common_stock(sym, name), (sym, name)
    # ...and every instrument class found on the stock leg 2026-10-25 goes out
    for sym, name in [
        ("SCE-PG", "SCE Trust II TR PFD SECS 5.1%"), ("CELG-RI", "Bristol-Myers Squibb Company Contingent Value Rights"),
        ("ACGCW", "ACP Holdings Acquisition Corp. Warrants"), ("IPHXU", "Inflection Point Acquisition Corp. VIII"),
        ("SORNR", "Soren Acquisition Corp."), ("CGABL", "The Carlyle Group Inc. 4.625% Subordinated Notes due 2061"),
        ("STRF", "MicroStrategy Incorporated 10.00% Series A Perpetual Strife Preferred Stock"),
        ("DUKU", "Duke Energy Corporation Units 1.08.29"), ("MER-PK", "Bank of America Corp 6.45 % Notes 2018-15.12.66"),
        ("AAC-UN", "Ares Acquisition Corporation II"), ("PEW-WT", "GrabAGun Digital Holdings Inc."),
        ("CTA-PB", "EIDP, Inc. USD 4.50 Cum Pfd Registered Shs"), ("ETI-P", "Entergy Texas, Inc."),
        ("GJO", "STRATS(SM) Trust for Wal-Mart Stores, Inc. Securities, Series 2004-5"),
        ("NIOBW", "NioCorp Developments Ltd."), ("MDAIW", "Spectral AI, Inc."),
        ("HVMCU", "Highview Merger Corp."), ("XSLLU", "Xsolla SPAC 1"), ("GHXIU", "Gores Holdings XI, Inc."),
        ("TRGSR", "TRG Latin America Acquisitions Corp."), ("JONER", "Jones Ventures INTL Acquisition1 Corp"),
        ("XYZP", "Depositary Shares each representing a 1/1000th interest in a 5.375% Series H Preferred"),
        ("LILAP", "Liberty Latin America Ltd. 9% Cum Perp Red Pfd Shs Series A"),
    ]:
        assert not _is_common_stock(sym, name), (sym, name)
    assert set(_SCREENER_EXCHANGES.split(",")) == US_EXCHANGES
    print("refresh_stock_snapshots selftest OK")


if __name__ == "__main__":
    import sys

    if "--selftest" in sys.argv[1:]:
        _selftest()
    elif "--valuations" in sys.argv[1:]:
        asyncio.run(_backfill_valuations())
    else:
        asyncio.run(_drain_company_profiles())
