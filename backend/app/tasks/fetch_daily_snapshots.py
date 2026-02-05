"""
Daily stock snapshot fetcher - CRON JOB
Fetches all stock snapshots from Massive API and stores in database
"""
import asyncio
import os
from sqlalchemy import delete
from datetime import date
from massive import RESTClient
from massive.rest.models import TickerSnapshot, Agg

from app.db.session import AsyncSessionLocal
from app.db.models import DailyStockSnapshot  # ✅ Fixed import path


async def fetch_and_store_snapshots():
    """Fetch all stock snapshots and store in database"""
    print("📊 Starting daily snapshot fetch...")
    
    # Get API key from environment
    api_key = os.getenv("MASSIVE_API_KEY")
    if not api_key:
        print("❌ ERROR: MASSIVE_API_KEY not set in environment")
        return
    
    session = None
    try:
        # Fetch snapshots from Massive API (synchronous)
        print("📈 Fetching snapshots from Massive API...")
        client = RESTClient(api_key)
        snapshot_data = client.get_snapshot_all("stocks")
        
        if not snapshot_data:
            print("⚠️ No snapshots returned from API")
            return
        
        print(f"✅ Fetched {len(snapshot_data)} snapshots from API")
        
        # Process snapshots
        valid_snapshots = []
        today = date.today()
        
        for item in snapshot_data:
            if isinstance(item, TickerSnapshot):
                if isinstance(item.prev_day, Agg):
                    if isinstance(item.prev_day.open, (float, int)) and isinstance(item.prev_day.close, (float, int)):
                        # Calculate percent change
                        open_price = float(item.prev_day.open)
                        close_price = float(item.prev_day.close)
                        
                        if open_price != 0:
                            change_percent = ((close_price - open_price) / open_price) * 100
                        else:
                            change_percent = 0.0
                        
                        valid_snapshots.append({
                            'ticker': item.ticker,
                            'open_price': open_price,
                            'close_price': close_price,
                            'change_percent': change_percent,
                            'snapshot_date': today
                        })
        
        print(f"✅ Processed {len(valid_snapshots)} valid snapshots")
        
        if not valid_snapshots:
            print("⚠️ No valid snapshots to store")
            return
        
        # Create database session
        session = AsyncSessionLocal()
        
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
        
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
        if session:
            await session.rollback()
        raise
    finally:
        if session:
            await session.close()
            print("🔒 Database connection closed")


if __name__ == "__main__":
    asyncio.run(fetch_and_store_snapshots())
    print("✅ Cron job completed - exiting")
    