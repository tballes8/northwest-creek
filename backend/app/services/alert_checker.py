"""
Alert Checker Service — Background price alert monitoring

Hooks into the LivePriceService's price stream to check active alerts
against real-time prices. When an alert triggers:
  1. Sets triggered_at + is_active=False in the DB
  2. Sends SMS via Twilio (if sms_enabled + phone verified)
  3. Sends email notification via SendGrid
  4. Broadcasts a trigger event over the WebSocket to the user's browser

Throttled to one check per ticker per THROTTLE_SECONDS to avoid
hammering the database on every single trade tick.

Usage (in main.py startup):
    from app.services.alert_checker import alert_checker
    from app.services.websocket_service import live_price_service

    @app.on_event("startup")
    async def startup():
        alert_checker.set_broadcast_fn(live_price_service.broadcast_to_clients)
        live_price_service.on_price_update = alert_checker.on_price_update
        await alert_checker.load_alert_tickers(live_price_service)
        await live_price_service.start()
"""
import asyncio
from datetime import datetime, timezone
from decimal import Decimal
from typing import Callable, Dict, Optional, Set

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import get_settings
from app.db.session import async_session as AsyncSessionLocal
from app.db.models import User, PriceAlert
from app.services.sms_service import send_alert_sms, build_price_alert_message

settings = get_settings()

# ── Configuration ────────────────────────────────────────────

THROTTLE_SECONDS = 15  # Min seconds between checks for the same ticker
EMAIL_ON_TRIGGER = True  # Send email notification on every trigger


class AlertChecker:
    """
    Monitors the WebSocket price stream and fires alerts when conditions are met.

    Integration points:
    - on_price_update(ticker, price)  — called by websocket_service on each trade
    - load_alert_tickers(service)     — subscribes the WS to all alert tickers at startup
    - set_broadcast_fn(fn)            — sets the callback for WebSocket push notifications
    """

    def __init__(self):
        self._last_check: Dict[str, float] = {}  # ticker → last check epoch
        self._broadcast_fn: Optional[Callable] = None
        self._processing: Set[str] = set()  # tickers currently being checked (prevent overlap)

    def set_broadcast_fn(self, fn: Callable):
        """Set the WebSocket broadcast function for real-time UI notifications."""
        self._broadcast_fn = fn

    # ── Main entry point (called per trade tick) ─────────────

    async def on_price_update(self, ticker: str, price: float):
        """
        Called by websocket_service every time a trade comes in.
        Throttles and delegates to the actual DB check.
        """
        now = asyncio.get_event_loop().time()
        last = self._last_check.get(ticker, 0)

        if now - last < THROTTLE_SECONDS:
            return

        # Prevent overlapping checks for the same ticker
        if ticker in self._processing:
            return

        self._last_check[ticker] = now
        self._processing.add(ticker)

        try:
            await self._check_alerts_for_ticker(ticker, price)
        except Exception as e:
            print(f"❌ AlertChecker error for {ticker}: {e}")
        finally:
            self._processing.discard(ticker)

    # ── Core alert check logic ───────────────────────────────

    async def _check_alerts_for_ticker(self, ticker: str, current_price: float):
        """
        Query all active alerts for this ticker, evaluate conditions,
        trigger any that match.
        """
        async with AsyncSessionLocal() as db:
            try:
                # Fetch active, un-triggered alerts for this ticker with their user
                result = await db.execute(
                    select(PriceAlert)
                    .options(selectinload(PriceAlert.user))
                    .where(
                        PriceAlert.ticker == ticker,
                        PriceAlert.is_active == True,
                        PriceAlert.triggered_at == None,
                    )
                )
                alerts = result.scalars().all()

                if not alerts:
                    return

                for alert in alerts:
                    triggered = self._evaluate_condition(
                        condition=alert.condition,
                        target_price=float(alert.target_price),
                        current_price=current_price,
                    )

                    if triggered:
                        await self._trigger_alert(db, alert, current_price)

                await db.commit()

            except Exception as e:
                await db.rollback()
                print(f"❌ AlertChecker DB error for {ticker}: {e}")
                raise

    @staticmethod
    def _evaluate_condition(condition: str, target_price: float, current_price: float) -> bool:
        """Check if the alert condition is met."""
        if condition == "above":
            return current_price >= target_price
        elif condition == "below":
            return current_price <= target_price
        return False

    async def _trigger_alert(self, db: AsyncSession, alert: PriceAlert, current_price: float):
        """
        Mark alert as triggered, send notifications.
        """
        now = datetime.now(timezone.utc)
        user: User = alert.user
        ticker = alert.ticker
        target_price = float(alert.target_price)
        condition = alert.condition

        print(
            f"🔔 ALERT TRIGGERED: {ticker} "
            f"{'above' if condition == 'above' else 'below'} "
            f"${target_price:.2f} → current ${current_price:.2f} "
            f"(user: {user.email})"
        )

        # ── 1. Update DB ─────────────────────────────────────
        alert.triggered_at = now
        alert.is_active = False

        # ── 2. Send SMS (fire-and-forget) ────────────────────
        if alert.sms_enabled and user.phone_verified and user.phone_number:
            try:
                message = build_price_alert_message(
                    ticker=ticker,
                    current_price=current_price,
                    target_price=target_price,
                    condition=condition,
                )
                send_alert_sms(
                    phone_e164=user.phone_number,
                    ticker=ticker,
                    message=message,
                )
                print(f"   📱 SMS sent to •••-{user.phone_number[-4:]}")
            except Exception as e:
                print(f"   ❌ SMS failed: {e}")

        # ── 3. Send email notification ───────────────────────
        if EMAIL_ON_TRIGGER:
            try:
                await self._send_trigger_email(
                    email=user.email,
                    full_name=user.full_name or user.email.split("@")[0],
                    ticker=ticker,
                    condition=condition,
                    target_price=target_price,
                    current_price=current_price,
                    triggered_at=now,
                )
                print(f"   📧 Email sent to {user.email}")
            except Exception as e:
                print(f"   ❌ Email failed: {e}")

        # ── 4. Broadcast trigger event to WebSocket clients ──
        if self._broadcast_fn:
            try:
                await self._broadcast_fn({
                    "type": "alert_triggered",
                    "data": {
                        "alert_id": str(alert.id),
                        "ticker": ticker,
                        "condition": condition,
                        "target_price": target_price,
                        "current_price": current_price,
                        "triggered_at": now.isoformat(),
                        "user_id": str(user.id),
                    },
                })
            except Exception as e:
                print(f"   ❌ WS broadcast failed: {e}")

    # ── Email notification ───────────────────────────────────

    @staticmethod
    async def _send_trigger_email(
        email: str,
        full_name: str,
        ticker: str,
        condition: str,
        target_price: float,
        current_price: float,
        triggered_at: datetime,
    ):
        """
        Send a styled HTML email when an alert triggers.
        Uses SendGrid via the existing config.
        """
        try:
            from sendgrid import SendGridAPIClient
            from sendgrid.helpers.mail import Mail, Email, To, Content, HtmlContent
        except ImportError:
            print("   ⚠️  sendgrid not installed — skipping email")
            return

        if not settings.SENDGRID_API_KEY:
            print("   ⚠️  SENDGRID_API_KEY not set — skipping email")
            return

        direction = "rose above" if condition == "above" else "dropped below"
        direction_emoji = "📈" if condition == "above" else "📉"
        time_str = triggered_at.strftime("%B %d, %Y at %I:%M %p UTC")

        subject = f"{direction_emoji} Alert: {ticker} {direction} ${target_price:.2f}"

        html_body = f"""
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: linear-gradient(135deg, #0d9488, #7c3aed); padding: 24px; border-radius: 12px 12px 0 0; text-align: center;">
                <h1 style="color: white; margin: 0; font-size: 24px;">
                    {direction_emoji} Price Alert Triggered
                </h1>
            </div>
            
            <div style="background: #ffffff; border: 1px solid #e5e7eb; border-top: none; padding: 24px; border-radius: 0 0 12px 12px;">
                <p style="color: #374151; font-size: 16px; margin-top: 0;">
                    Hi {full_name},
                </p>
                
                <p style="color: #374151; font-size: 16px;">
                    Your price alert for <strong>{ticker}</strong> has been triggered.
                </p>
                
                <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin: 20px 0;">
                    <table style="width: 100%; border-collapse: collapse;">
                        <tr>
                            <td style="color: #6b7280; padding: 6px 0; font-size: 14px;">Ticker</td>
                            <td style="color: #111827; padding: 6px 0; font-size: 14px; font-weight: 600; text-align: right;">{ticker}</td>
                        </tr>
                        <tr>
                            <td style="color: #6b7280; padding: 6px 0; font-size: 14px;">Condition</td>
                            <td style="color: #111827; padding: 6px 0; font-size: 14px; font-weight: 600; text-align: right;">{condition.title()} ${target_price:.2f}</td>
                        </tr>
                        <tr>
                            <td style="color: #6b7280; padding: 6px 0; font-size: 14px;">Current Price</td>
                            <td style="color: {'#059669' if condition == 'above' else '#dc2626'}; padding: 6px 0; font-size: 18px; font-weight: 700; text-align: right;">${current_price:.2f}</td>
                        </tr>
                        <tr>
                            <td style="color: #6b7280; padding: 6px 0; font-size: 14px;">Triggered At</td>
                            <td style="color: #111827; padding: 6px 0; font-size: 14px; text-align: right;">{time_str}</td>
                        </tr>
                    </table>
                </div>
                
                <div style="text-align: center; margin: 24px 0;">
                    <a href="{settings.FRONTEND_URL}/stocks?ticker={ticker}" 
                       style="display: inline-block; background: linear-gradient(135deg, #0d9488, #0f766e); color: white; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 600; font-size: 14px;">
                        View {ticker} on Northwest Creek
                    </a>
                </div>
                
                <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
                
                <p style="color: #9ca3af; font-size: 12px; text-align: center; margin-bottom: 0;">
                    This alert has been automatically deactivated. You can create a new alert from your 
                    <a href="{settings.FRONTEND_URL}/alerts" style="color: #0d9488;">Alerts dashboard</a>.
                </p>
            </div>
        </div>
        """

        try:
            sg = SendGridAPIClient(settings.SENDGRID_API_KEY)
            message = Mail(
                from_email=(settings.FROM_EMAIL, settings.FROM_NAME),
                to_emails=email,
                subject=subject,
                html_content=html_body,
            )
            sg.send(message)
        except Exception as e:
            print(f"   ❌ SendGrid error: {e}")

    # ── Startup: subscribe to alert tickers ──────────────────

    async def load_alert_tickers(self, price_service):
        """
        At app startup, query all active alert tickers and subscribe
        the WebSocket to them so we get price updates.
        """
        try:
            async with AsyncSessionLocal() as db:
                result = await db.execute(
                    select(PriceAlert.ticker)
                    .where(
                        PriceAlert.is_active == True,
                        PriceAlert.triggered_at == None,
                    )
                    .distinct()
                )
                tickers = {row[0] for row in result.all()}

            if tickers:
                print(f"🔔 AlertChecker: subscribing to {len(tickers)} alert tickers: {', '.join(sorted(tickers))}")
                await price_service.subscribe_to_tickers(tickers)
            else:
                print("🔔 AlertChecker: no active alerts — no tickers to subscribe")

        except Exception as e:
            print(f"❌ AlertChecker startup error: {e}")

    # ── On-demand: subscribe when a new alert is created ─────

    async def subscribe_new_alert_ticker(self, ticker: str, price_service):
        """
        Called when a user creates a new alert for a ticker we're not
        already watching. Adds it to the WebSocket subscription.
        """
        if ticker not in price_service.subscribed_tickers:
            await price_service.subscribe_to_tickers({ticker})
            print(f"🔔 AlertChecker: added subscription for new alert ticker {ticker}")


# ── Singleton ────────────────────────────────────────────────

alert_checker = AlertChecker()