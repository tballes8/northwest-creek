"""
One-off backfill: populate sector_etf_daily_closes with N years of history
for the 11 GICS sector ETFs + SPY.

Run on Railway via:
    railway run python -m app.tasks.backfill_sector_rotation

Or override the years with an env var:
    BACKFILL_YEARS=3 railway run python -m app.tasks.backfill_sector_rotation

Idempotent — safe to re-run; overwrites prices for existing (ticker, date) rows.
After this runs once, the daily fetch_daily_snapshots cron keeps the table fresh
via append_today_closes().
"""
import asyncio
import os

from app.services.fmp_client import init_fmp_client, close_fmp_client
from app.services.sector_rotation import backfill_history


async def main() -> None:
    years = int(os.getenv("BACKFILL_YEARS", "2"))
    print(f"📊 Sector rotation backfill starting — {years} year(s) of history")

    await init_fmp_client()
    try:
        total = await backfill_history(years=years)
        print(f"✅ Backfill complete — {total} rows written")
    finally:
        await close_fmp_client()


if __name__ == "__main__":
    asyncio.run(main())
