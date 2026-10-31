"""
Sector Rotation service.

Tracks daily close prices for the 11 GICS sector ETFs plus SPY (benchmark) in
the sector_etf_daily_closes table. Used by the heatmap and time-lapse endpoints.

Every row is dated by its trading session in US Eastern time, taken from FMP's
own EOD bar, never from the clock of the job that wrote it. Only sessions that
traded have rows, so the read paths use the stored dates as the session calendar.

Data flow:
- One-time backfill: `backfill_history(years=2)` — manual script, run once on deploy.
- Daily append: `append_today_closes()` — APScheduler job in main.py, and also
  called from the fetch_daily_snapshots cron.
- Repair of rows stored before closes were session-dated:
  `python -m app.tasks.repair_sector_closes` (dry run by default).
- Read paths: `compute_relative_returns()` and `compute_timelapse_frames()` —
  hit the local table only, no FMP calls.
"""
import logging
from datetime import date, datetime, time, timedelta
from decimal import Decimal
from typing import Any

import pytz
from sqlalchemy import select, and_, func
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.db.models import SectorEtfDailyClose
from app.db.session import async_session
from app.services.market_data import market_data_service

logger = logging.getLogger(__name__)

# 11 GICS sector ETFs — order matches typical heat-map layout (largest sectors first)
SECTOR_ETFS: dict[str, str] = {
    "XLK": "Technology",
    "XLV": "Healthcare",
    "XLF": "Financials",
    "XLY": "Consumer Discretionary",
    "XLC": "Communication Services",
    "XLI": "Industrials",
    "XLP": "Consumer Staples",
    "XLE": "Energy",
    "XLU": "Utilities",
    "XLRE": "Real Estate",
    "XLB": "Materials",
}
BENCHMARK_TICKER = "SPY"
ALL_TICKERS: list[str] = list(SECTOR_ETFS.keys()) + [BENCHMARK_TICKER]

EASTERN = pytz.timezone("America/New_York")
# FMP's EOD feed carries the current session while it trades, so a bar dated
# today (ET) is a last trade, not a close, until this time. 16:15 clears the
# 16:00 closing auction; a provisional close is corrected by the next run.
_SESSION_CLOSED_ET = time(16, 15)
# Calendar days of bars each append re-reads (~9 sessions), so a run missed for
# a deploy or an FMP outage is filled by the next one instead of leaving a gap.
_APPEND_LOOKBACK_DAYS = 14
# Furthest the readers walk back from a window's start date to find a close:
# a weekend plus a holiday, without reaching across a lapsed feed.
_MAX_WALKBACK_DAYS = 7


def _window_to_days(window: str) -> int:
    mapping = {
        "1D": 1,
        "1W": 7,
        "1M": 30,
        "3M": 90,
        "6M": 180,
        "1Y": 365,
    }
    if window not in mapping:
        raise ValueError(f"Invalid window: {window!r}. Use one of {list(mapping.keys())}.")
    return mapping[window]


def _session_rows(ticker: str, history: list[dict], now_et: datetime) -> list[dict]:
    """
    FMP EOD bars -> table rows, each dated by its bar's session date. Only
    sessions that traded have bars, so weekends and holidays yield no rows
    without a holiday calendar. Today's bar is held back until the session closes.
    """
    today_et = now_et.date()
    rows: list[dict] = []
    for h in history:
        raw_date, close = h.get("date"), h.get("close")
        if not raw_date or not close:
            continue
        session = date.fromisoformat(str(raw_date)[:10])
        if session > today_et or (session == today_et and now_et.time() < _SESSION_CLOSED_ET):
            continue
        rows.append({
            "ticker": ticker,
            "close_date": session,
            "close_price": Decimal(str(close)),
        })
    return rows


def _upsert_stmt(rows: list[dict]):
    """Insert rows; overwrite a stored close only when it differs, so a rerun
    over the same sessions writes nothing."""
    stmt = pg_insert(SectorEtfDailyClose).values(rows)
    return stmt.on_conflict_do_update(
        index_elements=["ticker", "close_date"],
        set_={"close_price": stmt.excluded.close_price},
        where=SectorEtfDailyClose.close_price.is_distinct_from(stmt.excluded.close_price),
    )


async def _upsert_closes(rows: list[dict]) -> int:
    """Upsert daily close rows. Returns the number of rows inserted or changed."""
    if not rows:
        return 0
    async with async_session() as session:
        result = await session.execute(_upsert_stmt(rows))
        await session.commit()
    return result.rowcount


async def backfill_history(years: int = 2) -> int:
    """
    Fetch historical daily closes for all 12 tickers and upsert into
    sector_etf_daily_closes. Run this once after deploying the migration.
    """
    days = years * 365
    now_et = datetime.now(EASTERN)
    total = 0
    for ticker in ALL_TICKERS:
        try:
            history = await market_data_service.get_historical_prices(ticker, days=days)
        except Exception as exc:
            logger.warning(f"Failed to fetch history for {ticker}: {exc}")
            continue

        written = await _upsert_closes(_session_rows(ticker, history, now_et))
        total += written
        logger.info(f"Backfilled {written} rows for {ticker}")
    return total


async def append_today_closes() -> int:
    """
    Upsert the closes of the latest completed sessions for the 12 tickers, each
    dated by its EOD bar's session date. Returns rows inserted or changed.

    The run date never decides the row date. Stamping date.today() from the
    06:00 UTC run filed Monday's close under Tuesday and copied Friday's close
    onto Saturday and Sunday, so Monday's "1 Day" view read 0.00% everywhere.
    A weekend or holiday has no bar, so a run that finds no new session writes
    nothing, and a rerun rewrites only closes that changed.

    EOD bars rather than a quote: the bar's date is the session's own date and
    its close is the official close, the same series backfill_history stores.
    """
    now_et = datetime.now(EASTERN)
    rows: list[dict] = []
    for ticker in ALL_TICKERS:
        try:
            history = await market_data_service.get_historical_prices(ticker, days=_APPEND_LOOKBACK_DAYS)
        except Exception as exc:
            logger.warning(f"Sector rotation: no EOD bars for {ticker}, skipping: {exc}")
            continue
        rows.extend(_session_rows(ticker, history, now_et))
    if not rows:
        logger.warning("Sector rotation: no completed sessions returned — skipping append")
        return 0
    written = await _upsert_closes(rows)
    logger.info(f"Sector rotation: {written} close rows written, latest session {max(r['close_date'] for r in rows)}")
    return written


async def _closes_by_ticker(start_date: date, end_date: date) -> dict[str, dict[date, Decimal]]:
    """Return {ticker: {session_date: close}} for sessions in [start_date, end_date]."""
    async with async_session() as session:
        stmt = (
            select(
                SectorEtfDailyClose.ticker,
                SectorEtfDailyClose.close_date,
                SectorEtfDailyClose.close_price,
            )
            .where(
                and_(
                    SectorEtfDailyClose.ticker.in_(ALL_TICKERS),
                    SectorEtfDailyClose.close_date >= start_date,
                    SectorEtfDailyClose.close_date <= end_date,
                )
            )
        )
        result = await session.execute(stmt)
        rows = result.all()

    grouped: dict[str, dict[date, Decimal]] = {}
    for r in rows:
        grouped.setdefault(r.ticker, {})[r.close_date] = r.close_price
    return grouped


async def _latest_close_date(on_or_before: date | None = None) -> date | None:
    """Latest stored session across the tracked tickers, on or before `on_or_before` if given."""
    async with async_session() as session:
        stmt = select(func.max(SectorEtfDailyClose.close_date)).where(
            SectorEtfDailyClose.ticker.in_(ALL_TICKERS)
        )
        if on_or_before is not None:
            stmt = stmt.where(SectorEtfDailyClose.close_date <= on_or_before)
        return await session.scalar(stmt)


def _close_on_or_before(prices: dict[date, Decimal], target: date) -> Decimal | None:
    for back in range(_MAX_WALKBACK_DAYS):
        price = prices.get(target - timedelta(days=back))
        if price is not None:
            return price
    return None


def _returns_ending(
    by_ticker: dict[str, dict[date, Decimal]], session: date, days: int
) -> tuple[float | None, list[dict[str, Any]]]:
    """
    Window returns ending on `session`: from the last close on or before
    `session - days` to the close on `session` itself, so "1 Day" on a Monday
    runs from Friday's close. A ticker with no close on `session` gets None
    rather than an older close passed off as that session's.
    """
    def _pct(ticker: str) -> float | None:
        prices = by_ticker.get(ticker, {})
        end = prices.get(session)
        start = _close_on_or_before(prices, session - timedelta(days=days))
        if not end or not start:
            return None
        return float((end - start) / start * Decimal(100))

    spy_return = _pct(BENCHMARK_TICKER)
    sectors: list[dict[str, Any]] = []
    for ticker, name in SECTOR_ETFS.items():
        ret = _pct(ticker)
        vs_spy = None
        if ret is not None and spy_return is not None:
            vs_spy = round(ret - spy_return, 4)
        sectors.append({
            "ticker": ticker,
            "name": name,
            "return_pct": round(ret, 4) if ret is not None else None,
            "vs_spy_pct": vs_spy,
        })
    return spy_return, sectors


async def compute_relative_returns(end_date: date | None, window: str) -> dict[str, Any]:
    """
    Compute window returns for each sector ETF and the SPY benchmark, as of the
    latest stored session on or before end_date (None: the latest session).
    Returns:
        {
            "as_of": "YYYY-MM-DD",
            "window": "1M",
            "spy_return_pct": 1.23,
            "sectors": [
                {"ticker": "XLK", "name": "Technology", "return_pct": 2.5, "vs_spy_pct": 1.27},
                ...
            ]
        }
    """
    days = _window_to_days(window)
    # Anchor on the latest real session so a stale/lapsed feed degrades to "data
    # through <latest date>" rather than a window full of null tiles, and a
    # weekend or holiday as-of date reads as the session before it.
    session = await _latest_close_date(end_date) or end_date or date.today()
    by_ticker = await _closes_by_ticker(session - timedelta(days=days + _MAX_WALKBACK_DAYS), session)
    spy_return, sectors = _returns_ending(by_ticker, session, days)

    return {
        "as_of": session.isoformat(),
        "window": window,
        "spy_return_pct": round(spy_return, 4) if spy_return is not None else None,
        "sectors": sectors,
    }


async def compute_timelapse_frames(end_date: date | None, window: str, step_days: int = 1) -> dict[str, Any]:
    """
    One heatmap frame per stored session in [end - window, end], frames at least
    `step_days` calendar days apart. Each frame is what compute_relative_returns
    returns for that session, so the last frame matches the heatmap. Weekends
    and holidays get no frame: one would compare Friday's close with itself.
    Single payload — client scrubs locally.
    """
    if step_days < 1:
        step_days = 1
    days = _window_to_days(window)
    # Cap the timeline at the latest real session so frames never trail past
    # available data into a wall of gray "—" tiles when the feed lapses.
    end_session = await _latest_close_date(end_date) or end_date or date.today()
    series_start = end_session - timedelta(days=days)
    # Pull enough history to cover the trailing window for the earliest frame
    by_ticker = await _closes_by_ticker(
        series_start - timedelta(days=days + _MAX_WALKBACK_DAYS), end_session
    )
    sessions = sorted({d for prices in by_ticker.values() for d in prices if d >= series_start})

    frames: list[dict[str, Any]] = []
    last_frame: date | None = None
    for session in sessions:
        if last_frame is not None and (session - last_frame).days < step_days:
            continue
        last_frame = session
        spy_return, sectors = _returns_ending(by_ticker, session, days)
        frames.append({
            "date": session.isoformat(),
            "spy_return_pct": round(spy_return, 4) if spy_return is not None else None,
            "sectors": sectors,
        })

    return {
        "window": window,
        "step_days": step_days,
        "end_date": end_session.isoformat(),
        "frames": frames,
    }
