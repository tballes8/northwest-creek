"""
Daily stock snapshot fetcher - CRON JOB
Fetches all stock snapshots from Massive API and stores in database
"""
import asyncio
from sqlalchemy import delete
from datetime import date

from app.db.session import AsyncSessionLocal
from app.models.daily_snapshot import DailyStockSnapshot
from app.services.market_data import market_data_service


async def fetch_and_store_snapshots():
    """Fetch all stock snapshots and store in database"""
    print("🔄 Starting daily snapshot fetch...")
    
    session = None
    try:
        # Fetch all snapshots from API
        print("📊 Fetching snapshots from Massive API...")
        snapshots_data = await market_data_service.get_all_snapshots()
        
        if not snapshots_data:
            print("⚠️  No snapshots returned from API")
            return
        
        print(f"✅ Fetched {len(snapshots_data)} snapshots")
        
        # Create database session
        session = AsyncSessionLocal()
        
        # Delete existing snapshots for today (idempotent)
        today = date.today()
        print(f"🗑️  Deleting existing snapshots for {today}")
        await session.execute(
            delete(DailyStockSnapshot).where(
                DailyStockSnapshot.snapshot_date == today
            )
        )
        
        # Prepare new snapshots
        new_snapshots = []
        for data in snapshots_data:
            # Calculate percent change
            if data.get('open') and data.get('close'):
                open_price = float(data['open'])
                close_price = float(data['close'])
                change_percent = ((close_price - open_price) / open_price) * 100
            else:
                change_percent = 0.0
            
            snapshot = DailyStockSnapshot(
                ticker=data['ticker'],
                open_price=data.get('open'),
                close_price=data.get('close'),
                change_percent=change_percent,
                snapshot_date=today
            )
            new_snapshots.append(snapshot)
        
        # Bulk insert
        print(f"💾 Inserting {len(new_snapshots)} snapshots...")
        session.add_all(new_snapshots)
        await session.commit()
        
        print(f"✅ Successfully stored {len(new_snapshots)} snapshots for {today}")
        
    except Exception as e:
        print(f"❌ Error fetching snapshots: {e}")
        if session:
            await session.rollback()
        raise
    finally:
        # IMPORTANT: Close database connection so process can exit
        if session:
            await session.close()
            print("🔒 Database connection closed")


if __name__ == "__main__":
    # Run the async function
    asyncio.run(fetch_and_store_snapshots())
    print("✅ Cron job completed - exiting")