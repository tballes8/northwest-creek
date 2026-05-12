"""
Script to populate sector, industry, and description fields for existing stocks
This fetches company profiles from FMP and updates the stock_snapshots table
"""
import asyncio
import sys
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.db.session import async_session
from app.db.models import StockSnapshot
from app.services.market_data import market_data_service
from app.services.fmp_client import get_fmp_client, init_fmp_client, close_fmp_client
from app.config import get_settings
from sqlalchemy import select
import logging
from typing import List, Dict, Any

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

settings = get_settings()


async def fetch_company_profile(ticker: str) -> Dict[str, Any]:
    """Fetch company profile from FMP API"""
    try:
        # Use the existing get_company_info method
        company_info = await market_data_service.get_company_info(ticker)

        return {
            'ticker': ticker,
            'sector': company_info.get('sector'),
            'industry': company_info.get('industry'),
            'description': company_info.get('description'),
        }
    except Exception as e:
        logger.warning(f"Failed to fetch profile for {ticker}: {e}")
        return {
            'ticker': ticker,
            'sector': None,
            'industry': None,
            'description': None,
        }


async def batch_fetch_profiles(tickers: List[str], batch_size: int = 10) -> List[Dict[str, Any]]:
    """Fetch multiple company profiles with rate limiting"""
    profiles = []

    for i in range(0, len(tickers), batch_size):
        batch = tickers[i:i+batch_size]
        logger.info(f"Fetching profiles for batch {i//batch_size + 1} ({len(batch)} stocks)")

        # Fetch profiles concurrently for this batch
        batch_profiles = await asyncio.gather(*[
            fetch_company_profile(ticker) for ticker in batch
        ])

        profiles.extend(batch_profiles)

        # Add a small delay between batches to avoid rate limiting
        if i + batch_size < len(tickers):
            await asyncio.sleep(1)

    return profiles


async def update_stock_profiles():
    """Main function to update all stock profiles"""
    async with async_session() as db:
        try:
            # Get all stocks from the database
            result = await db.execute(
                select(StockSnapshot).order_by(StockSnapshot.symbol)
            )
            stocks = result.scalars().all()

            logger.info(f"Found {len(stocks)} stocks to update")

            # Extract tickers
            tickers = [stock.symbol for stock in stocks]

            # Fetch profiles in batches
            profiles = await batch_fetch_profiles(tickers)

            # Create a dictionary for quick lookup
            profile_dict = {p['ticker']: p for p in profiles}

            # Update stocks with profile information
            updated_count = 0
            for stock in stocks:
                profile = profile_dict.get(stock.symbol, {})

                if profile.get('sector') or profile.get('industry') or profile.get('description'):
                    stock.sector = profile.get('sector')
                    stock.industry = profile.get('industry')
                    stock.description = profile.get('description')
                    updated_count += 1

            # Commit all changes
            await db.commit()
            logger.info(f"Successfully updated {updated_count} stocks with profile information")

        except Exception as e:
            logger.error(f"Error updating stock profiles: {e}")
            await db.rollback()
            raise


async def verify_update():
    """Verify that profiles were updated correctly"""
    async with async_session() as db:
        # Check how many stocks have sector information
        result = await db.execute(
            select(StockSnapshot).where(StockSnapshot.sector.isnot(None))
        )
        stocks_with_sector = result.scalars().all()

        # Check how many have industry
        result = await db.execute(
            select(StockSnapshot).where(StockSnapshot.industry.isnot(None))
        )
        stocks_with_industry = result.scalars().all()

        # Check how many have descriptions
        result = await db.execute(
            select(StockSnapshot).where(StockSnapshot.description.isnot(None))
        )
        stocks_with_description = result.scalars().all()

        logger.info(f"Verification Results:")
        logger.info(f"  - Stocks with sector: {len(stocks_with_sector)}")
        logger.info(f"  - Stocks with industry: {len(stocks_with_industry)}")
        logger.info(f"  - Stocks with description: {len(stocks_with_description)}")

        # Show some examples
        if stocks_with_sector:
            sample = stocks_with_sector[0]
            logger.info(f"\nSample stock with profile:")
            logger.info(f"  Symbol: {sample.symbol}")
            logger.info(f"  Name: {sample.name}")
            logger.info(f"  Sector: {sample.sector}")
            logger.info(f"  Industry: {sample.industry}")
            if sample.description:
                logger.info(f"  Description: {sample.description[:100]}...")


async def main():
    """Main entry point"""
    logger.info("Starting company profile population script")

    await init_fmp_client()
    try:
        await update_stock_profiles()
        await verify_update()
    finally:
        await close_fmp_client()

    logger.info("Script completed successfully")


if __name__ == "__main__":
    asyncio.run(main())