"""
Technical Indicators API Endpoints
"""
from fastapi import APIRouter, HTTPException, Query
from typing import Optional
from datetime import datetime

from app.schemas.indicator import (
    RSIResponse,
    MACDResponse,
    MovingAveragesResponse,
    BollingerBandsResponse,
    TrendAnalysisResponse,
    CompleteAnalysisResponse
)
from app.services.market_data import market_data_service
from app.services.technical_indicators import technical_indicators

router = APIRouter()


async def get_price_history(ticker: str, days: int = 30):
    """Helper to fetch price history and extract closing prices"""
    try:
        historical = await market_data_service.get_historical_prices(ticker, days)
        if not historical:
            raise ValueError(f"No historical data for {ticker}")
        
        # Extract closing prices (most recent last)
        prices = [float(day["close"]) for day in historical]
        return prices, historical[-1]["close"]  # Return prices and current price
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"Could not fetch data for {ticker}: {str(e)}")


@router.get("/{ticker}/rsi", response_model=RSIResponse)
async def get_rsi(
    ticker: str,
    period: int = Query(default=14, ge=2, le=50, description="RSI period (default 14)")
):
    """
    Get RSI (Relative Strength Index) for a stock
    
    **RSI Interpretation:**
    - Above 70: Overbought (consider selling)
    - Below 30: Oversold (consider buying)
    - 30-70: Neutral zone
    """
    prices, current_price = await get_price_history(ticker, days=max(period + 20, 30))
    
    rsi = technical_indicators.calculate_rsi(prices, period)
    
    if rsi is None:
        raise HTTPException(status_code=400, detail="Insufficient data to calculate RSI")
    
    # Determine signal
    if rsi > 70:
        signal = "Overbought"
        interpretation = f"RSI is {rsi:.2f}, indicating overbought conditions. Consider taking profits."
    elif rsi < 30:
        signal = "Oversold"
        interpretation = f"RSI is {rsi:.2f}, indicating oversold conditions. Potential buying opportunity."
    else:
        signal = "Neutral"
        interpretation = f"RSI is {rsi:.2f}, within normal range. No strong signal."
    
    return RSIResponse(
        ticker=ticker.upper(),
        rsi=round(rsi, 2),
        signal=signal,
        interpretation=interpretation
    )


@router.get("/{ticker}/macd", response_model=MACDResponse)
async def get_macd(ticker: str):
    """
    Get MACD (Moving Average Convergence Divergence)
    
    **MACD Interpretation:**
    - MACD above signal line: Bullish momentum
    - MACD below signal line: Bearish momentum
    - Histogram increasing: Strengthening trend
    - Histogram decreasing: Weakening trend
    """
    prices, current_price = await get_price_history(ticker, days=60)
    
    macd_data = technical_indicators.calculate_macd(prices)
    
    if not macd_data:
        raise HTTPException(status_code=400, detail="Insufficient data to calculate MACD")
    
    # Interpretation
    if macd_data["trend"] == "bullish":
        interpretation = f"MACD is above signal line with positive histogram ({macd_data['histogram']:.2f}). Bullish momentum."
    else:
        interpretation = f"MACD is below signal line with negative histogram ({macd_data['histogram']:.2f}). Bearish momentum."
    
    return MACDResponse(
        ticker=ticker.upper(),
        macd=round(macd_data["macd"], 2),
        signal=round(macd_data["signal"], 2),
        histogram=round(macd_data["histogram"], 2),
        trend=macd_data["trend"],
        interpretation=interpretation
    )


@router.get("/{ticker}/moving-averages", response_model=MovingAveragesResponse)
async def get_moving_averages(ticker: str):
    """
    Get Moving Averages (SMA 20, 50, 200)
    
    **Moving Average Interpretation:**
    - Price above MA: Bullish
    - Price below MA: Bearish
    - Golden Cross: 50-day crosses above 200-day (very bullish!)
    - Death Cross: 50-day crosses below 200-day (very bearish!)
    """
    prices, current_price = await get_price_history(ticker, days=210)
    
    ma_data = technical_indicators.calculate_moving_averages(prices)
    
    # Check for golden/death cross
    golden_cross = False
    death_cross = False
    if ma_data["sma_50"] and ma_data["sma_200"]:
        if ma_data["sma_50"] > ma_data["sma_200"]:
            golden_cross = True
        else:
            death_cross = True
    
    return MovingAveragesResponse(
        ticker=ticker.upper(),
        current_price=round(current_price, 2),
        sma_20=round(ma_data["sma_20"], 2) if ma_data["sma_20"] else None,
        sma_50=round(ma_data["sma_50"], 2) if ma_data["sma_50"] else None,
        sma_200=round(ma_data["sma_200"], 2) if ma_data["sma_200"] else None,
        golden_cross=golden_cross,
        death_cross=death_cross
    )


@router.get("/{ticker}/bollinger-bands", response_model=BollingerBandsResponse)
async def get_bollinger_bands(
    ticker: str,
    period: int = Query(default=20, ge=10, le=50, description="Period (default 20)")
):
    """
    Get Bollinger Bands
    
    **Bollinger Bands Interpretation:**
    - Price at upper band: Potentially overbought
    - Price at lower band: Potentially oversold
    - Wide bands: High volatility
    - Narrow bands: Low volatility (potential breakout coming)
    """
    prices, current_price = await get_price_history(ticker, days=max(period + 20, 40))
    
    bb_data = technical_indicators.calculate_bollinger_bands(prices, period)
    
    if not bb_data:
        raise HTTPException(status_code=400, detail="Insufficient data to calculate Bollinger Bands")
    
    # Interpretation
    if bb_data["position"] == "above_upper":
        interpretation = "Price is above upper band. Potentially overbought, but could indicate strong momentum."
    elif bb_data["position"] == "below_lower":
        interpretation = "Price is below lower band. Potentially oversold, possible reversal ahead."
    else:
        interpretation = "Price is within normal bands. No extreme conditions."
    
    return BollingerBandsResponse(
        ticker=ticker.upper(),
        current_price=round(current_price, 2),
        upper_band=round(bb_data["upper"], 2),
        middle_band=round(bb_data["middle"], 2),
        lower_band=round(bb_data["lower"], 2),
        bandwidth=round(bb_data["bandwidth"], 2),
        position=bb_data["position"],
        interpretation=interpretation
    )


@router.get("/{ticker}/trend", response_model=TrendAnalysisResponse)
async def get_trend_analysis(ticker: str):
    """
    Get complete trend analysis
    
    **Trend Types:**
    - Strong Uptrend: Price > SMA20 > SMA50 > SMA200
    - Uptrend: Price > SMA20 > SMA50
    - Sideways: Mixed signals
    - Downtrend: Price < SMA20 < SMA50
    - Strong Downtrend: Price < SMA20 < SMA50 < SMA200
    """
    prices, current_price = await get_price_history(ticker, days=210)
    
    ma_data = technical_indicators.calculate_moving_averages(prices)
    trend_data = technical_indicators.analyze_trend(prices, ma_data)
    
    # Calculate support/resistance
    support = ma_data["sma_20"] if ma_data["sma_20"] and ma_data["sma_20"] < current_price else None
    resistance = ma_data["sma_20"] if ma_data["sma_20"] and ma_data["sma_20"] > current_price else None
    
    return TrendAnalysisResponse(
        ticker=ticker.upper(),
        current_price=round(current_price, 2),
        trend=trend_data["trend"],
        strength=trend_data["strength"],
        above_sma_20=trend_data.get("above_sma_20"),
        above_sma_50=trend_data.get("above_sma_50"),
        above_sma_200=trend_data.get("above_sma_200"),
        support_level=round(support, 2) if support else None,
        resistance_level=round(resistance, 2) if resistance else None
    )


@router.get("/{ticker}/analysis", response_model=CompleteAnalysisResponse)
async def get_complete_analysis(ticker: str):
    """
    Get COMPLETE technical analysis with all indicators
    
    **Returns:**
    - All technical indicators
    - Trading signals
    - Overall sentiment
    - Buy/Sell/Hold recommendation
    
    **This is your most powerful endpoint!**
    """
    # Fetch data
    prices, current_price = await get_price_history(ticker, days=210)
    company = await market_data_service.get_company_info(ticker)
    
    # Calculate all indicators
    rsi_value = technical_indicators.calculate_rsi(prices)
    macd_data = technical_indicators.calculate_macd(prices)
    ma_data = technical_indicators.calculate_moving_averages(prices)
    bb_data = technical_indicators.calculate_bollinger_bands(prices)
    trend_data = technical_indicators.analyze_trend(prices, ma_data)
    
    # Build individual responses
    rsi_response = None
    if rsi_value:
        signal = "Overbought" if rsi_value > 70 else "Oversold" if rsi_value < 30 else "Neutral"
        rsi_response = RSIResponse(
            ticker=ticker.upper(),
            rsi=round(rsi_value, 2),
            signal=signal,
            interpretation=f"RSI: {rsi_value:.2f}"
        )
    
    macd_response = None
    if macd_data:
        macd_response = MACDResponse(
            ticker=ticker.upper(),
            macd=round(macd_data["macd"], 2),
            signal=round(macd_data["signal"], 2),
            histogram=round(macd_data["histogram"], 2),
            trend=macd_data["trend"],
            interpretation=f"MACD {macd_data['trend']}"
        )
    
    ma_response = MovingAveragesResponse(
        ticker=ticker.upper(),
        current_price=round(current_price, 2),
        sma_20=round(ma_data["sma_20"], 2) if ma_data["sma_20"] else None,
        sma_50=round(ma_data["sma_50"], 2) if ma_data["sma_50"] else None,
        sma_200=round(ma_data["sma_200"], 2) if ma_data["sma_200"] else None,
        golden_cross=ma_data["sma_50"] > ma_data["sma_200"] if ma_data["sma_50"] and ma_data["sma_200"] else False,
        death_cross=ma_data["sma_50"] < ma_data["sma_200"] if ma_data["sma_50"] and ma_data["sma_200"] else False
    )
    
    bb_response = None
    if bb_data:
        bb_response = BollingerBandsResponse(
            ticker=ticker.upper(),
            current_price=round(current_price, 2),
            upper_band=round(bb_data["upper"], 2),
            middle_band=round(bb_data["middle"], 2),
            lower_band=round(bb_data["lower"], 2),
            bandwidth=round(bb_data["bandwidth"], 2),
            position=bb_data["position"],
            interpretation=f"Price {bb_data['position']}"
        )
    
    trend_response = TrendAnalysisResponse(
        ticker=ticker.upper(),
        current_price=round(current_price, 2),
        trend=trend_data["trend"],
        strength=trend_data["strength"],
        above_sma_20=trend_data.get("above_sma_20"),
        above_sma_50=trend_data.get("above_sma_50"),
        above_sma_200=trend_data.get("above_sma_200")
    )
    
    # Generate trading signals
    signals = technical_indicators.get_trading_signals(rsi_value, macd_data, bb_data)
    
    # Determine overall sentiment
    bullish_count = 0
    bearish_count = 0
    
    if rsi_value and rsi_value < 40:
        bullish_count += 1
    elif rsi_value and rsi_value > 60:
        bearish_count += 1
    
    if macd_data and macd_data["trend"] == "bullish":
        bullish_count += 1
    elif macd_data and macd_data["trend"] == "bearish":
        bearish_count += 1
    
    if trend_data["trend"] in ["uptrend", "strong_uptrend"]:
        bullish_count += 1
    elif trend_data["trend"] in ["downtrend", "strong_downtrend"]:
        bearish_count += 1
    
    # Overall sentiment
    if bullish_count > bearish_count:
        sentiment = "Bullish"
        recommendation = "Consider buying - Multiple bullish signals detected"
    elif bearish_count > bullish_count:
        sentiment = "Bearish"
        recommendation = "Consider selling or avoiding - Multiple bearish signals detected"
    else:
        sentiment = "Neutral"
        recommendation = "Hold or wait for clearer signals"
    
    return CompleteAnalysisResponse(
        ticker=ticker.upper(),
        company_name=company.get("name", ticker.upper()),
        current_price=round(current_price, 2),
        last_updated=datetime.now().isoformat(),
        rsi=rsi_response,
        macd=macd_response,
        moving_averages=ma_response,
        bollinger_bands=bb_response,
        trend_analysis=trend_response,
        signals=signals,
        overall_sentiment=sentiment,
        recommendation=recommendation
    )