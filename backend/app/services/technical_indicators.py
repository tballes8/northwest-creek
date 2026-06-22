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
        deltas = [prices[i] - prices[i-1] for i in range(1, len(prices))]
        gains = [d if d > 0 else 0 for d in deltas]
        losses = [-d if d < 0 else 0 for d in deltas]
        # Wilder's smoothing: seed with SMA, then exponential
        avg_gain = sum(gains[:period]) / period
        avg_loss = sum(losses[:period]) / period
        for i in range(period, len(deltas)):
            avg_gain = (avg_gain * (period - 1) + gains[i]) / period
            avg_loss = (avg_loss * (period - 1) + losses[i]) / period
        if avg_loss == 0:
            return 100.0
        rs = avg_gain / avg_loss
        return round(100 - (100 / (1 + rs)), 4)
    
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
        std = prices_series.rolling(period).std(ddof=0)
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
            "description": f"MVWAP ${history[-1]:.2f} — Price {'above' if cp > history[-1] else 'below'} (multi-day cumulative)",
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
            s = [sum(data[:p]) / p]
            for i in range(p, len(data)):
                s.append((s[-1] * (p - 1) + data[i]) / p)
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

    def calculate_roc_divergence(self, highs, lows, closes, period=12, pivot_strength=3, lookback=60):
        """
        Detect divergence between price and ROC momentum.

        Bearish divergence: price makes a higher swing high while ROC makes a lower
        high — the advance is losing momentum. Bullish divergence: price makes a
        lower swing low while ROC makes a higher low — selling pressure is fading.

        Compares the two most recent confirmed swing pivots (a bar is a swing high/low
        when its high/low is the extreme of a +/- pivot_strength window, so the last
        pivot_strength bars are never pivots) within the most recent lookback bars.
        Heuristic by nature — an early-warning reading, not a trade trigger.

        Returns {"signal", "value", "description"} or None if there isn't enough data.
        """
        roc = self.calculate_roc(closes, period)
        if not roc:
            return None
        roc_hist = roc["history"]
        n = len(closes)
        start = max(period, n - lookback)  # ROC undefined before `period`

        swing_highs, swing_lows = [], []
        for i in range(max(start, pivot_strength), n - pivot_strength):
            window = slice(i - pivot_strength, i + pivot_strength + 1)
            if roc_hist[i] is None:
                continue
            if highs[i] == max(highs[window]):
                swing_highs.append(i)
            if lows[i] == min(lows[window]):
                swing_lows.append(i)

        bearish_idx = bullish_idx = None
        if len(swing_highs) >= 2:
            prev, recent = swing_highs[-2], swing_highs[-1]
            if highs[recent] > highs[prev] and roc_hist[recent] < roc_hist[prev]:
                bearish_idx = recent
        if len(swing_lows) >= 2:
            prev, recent = swing_lows[-2], swing_lows[-1]
            if lows[recent] < lows[prev] and roc_hist[recent] > roc_hist[prev]:
                bullish_idx = recent

        # If both fire, the more recent pivot wins.
        if bearish_idx is not None and (bullish_idx is None or bearish_idx >= bullish_idx):
            signal, description = "bearish", "Bearish divergence — price made a higher high while ROC made a lower high"
        elif bullish_idx is not None:
            signal, description = "bullish", "Bullish divergence — price made a lower low while ROC made a higher low"
        else:
            signal, description = "neutral", "No divergence — momentum confirming price"

        return {"signal": signal, "value": roc["value"], "description": description}

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
        # Wilder's smoothing: seed with SMA, then exponential
        vals = [None] * (period - 1)
        atr_val = sum(tr[:period]) / period
        vals.append(atr_val)
        for i in range(period, len(tr)):
            atr_val = (atr_val * (period - 1) + tr[i]) / period
            vals.append(atr_val)
        a = vals[-1]
        pct = (a/closes[-1]*100) if closes[-1] > 0 and a is not None else 0
        vol = "very_high" if pct > 5 else "high" if pct > 3 else "moderate" if pct > 1.5 else "low"
        return {
            "value": round(a, 4) if a is not None else None,
            "percent": round(pct, 2), "volatility": vol,
            "description": f"ATR ${a:.2f} ({pct:.1f}%) — {vol.replace('_',' ')} volatility" if a is not None else "N/A",
            "history": [None if v is None else round(v, 4) for v in vals]
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
    def compute_squeeze_state(bb_upper, bb_lower, kc_upper, kc_lower, min_bars=6, fired_window=5):
        """
        BB/KC squeeze: a bar is "in squeeze" when the Bollinger Bands sit fully
        inside the Keltner Channels (bb_upper < kc_upper AND bb_lower > kc_lower).

        Pure: takes aligned per-bar arrays (None allowed during indicator warmup),
        returns a small dict for the UI pill. No directional call.
        """
        if not bb_upper or not bb_lower or not kc_upper or not kc_lower:
            return None
        n = min(len(bb_upper), len(bb_lower), len(kc_upper), len(kc_lower))
        if n == 0:
            return None

        in_sqz = []
        for i in range(n):
            bu, bl, ku, kl = bb_upper[i], bb_lower[i], kc_upper[i], kc_lower[i]
            if bu is None or bl is None or ku is None or kl is None:
                in_sqz.append(False)
            else:
                in_sqz.append(bu < ku and bl > kl)

        # Currently coiling?
        if in_sqz[-1]:
            bars = 0
            for v in reversed(in_sqz):
                if not v:
                    break
                bars += 1
            return {"state": "on", "bars_in_squeeze": bars, "bars_since_fire": None, "min_bars": min_bars}

        # Recently fired? Find the most recent squeeze bar and measure the run + gap.
        last_true = -1
        for i in range(n - 1, -1, -1):
            if in_sqz[i]:
                last_true = i
                break
        if last_true != -1:
            run = 0
            for i in range(last_true, -1, -1):
                if not in_sqz[i]:
                    break
                run += 1
            gap = (n - 1) - last_true
            if run >= min_bars and gap <= fired_window:
                return {"state": "fired", "bars_in_squeeze": 0, "bars_since_fire": gap, "min_bars": min_bars}

        return {"state": "none", "bars_in_squeeze": 0, "bars_since_fire": None, "min_bars": min_bars}

    @staticmethod
    def compute_squeeze_from_ohlc(highs, lows, closes, bb_period=20, bb_std=2.0):
        """
        Convenience wrapper for batch/screener use: build BB + KC history arrays
        from raw OHLC lists and return the squeeze state dict (same shape and
        parameters as the Technical Analysis card pill so the two always agree).

        BB history matches the analyze endpoint exactly: 20-period SMA ± 2×population
        std. KC history comes from calculate_keltner_channels (EMA 20, ATR 10, 2.0×).
        Returns None if there is not enough history to evaluate.
        """
        if not closes or len(closes) < bb_period:
            return None

        bb_upper, bb_lower = [], []
        for i in range(len(closes)):
            if i >= bb_period - 1:
                window = closes[i - bb_period + 1:i + 1]
                sma = sum(window) / bb_period
                variance = sum((p - sma) ** 2 for p in window) / bb_period
                sd = variance ** 0.5
                bb_upper.append(sma + bb_std * sd)
                bb_lower.append(sma - bb_std * sd)
            else:
                bb_upper.append(None)
                bb_lower.append(None)

        kc = TechnicalIndicators.calculate_keltner_channels(highs, lows, closes)
        if not kc:
            return None

        result = TechnicalIndicators.compute_squeeze_state(
            bb_upper, bb_lower, kc["upper_history"], kc["lower_history"]
        )
        if result is not None:
            # Tightness: Bollinger width ÷ Keltner width at the latest bar
            # (smaller = bands sit deeper inside the channels = tighter coil).
            bu, bl = bb_upper[-1], bb_lower[-1]
            ku, kl = kc["upper_history"][-1], kc["lower_history"][-1]
            ratio = None
            if None not in (bu, bl, ku, kl):
                kc_width = ku - kl
                if kc_width:
                    ratio = round((bu - bl) / kc_width, 4)
            result["bandwidth_ratio"] = ratio
        return result

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
        # Senkou spans calculated at current bar (pre-shift)
        senkou_a_raw, senkou_b_raw = [], []
        for i in range(n):
            senkou_a_raw.append((tenkan[i]+kijun[i])/2 if tenkan[i] and kijun[i] else None)
            senkou_b_raw.append(midpt(highs, lows, senkou_b_p, i))
        # Forward-shift Senkou spans by kijun_p (26) periods
        shift = kijun_p
        senkou_a = [None]*shift + senkou_a_raw[:n-shift]
        senkou_b = [None]*shift + senkou_b_raw[:n-shift]
        # Chikou Span — current close plotted 26 periods back
        chikou = [closes[i+shift] if i+shift < n else None for i in range(n)]
        cp = closes[-1]
        top = max(senkou_a[-1] or 0, senkou_b[-1] or 0)
        bot = min(senkou_a[-1] or 0, senkou_b[-1] or 0)
        sig = "bullish" if cp > top else "bearish" if cp < bot else "in_cloud"
        def r(v): return round(v, 2) if v else None
        return {
            "tenkan": r(tenkan[-1]), "kijun": r(kijun[-1]),
            "senkou_a": r(senkou_a[-1]), "senkou_b": r(senkou_b[-1]),
            "chikou": r(chikou[-1]),
            "signal": sig,
            "description": f"Ichimoku: {'Above cloud — bullish' if sig == 'bullish' else 'Below cloud — bearish' if sig == 'bearish' else 'In cloud — neutral'}",
            "tenkan_history": [r(v) for v in tenkan], "kijun_history": [r(v) for v in kijun],
            "senkou_a_history": [r(v) for v in senkou_a], "senkou_b_history": [r(v) for v in senkou_b],
            "chikou_history": [r(v) for v in chikou]
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
            ("roc_divergence", lambda: self.calculate_roc_divergence(highs, lows, closes)),
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


def _calculate_price_range(current_price, bb_data, ma_data, advanced):
    """
    Derive a technical support/resistance range from price-level indicators.

    Collects upper-bound (resistance) and lower-bound (support) price levels
    from Bollinger Bands, Keltner Channels, Donchian Channels, Ichimoku Cloud,
    SMAs, VWAP, and Parabolic SAR. Returns the median of each as the range.
    """
    import statistics

    support_levels = []
    resistance_levels = []

    # Bollinger Bands
    if bb_data and isinstance(bb_data, dict):
        if bb_data.get("lower_band") is not None:
            support_levels.append(bb_data["lower_band"])
        if bb_data.get("upper_band") is not None:
            resistance_levels.append(bb_data["upper_band"])

    # Keltner Channels
    keltner = advanced.get("keltner")
    if keltner and isinstance(keltner, dict):
        if keltner.get("lower") is not None:
            support_levels.append(keltner["lower"])
        if keltner.get("upper") is not None:
            resistance_levels.append(keltner["upper"])

    # Donchian Channels
    donchian = advanced.get("donchian")
    if donchian and isinstance(donchian, dict):
        if donchian.get("lower") is not None:
            support_levels.append(donchian["lower"])
        if donchian.get("upper") is not None:
            resistance_levels.append(donchian["upper"])

    # Ichimoku Cloud — lower edge = support, upper edge = resistance
    ichimoku = advanced.get("ichimoku")
    if ichimoku and isinstance(ichimoku, dict):
        senkou_a = ichimoku.get("senkou_a")
        senkou_b = ichimoku.get("senkou_b")
        if senkou_a is not None and senkou_b is not None:
            support_levels.append(min(senkou_a, senkou_b))
            resistance_levels.append(max(senkou_a, senkou_b))

    # Moving Averages — classify as support or resistance relative to price
    if ma_data and isinstance(ma_data, dict):
        for key in ("sma_20", "sma_50", "sma_200"):
            val = ma_data.get(key)
            if val is not None:
                if val <= current_price:
                    support_levels.append(val)
                else:
                    resistance_levels.append(val)

    # VWAP — classify as support or resistance relative to price
    vwap = advanced.get("vwap")
    if vwap and isinstance(vwap, dict):
        vwap_val = vwap.get("value")
        if vwap_val is not None:
            if vwap_val <= current_price:
                support_levels.append(vwap_val)
            else:
                resistance_levels.append(vwap_val)

    # Parabolic SAR — uptrend SAR is below price (support), downtrend is above (resistance)
    sar = advanced.get("parabolic_sar")
    if sar and isinstance(sar, dict):
        sar_val = sar.get("value")
        sar_trend = sar.get("trend")
        if sar_val is not None:
            if sar_trend == "uptrend":
                support_levels.append(sar_val)
            else:
                resistance_levels.append(sar_val)

    # Need at least 2 levels on each side for a meaningful range
    if len(support_levels) < 2 or len(resistance_levels) < 2:
        return None

    return {
        "support": round(statistics.median(support_levels), 2),
        "resistance": round(statistics.median(resistance_levels), 2),
        "support_levels_count": len(support_levels),
        "resistance_levels_count": len(resistance_levels),
    }


def build_signal_rows(rsi, macd_data, ma_data, bb_data, current_price, advanced=None):
    """
    Build the per-indicator rows for the Trading Signals panel.

    Each row carries a "scored" flag. Scored rows use the same indicators and
    thresholds as generate_summary(), so they reconcile with the outlook's
    "X of N indicators" count (X = bullish scored rows, N = non-neutral scored
    rows). Unscored rows (ROC divergence, A/D Line, Keltner, Donchian) are
    informational only and intentionally do NOT contribute to that count — a
    mismatch between total rows and N is expected, not a bug.

    Each row is a *condition* — type is "bullish", "bearish", or "neutral" — not
    a trade instruction, and the message describes the reading (and, where it
    matters, why an extreme isn't a reversal in a trend). Phrasing avoids
    equity-specific wording so it reads correctly for ETFs/funds too.

    Indicators with no data are omitted entirely.
    """
    if advanced is None:
        advanced = {}

    rows = []

    # ── MACD (trend) ──────────────────────────────────────────────────
    if macd_data and isinstance(macd_data, dict):
        trend = macd_data.get("trend")
        if trend == "bullish":
            rows.append({"type": "bullish", "indicator": "MACD", "message": "MACD line above its signal line — bullish momentum."})
        elif trend == "bearish":
            rows.append({"type": "bearish", "indicator": "MACD", "message": "MACD line below its signal line — bearish momentum."})
        else:
            rows.append({"type": "neutral", "indicator": "MACD", "message": "MACD near its signal line — no clear momentum."})

    # ── ADX + Directional Index (trend strength, not direction) ───────
    adx_data = advanced.get("adx")
    if adx_data and isinstance(adx_data, dict) and adx_data.get("adx") is not None:
        adx_val = adx_data.get("adx")
        direction = adx_data.get("direction")
        strength = adx_data.get("strength")
        if strength in ("trending", "very_strong") and direction == "bullish":
            rows.append({"type": "bullish", "indicator": "ADX", "message": f"Strong trend, bullish direction (ADX {adx_val:.1f})."})
        elif strength in ("trending", "very_strong") and direction == "bearish":
            rows.append({"type": "bearish", "indicator": "ADX", "message": f"Strong trend, bearish direction (ADX {adx_val:.1f})."})
        else:
            rows.append({"type": "neutral", "indicator": "ADX", "message": f"Trend too weak to confirm direction (ADX {adx_val:.1f})."})

    # ── Moving Average alignment ──────────────────────────────────────
    if ma_data and isinstance(ma_data, dict) and (ma_data.get("sma_20") is not None or ma_data.get("sma_50") is not None):
        sma_20 = ma_data.get("sma_20")
        sma_50 = ma_data.get("sma_50")
        ma_score = 0
        if sma_20 is not None:
            ma_score += 1 if current_price > sma_20 else -1
        if sma_50 is not None:
            ma_score += 1 if current_price > sma_50 else -1
        if ma_score > 0:
            rows.append({"type": "bullish", "indicator": "Moving Averages", "message": "Price above its 20- and 50-day averages — uptrend."})
        elif ma_score < 0:
            rows.append({"type": "bearish", "indicator": "Moving Averages", "message": "Price below its 20- and 50-day averages — downtrend."})
        else:
            rows.append({"type": "neutral", "indicator": "Moving Averages", "message": "Price between its 20- and 50-day averages — no clear trend."})

    # ── Ichimoku Cloud ────────────────────────────────────────────────
    ich_data = advanced.get("ichimoku")
    if ich_data and isinstance(ich_data, dict):
        sig = ich_data.get("signal")
        if sig == "bullish":
            rows.append({"type": "bullish", "indicator": "Ichimoku Cloud", "message": "Price above the cloud — bullish trend."})
        elif sig == "bearish":
            rows.append({"type": "bearish", "indicator": "Ichimoku Cloud", "message": "Price below the cloud — bearish trend."})
        else:
            rows.append({"type": "neutral", "indicator": "Ichimoku Cloud", "message": "Price inside the cloud — trend unclear."})

    # ── Parabolic SAR ─────────────────────────────────────────────────
    sar_data = advanced.get("parabolic_sar")
    if sar_data and isinstance(sar_data, dict):
        sar_trend = sar_data.get("trend")
        val = sar_data.get("value")
        val_str = f" (SAR ${val:.2f})" if isinstance(val, (int, float)) else ""
        if sar_trend == "uptrend":
            rows.append({"type": "bullish", "indicator": "Parabolic SAR", "message": f"Dots below price{val_str} — uptrend."})
        elif sar_trend == "downtrend":
            rows.append({"type": "bearish", "indicator": "Parabolic SAR", "message": f"Dots above price{val_str} — downtrend."})
        else:
            rows.append({"type": "neutral", "indicator": "Parabolic SAR", "message": "Parabolic SAR shows no clear trend."})

    # ── RSI (only extremes score; mid-range is neutral) ───────────────
    if rsi is not None:
        if rsi < 30:
            rows.append({"type": "bullish", "indicator": "RSI", "message": f"Oversold (RSI {rsi:.1f}) — stretched low; in a strong downtrend this can persist rather than bounce."})
        elif rsi > 70:
            rows.append({"type": "bearish", "indicator": "RSI", "message": f"Overbought (RSI {rsi:.1f}) — extended; in a strong uptrend this reflects momentum, not a reversal on its own."})
        else:
            rows.append({"type": "neutral", "indicator": "RSI", "message": f"Neutral (RSI {rsi:.1f}) — momentum within the normal 30–70 range."})

    # ── Bollinger Bands ───────────────────────────────────────────────
    if bb_data and isinstance(bb_data, dict):
        position = bb_data.get("position")
        if position == "below_lower":
            rows.append({"type": "bullish", "indicator": "Bollinger Bands", "message": "Below the lower band — stretched low; in a downtrend price can ride the band rather than bounce."})
        elif position == "above_upper":
            rows.append({"type": "bearish", "indicator": "Bollinger Bands", "message": "Above the upper band — stretched high; in an uptrend price can ride the band rather than reverse."})
        else:
            rows.append({"type": "neutral", "indicator": "Bollinger Bands", "message": "Within the bands — trading in its normal range."})

    # ── Stochastic ────────────────────────────────────────────────────
    stoch = advanced.get("stochastic")
    if stoch and isinstance(stoch, dict):
        sig = stoch.get("signal")
        k = stoch.get("k")
        k_str = f"%K {k:.1f}" if isinstance(k, (int, float)) else "%K"
        if sig == "oversold":
            rows.append({"type": "bullish", "indicator": "Stochastic", "message": f"Oversold ({k_str}) — extended low; can stay pinned low in a strong downtrend."})
        elif sig == "overbought":
            rows.append({"type": "bearish", "indicator": "Stochastic", "message": f"Overbought ({k_str}) — extended in an uptrend, not a standalone reversal signal."})
        else:
            rows.append({"type": "neutral", "indicator": "Stochastic", "message": f"Neutral ({k_str}) — mid-range."})

    # ── CCI ───────────────────────────────────────────────────────────
    cci_data = advanced.get("cci")
    if cci_data and isinstance(cci_data, dict) and cci_data.get("value") is not None:
        sig = cci_data.get("signal")
        val = cci_data.get("value")
        if sig == "oversold":
            rows.append({"type": "bullish", "indicator": "CCI", "message": f"Oversold (CCI {val:.0f}) — stretched low; CCI is unbounded and can stay low in a downtrend."})
        elif sig == "overbought":
            rows.append({"type": "bearish", "indicator": "CCI", "message": f"Overbought (CCI {val:.0f}) — stretched high; CCI is unbounded and can stay high in an uptrend."})
        else:
            rows.append({"type": "neutral", "indicator": "CCI", "message": f"Neutral (CCI {val:.0f}) — within ±100."})

    # ── VWAP ──────────────────────────────────────────────────────────
    vwap_data = advanced.get("vwap")
    if vwap_data and isinstance(vwap_data, dict):
        sig = vwap_data.get("signal")
        if sig == "bullish":
            rows.append({"type": "bullish", "indicator": "VWAP", "message": "Price above its volume-weighted average — buyers in control over the period."})
        elif sig == "bearish":
            rows.append({"type": "bearish", "indicator": "VWAP", "message": "Price below its volume-weighted average — sellers in control over the period."})
        else:
            rows.append({"type": "neutral", "indicator": "VWAP", "message": "Price near its volume-weighted average."})

    # ── OBV ───────────────────────────────────────────────────────────
    obv_data = advanced.get("obv")
    if obv_data and isinstance(obv_data, dict):
        sig = obv_data.get("signal")
        if sig == "bullish":
            rows.append({"type": "bullish", "indicator": "OBV", "message": "On-balance volume rising — volume confirming buying pressure."})
        elif sig == "bearish":
            rows.append({"type": "bearish", "indicator": "OBV", "message": "On-balance volume falling — volume confirming selling pressure."})
        else:
            rows.append({"type": "neutral", "indicator": "OBV", "message": "On-balance volume flat — no clear volume bias."})

    # ── Informational rows (not scored — see docstring) ───────────────
    # ── ROC divergence (momentum vs. price) ───────────────────────────
    roc_div = advanced.get("roc_divergence")
    if roc_div and isinstance(roc_div, dict):
        sig = roc_div.get("signal")
        if sig == "bearish":
            rows.append({"type": "bearish", "indicator": "ROC", "message": "Bearish divergence — price made a higher high while ROC made a lower high; the momentum behind the advance is weakening."})
        elif sig == "bullish":
            rows.append({"type": "bullish", "indicator": "ROC", "message": "Bullish divergence — price made a lower low while ROC made a higher low; selling pressure may be fading."})
        else:
            rows.append({"type": "neutral", "indicator": "ROC", "message": "Momentum confirming price — no divergence between price and ROC."})

    # ── A/D Line (volume flow) ────────────────────────────────────────
    ad_data = advanced.get("ad_line")
    if ad_data and isinstance(ad_data, dict):
        sig = ad_data.get("signal")
        if sig == "bullish":
            rows.append({"type": "bullish", "indicator": "A/D Line", "message": "A/D line rising — volume flowing in (accumulation)."})
        elif sig == "bearish":
            rows.append({"type": "bearish", "indicator": "A/D Line", "message": "A/D line falling — volume flowing out (distribution)."})
        else:
            rows.append({"type": "neutral", "indicator": "A/D Line", "message": "A/D line flat — no clear accumulation or distribution."})

    # ── Keltner Channels (volatility envelope) ────────────────────────
    kc_data = advanced.get("keltner")
    if kc_data and isinstance(kc_data, dict):
        pos = kc_data.get("position")
        if pos == "above_upper":
            rows.append({"type": "bearish", "indicator": "Keltner Channels", "message": "Above the upper Keltner channel — stretched high for its recent volatility."})
        elif pos == "below_lower":
            rows.append({"type": "bullish", "indicator": "Keltner Channels", "message": "Below the lower Keltner channel — stretched low for its recent volatility."})
        else:
            rows.append({"type": "neutral", "indicator": "Keltner Channels", "message": "Within the Keltner channels — normal volatility range."})

    # ── Donchian Channels (20-day high/low range) ─────────────────────
    dc_data = advanced.get("donchian")
    if dc_data and isinstance(dc_data, dict) and dc_data.get("upper") is not None and dc_data.get("lower") is not None:
        upper, lower = dc_data["upper"], dc_data["lower"]
        if upper > lower:
            pos = (current_price - lower) / (upper - lower)
            if pos >= 0.8:
                rows.append({"type": "bullish", "indicator": "Donchian Channels", "message": "Near the top of its 20-day range — breakout territory."})
            elif pos <= 0.2:
                rows.append({"type": "bearish", "indicator": "Donchian Channels", "message": "Near the bottom of its 20-day range — breakdown territory."})
            else:
                rows.append({"type": "neutral", "indicator": "Donchian Channels", "message": "Mid-range within its 20-day high–low channel."})

    # Tag which rows feed generate_summary()'s outlook score; the rest are
    # informational and intentionally excluded from the "X of N" count.
    SCORED = {"MACD", "ADX", "Moving Averages", "Ichimoku Cloud", "Parabolic SAR",
              "RSI", "Bollinger Bands", "Stochastic", "CCI", "VWAP", "OBV"}
    for row in rows:
        row["scored"] = row["indicator"] in SCORED

    return rows


def generate_summary(rsi, macd_data, ma_data, bb_data, current_price, advanced=None):
    """
    Generate overall trading summary using weighted indicator scoring.

    Weight tiers:
      2 — Trend indicators (MACD, ADX, MA alignment, Ichimoku)
      1 — Oscillators & confirmation (RSI, BB, Stochastic, CCI, SAR, VWAP, OBV)

    Directional-only: volatility indicators (ATR, Keltner, Std Dev, Donchian)
    and ROC (redundant with MACD) are excluded from scoring.
    """
    if advanced is None:
        advanced = {}

    # Each entry: (name, score contribution, weight applied)
    contributions = []

    # ── MACD (weight 2) ───────────────────────────────────────────────
    if macd_data and isinstance(macd_data, dict):
        trend = macd_data.get("trend")
        if trend == "bullish":
            contributions.append(("MACD", 2))
        elif trend == "bearish":
            contributions.append(("MACD", -2))

    # ── ADX + Directional Index (weight 2) ────────────────────────────
    adx_data = advanced.get("adx")
    if adx_data and isinstance(adx_data, dict):
        adx_val = adx_data.get("adx")
        direction = adx_data.get("direction")
        strength = adx_data.get("strength")
        # Only score if trend is meaningful (ADX > ~20)
        if strength in ("trending", "very_strong") and direction:
            if direction == "bullish":
                contributions.append(("ADX", 2))
            elif direction == "bearish":
                contributions.append(("ADX", -2))

    # ── Moving Average alignment (weight 2) ───────────────────────────
    # Score based on price position relative to SMA 20 and SMA 50
    if ma_data and isinstance(ma_data, dict):
        sma_20 = ma_data.get("sma_20")
        sma_50 = ma_data.get("sma_50")
        ma_score = 0
        if sma_20 is not None:
            if current_price > sma_20:
                ma_score += 1
            else:
                ma_score -= 1
        if sma_50 is not None:
            if current_price > sma_50:
                ma_score += 1
            else:
                ma_score -= 1
        # Normalize: both above = +2, both below = -2, split = 0
        if ma_score != 0:
            contributions.append(("Moving Averages", ma_score))

    # ── Ichimoku Cloud (weight 2) ─────────────────────────────────────
    ich_data = advanced.get("ichimoku")
    if ich_data and isinstance(ich_data, dict):
        ich_signal = ich_data.get("signal")
        if ich_signal == "bullish":
            contributions.append(("Ichimoku", 2))
        elif ich_signal == "bearish":
            contributions.append(("Ichimoku", -2))
        # "in_cloud" = neutral, no contribution

    # ── Parabolic SAR (weight 1) ──────────────────────────────────────
    sar_data = advanced.get("parabolic_sar")
    if sar_data and isinstance(sar_data, dict):
        sar_trend = sar_data.get("trend")
        if sar_trend == "uptrend":
            contributions.append(("Parabolic SAR", 1))
        elif sar_trend == "downtrend":
            contributions.append(("Parabolic SAR", -1))

    # ── RSI (weight 1) — only at extremes ─────────────────────────────
    if rsi is not None:
        if rsi < 30:
            contributions.append(("RSI", 1))
        elif rsi > 70:
            contributions.append(("RSI", -1))

    # ── Bollinger Bands (weight 1) ────────────────────────────────────
    if bb_data and isinstance(bb_data, dict):
        position = bb_data.get("position")
        if position == "below_lower":
            contributions.append(("Bollinger Bands", 1))
        elif position == "above_upper":
            contributions.append(("Bollinger Bands", -1))

    # ── Stochastic (weight 1) ─────────────────────────────────────────
    stoch = advanced.get("stochastic")
    if stoch and isinstance(stoch, dict):
        stoch_signal = stoch.get("signal")
        if stoch_signal == "oversold":
            contributions.append(("Stochastic", 1))
        elif stoch_signal == "overbought":
            contributions.append(("Stochastic", -1))

    # ── CCI (weight 1) ────────────────────────────────────────────────
    cci_data = advanced.get("cci")
    if cci_data and isinstance(cci_data, dict):
        cci_signal = cci_data.get("signal")
        if cci_signal == "oversold":
            contributions.append(("CCI", 1))
        elif cci_signal == "overbought":
            contributions.append(("CCI", -1))

    # ── VWAP (weight 1) ───────────────────────────────────────────────
    vwap_data = advanced.get("vwap")
    if vwap_data and isinstance(vwap_data, dict):
        vwap_signal = vwap_data.get("signal")
        if vwap_signal == "bullish":
            contributions.append(("VWAP", 1))
        elif vwap_signal == "bearish":
            contributions.append(("VWAP", -1))

    # ── OBV (weight 1) ────────────────────────────────────────────────
    obv_data = advanced.get("obv")
    if obv_data and isinstance(obv_data, dict):
        obv_signal = obv_data.get("signal")
        if obv_signal == "bullish":
            contributions.append(("OBV", 1))
        elif obv_signal == "bearish":
            contributions.append(("OBV", -1))

    # ── Tally ─────────────────────────────────────────────────────────
    total_score = sum(s for _, s in contributions)
    bullish_count = sum(1 for _, s in contributions if s > 0)
    bearish_count = sum(1 for _, s in contributions if s < 0)
    indicators_counted = len(contributions)

    # ── Determine outlook ─────────────────────────────────────────────
    #   Strong Bullish:  score >= 6
    #   Bullish:         score 3 to 5
    #   Neutral:         score -2 to 2
    #   Bearish:         score -5 to -3
    #   Strong Bearish:  score <= -6
    if total_score >= 6:
        outlook = "bullish"
        label = "Strong Bullish"
    elif total_score >= 3:
        outlook = "bullish"
        label = "Bullish"
    elif total_score <= -6:
        outlook = "bearish"
        label = "Strong Bearish"
    elif total_score <= -3:
        outlook = "bearish"
        label = "Bearish"
    else:
        outlook = "neutral"
        label = "Neutral"

    # ── Build message ─────────────────────────────────────────────────
    if indicators_counted == 0:
        message = "Insufficient indicator data for outlook"
    elif outlook == "neutral":
        message = f"Mixed signals - wait for clearer trend ({bullish_count} bullish, {bearish_count} bearish of {indicators_counted} indicators)"
    else:
        direction = "bullish" if total_score > 0 else "bearish"
        dominant_count = bullish_count if total_score > 0 else bearish_count
        message = f"{label} outlook — {dominant_count} of {indicators_counted} indicators {direction} (score: {total_score:+d})"

    # ── Build breakdown for transparency ──────────────────────────────
    breakdown = []
    for name, score in contributions:
        breakdown.append({
            "indicator": name,
            "direction": "bullish" if score > 0 else "bearish",
            "weight": abs(score),
        })

    # ── Technical Price Range ───────────────────────────────────────
    price_range = _calculate_price_range(current_price, bb_data, ma_data, advanced)

    return {
        "outlook": outlook,
        "strength": total_score,
        "message": message,
        "score": total_score,
        "indicators_counted": indicators_counted,
        "bullish_count": bullish_count,
        "bearish_count": bearish_count,
        "breakdown": breakdown,
        "price_range": price_range,
    }