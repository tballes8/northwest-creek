"""Quick test of market data service"""
import asyncio
from app.services.market_data import market_data_service


async def test_market_data():
    print("\n🧪 Testing Market Data Service...\n")
    
    # Test 1: Get AAPL quote
    print("1️⃣ Testing AAPL quote...")
    try:
        quote = await market_data_service.get_quote("AAPL")
        print(f"✅ Price: ${quote['price']:.2f}")
        print(f"✅ Change: {quote['change_percent']:.2f}%")
        print(f"✅ Volume: {quote['volume']:,}")
    except Exception as e:
        print(f"❌ Error: {e}")
    
    print("\n" + "="*50 + "\n")
    
    # Test 2: Get company info
    print("2️⃣ Testing AAPL company info...")
    try:
        company = await market_data_service.get_company_info("AAPL")
        print(f"✅ Name: {company['name']}")
        print(f"✅ Sector: {company['sector']}")
        print(f"✅ CEO: {company['ceo']}")
    except Exception as e:
        print(f"❌ Error: {e}")
    
    print("\n" + "="*50 + "\n")
    
    # Test 3: Get historical data
    print("3️⃣ Testing AAPL historical data (last 7 days)...")
    try:
        historical = await market_data_service.get_historical_prices("AAPL", days=7)
        print(f"✅ Got {len(historical)} days of data")
        if historical:
            latest = historical[0]
            print(f"✅ Latest close: ${latest['close']:.2f}")
    except Exception as e:
        print(f"❌ Error: {e}")
    
    print("\n🎉 Market Data Service tests complete!\n")


if __name__ == "__main__":
    asyncio.run(test_market_data())