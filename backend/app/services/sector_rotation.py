"""
Sector Rotation service.

Tracks daily close prices for the 11 GICS sector ETFs plus SPY (benchmark) in
the sector_etf_daily_closes table. Used by the heatmap and time-lapse endpoints.

Data flow:
- One-time backfill: `backfill_history(years=2)` — manual script, run once on deploy.
- Daily append: `append_today_closes()` — called from fetch_daily_snapshots cron.
- Read paths: `compute_relative_returns()` and `compute_timelapse_frames()` —
  hit the local table only, no FMP calls.
"""
import logging
from datetime import date, timedelta
from decimal import Decimal
from typing import Any

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


async def _upsert_closes(rows: list[dict]) -> int:
    """Upsert daily close rows. Returns number of rows written."""
    if not rows:
        return 0
    async with async_session() as session:
        stmt = pg_insert(SectorEtfDailyClose).values(rows)
        stmt = stmt.on_conflict_do_update(
            index_elements=["ticker", "close_date"],
            set_={"close_price": stmt.excluded.close_price},
        )
        await session.execute(stmt)
        await session.commit()
    return len(rows)


async def backfill_history(years: int = 2) -> int:
    """
    Fetch historical daily closes for all 12 tickers and upsert into
    sector_etf_daily_closes. Run this once after deploying the migration.
    """
    days = years * 365
    total = 0
    for ticker in ALL_TICKERS:
        try:
            history = await market_data_service.get_historical_prices(ticker, days=days)
        except Exception as exc:
            logger.warning(f"Failed to fetch history for {ticker}: {exc}")
            continue

        rows = [
            {
                "ticker": ticker,
                "close_date": date.fromisoformat(h["date"]) if isinstance(h.get("date"), str) else h.get("date"),
                "close_price": Decimal(str(h["close"])),
            }
            for h in history
            if h.get("close") is not None and h.get("date")
        ]
        written = await _upsert_closes(rows)
        total += written
        logger.info(f"Backfilled {written} rows for {ticker}")
    return total


async def append_today_closes() -> int:
    """
    Fetch today's close prices for the 12 tickers via FMP batch quote and append
    one row per ticker. Idempotent — re-running on the same day overwrites.
    Called by the daily fetch_daily_snapshots cron after market close.
    """
    quotes = await market_data_service.get_batch_quotes(ALL_TICKERS)
    if not quotes:
        logger.warning("Sector rotation: batch quote returned empty — skipping append")
        return 0

    today = date.today()
    rows: list[dict] = []
    for ticker in ALL_TICKERS:
        q = quotes.get(ticker.upper())
        if not q:
            logger.warning(f"Sector rotation: missing quote for {ticker}")
            continue
        price = q.get("price")
        if price is None or price == 0:
            continue
        rows.append({
            "ticker": ticker,
            "close_date": today,
            "close_price": Decimal(str(price)),
        })
    return await _upsert_closes(rows)


async def _closes_in_range(start_date: date, end_date: date) -> dict[str, list[tuple[date, Decimal]]]:
    """Return {ticker: [(date, close), ...]} sorted by date ascending."""
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
            .order_by(SectorEtfDailyClose.ticker, SectorEtfDailyClose.close_date)
        )
        result = await session.execute(stmt)
        rows = result.all()

    grouped: dict[str, list[tuple[date, Decimal]]] = {}
    for r in rows:
        grouped.setdefault(r.ticker, []).append((r.close_date, r.close_price))
    return grouped


async def _latest_close_date() -> date | None:
    """Most recent close_date present in the table across the tracked tickers."""
    async with async_session() as session:
        stmt = select(func.max(SectorEtfDailyClose.close_date)).where(
            SectorEtfDailyClose.ticker.in_(ALL_TICKERS)
        )
        return await session.scalar(stmt)


async def compute_relative_returns(end_date: date, window: str) -> dict[str, Any]:
    """
    Compute window returns for each sector ETF and the SPY benchmark.
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
    # Anchor on the latest real close so a stale/lapsed feed degrades to "data
    # through <latest date>" rather than a window full of null tiles.
    latest = await _latest_close_date()
    if latest and latest < end_date:
        end_date = latest
    start_date = end_date - timedelta(days=days)
    grouped = await _closes_in_range(start_date, end_date)

    def _pct(series: list[tuple[date, Decimal]]) -> float | None:
        if len(series) < 2:
            return None
        first = series[0][1]
        last = series[-1][1]
        if first is None or first == 0:
            return None
        return float((last - first) / first * Decimal(100))

    spy_return = _pct(grouped.get(BENCHMARK_TICKER, []))
    sectors_payload = []
    for ticker, name in SECTOR_ETFS.items():
        ret = _pct(grouped.get(ticker, []))
        vs_spy = None
        if ret is not None and spy_return is not None:
            vs_spy = round(ret - spy_return, 4)
        sectors_payload.append({
            "ticker": ticker,
            "name": name,
            "return_pct": round(ret, 4) if ret is not None else None,
            "vs_spy_pct": vs_spy,
        })

    return {
        "as_of": end_date.isoformat(),
        "window": window,
        "spy_return_pct": round(spy_return, 4) if spy_return is not None else None,
        "sectors": sectors_payload,
    }


async def compute_timelapse_frames(end_date: date, window: str, step_days: int = 1) -> dict[str, Any]:
    """
    Build a list of heatmap frames over the [end_date - window, end_date] range,
    one frame per `step_days`. Each frame uses the same `window` lookback as
    compute_relative_returns. Single payload — client scrubs locally.
    """
    if step_days < 1:
        step_days = 1
    days = _window_to_days(window)
    # Cap the timeline at the latest real close so frames never trail past
    # available data into a wall of gray "—" tiles when the feed lapses.
    latest = await _latest_close_date()
    if latest and latest < end_date:
        end_date = latest
    series_start = end_date - timedelta(days=days)
    # Pull enough history to cover the trailing window for the earliest frame
    history_start = series_start - timedelta(days=days)
    grouped = await _closes_in_range(history_start, end_date)

    # Build a per-ticker date->price map for fast lookup
    by_ticker: dict[str, dict[date, Decimal]] = {
        t: {d: p for d, p in series} for t, series in grouped.items()
    }

    def _last_close_on_or_before(ticker: str, target: date) -> Decimal | None:
        prices = by_ticker.get(ticker, {})
        cursor = target
        # Walk back up to 7 days to skip weekends / holidays
        for _ in range(7):
            if cursor in prices:
                return prices[cursor]
            cursor -= timedelta(days=1)
        return None

    frames: list[dict[str, Any]] = []
    cursor = series_start
    while cursor <= end_date:
        spy_start = _last_close_on_or_before(BENCHMARK_TICKER, cursor - timedelta(days=days))
        spy_end = _last_close_on_or_before(BENCHMARK_TICKER, cursor)
        spy_return = None
        if spy_start and spy_end and spy_start != 0:
            spy_return = float((spy_end - spy_start) / spy_start * Decimal(100))

        sectors_frame = []
        for ticker, name in SECTOR_ETFS.items():
            t_start = _last_close_on_or_before(ticker, cursor - timedelta(days=days))
            t_end = _last_close_on_or_before(ticker, cursor)
            ret = None
            if t_start and t_end and t_start != 0:
                ret = float((t_end - t_start) / t_start * Decimal(100))
            vs_spy = None
            if ret is not None and spy_return is not None:
                vs_spy = round(ret - spy_return, 4)
            sectors_frame.append({
                "ticker": ticker,
                "name": name,
                "return_pct": round(ret, 4) if ret is not None else None,
                "vs_spy_pct": vs_spy,
            })

        frames.append({
            "date": cursor.isoformat(),
            "spy_return_pct": round(spy_return, 4) if spy_return is not None else None,
            "sectors": sectors_frame,
        })
        cursor += timedelta(days=step_days)

    return {
        "window": window,
        "step_days": step_days,
        "end_date": end_date.isoformat(),
        "frames": frames,
    }
