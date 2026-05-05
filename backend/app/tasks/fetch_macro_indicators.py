"""
Daily macro-indicator fetcher.

Pulls the latest observation for each FRED series in MACRO_SERIES and upserts
it into the macro_indicators table (one row per series_id, kept current).
Runs daily — most series only update monthly/quarterly, so the upsert is a
no-op on most days.

Used by the AI economic-cycle synthesis on the Sector Heatmap page.
"""
from __future__ import annotations

import asyncio
import logging
from decimal import Decimal

from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.db.models import MacroIndicator
from app.db.session import async_session
from app.services.fred_client import MACRO_SERIES, fetch_latest_observation

logger = logging.getLogger(__name__)


async def fetch_and_store_macro_indicators() -> int:
    """
    Fetch latest observations for all tracked FRED series and upsert. Returns the
    number of series successfully written. Failures on individual series are logged
    but don't abort the run.
    """
    written = 0
    for series_id in MACRO_SERIES:
        obs = await fetch_latest_observation(series_id)
        if obs is None:
            logger.warning(f"Macro indicators: no observation returned for {series_id}")
            continue

        async with async_session() as session:
            stmt = pg_insert(MacroIndicator).values(
                series_id=obs.series_id,
                observation_date=obs.observation_date,
                value=Decimal(str(obs.value)),
            )
            stmt = stmt.on_conflict_do_update(
                index_elements=["series_id"],
                set_={
                    "observation_date": stmt.excluded.observation_date,
                    "value": stmt.excluded.value,
                },
            )
            await session.execute(stmt)
            await session.commit()
        written += 1
        logger.info(f"Macro indicators: upserted {series_id} = {obs.value} ({obs.observation_date})")

    return written


async def macro_indicators_job() -> None:
    """APScheduler entrypoint — wraps fetch_and_store_macro_indicators with logging."""
    try:
        n = await fetch_and_store_macro_indicators()
        logger.info(f"Macro indicators job done: {n}/{len(MACRO_SERIES)} series written")
    except Exception as exc:
        logger.exception(f"Macro indicators job failed: {exc}")


if __name__ == "__main__":
    asyncio.run(macro_indicators_job())
    print("Macro indicators job completed")
