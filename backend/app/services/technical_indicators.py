"""
Technical Indicators Service - Calculate trading indicators
"""
import pandas as pd
import numpy as np
from typing import Dict, List, Any, Optional
from datetime import datetime


class TechnicalIndicators:
    """Calculate technical indicators for stocks"""
    
    @staticmethod
    def calculate_rsi(prices: List[float], period: int = 14) -> Optional[float]:
        """
        Calculate Relative Strength Index (RSI)
        
        RSI = 100 - (100 / (1 + RS))
        RS = Average Gain / Average Loss
        
        Returns:
            float: RSI value between 0-100
        """
        if len(prices) < period + 1:
            return None
        
        # Convert to pandas series
        prices_series = pd.Series(prices)
        
        # Calculate price changes
        delta = prices_series.diff()
        
        # Separate gains and losses
        gains = delta.where(delta > 0, 0)
        losses = -delta.where(delta < 0, 0)
        
        # Calculate average gains and losses
        avg_gain = gains.rolling(window=period).mean()
        avg_loss = losses.rolling(window=period).mean()
        
        # Calculate RS and RSI
        rs = avg_gain / avg_loss
        rsi = 100 - (100 / (1 + rs))
        
        # Return the latest RSI value
        return float(rsi.iloc[-1]) if not pd.isna(rsi.iloc[-1]) else None
    
    @staticmethod
    def calculate_macd(
        prices: List[float], 
        fast_period: int = 12, 
        slow_period: int = 26, 
        signal_period: int = 9
    ) -> Optional[Dict[str, float]]:
        """
        Calculate MACD (Moving Average Convergence Divergence)
        
        MACD = EMA(12) - EMA(26)
        Signal = EMA(9) of MACD
        Histogram = MACD - Signal
        
        Returns:
            Dict with macd, signal, histogram values
        """
        if len(prices) < slow_period + signal_period:
            return None
        
        prices_series = pd.Series(prices)
        
        # Calculate EMAs
        ema_fast = prices_series.ewm(span=fast_period, adjust=False).mean()
        ema_slow = prices_series.ewm(span=slow_period, adjust=False).mean()
        
        # Calculate MACD line
        macd_line = ema_fast - ema_slow
        
        # Calculate signal line
        signal_line = macd_line.ewm(span=signal_period, adjust=False).mean()
        
        # Calculate histogram
        histogram = macd_line - signal_line
        
        return {
            "macd": float(macd_line.iloc[-1]),
            "signal": float(signal_line.iloc[-1]),
            "histogram": float(histogram.iloc[-1]),
            "trend": "bullish" if histogram.iloc[-1] > 0 else "bearish"
        }
    
    @staticmethod
    def calculate_moving_averages(
        prices: List[float]
    ) -> Dict[str, Optional[float]]:
        """
        Calculate Simple Moving Averages (SMA)
        
        Returns:
            Dict with SMA values for different periods
        """
        prices_series = pd.Series(prices)
        
        return {
            "sma_20": float(prices_series.rolling(window=20).mean().iloc[-1]) if len(prices) >= 20 else None,
            "sma_50": float(prices_series.rolling(window=50).mean().iloc[-1]) if len(prices) >= 50 else None,
            "sma_200": float(prices_series.rolling(window=200).mean().iloc[-1]) if len(prices) >= 200 else None,
        }
    
    @staticmethod
    def calculate_bollinger_bands(
        prices: List[float], 
        period: int = 20, 
        std_dev: int = 2
    ) -> Optional[Dict[str, float]]:
        """
        Calculate Bollinger Bands
        
        Middle Band = SMA(20)
        Upper Band = SMA(20) + (2 × standard deviation)
        Lower Band = SMA(20) - (2 × standard deviation)
        
        Returns:
            Dict with upper, middle, lower band values
        """
        if len(prices) < period:
            return None
        
        prices_series = pd.Series(prices)
        
        # Calculate middle band (SMA)
        middle_band = prices_series.rolling(window=period).mean()
        
        # Calculate standard deviation
        std = prices_series.rolling(window=period).std()
        
        # Calculate upper and lower bands
        upper_band = middle_band + (std_dev * std)
        lower_band = middle_band - (std_dev * std)
        
        current_price = prices[-1]
        
        return {
            "upper": float(upper_band.iloc[-1]),
            "middle": float(middle_band.iloc[-1]),
            "lower": float(lower_band.iloc[-1]),
            "bandwidth": float(upper_band.iloc[-1] - lower_band.iloc[-1]),
            "position": "above_upper" if current_price > upper_band.iloc[-1] 
                       else "below_lower" if current_price < lower_band.iloc[-1]
                       else "within_bands"
        }
    
    @staticmethod
    def analyze_trend(
        prices: List[float], 
        ma_data: Dict[str, Optional[float]]
    ) -> Dict[str, Any]:
        """
        Analyze overall trend using moving averages
        
        Returns:
            Dict with trend analysis
        """
        current_price = prices[-1]
        
        # Determine trend based on MAs
        trend = "unknown"
        strength = "neutral"
        
        if ma_data["sma_20"] and ma_data["sma_50"]:
            if current_price > ma_data["sma_20"] > ma_data["sma_50"]:
                trend = "strong_uptrend"
                strength = "strong"
            elif current_price > ma_data["sma_20"]:
                trend = "uptrend"
                strength = "moderate"
            elif current_price < ma_data["sma_20"] < ma_data["sma_50"]:
                trend = "strong_downtrend"
                strength = "strong"
            elif current_price < ma_data["sma_20"]:
                trend = "downtrend"
                strength = "moderate"
            else:
                trend = "sideways"
                strength = "weak"
        
        # Check for golden/death cross
        crosses = []
        if ma_data["sma_50"] and ma_data["sma_200"]:
            if ma_data["sma_50"] > ma_data["sma_200"]:
                crosses.append("golden_cross_territory")
            elif ma_data["sma_50"] < ma_data["sma_200"]:
                crosses.append("death_cross_territory")
        
        return {
            "trend": trend,
            "strength": strength,
            "crosses": crosses,
            "current_price": current_price,
            "above_sma_20": current_price > ma_data["sma_20"] if ma_data["sma_20"] else None,
            "above_sma_50": current_price > ma_data["sma_50"] if ma_data["sma_50"] else None,
            "above_sma_200": current_price > ma_data["sma_200"] if ma_data["sma_200"] else None,
        }
    
    @staticmethod
    def get_trading_signals(
        rsi: Optional[float],
        macd_data: Optional[Dict[str, float]],
        bollinger_data: Optional[Dict[str, float]]
    ) -> List[str]:
        """
        Generate trading signals based on indicators
        
        Returns:
            List of signal strings
        """
        signals = []
        
        # RSI signals
        if rsi:
            if rsi > 70:
                signals.append("🔴 RSI Overbought (>70) - Consider selling")
            elif rsi < 30:
                signals.append("🟢 RSI Oversold (<30) - Consider buying")
            elif 40 <= rsi <= 60:
                signals.append("🟡 RSI Neutral - No strong signal")
        
        # MACD signals
        if macd_data:
            if macd_data["trend"] == "bullish" and macd_data["histogram"] > 0:
                signals.append("🟢 MACD Bullish - Upward momentum")
            elif macd_data["trend"] == "bearish" and macd_data["histogram"] < 0:
                signals.append("🔴 MACD Bearish - Downward momentum")
        
        # Bollinger Bands signals
        if bollinger_data:
            if bollinger_data["position"] == "above_upper":
                signals.append("🔴 Price above upper Bollinger Band - Potentially overbought")
            elif bollinger_data["position"] == "below_lower":
                signals.append("🟢 Price below lower Bollinger Band - Potentially oversold")
        
        return signals if signals else ["🟡 No strong signals - Hold or wait"]


# Global instance
technical_indicators = TechnicalIndicators()