"""
Daily stock snapshot fetcher - CRON JOB
Fetches all stock snapshots from FMP API and stores in database
"""
import asyncio
import os
from sqlalchemy import delete, insert, select, func
from sqlalchemy.ext.asyncio import async_sessionmaker
from datetime import date
import httpx

from app.db.engine import make_async_engine
from app.db.models import DailyStockSnapshot
from app.db.models import WaitlistSignup

FMP_BASE = "https://financialmodelingprep.com/stable"
# Batch size for quote requests — /stable/batch-quote supports larger batches
QUOTE_BATCH_SIZE = 1000


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

    # Create database engine and session for this script
    engine = make_async_engine(database_url)
    async_session_factory = async_sessionmaker(engine, expire_on_commit=False)

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

        # Fetch delisted companies to exclude them
        print("📈 Fetching delisted companies from FMP...")
        delisted_symbols = set()
        async with httpx.AsyncClient(timeout=30.0) as client:
            page = 0
            while True:
                resp = await client.get(
                    f"{FMP_BASE}/delisted-companies",
                    params={"apikey": api_key, "page": page, "limit": 100},
                )
                resp.raise_for_status()
                data = resp.json()
                if not data or not isinstance(data, list):
                    break
                for item in data:
                    sym = item.get("symbol")
                    if sym:
                        delisted_symbols.add(sym.upper())
                if len(data) < 100:
                    break
                page += 1
        print(f"✅ Found {len(delisted_symbols)} delisted companies to exclude")

        # Step 1b: Fetch the ETF list so we can classify tickers accurately
        print("📈 Fetching ETF list from FMP...")
        etf_symbols: set[str] = set()
        async with httpx.AsyncClient(timeout=30.0) as client:
            try:
                resp = await client.get(
                    f"{FMP_BASE}/etf-list",
                    params={"apikey": api_key},
                )
                resp.raise_for_status()
                etf_list = resp.json()
                if etf_list and isinstance(etf_list, list):
                    for e in etf_list:
                        sym = e.get("symbol")
                        if sym:
                            etf_symbols.add(sym.upper())
                print(f"✅ Got {len(etf_symbols)} ETF symbols from FMP")
            except Exception as etf_err:
                print(f"⚠️ Could not fetch ETF list (will classify all as CS): {etf_err}")

        # Filter to US-only tickers: skip foreign symbols (contain dots like .T, .PA),
        # tickers longer than 10 chars (DB column is VARCHAR(10)), and delisted stocks
        tickers = []
        ticker_type_map: dict[str, str] = {}  # ticker -> asset type (ETF or CS)
        for s in stock_list:
            sym = s.get("symbol")
            if not sym or "." in sym or len(sym) > 10:
                continue
            if sym.upper() in delisted_symbols:
                continue
            tickers.append(sym)
            ticker_type_map[sym] = "ETF" if sym.upper() in etf_symbols else "CS"

        print(f"✅ Got {len(tickers)} tickers from stock list (after filtering delisted)")

        # Step 2: Batch-fetch quotes
        print("📈 Fetching quotes in batches...")
        valid_snapshots = []
        skipped_no_change = 0
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
                        if "." in ticker or len(ticker) > 10:
                            continue

                        open_price = float(open_price)
                        close_price = float(close_price)

                        # Use FMP's own changePercentage — the identical field
                        # refresh_stock_snapshots.py:376 stores as
                        # stock_snapshots.change_percentage from this same
                        # /stable/batch-quote call. It is what the screener, the
                        # dashboard and the ticker tape all display.
                        #
                        # This used to be computed as (price - open) / open: an
                        # open-to-close move that no other surface in the app
                        # reports, so the discovery cards on Stocks.tsx showed a
                        # different number for a ticker than the screener row for
                        # that same ticker, on the same page.
                        #
                        # changePercentage is occasionally absent. previousClose
                        # yields the same definition, so derive from it rather than
                        # falling back to the open-based figure — a silent mix of
                        # two metrics in one column is the problem being fixed.
                        # If both are missing the row is dropped: change_percent is
                        # NOT NULL, and a synthesised 0.0 renders as a confident
                        # flat "+0.00%" on a stock that may well have moved.
                        change_percent = item.get("changePercentage")
                        if change_percent is None:
                            prev_close = item.get("previousClose")
                            if prev_close is None or float(prev_close) == 0:
                                skipped_no_change += 1
                                continue
                            prev_close = float(prev_close)
                            change_percent = ((close_price - prev_close) / prev_close) * 100
                        change_percent = float(change_percent)

                        valid_snapshots.append({
                            'ticker': ticker,
                            'open_price': open_price,
                            'close_price': close_price,
                            'change_percent': change_percent,
                            'snapshot_date': today,
                            'asset_type': ticker_type_map.get(ticker, 'CS'),
                        })

                except Exception as batch_err:
                    print(f"⚠️ Batch {i}-{i+QUOTE_BATCH_SIZE} failed: {batch_err}")
                    continue

                # Progress logging every 500 tickers
                if (i + QUOTE_BATCH_SIZE) % 500 == 0:
                    print(f"   Processed {i + QUOTE_BATCH_SIZE}/{len(tickers)} tickers...")

        print(f"✅ Processed {len(valid_snapshots)} valid snapshots")
        if skipped_no_change:
            # Visible on purpose: this is the only way a ticker silently leaves the
            # discovery widgets, so a sudden jump means a vendor field change.
            print(f"⚠️  Skipped {skipped_no_change} quotes with no changePercentage and no previousClose")

        if not valid_snapshots:
            print("⚠️ No valid snapshots to store")
            return

        # Create database session
        async with async_session_factory() as session:
            try:
                # Delete all existing snapshots before inserting fresh data
                print(f"🗑️ Deleting all existing snapshots...")
                await session.execute(delete(DailyStockSnapshot))

                # Bulk insert all snapshots in one statement
                print(f"💾 Inserting {len(valid_snapshots)} snapshots...")
                await session.execute(
                    insert(DailyStockSnapshot),
                    valid_snapshots
                )

                await session.commit()
                print(f"✅ Successfully stored {len(valid_snapshots)} snapshots for {today}")

            except Exception as db_error:
                await session.rollback()
                print(f"❌ Database error: {db_error}")
                raise

        # Append today's sector ETF closes for the rotation heatmap.
        # Failure here should not abort the main snapshot job — it's a separate dataset.
        try:
            from app.services.sector_rotation import append_today_closes
            written = await append_today_closes()
            print(f"📊 Sector rotation: appended {written} ETF close rows")
        except Exception as sector_err:
            print(f"⚠️  Sector rotation append failed (non-fatal): {sector_err}")

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

    engine = make_async_engine(database_url)
    async_session_factory = async_sessionmaker(engine, expire_on_commit=False)

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
