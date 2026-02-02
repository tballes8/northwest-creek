"""
Daily Stock Snapshot Fetcher
Runs once per day to fetch all stock snapshots and store in database
"""
import asyncio
from datetime import datetime, date
from sqlalchemy.ext.asyncio import AsyncSession
from massive import RESTClient
from massive.rest.models import TickerSnapshot, Agg
import os
import sys

# Add parent directory to path so we can import app modules
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')))

from app.db.session import AsyncSessionLocal
from app.models.daily_snapshot import DailyStockSnapshot
from sqlalchemy import delete


async def fetch_and_store_snapshots():
    """
    Fetch all stock snapshots from Massive API and store in database
    """
    print(f"[{datetime.now()}] Starting daily snapshot fetch...")
    
    # Get API key from environment
    api_key = os.getenv("MASSIVE_API_KEY")
    if not api_key:
        print("ERROR: MASSIVE_API_KEY not set in environment")
        return
    
    # Initialize Massive client
    client = RESTClient(api_key)
    
    # Get all stock snapshots
    print("Fetching snapshots from Massive API...")
    snapshot = client.get_snapshot_all("stocks")
    
    # Process snapshots
    results = []
    today = date.today()
    
    print(f"Processing {len(snapshot)} stock snapshots...")
    
    for item in snapshot:
        if isinstance(item, TickerSnapshot):
            if isinstance(item.prev_day, Agg):
                if isinstance(item.prev_day.open, float) and isinstance(item.prev_day.close, float):
                    # Avoid division by zero
                    if item.prev_day.open != 0:
                        percent_change = (
                            (item.prev_day.close - item.prev_day.open)
                            / item.prev_day.open
                            * 100
                        )
                    else:
                        percent_change = 0.0
                    
                    results.append({
                        'ticker': item.ticker,
                        'open_price': item.prev_day.open,
                        'close_price': item.prev_day.close,
                        'change_percent': percent_change,
                        'snapshot_date': today
                    })
    
    print(f"Processed {len(results)} valid snapshots")
    
    # Store in database
    async with AsyncSessionLocal() as db:
        try:
            # Delete old snapshots for today (in case script runs multiple times)
            await db.execute(
                delete(DailyStockSnapshot).where(
                    DailyStockSnapshot.snapshot_date == today
                )
            )
            
            # Insert new snapshots
            for result in results:
                snapshot_obj = DailyStockSnapshot(**result)
                db.add(snapshot_obj)
            
            await db.commit()
            print(f"✅ Successfully stored {len(results)} snapshots for {today}")
            
        except Exception as e:
            await db.rollback()
            print(f"❌ Error storing snapshots: {e}")
            raise


def main():
    """
    Main entry point for the script
    """
    asyncio.run(fetch_and_store_snapshots())


if __name__ == "__main__":
    main()