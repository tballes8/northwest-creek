"""
Daily stock snapshot fetcher - CRON JOB
Fetches all stock snapshots from FMP API and stores in database
"""
import asyncio
import os
from sqlalchemy import delete, select, func
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from datetime import date
import httpx

from app.db.models import DailyStockSnapshot
from app.db.models import WaitlistSignup

FMP_BASE = "https://financialmodelingprep.com/stable"
# Batch size for quote requests — /stable/batch-quote supports larger batches
QUOTE_BATCH_SIZE = 500


async def fetch_and_store_snapshots():
    """Fetch all stock snapshots and store in database"""
    print("📊 Starting daily snapshot fetch...")

    # Get environment variables
    api_key = os.getenv("MASSIVE_API_KEY")
    database_url = os.getenv("DATABASE_URL")

    if not api_key:
        print("❌ ERROR: MASSIVE_API_KEY not set in environment")
        return

    if not database_url:
        print("❌ ERROR: No DATABASE_URL found")
        return

    # DEBUG: Print masked DATABASE_URL
    if database_url:
        masked_url = database_url.split('@')[1] if '@' in database_url else database_url
        print(f"🔍 Connecting to: {masked_url}")

    # Convert postgresql:// to postgresql+asyncpg://
    if database_url.startswith("postgresql://"):
        database_url = database_url.replace("postgresql://", "postgresql+asyncpg://")

    # Create database engine and session for this script
    engine = create_async_engine(database_url, echo=False)
    async_session_factory = sessionmaker(
        engine, class_=AsyncSession, expire_on_commit=False
    )

    try:
        # Step 1: Get list of all tradable stocks from FMP
        print("📈 Fetching stock list from FMP...")
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.get(
                f"{FMP_BASE}/stock-list",
                params={"apikey": api_key},
            )
            resp.raise_for_status()
            stock_list = resp.json()

        if not stock_list or not isinstance(stock_list, list):
            print("⚠️ No stock list returned from FMP")
            return

        # Filter to common stocks only (exclude ETFs, warrants, etc.)
        tickers = [
            s.get("symbol") for s in stock_list
            if s.get("symbol") and s.get("type") in ("stock", "Stock", "cs", "CS", None)
        ]
        # Fallback: if type filtering removed everything, just take all symbols
        if not tickers:
            tickers = [s.get("symbol") for s in stock_list if s.get("symbol")]

        print(f"✅ Got {len(tickers)} tickers from stock list")

        # Step 2: Batch-fetch quotes
        print("📈 Fetching quotes in batches...")
        valid_snapshots = []
        today = date.today()

        async with httpx.AsyncClient(timeout=15.0) as client:
            for i in range(0, len(tickers), QUOTE_BATCH_SIZE):
                batch = tickers[i:i + QUOTE_BATCH_SIZE]
                symbols = ",".join(batch)

                try:
                    resp = await client.get(
                        f"{FMP_BASE}/batch-quote",
                        params={"symbols": symbols, "apikey": api_key},
                    )
                    resp.raise_for_status()
                    quotes = resp.json()

                    if not quotes or not isinstance(quotes, list):
                        continue

                    for item in quotes:
                        open_price = item.get("open")
                        close_price = item.get("price")
                        ticker = item.get("symbol")

                        if not ticker or open_price is None or close_price is None:
                            continue

                        open_price = float(open_price)
                        close_price = float(close_price)

                        if open_price != 0:
                            change_percent = ((close_price - open_price) / open_price) * 100
                        else:
                            change_percent = 0.0

                        valid_snapshots.append({
                            'ticker': ticker,
                            'open_price': open_price,
                            'close_price': close_price,
                            'change_percent': change_percent,
                            'snapshot_date': today,
                        })

                except Exception as batch_err:
                    print(f"⚠️ Batch {i}-{i+QUOTE_BATCH_SIZE} failed: {batch_err}")
                    continue

                # Progress logging every 500 tickers
                if (i + QUOTE_BATCH_SIZE) % 500 == 0:
                    print(f"   Processed {i + QUOTE_BATCH_SIZE}/{len(tickers)} tickers...")

        print(f"✅ Processed {len(valid_snapshots)} valid snapshots")

        if not valid_snapshots:
            print("⚠️ No valid snapshots to store")
            return

        # Create database session
        async with async_session_factory() as session:
            try:
                # Delete existing snapshots for today (idempotent)
                print(f"🗑️ Deleting existing snapshots for {today}")
                await session.execute(
                    delete(DailyStockSnapshot).where(
                        DailyStockSnapshot.snapshot_date == today
                    )
                )

                # Insert new snapshots
                print(f"💾 Inserting {len(valid_snapshots)} snapshots...")
                for snapshot_data in valid_snapshots:
                    snapshot = DailyStockSnapshot(**snapshot_data)
                    session.add(snapshot)

                await session.commit()
                print(f"✅ Successfully stored {len(valid_snapshots)} snapshots for {today}")

            except Exception as db_error:
                await session.rollback()
                print(f"❌ Database error: {db_error}")
                raise

        print("🔒 Database connection closed")

    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
        raise
    finally:
        # Clean up engine
        await engine.dispose()


async def fetch_waitlist_report():
    """Fetch and log all waitlist signups"""
    print("\n📋 Generating waitlist report...")

    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        print("❌ ERROR: No DATABASE_URL found")
        return

    if database_url.startswith("postgresql://"):
        database_url = database_url.replace("postgresql://", "postgresql+asyncpg://")

    engine = create_async_engine(database_url, echo=False)
    async_session_factory = sessionmaker(
        engine, class_=AsyncSession, expire_on_commit=False
    )

    try:
        async with async_session_factory() as session:

            # Total count
            total = (await session.execute(
                select(func.count(WaitlistSignup.id))
            )).scalar()

            # All signups ordered by date
            result = await session.execute(
                select(WaitlistSignup).order_by(WaitlistSignup.created_at.desc())
            )
            signups = result.scalars().all()

            print(f"📊 Total waitlist signups: {total}")
            print("-" * 60)

            for s in signups:
                converted = "✅ converted" if s.converted else ""
                source = s.source or "direct"
                print(f"  {s.email:<35} {source:<15} {s.created_at.strftime('%Y-%m-%d %H:%M')}  {converted}")

            print("-" * 60)

            # Source breakdown
            source_counts = (await session.execute(
                select(
                    func.coalesce(WaitlistSignup.source, 'direct'),
                    func.count(WaitlistSignup.id)
                ).group_by(WaitlistSignup.source)
            )).all()

            if source_counts:
                print("📈 Signups by source:")
                for source, count in source_counts:
                    print(f"  {source or 'direct':<20} {count}")

    except Exception as e:
        print(f"❌ Waitlist report error: {e}")
        import traceback
        traceback.print_exc()
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(fetch_and_store_snapshots())
    print("✅ Snapshot job completed")
    asyncio.run(fetch_waitlist_report())
    print("✅ All cron tasks completed - exiting")
