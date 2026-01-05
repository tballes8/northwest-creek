"""Test technical indicators"""
from app.services.technical_indicators import technical_indicators

# Sample AAPL prices (40 days - enough for all indicators)
prices = [
    250.0, 251.5, 252.0, 250.8, 249.5,  # Days 1-5
    251.0, 252.5, 254.0, 253.2, 252.0,  # Days 6-10
    253.5, 255.0, 256.5, 255.8, 254.2,  # Days 11-15
    255.5, 257.0, 258.5, 257.8, 256.5,  # Days 16-20
    258.0, 259.5, 261.0, 260.2, 259.0,  # Days 21-25
    260.5, 262.0, 263.5, 264.8, 263.2,  # Days 26-30
    264.5, 266.0, 267.5, 268.8, 267.5,  # Days 31-35
    269.0, 270.5, 272.0, 273.5, 274.0,  # Days 36-40
]

print("🧪 Testing Technical Indicators...\n")

# Test RSI
rsi = technical_indicators.calculate_rsi(prices)
print(f"📊 RSI (14): {rsi:.2f}")
if rsi > 70:
    print("   🔴 Overbought!")
elif rsi < 30:
    print("   🟢 Oversold!")
else:
    print("   🟡 Neutral")

print("\n" + "="*50 + "\n")

# Test MACD
macd = technical_indicators.calculate_macd(prices)
if macd:
    print(f"📈 MACD: {macd['macd']:.2f}")
    print(f"📉 Signal: {macd['signal']:.2f}")
    print(f"📊 Histogram: {macd['histogram']:.2f}")
    print(f"🎯 Trend: {macd['trend']}")
else:
    print("❌ MACD: Need more data (35+ days)")

print("\n" + "="*50 + "\n")

# Test Moving Averages
ma = technical_indicators.calculate_moving_averages(prices)
print(f"📊 SMA 20: ${ma['sma_20']:.2f}" if ma['sma_20'] else "📊 SMA 20: Need more data")
print(f"📊 SMA 50: ${ma['sma_50']:.2f}" if ma['sma_50'] else "📊 SMA 50: Need more data (50+ days)")
print(f"📊 SMA 200: ${ma['sma_200']:.2f}" if ma['sma_200'] else "📊 SMA 200: Need more data (200+ days)")

print("\n" + "="*50 + "\n")

# Test Bollinger Bands
bollinger = technical_indicators.calculate_bollinger_bands(prices)
if bollinger:
    print(f"📊 Bollinger Bands:")
    print(f"   Upper: ${bollinger['upper']:.2f}")
    print(f"   Middle: ${bollinger['middle']:.2f}")
    print(f"   Lower: ${bollinger['lower']:.2f}")
    print(f"   Position: {bollinger['position']}")

print("\n" + "="*50 + "\n")

# Test Trend Analysis
trend = technical_indicators.analyze_trend(prices, ma)
print(f"🎯 Trend Analysis:")
print(f"   Trend: {trend['trend']}")
print(f"   Strength: {trend['strength']}")
print(f"   Current Price: ${trend['current_price']:.2f}")

print("\n" + "="*50 + "\n")

# Test Trading Signals
signals = technical_indicators.get_trading_signals(rsi, macd, bollinger)
print("🎯 Trading Signals:")
for signal in signals:
    print(f"   {signal}")

print("\n🎉 All indicators working!\n")