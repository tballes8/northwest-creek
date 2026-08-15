"""
Technical Alert Checker - Evaluates indicator-based alerts for state transitions.
Called by the daily cron task after market close.
"""
import asyncio
from collections import defaultdict
from datetime import datetime, timezone
from typing import Any, Dict, Optional, Tuple

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import get_settings
from app.db.models import TechnicalAlert, User
from app.services.email_service import email_service
from app.services.market_data import market_data_service
from app.services.technical_indicators import technical_indicators, generate_summary
from app.services.sms_service import send_alert_sms, build_technical_alert_message
from app.services.financials_service import get_company_financials

settings = get_settings()
EMAIL_ON_TRIGGER = True
FMP_CONCURRENCY = 5  # max parallel FMP requests

INDICATOR_ALERT_TYPES = {"sentiment_shift", "ma_crossover", "rsi_extreme", "macd_cross", "bollinger_breach", "sar_flip"}
FUNDAMENTAL_ALERT_TYPES = {"dcf_valuation", "rule_of_40"}


def _sar_trend_runs(trend_history: list) -> Tuple[int, int]:
    """
    Return (current_run_bars, prior_run_bars) from a Parabolic SAR trend history
    (a list of +1 / -1 values, one per bar).

    Derived from the full history rather than accumulated across cron runs, so a
    missed run or a re-seeded alert still yields the correct trend age.
    """
    if not trend_history:
        return 0, 0

    i = len(trend_history) - 1
    current_trend = trend_history[-1]
    current = 0
    while i >= 0 and trend_history[i] == current_trend:
        current += 1
        i -= 1

    if i < 0:
        return current, 0

    prior_trend = trend_history[i]
    prior = 0
    while i >= 0 and trend_history[i] == prior_trend:
        prior += 1
        i -= 1

    return current, prior


def _sar_snapshot(indicators: Dict[str, Any]) -> Optional[Tuple[str, int, int, Optional[float]]]:
    """Extract (position, bars_in_trend, prior_trend_bars, sar_value) from computed indicators."""
    sar = (indicators.get("advanced") or {}).get("parabolic_sar")
    if not sar or not isinstance(sar, dict):
        return None
    position = "below" if sar.get("trend") == "uptrend" else "above"
    bars_in_trend, prior_trend_bars = _sar_trend_runs(sar.get("trend_history") or [])
    return position, bars_in_trend, prior_trend_bars, sar.get("value")

# Sector DCF defaults: (growth_rate, terminal_growth, discount_rate, projection_years)
_SECTOR_DEFAULTS = {
    "Technology": (0.15, 0.03, 0.12, 7),
    "Healthcare": (0.08, 0.025, 0.09, 5),
    "Financial Services": (0.06, 0.02, 0.11, 5),
    "Consumer Cyclical": (0.07, 0.025, 0.10, 5),
    "Consumer Defensive": (0.05, 0.02, 0.08, 5),
    "Energy": (0.04, 0.015, 0.12, 5),
    "Industrials": (0.06, 0.025, 0.09, 5),
    "Real Estate": (0.04, 0.02, 0.09, 5),
    "Utilities": (0.03, 0.02, 0.07, 5),
    "Communication Services": (0.08, 0.025, 0.10, 6),
    "Materials": (0.05, 0.02, 0.10, 5),
}
_DEFAULT_PROFILE = (0.06, 0.025, 0.10, 5)


class TechnicalAlertChecker:
    """Evaluates all active technical alerts against current indicator data."""

    def __init__(self):
        self._broadcast_fn = None

    def set_broadcast_fn(self, fn):
        self._broadcast_fn = fn

    async def check_all_alerts(self, db: AsyncSession):
        """Main entry point - called by the cron task."""
        result = await db.execute(
            select(TechnicalAlert)
            .options(selectinload(TechnicalAlert.user))
            .where(
                TechnicalAlert.is_active == True,
                TechnicalAlert.triggered_at == None,
            )
        )
        alerts = result.scalars().all()

        if not alerts:
            print("   No active technical alerts to check")
            return {"checked": 0, "triggered": 0}

        # Group by ticker to compute indicators once per ticker
        ticker_groups: Dict[str, list] = defaultdict(list)
        for alert in alerts:
            ticker_groups[alert.ticker.upper()].append(alert)

        print(f"   Checking {len(alerts)} alerts across {len(ticker_groups)} tickers")

        triggered_count = 0
        semaphore = asyncio.Semaphore(FMP_CONCURRENCY)

        async def process_ticker(ticker: str, ticker_alerts: list):
            nonlocal triggered_count
            async with semaphore:
                try:
                    needs_indicators = any(a.alert_type in INDICATOR_ALERT_TYPES for a in ticker_alerts)
                    needs_fundamentals = any(a.alert_type in FUNDAMENTAL_ALERT_TYPES for a in ticker_alerts)

                    indicators = None
                    fundamentals = None

                    if needs_indicators:
                        indicators = await self._compute_indicators(ticker)
                    if needs_fundamentals:
                        fundamentals = await self._compute_fundamentals(ticker)

                    for alert in ticker_alerts:
                        if alert.alert_type in INDICATOR_ALERT_TYPES and indicators is None:
                            continue
                        if alert.alert_type in FUNDAMENTAL_ALERT_TYPES and fundamentals is None:
                            continue

                        triggered, new_state, details = self._evaluate_alert(alert, indicators, fundamentals)

                        if not triggered:
                            alert.last_state = new_state
                            continue

                        if await self._trigger_alert(db, alert, details):
                            alert.last_state = new_state
                            triggered_count += 1
                        else:
                            # Notification failed. Hold last_state at its pre-transition
                            # value so this same transition is re-detected and retried on
                            # the next cron run — advancing it would silently lose the alert.
                            print(
                                f"   ⚠️  {ticker} [{alert.alert_type}] left ARMED — "
                                f"notification failed, will retry next run"
                            )

                except Exception as e:
                    print(f"   ❌ Error processing {ticker}: {e}")

        tasks = [
            process_ticker(ticker, ticker_alerts)
            for ticker, ticker_alerts in ticker_groups.items()
        ]
        await asyncio.gather(*tasks)

        await db.commit()
        print(f"   Done: {len(alerts)} checked, {triggered_count} triggered")
        return {"checked": len(alerts), "triggered": triggered_count}

    async def _compute_indicators(self, ticker: str) -> Optional[Dict[str, Any]]:
        """Fetch prices and compute all indicators needed by any alert type."""
        try:
            historical = await market_data_service.get_historical_prices(ticker, days=260)
        except Exception as e:
            print(f"   ⚠️  Could not fetch history for {ticker}: {e}")
            return None

        if len(historical) < 50:
            return None

        closes = [d["close"] for d in historical]
        highs = [d["high"] for d in historical]
        lows = [d["low"] for d in historical]
        volumes = [d["volume"] for d in historical]
        current_price = closes[-1]

        rsi = technical_indicators.calculate_rsi(closes)
        macd = technical_indicators.calculate_macd(closes)
        ma = technical_indicators.calculate_moving_averages(closes)
        bb = technical_indicators.calculate_bollinger_bands(closes)
        advanced = technical_indicators.calculate_all_advanced(highs, lows, closes, volumes)

        summary = generate_summary(rsi, macd, ma, bb, current_price, advanced)

        return {
            "current_price": current_price,
            "rsi": rsi,
            "macd": macd,
            "ma": ma,
            "bb": bb,
            "advanced": advanced,
            "summary": summary,
        }

    def _evaluate_alert(
        self, alert: TechnicalAlert,
        indicators: Optional[Dict[str, Any]] = None,
        fundamentals: Optional[Dict[str, Any]] = None,
    ) -> Tuple[bool, dict, dict]:
        """Returns (triggered, new_state, trigger_details)."""
        atype = alert.alert_type

        # Fundamental-based alerts
        if atype == "dcf_valuation":
            return self._eval_dcf_valuation(alert, fundamentals)
        if atype == "rule_of_40":
            return self._eval_rule_of_40(alert, fundamentals)

        # Indicator-based alerts
        evaluators = {
            "sentiment_shift": self._eval_sentiment_shift,
            "ma_crossover": self._eval_ma_crossover,
            "rsi_extreme": self._eval_rsi_extreme,
            "macd_cross": self._eval_macd_cross,
            "bollinger_breach": self._eval_bollinger_breach,
            "sar_flip": self._eval_sar_flip,
        }
        evaluator = evaluators.get(atype)
        if not evaluator:
            return False, alert.last_state or {}, {}
        return evaluator(alert, indicators)

    # ── Type-specific evaluators ──────────────────────────────────────

    def _eval_sentiment_shift(self, alert, indicators):
        """Detect transition TO target outlook."""
        current_outlook = indicators["summary"]["outlook"]
        last_outlook = (alert.last_state or {}).get("outlook")
        target = alert.config["target_outlook"]
        new_state = {"outlook": current_outlook, "score": indicators["summary"]["score"]}

        triggered = (
            current_outlook == target
            and last_outlook is not None
            and last_outlook != target
        )
        details = {
            "from_outlook": last_outlook,
            "to_outlook": current_outlook,
            "score": indicators["summary"]["score"],
        }
        return triggered, new_state, details

    def _eval_ma_crossover(self, alert, indicators):
        """Detect SMA20 crossing SMA50."""
        ma = indicators["ma"]
        sma20 = ma.get("sma_20") if ma else None
        sma50 = ma.get("sma_50") if ma else None

        if sma20 is None or sma50 is None:
            return False, alert.last_state or {}, {}

        currently_above = sma20 > sma50
        was_above = (alert.last_state or {}).get("sma20_above_sma50")
        new_state = {"sma20_above_sma50": currently_above, "sma20": round(sma20, 2), "sma50": round(sma50, 2)}

        if was_above is None:
            return False, new_state, {}

        cross_type = alert.config["cross_type"]
        triggered = False
        if cross_type == "golden_cross" and currently_above and not was_above:
            triggered = True
        elif cross_type == "death_cross" and not currently_above and was_above:
            triggered = True

        details = {"sma20": round(sma20, 2), "sma50": round(sma50, 2), "cross_type": cross_type}
        return triggered, new_state, details

    def _eval_rsi_extreme(self, alert, indicators):
        """Detect RSI crossing threshold."""
        rsi = indicators["rsi"]
        if rsi is None:
            return False, alert.last_state or {}, {}

        threshold = alert.config["threshold"]
        direction = alert.config["direction"]
        last_rsi = (alert.last_state or {}).get("rsi")
        new_state = {"rsi": round(rsi, 2)}

        if last_rsi is None:
            return False, new_state, {}

        triggered = False
        if direction == "above" and rsi >= threshold and last_rsi < threshold:
            triggered = True
        elif direction == "below" and rsi <= threshold and last_rsi > threshold:
            triggered = True

        details = {"rsi": round(rsi, 2), "previous_rsi": round(last_rsi, 2), "threshold": threshold}
        return triggered, new_state, details

    def _eval_macd_cross(self, alert, indicators):
        """Detect MACD histogram sign flip."""
        macd = indicators["macd"]
        if macd is None:
            return False, alert.last_state or {}, {}

        histogram = macd["histogram"]
        current_sign = "positive" if histogram > 0 else "negative" if histogram < 0 else "zero"
        last_sign = (alert.last_state or {}).get("histogram_sign")
        new_state = {
            "histogram_sign": current_sign,
            "histogram": round(histogram, 4),
            "macd": round(macd["macd"], 4),
            "signal": round(macd["signal"], 4),
        }

        if last_sign is None:
            return False, new_state, {}

        cross_type = alert.config["cross_type"]
        triggered = False
        if cross_type == "bullish" and current_sign == "positive" and last_sign == "negative":
            triggered = True
        elif cross_type == "bearish" and current_sign == "negative" and last_sign == "positive":
            triggered = True

        details = {"histogram": round(histogram, 4), "previous_sign": last_sign, "current_sign": current_sign}
        return triggered, new_state, details

    def _eval_bollinger_breach(self, alert, indicators):
        """Detect price breaking outside Bollinger Bands."""
        bb = indicators["bb"]
        if bb is None:
            return False, alert.last_state or {}, {}

        position = bb["position"]
        last_position = (alert.last_state or {}).get("position")
        price = indicators["current_price"]
        new_state = {
            "position": position,
            "upper": round(bb["upper"], 2),
            "lower": round(bb["lower"], 2),
            "price": round(price, 2),
        }

        if last_position is None:
            return False, new_state, {}

        breach_type = alert.config["breach_type"]
        triggered = False
        if breach_type == "upper" and position == "above_upper" and last_position != "above_upper":
            triggered = True
        elif breach_type == "lower" and position == "below_lower" and last_position != "below_lower":
            triggered = True

        details = {
            "price": round(price, 2),
            "upper": round(bb["upper"], 2),
            "lower": round(bb["lower"], 2),
            "position": position,
        }
        return triggered, new_state, details

    def _eval_sar_flip(self, alert, indicators):
        """
        Detect a Parabolic SAR flip (dots crossing from one side of price to the other).

        Whipsaw guard: the flip only fires if the trend it replaced ran for at least
        `min_prior_trend_bars` bars. Rejected flips still update last_state, so a
        choppy stock produces one state change per flip rather than one alert.
        """
        snapshot = _sar_snapshot(indicators)
        if snapshot is None:
            return False, alert.last_state or {}, {}

        position, bars_in_trend, prior_trend_bars, sar_value = snapshot
        price = indicators["current_price"]

        new_state = {
            "sar_position": position,
            "bars_in_trend": bars_in_trend,
            "sar": sar_value,
            "price": round(price, 2),
        }

        last_position = (alert.last_state or {}).get("sar_position")
        if last_position is None or last_position == position:
            return False, new_state, {}

        flip_direction = "bullish_flip" if position == "below" else "bearish_flip"
        wanted = alert.config.get("direction", "any")
        min_prior = alert.config.get("min_prior_trend_bars", 5)

        triggered = (
            (wanted == "any" or wanted == flip_direction)
            and prior_trend_bars >= min_prior
        )

        details = {
            "flip_direction": flip_direction,
            "from_position": last_position,
            "to_position": position,
            "sar": sar_value,
            "price": round(price, 2),
            "prior_trend_bars": prior_trend_bars,
            "min_prior_trend_bars": min_prior,
        }
        return triggered, new_state, details

    # ── Fundamental-based evaluators ─────────────────────────────────

    async def _compute_fundamentals(self, ticker: str) -> Optional[Dict[str, Any]]:
        """Fetch quote, company info, and financials for DCF / Rule-of-40 alerts."""
        try:
            quote, company, financials = await asyncio.gather(
                market_data_service.get_quote(ticker),
                market_data_service.get_company_info(ticker),
                get_company_financials(ticker),
                return_exceptions=True,
            )
            if isinstance(quote, BaseException) or isinstance(company, BaseException):
                return None
            if isinstance(financials, BaseException):
                financials = None

            current_price = float(quote.get("price", 0))
            if current_price == 0:
                return None

            return {
                "current_price": current_price,
                "company": company,
                "financials": financials,
            }
        except Exception as e:
            print(f"   ⚠️  Could not fetch fundamentals for {ticker}: {e}")
            return None

    @staticmethod
    def _compute_dcf_rating(fundamentals: Dict[str, Any]) -> Tuple[Optional[str], float, float]:
        """Calculate DCF rating using sector defaults. Returns (rating_key, margin_of_safety, intrinsic_value)."""
        company = fundamentals["company"]
        fin = fundamentals["financials"]
        current_price = fundamentals["current_price"]

        if fin is None:
            return None, 0.0, 0.0

        sector = company.get("sector", "Other")
        market_cap = company.get("market_cap") or 0

        # Sector defaults
        growth_rate, terminal_growth, discount_rate, projection_years = _SECTOR_DEFAULTS.get(sector, _DEFAULT_PROFILE)

        # Size adjustment
        if market_cap >= 200_000_000_000:
            g_adj, d_adj = -0.01, -0.01
        elif market_cap >= 10_000_000_000:
            g_adj, d_adj = 0, 0
        elif market_cap >= 2_000_000_000:
            g_adj, d_adj = 0.01, 0.01
        elif market_cap >= 300_000_000:
            g_adj, d_adj = 0.02, 0.02
        else:
            g_adj, d_adj = 0.03, 0.03

        growth_rate = max(0.01, min(0.30, growth_rate + g_adj))
        discount_rate = max(0.06, min(0.20, discount_rate + d_adj))

        # Extract FCF
        cash_flow_data = fin.get("cash_flow") or {}
        current_fcf = cash_flow_data.get("free_cash_flow")
        if current_fcf is None:
            current_fcf = cash_flow_data.get("operating_cash_flow")
        if current_fcf is None:
            current_fcf = (market_cap * 0.05) if market_cap else (current_price * 1_000_000)

        # Extract shares outstanding
        income_data = fin.get("income_statement") or {}
        shares = income_data.get("diluted_shares_outstanding")
        if not shares or shares <= 0:
            shares = (market_cap / current_price) if (market_cap and current_price > 0) else 1_000_000

        # Project cash flows
        pv_sum = 0
        last_year_fcf = current_fcf
        for year in range(1, projection_years + 1):
            fcf = current_fcf * ((1 + growth_rate) ** year)
            pv = fcf / ((1 + discount_rate) ** year)
            pv_sum += pv
            last_year_fcf = fcf

        # Terminal value
        if discount_rate <= terminal_growth:
            return None, 0.0, 0.0
        terminal_value = (last_year_fcf * (1 + terminal_growth)) / (discount_rate - terminal_growth)
        terminal_pv = terminal_value / ((1 + discount_rate) ** projection_years)

        # Equity value (with net cash adjustment)
        balance_sheet = fin.get("balance_sheet") or {}
        cash = balance_sheet.get("cash_and_equivalents") or balance_sheet.get("cash") or 0
        debt = balance_sheet.get("total_debt") or balance_sheet.get("long_term_debt") or 0
        enterprise_value = pv_sum + terminal_pv
        equity_value = enterprise_value + (cash - debt)
        intrinsic_value = equity_value / shares

        # Margin of safety & rating
        margin_of_safety = ((intrinsic_value - current_price) / current_price) * 100

        if margin_of_safety > 20:
            rating = "strong_buy"
        elif margin_of_safety > 10:
            rating = "buy"
        elif margin_of_safety > -10:
            rating = "hold"
        elif margin_of_safety > -20:
            rating = "sell"
        else:
            rating = "strong_sell"

        return rating, margin_of_safety, intrinsic_value

    def _eval_dcf_valuation(self, alert, fundamentals):
        """Detect DCF rating transition to target."""
        if fundamentals is None:
            return False, alert.last_state or {}, {}

        rating, mos, iv = self._compute_dcf_rating(fundamentals)
        if rating is None:
            return False, alert.last_state or {}, {}

        last_rating = (alert.last_state or {}).get("rating")
        target_rating = alert.config["target_rating"]

        new_state = {
            "rating": rating,
            "margin_of_safety": round(mos, 2),
            "intrinsic_value": round(iv, 2),
            "current_price": round(fundamentals["current_price"], 2),
        }

        triggered = (
            rating == target_rating
            and last_rating is not None
            and last_rating != target_rating
        )
        details = {
            "from_rating": last_rating,
            "to_rating": rating,
            "margin_of_safety": round(mos, 2),
            "intrinsic_value": round(iv, 2),
            "current_price": round(fundamentals["current_price"], 2),
        }
        return triggered, new_state, details

    def _eval_rule_of_40(self, alert, fundamentals):
        """Detect Rule of 40 crossing threshold."""
        if fundamentals is None:
            return False, alert.last_state or {}, {}

        fin = fundamentals.get("financials")
        if fin is None:
            return False, alert.last_state or {}, {}

        gp = fin.get("growth_profile") or {}
        if gp.get("is_stale"):
            return False, alert.last_state or {}, {}

        r40 = gp.get("rule_of_40")
        if r40 is None:
            return False, alert.last_state or {}, {}

        threshold = alert.config["threshold"]
        direction = alert.config["direction"]
        was_above = (alert.last_state or {}).get("above_threshold")
        currently_above = r40 >= threshold

        new_state = {
            "rule_of_40": r40,
            "above_threshold": currently_above,
            "components": gp.get("rule_of_40_components"),
        }

        if was_above is None:
            return False, new_state, {}

        triggered = False
        if direction == "above" and currently_above and not was_above:
            triggered = True
        elif direction == "below" and not currently_above and was_above:
            triggered = True

        details = {
            "rule_of_40": r40,
            "threshold": threshold,
            "components": gp.get("rule_of_40_components"),
        }
        return triggered, new_state, details

    # ── Trigger & Notifications ───────────────────────────────────────

    async def _trigger_alert(self, db: AsyncSession, alert: TechnicalAlert, trigger_details: dict) -> bool:
        """
        Send SMS/Email/WebSocket notifications, then mark the alert triggered.

        Returns True if the alert was consumed (the user was reached, or there was
        no channel to reach them on). Returns False if every channel failed — the
        caller must then hold `last_state` so the transition is retried next run.
        """
        now = datetime.now(timezone.utc)
        user: User = alert.user
        ticker = alert.ticker

        print(
            f"🔔 TECHNICAL ALERT TRIGGERED: {ticker} "
            f"[{alert.alert_type}] (user: {user.email})"
        )

        # ── 1. Build human-readable summary
        trigger_summary = self._build_trigger_summary(alert.alert_type, alert.config, trigger_details)

        # ── 2. Notify the user BEFORE consuming the alert
        # This alert is one-shot: deactivating it first meant a provider outage
        # destroyed the notification permanently. Track whether any channel
        # actually reached the user, and only consume it if one did.
        attempted = False
        notified = False

        # SMS
        if alert.sms_enabled and user.phone_verified and user.phone_number:
            attempted = True
            try:
                message = build_technical_alert_message(
                    ticker=ticker,
                    alert_type=alert.alert_type,
                    trigger_summary=trigger_summary,
                )
                # Twilio call is synchronous — offload so we don't block the loop
                await asyncio.to_thread(
                    send_alert_sms,
                    phone_e164=user.phone_number,
                    ticker=ticker,
                    message=message,
                )
                notified = True
                print(f"   📱 SMS sent to •••-{user.phone_number[-4:]}")
            except Exception as e:
                print(f"   ❌ SMS failed: {e}")

        # Email
        if EMAIL_ON_TRIGGER:
            attempted = True
            try:
                if await self._send_trigger_email(
                    email=user.email,
                    full_name=user.full_name or user.email.split("@")[0],
                    ticker=ticker,
                    alert_type=alert.alert_type,
                    config=alert.config,
                    trigger_details=trigger_details,
                    trigger_summary=trigger_summary,
                    triggered_at=now,
                ):
                    notified = True
                    print(f"   📧 Email sent to {user.email}")
                else:
                    print(f"   ❌ Email rejected by provider for {user.email}")
            except Exception as e:
                print(f"   ❌ Email failed: {e}")

        # ── 3. Consume the alert only if the user was reached
        # `not attempted` covers the case where no channel is configured at all —
        # there is nothing to wait for, so don't leave it armed forever.
        consumed = notified or not attempted
        if consumed:
            alert.triggered_at = now
            alert.is_active = False
            alert.trigger_details = trigger_details

        # ── 4. Broadcast trigger event to WebSocket clients
        if self._broadcast_fn:
            try:
                await self._broadcast_fn({
                    "type": "technical_alert_triggered",
                    "data": {
                        "alert_id": str(alert.id),
                        "ticker": ticker,
                        "alert_type": alert.alert_type,
                        "trigger_summary": trigger_summary,
                        "trigger_details": trigger_details,
                        "triggered_at": now.isoformat(),
                        "user_id": str(user.id),
                    },
                })
            except Exception as e:
                print(f"   ❌ WS broadcast failed: {e}")

        return consumed

    @staticmethod
    def _build_trigger_summary(alert_type: str, config: dict, details: dict) -> str:
        """Short human-readable trigger summary for notifications."""
        if alert_type == "sentiment_shift":
            return f"outlook shifted from {details.get('from_outlook')} to {details.get('to_outlook')} (score: {details.get('score', '?'):+d})"
        elif alert_type == "ma_crossover":
            label = "Golden Cross" if config.get("cross_type") == "golden_cross" else "Death Cross"
            return f"{label} — SMA20 ${details.get('sma20', '?')} / SMA50 ${details.get('sma50', '?')}"
        elif alert_type == "rsi_extreme":
            return f"RSI crossed {'above' if config.get('direction') == 'above' else 'below'} {config.get('threshold', '?')} — now {details.get('rsi', '?')}"
        elif alert_type == "macd_cross":
            label = "bullish" if config.get("cross_type") == "bullish" else "bearish"
            return f"MACD {label} cross — histogram flipped {details.get('previous_sign')} → {details.get('current_sign')}"
        elif alert_type == "bollinger_breach":
            band = "upper" if config.get("breach_type") == "upper" else "lower"
            return f"broke {band} Bollinger Band — price ${details.get('price', '?')}"
        elif alert_type == "sar_flip":
            label = "bullish" if details.get("flip_direction") == "bullish_flip" else "bearish"
            return (
                f"Parabolic SAR {label} flip — dots now {details.get('to_position')} price "
                f"(SAR ${details.get('sar', '?')} vs ${details.get('price', '?')}, "
                f"prior trend {details.get('prior_trend_bars', '?')} bars)"
            )
        elif alert_type == "dcf_valuation":
            from_r = (details.get("from_rating") or "?").replace("_", " ").title()
            to_r = (details.get("to_rating") or "?").replace("_", " ").title()
            return f"DCF rating shifted {from_r} → {to_r} (MoS: {details.get('margin_of_safety', '?')}%)"
        elif alert_type == "rule_of_40":
            r40 = details.get("rule_of_40", "?")
            threshold = details.get("threshold", 40)
            direction = "above" if config.get("direction") == "above" else "below"
            return f"Rule of 40 crossed {direction} {threshold} — now {r40}"
        return "indicator alert triggered"

    @staticmethod
    async def _send_trigger_email(
        email: str,
        full_name: str,
        ticker: str,
        alert_type: str,
        config: dict,
        trigger_details: dict,
        trigger_summary: str,
        triggered_at: datetime,
    ) -> bool:
        """
        Send a styled HTML email when a technical alert triggers.

        Routed through EmailService so every outbound path shares one provider,
        one sender identity, and one place to swap providers. Returns True only
        if the provider accepted the message — the caller relies on this to
        decide whether the alert may be consumed.
        """
        from app.schemas.technical_alert import ALERT_TYPE_LABELS

        type_label = ALERT_TYPE_LABELS.get(alert_type, alert_type)
        subject = f"📊 Alert: {ticker} — {type_label}"

        html = f"""
        <div style="max-width:600px;margin:0 auto;font-family:system-ui,sans-serif;background:#1f2937;color:#f9fafb;border-radius:12px;overflow:hidden;">
          <div style="background:linear-gradient(135deg,#2dd4bf,#0d9488);padding:24px;text-align:center;">
            <h1 style="margin:0;font-size:24px;color:#fff;">📊 Technical Alert</h1>
            <p style="margin:8px 0 0;color:rgba(255,255,255,0.85);font-size:14px;">{ticker} — {type_label}</p>
          </div>
          <div style="padding:24px;">
            <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
              <tr>
                <td style="padding:8px 12px;color:#9ca3af;border-bottom:1px solid #374151;">Ticker</td>
                <td style="padding:8px 12px;font-weight:600;border-bottom:1px solid #374151;">{ticker}</td>
              </tr>
              <tr>
                <td style="padding:8px 12px;color:#9ca3af;border-bottom:1px solid #374151;">Alert Type</td>
                <td style="padding:8px 12px;font-weight:600;border-bottom:1px solid #374151;">{type_label}</td>
              </tr>
              <tr>
                <td style="padding:8px 12px;color:#9ca3af;border-bottom:1px solid #374151;">What Happened</td>
                <td style="padding:8px 12px;font-weight:600;border-bottom:1px solid #374151;">{trigger_summary}</td>
              </tr>
              <tr>
                <td style="padding:8px 12px;color:#9ca3af;">Triggered At</td>
                <td style="padding:8px 12px;font-weight:600;">{triggered_at.strftime('%b %d, %Y %I:%M %p')} UTC</td>
              </tr>
            </table>
            <div style="text-align:center;margin-top:20px;">
              <a href="{settings.FRONTEND_URL}/technical-analysis?ticker={ticker}"
                 style="display:inline-block;background:#2dd4bf;color:#111827;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;">
                View Technical Analysis
              </a>
            </div>
            <p style="margin-top:20px;color:#6b7280;font-size:12px;text-align:center;">
              This alert has been deactivated. Create a new one to continue monitoring.
            </p>
          </div>
        </div>
        """

        # send_email is synchronous — offload so we don't block the loop.
        # No from_email_override: alerts keep sending as FROM_EMAIL.
        return await asyncio.to_thread(
            email_service.send_email,
            to_email=email,
            subject=subject,
            html_content=html,
        )

    # ── Initial state seeding ─────────────────────────────────────────

    async def seed_initial_state(self, ticker: str, alert_type: str, config: dict) -> dict:
        """
        Compute the current indicator state for a newly created alert.
        Called at alert creation time so the first cron run can detect transitions.
        """
        # Fundamental-based types don't need historical price indicators
        if alert_type in FUNDAMENTAL_ALERT_TYPES:
            return await self._seed_fundamental_state(ticker, alert_type, config)

        indicators = await self._compute_indicators(ticker)
        if indicators is None:
            return {}

        # Build the last_state dict that would be produced by _evaluate_alert
        if alert_type == "sentiment_shift":
            return {"outlook": indicators["summary"]["outlook"], "score": indicators["summary"]["score"]}

        elif alert_type == "ma_crossover":
            ma = indicators["ma"]
            sma20 = ma.get("sma_20") if ma else None
            sma50 = ma.get("sma_50") if ma else None
            if sma20 is None or sma50 is None:
                return {}
            return {"sma20_above_sma50": sma20 > sma50, "sma20": round(sma20, 2), "sma50": round(sma50, 2)}

        elif alert_type == "rsi_extreme":
            rsi = indicators["rsi"]
            if rsi is None:
                return {}
            return {"rsi": round(rsi, 2)}

        elif alert_type == "macd_cross":
            macd = indicators["macd"]
            if macd is None:
                return {}
            histogram = macd["histogram"]
            sign = "positive" if histogram > 0 else "negative" if histogram < 0 else "zero"
            return {
                "histogram_sign": sign,
                "histogram": round(histogram, 4),
                "macd": round(macd["macd"], 4),
                "signal": round(macd["signal"], 4),
            }

        elif alert_type == "bollinger_breach":
            bb = indicators["bb"]
            if bb is None:
                return {}
            return {
                "position": bb["position"],
                "upper": round(bb["upper"], 2),
                "lower": round(bb["lower"], 2),
                "price": round(indicators["current_price"], 2),
            }

        elif alert_type == "sar_flip":
            snapshot = _sar_snapshot(indicators)
            if snapshot is None:
                return {}
            position, bars_in_trend, _prior, sar_value = snapshot
            return {
                "sar_position": position,
                "bars_in_trend": bars_in_trend,
                "sar": sar_value,
                "price": round(indicators["current_price"], 2),
            }

        return {}

    async def _seed_fundamental_state(self, ticker: str, alert_type: str, config: dict) -> dict:
        """Seed initial state for fundamental-based alert types."""
        fundamentals = await self._compute_fundamentals(ticker)
        if fundamentals is None:
            return {}

        if alert_type == "dcf_valuation":
            rating, mos, iv = self._compute_dcf_rating(fundamentals)
            if rating is None:
                return {}
            return {
                "rating": rating,
                "margin_of_safety": round(mos, 2),
                "intrinsic_value": round(iv, 2),
                "current_price": round(fundamentals["current_price"], 2),
            }

        elif alert_type == "rule_of_40":
            fin = fundamentals.get("financials")
            if fin is None:
                return {}
            gp = fin.get("growth_profile") or {}
            r40 = gp.get("rule_of_40")
            if r40 is None:
                return {}
            threshold = config.get("threshold", 40)
            return {
                "rule_of_40": r40,
                "above_threshold": r40 >= threshold,
                "components": gp.get("rule_of_40_components"),
            }

        return {}


# Global instance
technical_alert_checker = TechnicalAlertChecker()
