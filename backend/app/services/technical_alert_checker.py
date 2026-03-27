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
from app.services.market_data import market_data_service
from app.services.technical_indicators import technical_indicators, generate_summary
from app.services.sms_service import send_alert_sms, build_technical_alert_message

settings = get_settings()
EMAIL_ON_TRIGGER = True
FMP_CONCURRENCY = 5  # max parallel FMP requests


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
                    indicators = await self._compute_indicators(ticker)
                    if indicators is None:
                        print(f"   ⚠️  Skipping {ticker}: insufficient data")
                        return

                    for alert in ticker_alerts:
                        triggered, new_state, details = self._evaluate_alert(alert, indicators)

                        # Always update last_state regardless of trigger
                        alert.last_state = new_state

                        if triggered:
                            await self._trigger_alert(db, alert, details)
                            triggered_count += 1

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
        self, alert: TechnicalAlert, indicators: Dict[str, Any]
    ) -> Tuple[bool, dict, dict]:
        """Returns (triggered, new_state, trigger_details)."""
        evaluators = {
            "sentiment_shift": self._eval_sentiment_shift,
            "ma_crossover": self._eval_ma_crossover,
            "rsi_extreme": self._eval_rsi_extreme,
            "macd_cross": self._eval_macd_cross,
            "bollinger_breach": self._eval_bollinger_breach,
        }
        evaluator = evaluators.get(alert.alert_type)
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

    # ── Trigger & Notifications ───────────────────────────────────────

    async def _trigger_alert(self, db: AsyncSession, alert: TechnicalAlert, trigger_details: dict):
        """Mark alert as triggered, send SMS/Email/WebSocket notifications."""
        now = datetime.now(timezone.utc)
        user: User = alert.user
        ticker = alert.ticker

        print(
            f"🔔 TECHNICAL ALERT TRIGGERED: {ticker} "
            f"[{alert.alert_type}] (user: {user.email})"
        )

        # ── 1. Update DB
        alert.triggered_at = now
        alert.is_active = False
        alert.trigger_details = trigger_details

        # ── 2. Build human-readable summary
        trigger_summary = self._build_trigger_summary(alert.alert_type, alert.config, trigger_details)

        # ── 3. Send SMS (fire-and-forget)
        if alert.sms_enabled and user.phone_verified and user.phone_number:
            try:
                message = build_technical_alert_message(
                    ticker=ticker,
                    alert_type=alert.alert_type,
                    trigger_summary=trigger_summary,
                )
                send_alert_sms(
                    phone_e164=user.phone_number,
                    ticker=ticker,
                    message=message,
                )
                print(f"   📱 SMS sent to •••-{user.phone_number[-4:]}")
            except Exception as e:
                print(f"   ❌ SMS failed: {e}")

        # ── 4. Send email notification
        if EMAIL_ON_TRIGGER:
            try:
                await self._send_trigger_email(
                    email=user.email,
                    full_name=user.full_name or user.email.split("@")[0],
                    ticker=ticker,
                    alert_type=alert.alert_type,
                    config=alert.config,
                    trigger_details=trigger_details,
                    trigger_summary=trigger_summary,
                    triggered_at=now,
                )
                print(f"   📧 Email sent to {user.email}")
            except Exception as e:
                print(f"   ❌ Email failed: {e}")

        # ── 5. Broadcast trigger event to WebSocket clients
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
    ):
        """Send a styled HTML email when a technical alert triggers."""
        try:
            from sendgrid import SendGridAPIClient
            from sendgrid.helpers.mail import Mail
        except ImportError:
            print("   ⚠️  sendgrid not installed — skipping email")
            return

        if not settings.SENDGRID_API_KEY:
            print("   ⚠️  SENDGRID_API_KEY not set — skipping email")
            return

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
              <a href="https://nwc-analytics.com/technical-analysis?ticker={ticker}"
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

        msg = Mail(
            from_email=settings.FROM_EMAIL,
            to_emails=email,
            subject=subject,
            html_content=html,
        )

        sg = SendGridAPIClient(settings.SENDGRID_API_KEY)
        sg.send(msg)

    # ── Initial state seeding ─────────────────────────────────────────

    async def seed_initial_state(self, ticker: str, alert_type: str, config: dict) -> dict:
        """
        Compute the current indicator state for a newly created alert.
        Called at alert creation time so the first cron run can detect transitions.
        """
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

        return {}


# Global instance
technical_alert_checker = TechnicalAlertChecker()
