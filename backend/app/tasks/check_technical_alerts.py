"""
Technical Alert Checker — CRON JOB
Runs daily after market close to evaluate indicator-based alerts.
Schedule: 30 21 * * 1-5 (4:30 PM ET weekdays)
"""
import asyncio
import os
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import async_sessionmaker

from app.db.engine import make_async_engine
from app.services.technical_alert_checker import technical_alert_checker
from app.services.fmp_client import init_fmp_client, close_fmp_client


async def run_check():
    """Fetch indicators and evaluate all active technical alerts."""
    print(f"📊 Technical alert check starting at {datetime.now(timezone.utc).isoformat()}")

    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        print("❌ ERROR: No DATABASE_URL found")
        return

    if not os.getenv("MASSIVE_API_KEY"):
        print("❌ ERROR: MASSIVE_API_KEY not set")
        return

    engine = make_async_engine(database_url)
    async_session_factory = async_sessionmaker(engine, expire_on_commit=False)

    # Initialize FMP HTTP client
    await init_fmp_client()

    try:
        async with async_session_factory() as session:
            result = await technical_alert_checker.check_all_alerts(session)
            print(f"✅ Technical alert check complete: {result}")
    except Exception as e:
        print(f"❌ Technical alert check failed: {e}")
        import traceback
        traceback.print_exc()
    finally:
        await close_fmp_client()
        await engine.dispose()

    print(f"📊 Technical alert check finished at {datetime.now(timezone.utc).isoformat()}")


if __name__ == "__main__":
    asyncio.run(run_check())
