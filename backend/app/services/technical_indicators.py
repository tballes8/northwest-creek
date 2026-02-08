"""
Technical Indicators Service - Calculate trading indicators
Enhanced with Volume, Momentum, Volatility, and Trend indicators
"""
import pandas as pd
import numpy as np
from typing import Dict, List, Any, Optional
from datetime import datetime


class TechnicalIndicators:
    """Calculate technical indicators for stocks"""
    
    # ═══════════════════════════════════════════════════════════════════════
    # EXISTING INDICATORS (unchanged)
    # ═══════════════════════════════════════════════════════════════════════
    
    @staticmethod
    def calculate_rsi(prices: List[float], period: int = 14) -> Optional[float]:
        if len(prices) < period + 1:
            return None
        prices_series = pd.Series(prices)
        delta = prices_series.diff()
        gains = delta.where(delta > 0, 0)
        losses = -delta.where(delta < 0, 0)
        avg_gain = gains.rolling(window=period).mean()
        avg_loss = losses.rolling(window=period).mean()
        rs = avg_gain / avg_loss
        rsi = 100 - (100 / (1 + rs))
        return float(rsi.iloc[-1]) if not pd.isna(rsi.iloc[-1]) else None
    
    @staticmethod
    def calculate_macd(prices, fast_period=12, slow_period=26, signal_period=9):
        if len(prices) < slow_period + signal_period:
            return None
        prices_series = pd.Series(prices)
        ema_fast = prices_series.ewm(span=fast_period, adjust=False).mean()
        ema_slow = prices_series.ewm(span=slow_period, adjust=False).mean()
        macd_line = ema_fast - ema_slow
        signal_line = macd_line.ewm(span=signal_period, adjust=False).mean()
        histogram = macd_line - signal_line
        return {
            "macd": float(macd_line.iloc[-1]),
            "signal": float(signal_line.iloc[-1]),
            "histogram": float(histogram.iloc[-1]),
            "trend": "bullish" if histogram.iloc[-1] > 0 else "bearish"
        }
    
    @staticmethod
    def calculate_moving_averages(prices):
        prices_series = pd.Series(prices)
        return {
            "sma_20": float(prices_series.rolling(20).mean().iloc[-1]) if len(prices) >= 20 else None,
            "sma_50": float(prices_series.rolling(50).mean().iloc[-1]) if len(prices) >= 50 else None,
            "sma_200": float(prices_series.rolling(200).mean().iloc[-1]) if len(prices) >= 200 else None,
        }
    
    @staticmethod
    def calculate_bollinger_bands(prices, period=20, std_dev=2):
        if len(prices) < period:
            return None
        prices_series = pd.Series(prices)
        middle = prices_series.rolling(period).mean()
        std = prices_series.rolling(period).std()
        upper = middle + std_dev * std
        lower = middle - std_dev * std
        cp = prices[-1]
        return {
            "upper": float(upper.iloc[-1]), "middle": float(middle.iloc[-1]),
            "lower": float(lower.iloc[-1]),
            "bandwidth": float(upper.iloc[-1] - lower.iloc[-1]),
            "position": "above_upper" if cp > upper.iloc[-1] else "below_lower" if cp < lower.iloc[-1] else "within_bands"
        }
    
    @staticmethod
    def analyze_trend(prices, ma_data):
        cp = prices[-1]
        trend, strength = "unknown", "neutral"
        if ma_data["sma_20"] and ma_data["sma_50"]:
            if cp > ma_data["sma_20"] > ma_data["sma_50"]:
                trend, strength = "strong_uptrend", "strong"
            elif cp > ma_data["sma_20"]:
                trend, strength = "uptrend", "moderate"
            elif cp < ma_data["sma_20"] < ma_data["sma_50"]:
                trend, strength = "strong_downtrend", "strong"
            elif cp < ma_data["sma_20"]:
                trend, strength = "downtrend", "moderate"
            else:
                trend, strength = "sideways", "weak"
        crosses = []
        if ma_data["sma_50"] and ma_data["sma_200"]:
            crosses.append("golden_cross_territory" if ma_data["sma_50"] > ma_data["sma_200"] else "death_cross_territory")
        return {
            "trend": trend, "strength": strength, "crosses": crosses,
            "current_price": cp,
            "above_sma_20": cp > ma_data["sma_20"] if ma_data["sma_20"] else None,
            "above_sma_50": cp > ma_data["sma_50"] if ma_data["sma_50"] else None,
            "above_sma_200": cp > ma_data["sma_200"] if ma_data["sma_200"] else None,
        }
    
    @staticmethod
    def get_trading_signals(rsi, macd_data, bollinger_data):
        signals = []
        if rsi:
            if rsi > 70: signals.append("🔴 RSI Overbought (>70) - Consider selling")
            elif rsi < 30: signals.append("🟢 RSI Oversold (<30) - Consider buying")
            elif 40 <= rsi <= 60: signals.append("🟡 RSI Neutral - No strong signal")
        if macd_data:
            if macd_data["trend"] == "bullish" and macd_data["histogram"] > 0:
                signals.append("🟢 MACD Bullish - Upward momentum")
            elif macd_data["trend"] == "bearish" and macd_data["histogram"] < 0:
                signals.append("🔴 MACD Bearish - Downward momentum")
        if bollinger_data:
            if bollinger_data["position"] == "above_upper":
                signals.append("🔴 Price above upper Bollinger Band - Potentially overbought")
            elif bollinger_data["position"] == "below_lower":
                signals.append("🟢 Price below lower Bollinger Band - Potentially oversold")
        return signals if signals else ["🟡 No strong signals - Hold or wait"]

    # ═══════════════════════════════════════════════════════════════════════
    # A. VOLUME INDICATORS
    # ═══════════════════════════════════════════════════════════════════════

    @staticmethod
    def calculate_vwap(highs, lows, closes, volumes):
        """Volume Weighted Average Price — institutional benchmark."""
        if len(closes) < 2: return None
        tp = [(h + l + c) / 3 for h, l, c in zip(highs, lows, closes)]
        cum_tp_vol = list(np.cumsum([t * v for t, v in zip(tp, volumes)]))
        cum_vol = list(np.cumsum(volumes))
        history = [cum_tp_vol[i] / cum_vol[i] if cum_vol[i] > 0 else tp[i] for i in range(len(closes))]
        cp = closes[-1]
        return {
            "value": round(history[-1], 4),
            "signal": "bullish" if cp > history[-1] else "bearish",
            "description": f"VWAP ${history[-1]:.2f} — Price {'above' if cp > history[-1] else 'below'}",
            "history": history
        }

    @staticmethod
    def calculate_obv(closes, volumes):
        """On-Balance Volume — volume flow indicator."""
        if len(closes) < 2: return None
        obv = [0.0]
        for i in range(1, len(closes)):
            if closes[i] > closes[i-1]: obv.append(obv[-1] + volumes[i])
            elif closes[i] < closes[i-1]: obv.append(obv[-1] - volumes[i])
            else: obv.append(obv[-1])
        obv_s = pd.Series(obv)
        obv_sma = obv_s.rolling(20).mean()
        trend = "neutral"
        if len(obv) >= 20:
            trend = "bullish" if obv[-1] > float(obv_sma.iloc[-1]) else "bearish"
        return {
            "value": round(obv[-1], 0), "signal": trend,
            "description": f"OBV {'rising — accumulation' if trend == 'bullish' else 'falling — distribution' if trend == 'bearish' else 'flat'}",
            "history": obv
        }

    @staticmethod
    def calculate_ad_line(highs, lows, closes, volumes):
        """Accumulation/Distribution Line — buying/selling pressure."""
        if len(closes) < 2: return None
        ad = []
        for i in range(len(closes)):
            hl = highs[i] - lows[i]
            clv = ((closes[i] - lows[i]) - (highs[i] - closes[i])) / hl if hl > 0 else 0
            ad.append((ad[-1] if ad else 0) + clv * volumes[i])
        ad_s = pd.Series(ad)
        ad_sma = ad_s.rolling(20).mean()
        trend = "neutral"
        if len(ad) >= 20:
            trend = "bullish" if ad[-1] > float(ad_sma.iloc[-1]) else "bearish"
        return {
            "value": round(ad[-1], 0), "signal": trend,
            "description": f"A/D {'rising — buying pressure' if trend == 'bullish' else 'falling — selling pressure' if trend == 'bearish' else 'flat'}",
            "history": ad
        }

    # ═══════════════════════════════════════════════════════════════════════
    # B. MOMENTUM INDICATORS
    # ═══════════════════════════════════════════════════════════════════════

    @staticmethod
    def calculate_stochastic(highs, lows, closes, k_period=14, d_period=3):
        """Stochastic Oscillator — overbought/oversold. >80 overbought, <20 oversold."""
        if len(closes) < k_period: return None
        k_values = []
        for i in range(len(closes)):
            if i < k_period - 1:
                k_values.append(None)
            else:
                wh = max(highs[i-k_period+1:i+1])
                wl = min(lows[i-k_period+1:i+1])
                r = wh - wl
                k_values.append(((closes[i] - wl) / r * 100) if r > 0 else 50)
        k_s = pd.Series(k_values)
        d_s = k_s.rolling(d_period).mean()
        d_values = [None if pd.isna(v) else v for v in d_s.tolist()]
        k = k_values[-1]
        d = d_values[-1]
        sig = "overbought" if k and k > 80 else "oversold" if k and k < 20 else "neutral"
        return {
            "k": round(k, 2) if k else None, "d": round(d, 2) if d else None,
            "signal": sig,
            "description": f"Stoch %K={k:.1f}" + (f", %D={d:.1f}" if d else "") + f" — {sig}" if k else "N/A",
            "k_history": k_values, "d_history": d_values
        }

    @staticmethod
    def calculate_adx(highs, lows, closes, period=14):
        """ADX — trend strength. >25 trending, <20 ranging. +DI/-DI for direction."""
        n = len(closes)
        if n < period * 2 + 1: return None
        plus_dm, minus_dm, tr_list = [], [], []
        for i in range(1, n):
            up = highs[i] - highs[i-1]
            down = lows[i-1] - lows[i]
            plus_dm.append(up if up > down and up > 0 else 0)
            minus_dm.append(down if down > up and down > 0 else 0)
            tr_list.append(max(highs[i]-lows[i], abs(highs[i]-closes[i-1]), abs(lows[i]-closes[i-1])))
        def wilder(data, p):
            s = [sum(data[:p])]
            for i in range(p, len(data)):
                s.append(s[-1] - s[-1]/p + data[i])
            return s
        atr_s = wilder(tr_list, period)
        pdm_s = wilder(plus_dm, period)
        mdm_s = wilder(minus_dm, period)
        pdi, mdi, dx = [], [], []
        for i in range(len(atr_s)):
            p = pdm_s[i]/atr_s[i]*100 if atr_s[i] > 0 else 0
            m = mdm_s[i]/atr_s[i]*100 if atr_s[i] > 0 else 0
            pdi.append(p); mdi.append(m)
            s = p + m
            dx.append(abs(p-m)/s*100 if s > 0 else 0)
        if len(dx) < period: return None
        adx_vals = wilder(dx, period)
        pad = n - len(adx_vals)
        pad_di = n - len(pdi)
        adx_h = [None]*pad + [round(v, 2) for v in adx_vals]
        pdi_h = [None]*pad_di + [round(v, 2) for v in pdi]
        mdi_h = [None]*pad_di + [round(v, 2) for v in mdi]
        a = adx_vals[-1]
        strength = "very_strong" if a > 50 else "trending" if a > 25 else "ranging"
        direction = "bullish" if pdi[-1] > mdi[-1] else "bearish"
        return {
            "adx": round(a, 2), "plus_di": round(pdi[-1], 2), "minus_di": round(mdi[-1], 2),
            "strength": strength, "direction": direction,
            "description": f"ADX {a:.1f} — {'Strong trend' if a > 25 else 'Ranging'}, {direction}",
            "adx_history": adx_h, "plus_di_history": pdi_h, "minus_di_history": mdi_h
        }

    @staticmethod
    def calculate_cci(highs, lows, closes, period=20):
        """CCI — overbought > +100, oversold < -100."""
        if len(closes) < period: return None
        tp = [(h+l+c)/3 for h, l, c in zip(highs, lows, closes)]
        vals = []
        for i in range(len(tp)):
            if i < period - 1:
                vals.append(None)
            else:
                w = tp[i-period+1:i+1]
                m = sum(w)/period
                md = sum(abs(v-m) for v in w)/period
                vals.append((tp[i]-m)/(0.015*md) if md > 0 else 0)
        c = vals[-1]
        sig = "overbought" if c and c > 100 else "oversold" if c and c < -100 else "neutral"
        return {
            "value": round(c, 2) if c else None, "signal": sig,
            "description": f"CCI {c:.1f} — {sig}" if c else "N/A",
            "history": vals
        }

    @staticmethod
    def calculate_roc(closes, period=12):
        """Rate of Change — price momentum as percentage."""
        if len(closes) < period + 1: return None
        vals = []
        for i in range(len(closes)):
            if i < period: vals.append(None)
            else:
                prev = closes[i-period]
                vals.append(((closes[i]-prev)/prev*100) if prev > 0 else 0)
        c = vals[-1]
        sig = "bullish" if c and c > 0 else "bearish" if c and c < 0 else "neutral"
        return {
            "value": round(c, 2) if c else None, "signal": sig,
            "description": f"ROC {c:+.2f}% — {'Positive' if c and c > 0 else 'Negative'} momentum" if c else "N/A",
            "history": vals
        }

    # ═══════════════════════════════════════════════════════════════════════
    # C. VOLATILITY INDICATORS
    # ═══════════════════════════════════════════════════════════════════════

    @staticmethod
    def calculate_atr(highs, lows, closes, period=14):
        """ATR — volatility measurement."""
        if len(closes) < period + 1: return None
        tr = [highs[0]-lows[0]]
        for i in range(1, len(closes)):
            tr.append(max(highs[i]-lows[i], abs(highs[i]-closes[i-1]), abs(lows[i]-closes[i-1])))
        atr_s = pd.Series(tr).rolling(period).mean()
        vals = atr_s.tolist()
        a = vals[-1]
        pct = (a/closes[-1]*100) if closes[-1] > 0 and not pd.isna(a) else 0
        vol = "very_high" if pct > 5 else "high" if pct > 3 else "moderate" if pct > 1.5 else "low"
        return {
            "value": round(a, 4) if not pd.isna(a) else None,
            "percent": round(pct, 2), "volatility": vol,
            "description": f"ATR ${a:.2f} ({pct:.1f}%) — {vol.replace('_',' ')} volatility" if not pd.isna(a) else "N/A",
            "history": [None if pd.isna(v) else round(v, 4) for v in vals]
        }

    @staticmethod
    def calculate_keltner_channels(highs, lows, closes, ema_period=20, atr_period=10, multiplier=2.0):
        """Keltner Channels — EMA ± ATR multiplier."""
        if len(closes) < max(ema_period, atr_period) + 1: return None
        ema = pd.Series(closes).ewm(span=ema_period, adjust=False).mean()
        tr = [highs[0]-lows[0]]
        for i in range(1, len(closes)):
            tr.append(max(highs[i]-lows[i], abs(highs[i]-closes[i-1]), abs(lows[i]-closes[i-1])))
        atr = pd.Series(tr).rolling(atr_period).mean()
        upper = ema + multiplier * atr
        lower = ema - multiplier * atr
        cp = closes[-1]
        uv, lv, mv = float(upper.iloc[-1]), float(lower.iloc[-1]), float(ema.iloc[-1])
        pos = "above_upper" if cp > uv else "below_lower" if cp < lv else "within_channels"
        def clean(s): return [None if pd.isna(v) else round(v, 2) for v in s.tolist()]
        return {
            "upper": round(uv, 2), "middle": round(mv, 2), "lower": round(lv, 2),
            "position": pos, "description": f"Keltner: Price {pos.replace('_',' ')}",
            "upper_history": clean(upper), "middle_history": clean(ema), "lower_history": clean(lower)
        }

    @staticmethod
    def calculate_std_dev(closes, period=20):
        """Standard Deviation — price dispersion."""
        if len(closes) < period: return None
        std_s = pd.Series(closes).rolling(period).std()
        vals = std_s.tolist()
        c = vals[-1]
        pct = (c/closes[-1]*100) if closes[-1] > 0 and not pd.isna(c) else 0
        return {
            "value": round(c, 4) if not pd.isna(c) else None,
            "percent": round(pct, 2),
            "description": f"Std Dev ${c:.2f} ({pct:.1f}%)" if not pd.isna(c) else "N/A",
            "history": [None if pd.isna(v) else round(v, 4) for v in vals]
        }

    # ═══════════════════════════════════════════════════════════════════════
    # D. TREND INDICATORS
    # ═══════════════════════════════════════════════════════════════════════

    @staticmethod
    def calculate_parabolic_sar(highs, lows, closes, af_start=0.02, af_step=0.02, af_max=0.20):
        """Parabolic SAR — stop and reverse points."""
        n = len(closes)
        if n < 3: return None
        sar = [0.0]*n; tr = [1]*n; ep = [0.0]*n; af = [af_start]*n
        if closes[1] >= closes[0]:
            tr[0], sar[0], ep[0] = 1, lows[0], highs[0]
        else:
            tr[0], sar[0], ep[0] = -1, highs[0], lows[0]
        for i in range(1, n):
            if tr[i-1] == 1:
                sar[i] = sar[i-1] + af[i-1] * (ep[i-1] - sar[i-1])
                sar[i] = min(sar[i], lows[i-1])
                if i >= 2: sar[i] = min(sar[i], lows[i-2])
                if lows[i] < sar[i]:
                    tr[i], sar[i], ep[i], af[i] = -1, ep[i-1], lows[i], af_start
                else:
                    tr[i] = 1
                    if highs[i] > ep[i-1]:
                        ep[i] = highs[i]; af[i] = min(af[i-1]+af_step, af_max)
                    else:
                        ep[i] = ep[i-1]; af[i] = af[i-1]
            else:
                sar[i] = sar[i-1] + af[i-1] * (ep[i-1] - sar[i-1])
                sar[i] = max(sar[i], highs[i-1])
                if i >= 2: sar[i] = max(sar[i], highs[i-2])
                if highs[i] > sar[i]:
                    tr[i], sar[i], ep[i], af[i] = 1, ep[i-1], highs[i], af_start
                else:
                    tr[i] = -1
                    if lows[i] < ep[i-1]:
                        ep[i] = lows[i]; af[i] = min(af[i-1]+af_step, af_max)
                    else:
                        ep[i] = ep[i-1]; af[i] = af[i-1]
        ct = "uptrend" if tr[-1] == 1 else "downtrend"
        return {
            "value": round(sar[-1], 2), "trend": ct,
            "description": f"SAR ${sar[-1]:.2f} — {'Below price (uptrend)' if ct == 'uptrend' else 'Above price (downtrend)'}",
            "sar_history": [round(v, 2) for v in sar], "trend_history": tr
        }

    @staticmethod
    def calculate_ichimoku(highs, lows, closes, tenkan_p=9, kijun_p=26, senkou_b_p=52):
        """Ichimoku Cloud — support/resistance + trend direction."""
        n = len(closes)
        if n < senkou_b_p: return None
        def midpt(h_arr, l_arr, period, idx):
            if idx < period - 1: return None
            return (max(h_arr[idx-period+1:idx+1]) + min(l_arr[idx-period+1:idx+1])) / 2
        tenkan = [midpt(highs, lows, tenkan_p, i) for i in range(n)]
        kijun = [midpt(highs, lows, kijun_p, i) for i in range(n)]
        senkou_a, senkou_b = [], []
        for i in range(n):
            senkou_a.append((tenkan[i]+kijun[i])/2 if tenkan[i] and kijun[i] else None)
            senkou_b.append(midpt(highs, lows, senkou_b_p, i))
        cp = closes[-1]
        top = max(senkou_a[-1] or 0, senkou_b[-1] or 0)
        bot = min(senkou_a[-1] or 0, senkou_b[-1] or 0)
        sig = "bullish" if cp > top else "bearish" if cp < bot else "in_cloud"
        def r(v): return round(v, 2) if v else None
        return {
            "tenkan": r(tenkan[-1]), "kijun": r(kijun[-1]),
            "senkou_a": r(senkou_a[-1]), "senkou_b": r(senkou_b[-1]),
            "signal": sig,
            "description": f"Ichimoku: {'Above cloud — bullish' if sig == 'bullish' else 'Below cloud — bearish' if sig == 'bearish' else 'In cloud — neutral'}",
            "tenkan_history": [r(v) for v in tenkan], "kijun_history": [r(v) for v in kijun],
            "senkou_a_history": [r(v) for v in senkou_a], "senkou_b_history": [r(v) for v in senkou_b]
        }

    @staticmethod
    def calculate_donchian_channels(highs, lows, period=20):
        """Donchian Channels — breakout trading."""
        if len(highs) < period: return None
        uh, lh, mh = [], [], []
        for i in range(len(highs)):
            if i < period - 1:
                uh.append(None); lh.append(None); mh.append(None)
            else:
                h = max(highs[i-period+1:i+1]); l = min(lows[i-period+1:i+1])
                uh.append(h); lh.append(l); mh.append((h+l)/2)
        def r(v): return round(v, 2) if v else None
        return {
            "upper": r(uh[-1]), "lower": r(lh[-1]), "middle": r(mh[-1]),
            "description": f"Donchian: ${uh[-1]:.2f} / ${lh[-1]:.2f}" if uh[-1] else "N/A",
            "upper_history": [r(v) for v in uh], "lower_history": [r(v) for v in lh],
            "middle_history": [r(v) for v in mh]
        }

    # ═══════════════════════════════════════════════════════════════════════
    # BATCH CALCULATION — all advanced indicators at once
    # ═══════════════════════════════════════════════════════════════════════

    def calculate_all_advanced(self, highs, lows, closes, volumes):
        """Calculate all advanced indicators. Returns dict keyed by name."""
        results = {}
        calcs = [
            ("vwap", lambda: self.calculate_vwap(highs, lows, closes, volumes)),
            ("obv", lambda: self.calculate_obv(closes, volumes)),
            ("ad_line", lambda: self.calculate_ad_line(highs, lows, closes, volumes)),
            ("stochastic", lambda: self.calculate_stochastic(highs, lows, closes)),
            ("adx", lambda: self.calculate_adx(highs, lows, closes)),
            ("cci", lambda: self.calculate_cci(highs, lows, closes)),
            ("roc", lambda: self.calculate_roc(closes)),
            ("atr", lambda: self.calculate_atr(highs, lows, closes)),
            ("keltner", lambda: self.calculate_keltner_channels(highs, lows, closes)),
            ("std_dev", lambda: self.calculate_std_dev(closes)),
            ("parabolic_sar", lambda: self.calculate_parabolic_sar(highs, lows, closes)),
            ("ichimoku", lambda: self.calculate_ichimoku(highs, lows, closes)),
            ("donchian", lambda: self.calculate_donchian_channels(highs, lows)),
        ]
        for name, fn in calcs:
            try:
                results[name] = fn()
            except Exception as e:
                print(f"{name} error: {e}")
                results[name] = None
        return results


# Global instance
technical_indicators = TechnicalIndicators()
