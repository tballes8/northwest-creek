"""
Daily stock snapshot fetcher - CRON JOB
Fetches all stock snapshots from Massive API and stores in database
"""
import asyncio
import os
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from datetime import date
from massive import RESTClient
from massive.rest.models import TickerSnapshot, Agg

from app.db.models import DailyStockSnapshot

async def fetch_and_store_snapshots():
    """Fetch all stock snapshots and store in database"""
    print("📊 Starting daily snapshot fetch...")
    
    # Get environment variables
    api_key = os.getenv("MASSIVE_API_KEY")
    
    # Check if we're running locally or on Railway
    # Railway cron will have DATABASE_URL pointing to internal network
    database_url = os.getenv("DATABASE_URL")
    
    # If the URL contains 'railway.internal', we're testing locally via railway run
    # Replace with public URL
    if database_url and "railway.internal" in database_url:
        print("🔍 Detected local testing - using public database URL")
        database_url = "postgresql://postgres:wZzGWpLKjwzGeTsXGdHVhBveBtJTrWDr@crossover.proxy.rlwy.net:21798/railway"
    
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


if __name__ == "__main__":
    asyncio.run(fetch_and_store_snapshots())
    print("✅ Cron job completed - exiting")