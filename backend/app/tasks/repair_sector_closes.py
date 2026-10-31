"""
Repair sector_etf_daily_closes rows stored before closes were session-dated (N12).

append_today_closes() used to stamp each close with the run's date.today().
The 06:00 UTC job filed session D's close under D+1 and copied Friday's close
onto Saturday, Sunday and Monday; the fetch_daily_snapshots cron did the same
while it ran pre-market (11:00 UTC, until 2026-09-09), and on holidays both
stored the previous close under the holiday's date. So the table can hold:
  - rows on dates no session traded (weekends, holidays) carrying the previous
    close. Each becomes a time-lapse frame reading 0.00%, and an as-of date
    landing on one compares a close with itself.
  - session rows carrying the previous session's close, which every window
    starting or ending on them reads one session off.
The fixed append only re-reads its trailing two weeks, so neither heals alone.

This makes the table match FMP's EOD bars over the stored span:
  update  a session row whose close differs from its bar
  insert  a session with a bar but no row (e.g. days the append failed)
  delete  a row on a date none of the 12 tickers has a bar for, inside the
          span every ticker's bars cover (a weekend or holiday), and any row
          dated a Saturday or Sunday, when no US session ever trades
Other rows outside the bars' span are left alone. If any ticker's bars can't
be fetched, nothing is written. Writes go in one transaction. Idempotent: a second
--apply finds nothing to do.

    python -m app.tasks.repair_sector_closes            # dry run, prints the plan
    python -m app.tasks.repair_sector_closes --apply    # writes it
"""
import asyncio
import sys
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import and_, delete, select

from app.db.models import SectorEtfDailyClose
from app.db.session import async_session, engine
from app.services.fmp_client import init_fmp_client, close_fmp_client
from app.services.market_data import market_data_service
from app.services import sector_rotation as sr

_FOUR_DP = Decimal("0.0001")  # close_price is NUMERIC(18,4)


async def plan_repair() -> dict | None:
    """Compare stored rows with FMP's EOD bars. Returns the plan, or None when
    there is nothing stored or a ticker's bars could not be fetched."""
    async with async_session() as session:
        result = await session.execute(
            select(
                SectorEtfDailyClose.ticker,
                SectorEtfDailyClose.close_date,
                SectorEtfDailyClose.close_price,
            ).where(SectorEtfDailyClose.ticker.in_(sr.ALL_TICKERS))
        )
        stored: dict[str, dict[date, Decimal]] = {}
        for r in result.all():
            stored.setdefault(r.ticker, {})[r.close_date] = r.close_price
    if not stored:
        print("No stored rows for the tracked tickers. Nothing to repair.")
        return None
    first_stored = min(min(rows) for rows in stored.values())

    now_et = datetime.now(sr.EASTERN)
    days = (now_et.date() - first_stored).days + 7
    bars: dict[str, dict[date, Decimal]] = {}
    for ticker in sr.ALL_TICKERS:
        try:
            history = await market_data_service.get_historical_prices(ticker, days=days)
        except Exception as exc:
            print(f"Could not fetch EOD bars for {ticker}: {exc}. Nothing written; re-run later.")
            return None
        rows = sr._session_rows(ticker, history, now_et)
        if not rows:
            print(f"No EOD bars returned for {ticker}. Nothing written; re-run later.")
            return None
        bars[ticker] = {r["close_date"]: r["close_price"].quantize(_FOUR_DP) for r in rows}

    sessions = {d for ticker_bars in bars.values() for d in ticker_bars}
    # Only judge a date inside the span every ticker's bars cover, so a series
    # shorter than the stored history (plan depth limits) can't delete rows.
    covered_from = max(min(b) for b in bars.values())
    covered_to = min(max(b) for b in bars.values())

    updates: list[tuple[str, date, Decimal, Decimal]] = []
    inserts: list[tuple[str, date, Decimal]] = []
    deletes: list[tuple[str, date, Decimal]] = []
    for ticker in sr.ALL_TICKERS:
        have = stored.get(ticker, {})
        for d, close in sorted(bars[ticker].items()):
            if d < first_stored:
                continue
            if d not in have:
                inserts.append((ticker, d, close))
            elif have[d] != close:
                updates.append((ticker, d, have[d], close))
        for d, price in sorted(have.items()):
            # The weekend test also catches a legacy weekend row dated after the
            # last completed bar, which the span test can't judge yet.
            if (covered_from <= d <= covered_to and d not in sessions) or d.weekday() >= 5:
                deletes.append((ticker, d, price))

    return {
        "stored_rows": sum(len(v) for v in stored.values()),
        "stored_span": (first_stored, max(max(v) for v in stored.values())),
        "covered": (covered_from, covered_to),
        "updates": updates,
        "inserts": inserts,
        "deletes": deletes,
    }


def _change(old: Decimal, new: Decimal) -> str:
    return f"{(new - old) / old * 100:+.2f}%" if old else "n/a"


def print_plan(plan: dict) -> None:
    url = engine.url
    print(f"Database: {url.host}:{url.port}/{url.database}")
    print(f"Stored:   {plan['stored_rows']} rows, {plan['stored_span'][0]} .. {plan['stored_span'][1]}")
    print(f"Bars:     every ticker covers {plan['covered'][0]} .. {plan['covered'][1]}")
    print(f"{'ticker':<7}{'update':>8}{'insert':>8}{'delete':>8}")
    for ticker in sr.ALL_TICKERS:
        counts = [sum(1 for row in plan[k] if row[0] == ticker) for k in ("updates", "inserts", "deletes")]
        print(f"{ticker:<7}{counts[0]:>8}{counts[1]:>8}{counts[2]:>8}")

    non_sessions = sorted({d for _, d, _ in plan["deletes"]})
    if non_sessions:
        weekend = sum(1 for d in non_sessions if d.weekday() >= 5)
        print(f"\nNon-session dates ({len(non_sessions)}: {weekend} weekend, "
              f"{len(non_sessions) - weekend} weekday holiday):")
        print("  " + ", ".join(f"{d} {d.strftime('%a')}" for d in non_sessions))
    if plan["updates"]:
        print("\nClose corrections (first 15; stored -> bar):")
        for ticker, d, old, new in plan["updates"][:15]:
            print(f"  {ticker:<5} {d} {d.strftime('%a')}  {old} -> {new}  ({_change(old, new)})")
        worst = max(plan["updates"], key=lambda u: abs(u[3] - u[2]) / u[2] if u[2] else Decimal(1))
        print(f"  largest: {worst[0]} {worst[1]} {worst[2]} -> {worst[3]} ({_change(worst[2], worst[3])})")
    if plan["inserts"]:
        missing = sorted({d for _, d, _ in plan["inserts"]})
        print(f"\nMissing sessions to fill ({len(missing)}): {missing[0]} .. {missing[-1]}")
    print(f"\nTotal: update {len(plan['updates'])}, insert {len(plan['inserts'])}, "
          f"delete {len(plan['deletes'])}")


async def apply_plan(plan: dict) -> None:
    """Write the plan in one transaction."""
    async with async_session() as session:
        by_date: dict[date, list[str]] = {}
        for ticker, d, _ in plan["deletes"]:
            by_date.setdefault(d, []).append(ticker)
        for d, tickers in by_date.items():
            await session.execute(
                delete(SectorEtfDailyClose).where(
                    and_(
                        SectorEtfDailyClose.close_date == d,
                        SectorEtfDailyClose.ticker.in_(tickers),
                    )
                )
            )
        upserts = [(t, d, new) for t, d, _, new in plan["updates"]] + plan["inserts"]
        for ticker in sr.ALL_TICKERS:
            rows = [
                {"ticker": t, "close_date": d, "close_price": close}
                for t, d, close in upserts
                if t == ticker
            ]
            if rows:
                await session.execute(sr._upsert_stmt(rows))
        await session.commit()


async def main(apply: bool) -> None:
    await init_fmp_client()
    try:
        plan = await plan_repair()
        if plan is None:
            return
        print_plan(plan)
        if not (plan["updates"] or plan["inserts"] or plan["deletes"]):
            print("Table already matches the EOD bars. Nothing to do.")
        elif apply:
            await apply_plan(plan)
            print("Applied.")
        else:
            print("Dry run, nothing written. Re-run with --apply to write it.")
    finally:
        await close_fmp_client()
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main(apply="--apply" in sys.argv[1:]))
