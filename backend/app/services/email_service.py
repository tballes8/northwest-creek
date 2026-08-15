"""
Email Service - Send verification and notification emails using Postmark

This is the single outbound send path for the whole app. Every email — account
verification, password reset, payment, price alerts, technical alerts — goes
through EmailService.send_email(), so there is exactly one place to configure
the provider, the sender identity, and error handling.
"""
import logging

import requests

from app.config import get_settings
from app.core.tier_limits import TIER_LIMITS

logger = logging.getLogger(__name__)

POSTMARK_SEND_URL = "https://api.postmarkapp.com/email"
POSTMARK_TIMEOUT_SECONDS = 10

# Use get_settings() lazily to avoid circular imports at module load
_settings = None

def _get_settings():
    global _settings
    if _settings is None:
        _settings = get_settings()
    return _settings


class EmailService:
    def __init__(self):
        # Lazy init — settings may not be ready at import time
        self._token = None
        self._initialized = False

    def _ensure_initialized(self):
        """Lazy initialization of Postmark configuration"""
        if self._initialized:
            return
        self._initialized = True

        settings = _get_settings()
        self._token = settings.POSTMARK_SERVER_TOKEN
        self.message_stream = settings.POSTMARK_MESSAGE_STREAM
        self.from_email = settings.FROM_EMAIL
        self.support_email = settings.SUPPORT_EMAIL
        self.sales_email = settings.SALES_EMAIL
        self.from_name = settings.FROM_NAME

        if self._token:
            logger.info(
                "Postmark initialized (stream: %s, default: %s, support: %s, sales: %s)",
                self.message_stream, self.from_email, self.support_email, self.sales_email,
            )
        else:
            logger.error("POSTMARK_SERVER_TOKEN not configured — emails will NOT send")

    def send_email(self, to_email: str, subject: str, html_content: str, from_email_override: str = None) -> bool:
        """
        Send an email via Postmark. Optionally override the from address.

        Synchronous by design — async callers wrap this in asyncio.to_thread so
        they don't block the event loop. Returns True only when Postmark accepted
        the message; callers rely on that to decide whether to report success.
        """
        self._ensure_initialized()

        if not self._token:
            logger.error("Cannot send email to %s: Postmark not configured", to_email)
            return False

        sender = from_email_override or self.from_email
        if not sender:
            logger.error(
                "Cannot send email to %s: no sender address configured "
                "(FROM_EMAIL / SUPPORT_EMAIL / SALES_EMAIL)",
                to_email,
            )
            return False

        try:
            response = requests.post(
                POSTMARK_SEND_URL,
                headers={
                    "Accept": "application/json",
                    "Content-Type": "application/json",
                    "X-Postmark-Server-Token": self._token,
                },
                json={
                    "From": f"{self.from_name} <{sender}>" if self.from_name else sender,
                    "To": to_email,
                    "Subject": subject,
                    "HtmlBody": html_content,
                    "MessageStream": self.message_stream,
                },
                timeout=POSTMARK_TIMEOUT_SECONDS,
            )

            # Postmark returns 200 with ErrorCode 0 on success. Anything else is a
            # failure, and the ErrorCode is far more actionable than the status alone
            # (e.g. 406 = recipient suppressed after a prior bounce/spam complaint,
            # 400/401 = sender signature not confirmed for this domain).
            try:
                body = response.json()
            except ValueError:
                body = {}

            error_code = body.get("ErrorCode")
            if response.status_code == 200 and error_code == 0:
                logger.info("Email sent to %s (MessageID: %s)", to_email, body.get("MessageID", "n/a"))
                return True

            logger.error(
                "Postmark rejected email to %s (HTTP %s, ErrorCode %s): %s",
                to_email, response.status_code, error_code,
                body.get("Message", response.text[:200]),
            )
            return False

        except requests.Timeout:
            logger.error("Timed out after %ss sending email to %s", POSTMARK_TIMEOUT_SECONDS, to_email)
            return False
        except Exception as e:
            logger.error("Failed to send email to %s: %s", to_email, e)
            return False
    
    def send_verification_email(self, to_email: str, verification_token: str, user_name: str, selected_tier: str = "beginner") -> bool:
        """Send account verification email with tier-specific features"""
        self._ensure_initialized()
        settings = _get_settings()
        
        # Embed selected tier in the verification URL so frontend can redirect to Stripe after verification
        tier_param = f"&tier={selected_tier}" if selected_tier else "&tier=beginner"
        verification_url = f"{settings.FRONTEND_URL}/verify-email?token={verification_token}{tier_param}"
        
        # Never log verification_url — it embeds the token, which is a bearer
        # credential for taking over the account.
        logger.info("Sending verification email to %s (tier=%s)", to_email, selected_tier)
        
        # Build dynamic features list from TIER_LIMITS
        limits = TIER_LIMITS.get(selected_tier, TIER_LIMITS.get("beginner", {}))
        tier_display = {
            "beginner": "Beginner",
            "casual": "Casual Investor",
            "active": "Active Investor",
            "professional": "Professional"
        }.get(selected_tier, "Beginner")
        
        review_period = {
            "beginner": "total",
            "casual": "per week",
            "active": "per day",
            "professional": "per day"
        }.get(selected_tier, "total")
        
        features_html = f'<li>✅ Track up to {limits["watchlist_stocks"]} stocks in your watchlist</li>\n'
        features_html += f'                            <li>✅ Monitor {limits["portfolio_entries"]} portfolio positions</li>\n'
        features_html += f'                            <li>✅ {limits["stock_reviews"]} stock reviews {review_period}</li>\n'
        
        if limits["alerts"] > 0:
            features_html += f'                            <li>✅ {limits["alerts"]} price alerts</li>\n'
        
        if limits["dcf_valuations"] > 0:
            features_html += f'                            <li>✅ {limits["dcf_valuations"]} DCF valuations {review_period}</li>\n'
        
        if limits["technical_analysis"]:
            features_html += '                            <li>✅ Advanced technical analysis (15+ indicators)</li>\n'
        
        features_html += '                            <li>✅ Real-time market data and quotes</li>'
        
        html_content = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body {{ 
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
                    line-height: 1.6; 
                    color: #333;
                    margin: 0;
                    padding: 0;
                    background-color: #f3f4f6;
                }}
                .container {{ 
                    max-width: 600px; 
                    margin: 40px auto; 
                    background-color: #ffffff;
                    border-radius: 8px;
                    overflow: hidden;
                    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
                }}
                .header {{ 
                    background: linear-gradient(135deg, #0d9488 0%, #14b8a6 100%); 
                    color: white; 
                    padding: 40px 30px; 
                    text-align: center; 
                }}
                .header h1 {{
                    margin: 0;
                    font-size: 28px;
                    font-weight: 700;
                }}
                .content {{ 
                    padding: 40px 30px; 
                }}
                .content p {{
                    margin: 0 0 16px 0;
                    color: #374151;
                }}
                .button {{ 
                    display: inline-block; 
                    background: #0d9488; 
                    color: white; 
                    padding: 14px 32px; 
                    text-decoration: none; 
                    border-radius: 6px; 
                    font-weight: 600; 
                    margin: 24px 0;
                    transition: background 0.3s;
                }}
                .button:hover {{
                    background: #0f766e;
                }}
                .link-box {{
                    background: #f3f4f6;
                    padding: 16px;
                    border-radius: 6px;
                    word-break: break-all;
                    margin: 20px 0;
                    border-left: 4px solid #0d9488;
                }}
                .link-box p {{
                    margin: 0;
                    font-size: 13px;
                    color: #6b7280;
                }}
                .features {{
                    background: #f9fafb;
                    padding: 24px;
                    border-radius: 6px;
                    margin: 24px 0;
                }}
                .features ul {{
                    margin: 0;
                    padding-left: 20px;
                }}
                .features li {{
                    margin: 8px 0;
                    color: #374151;
                }}
                .footer {{ 
                    text-align: center; 
                    padding: 30px; 
                    background: #f9fafb;
                    color: #6b7280; 
                    font-size: 14px; 
                    border-top: 1px solid #e5e7eb;
                }}
                .footer p {{
                    margin: 4px 0;
                }}
                .warning {{
                    background: #fef3c7;
                    border-left: 4px solid #f59e0b;
                    padding: 12px 16px;
                    border-radius: 4px;
                    margin: 20px 0;
                }}
                .warning p {{
                    margin: 0;
                    color: #92400e;
                    font-size: 14px;
                }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>🎉 Welcome to NWC-Analytics!</h1>
                </div>
                <div class="content">
                    <p><strong>Hi {user_name},</strong></p>
                    
                    <p>Thank you for registering with NWC-Analytics — your intelligent stock analysis platform!</p>
                    
                    <p>To complete your registration and activate your account, please verify your email address by clicking the button below:</p>
                    
                    <div style="text-align: center;">
                        <a href="{verification_url}" class="button">✓ Verify Email Address</a>
                    </div>
                    
                    <p style="font-size: 14px; color: #6b7280;">Or copy and paste this link into your browser:</p>
                    <div class="link-box">
                        <p>{verification_url}</p>
                    </div>
                    
                    <div class="warning">
                        <p><strong>⏰ This link will expire in 24 hours.</strong></p>
                        <p style="margin-top: 8px;">After verifying your email, you'll be asked to enter a payment method to activate your account. <strong>You will not be charged if you cancel before your 14-day free trial ends.</strong></p>
                    </div>
                    
                    <div class="features">
                        <p><strong>Your {tier_display} plan includes:</strong></p>
                        <ul>
                            {features_html}
                        </ul>
                    </div>
                    
                    <p style="margin-top: 24px; font-size: 14px; color: #6b7280;">
                        If you didn't create an account with NWC-Analytics, you can safely ignore this email.
                    </p>
                    
                    <p style="margin-top: 32px;"><strong>Best regards,</strong><br>The NWC-Analytics Team</p>
                </div>
                <div class="footer">
                    <p><strong>NWC-Analytics</strong></p>
                    <p>Intelligent Stock Analysis & Portfolio Management</p>
                    <p style="margin-top: 12px;">This is an automated email, please do not reply.</p>
                </div>
            </div>
        </body>
        </html>
        """
        
        return self.send_email(
            to_email=to_email,
            subject="🎉 Verify Your NWC-Analytics Account",
            html_content=html_content,
            from_email_override=self.support_email
        )


    # ---- Payment Success / Subscription Confirmation Email ----
    
    def send_payment_success_email(self, to_email: str, user_name: str, plan_name: str, tier: str) -> bool:
        """Send subscription confirmation email after successful payment"""
        self._ensure_initialized()
        settings = _get_settings()
        dashboard_url = f"{settings.FRONTEND_URL}/dashboard"
        
        logger.info("Sending payment success email to %s (plan=%s)", to_email, plan_name)
        
        # Build features list for the purchased tier
        limits = TIER_LIMITS.get(tier, TIER_LIMITS.get("casual", {}))
        review_period = {
            "casual": "per week", "active": "per day", "professional": "per day"
        }.get(tier, "per week")
        
        price = {"beginner": "$10", "casual": "$20", "active": "$40", "professional": "$50"}.get(tier, "")
        
        features_html = f'<li>✅ Track up to {limits.get("watchlist_stocks", 20)} stocks in your watchlist</li>\n'
        features_html += f'                            <li>✅ Monitor {limits.get("portfolio_entries", 20)} portfolio positions</li>\n'
        features_html += f'                            <li>✅ {limits.get("stock_reviews", 5)} stock reviews {review_period}</li>\n'
        if limits.get("alerts", 0) > 0:
            features_html += f'                            <li>✅ {limits["alerts"]} price alerts</li>\n'
        if limits.get("dcf_valuations", 0) > 0:
            features_html += f'                            <li>✅ {limits["dcf_valuations"]} DCF valuations {review_period}</li>\n'
        if limits.get("technical_analysis", False):
            features_html += '                            <li>✅ Advanced technical analysis (15+ indicators)</li>\n'
        features_html += '                            <li>✅ Real-time market data and quotes</li>'
        
        html_content = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body {{ 
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
                    line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f3f4f6;
                }}
                .container {{ 
                    max-width: 600px; margin: 40px auto; background-color: #ffffff;
                    border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
                }}
                .header {{ 
                    background: linear-gradient(135deg, #0d9488 0%, #14b8a6 100%); 
                    color: white; padding: 40px 30px; text-align: center; 
                }}
                .header h1 {{ margin: 0; font-size: 28px; font-weight: 700; }}
                .content {{ padding: 40px 30px; }}
                .content p {{ margin: 0 0 16px 0; color: #374151; }}
                .button {{ 
                    display: inline-block; background: #0d9488; color: white; 
                    padding: 14px 32px; text-decoration: none; border-radius: 6px; 
                    font-weight: 600; margin: 24px 0;
                }}
                .features {{
                    background: #f9fafb; padding: 24px; border-radius: 6px; margin: 24px 0;
                }}
                .features ul {{ margin: 0; padding-left: 20px; }}
                .features li {{ margin: 8px 0; color: #374151; }}
                .footer {{ 
                    text-align: center; padding: 30px; background: #f9fafb;
                    color: #6b7280; font-size: 14px; border-top: 1px solid #e5e7eb;
                }}
                .footer p {{ margin: 4px 0; }}
                .success-box {{
                    background: #ecfdf5; border-left: 4px solid #10b981;
                    padding: 16px; border-radius: 4px; margin: 20px 0;
                }}
                .success-box p {{ margin: 0; color: #065f46; font-size: 14px; }}
                .plan-badge {{
                    display: inline-block; background: #0d9488; color: white;
                    padding: 6px 16px; border-radius: 20px; font-weight: 600; font-size: 14px;
                }}
                .details-box {{
                    background: #f9fafb; border-radius: 6px; padding: 20px; margin: 24px 0;
                }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>🎉 Payment Successful!</h1>
                </div>
                <div class="content">
                    <p><strong>Hi {user_name},</strong></p>
                    
                    <div class="success-box">
                        <p><strong>Your subscription is now active!</strong></p>
                        <p style="margin-top: 8px;">You've been upgraded to the <span class="plan-badge">{plan_name}</span> plan.</p>
                    </div>
                    
                    <p>Thank you for subscribing to NWC-Analytics! Your {plan_name} subscription ({price}/month) is now active and all premium features have been unlocked.</p>
                    
                    <div class="features">
                        <p><strong>Your {plan_name} plan includes:</strong></p>
                        <ul>
                            {features_html}
                        </ul>
                    </div>
                    
                    <div style="text-align: center;">
                        <a href="{dashboard_url}" class="button">Go to Dashboard →</a>
                    </div>
                    
                    <div class="details-box">
                        <p style="margin: 0 0 8px 0; font-weight: 600; color: #1f2937;">Subscription Details</p>
                        <p style="margin: 4px 0; font-size: 14px;"><strong>Plan:</strong> {plan_name}</p>
                        <p style="margin: 4px 0; font-size: 14px;"><strong>Amount:</strong> {price}/month</p>
                        <p style="margin: 4px 0; font-size: 14px;"><strong>Billing:</strong> Monthly, auto-renewal</p>
                        <p style="margin: 8px 0 0 0; font-size: 13px; color: #6b7280;">
                            You can manage your subscription anytime from your account settings. Cancel anytime — no questions asked.
                        </p>
                    </div>
                    
                    <p style="margin-top: 24px; font-size: 14px; color: #6b7280;">
                        Questions about your subscription? Contact us at 
                        <a href="mailto:support@nwc-analytics.com" style="color: #0d9488;">support@nwc-analytics.com</a>
                    </p>
                    
                    <p style="margin-top: 32px;"><strong>Happy investing!</strong><br>The NWC-Analytics Team</p>
                </div>
                <div class="footer">
                    <p><strong>NWC-Analytics</strong></p>
                    <p>Intelligent Stock Analysis & Portfolio Management</p>
                    <p style="margin-top: 12px;">This is an automated email, please do not reply.</p>
                </div>
            </div>
        </body>
        </html>
        """
        
        return self.send_email(
            to_email=to_email,
            subject=f"✅ Welcome to {plan_name} — Your Subscription is Active!",
            html_content=html_content,
            from_email_override=self.sales_email
        )
    
    def send_password_reset_email(self, to_email: str, reset_token: str, user_name: str) -> bool:
        """
        Send a password reset email with a tokenized link.
        The link points to /reset-password?token=<token> on the frontend.
        Token expires in 1 hour (enforced server-side).
        """
        self._ensure_initialized()
        settings = _get_settings()
        reset_url = f"{settings.FRONTEND_URL}/reset-password?token={reset_token}"

        # Never log reset_url — it embeds the token, which is a bearer credential
        # for taking over the account.
        logger.info("Sending password reset email to %s", to_email)

        html_content = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body {{ 
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
                    line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f3f4f6;
                }}
                .container {{ 
                    max-width: 600px; margin: 40px auto; background-color: #ffffff;
                    border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
                }}
                .header {{ 
                    background: linear-gradient(135deg, #0d9488 0%, #14b8a6 100%); 
                    color: white; padding: 40px 30px; text-align: center; 
                }}
                .header h1 {{ margin: 0; font-size: 28px; font-weight: 700; }}
                .content {{ padding: 40px 30px; }}
                .content p {{ margin: 0 0 16px 0; color: #374151; }}
                .button {{ 
                    display: inline-block; background: #0d9488; color: white; 
                    padding: 14px 32px; text-decoration: none; border-radius: 6px; 
                    font-weight: 600; margin: 24px 0;
                }}
                .link-box {{
                    background: #f3f4f6; padding: 16px; border-radius: 6px;
                    word-break: break-all; margin: 20px 0; border-left: 4px solid #0d9488;
                }}
                .link-box p {{ margin: 0; font-size: 13px; color: #6b7280; }}
                .warning {{
                    background: #fef3c7; border-left: 4px solid #f59e0b;
                    padding: 12px 16px; border-radius: 4px; margin: 20px 0;
                }}
                .warning p {{ margin: 0; color: #92400e; font-size: 14px; }}
                .footer {{ 
                    text-align: center; padding: 30px; background: #f9fafb;
                    color: #6b7280; font-size: 14px; border-top: 1px solid #e5e7eb;
                }}
                .footer p {{ margin: 4px 0; }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>🔒 Password Reset</h1>
                </div>
                <div class="content">
                    <p><strong>Hi {user_name},</strong></p>
                    
                    <p>We received a request to reset the password for your NWC-Analytics account.</p>
                    
                    <p>Click the button below to choose a new password:</p>
                    
                    <div style="text-align: center;">
                        <a href="{reset_url}" class="button">Reset Password</a>
                    </div>
                    
                    <p style="font-size: 14px; color: #6b7280;">Or copy and paste this link into your browser:</p>
                    <div class="link-box">
                        <p>{reset_url}</p>
                    </div>
                    
                    <div class="warning">
                        <p><strong>⏰ This link will expire in 1 hour.</strong></p>
                        <p style="margin-top: 8px;">If you didn't request a password reset, you can safely ignore this email — your password will not be changed.</p>
                    </div>
                    
                    <p style="margin-top: 32px;"><strong>Best regards,</strong><br>The NWC-Analytics Team</p>
                </div>
                <div class="footer">
                    <p><strong>NWC-Analytics</strong></p>
                    <p>Intelligent Stock Analysis & Portfolio Management</p>
                    <p style="margin-top: 12px;">This is an automated email, please do not reply.</p>
                </div>
            </div>
        </body>
        </html>
        """

        return self.send_email(
            to_email=to_email,
            subject="🔒 Reset Your NWC-Analytics Password",
            html_content=html_content,
            from_email_override=self.support_email
        )


    def send_payment_failed_email(self, to_email: str, user_name: str, plan_name: str) -> bool:
        """Notify user that their payment failed and action is needed"""
        self._ensure_initialized()
        settings = _get_settings()
        account_url = f"{settings.FRONTEND_URL}/account"

        logger.info("Sending payment failed email to %s", to_email)

        html_content = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f3f4f6; }}
                .container {{ max-width: 600px; margin: 40px auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }}
                .header {{ background: linear-gradient(135deg, #dc2626 0%, #ef4444 100%); color: white; padding: 40px 30px; text-align: center; }}
                .header h1 {{ margin: 0; font-size: 28px; font-weight: 700; }}
                .content {{ padding: 40px 30px; }}
                .content p {{ margin: 0 0 16px 0; color: #374151; }}
                .button {{ display: inline-block; background: #0d9488; color: white; padding: 14px 32px; text-decoration: none; border-radius: 6px; font-weight: 600; margin: 24px 0; }}
                .footer {{ background-color: #f9fafb; padding: 24px 30px; text-align: center; font-size: 12px; color: #9ca3af; }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header"><h1>Payment Issue</h1></div>
                <div class="content">
                    <p>Hi {user_name},</p>
                    <p>We were unable to process your payment for the <strong>{plan_name}</strong> plan. This usually happens when a card expires or has insufficient funds.</p>
                    <p>To keep your subscription active, please update your payment method:</p>
                    <div style="text-align: center;">
                        <a href="{account_url}" class="button">Update Payment Method →</a>
                    </div>
                    <p style="font-size: 14px; color: #6b7280;">If your payment isn't resolved within a few days, your account will be downgraded to the Beginner plan. Your data (watchlist, portfolio, alerts) will be preserved.</p>
                    <p style="font-size: 14px; color: #6b7280;">Questions? Contact us at <a href="mailto:support@nwc-analytics.com" style="color: #0d9488;">support@nwc-analytics.com</a></p>
                </div>
                <div class="footer">
                    <p><strong>NWC-Analytics</strong></p>
                    <p>Intelligent Stock Analysis & Portfolio Management</p>
                </div>
            </div>
        </body>
        </html>
        """

        return self.send_email(
            to_email=to_email,
            subject=f"Action Required: Payment Failed for {plan_name}",
            html_content=html_content,
            from_email_override=self.support_email
        )

    def send_trial_ending_email(self, to_email: str, user_name: str, plan_name: str, days_remaining: int) -> bool:
        """Warn user their trial is ending soon"""
        self._ensure_initialized()
        settings = _get_settings()
        account_url = f"{settings.FRONTEND_URL}/account"

        logger.info("Sending trial ending email to %s (%s days left)", to_email, days_remaining)

        html_content = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f3f4f6; }}
                .container {{ max-width: 600px; margin: 40px auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }}
                .header {{ background: linear-gradient(135deg, #d97706 0%, #f59e0b 100%); color: white; padding: 40px 30px; text-align: center; }}
                .header h1 {{ margin: 0; font-size: 28px; font-weight: 700; }}
                .content {{ padding: 40px 30px; }}
                .content p {{ margin: 0 0 16px 0; color: #374151; }}
                .button {{ display: inline-block; background: #0d9488; color: white; padding: 14px 32px; text-decoration: none; border-radius: 6px; font-weight: 600; margin: 24px 0; }}
                .footer {{ background-color: #f9fafb; padding: 24px 30px; text-align: center; font-size: 12px; color: #9ca3af; }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header"><h1>Your Trial Ends in {days_remaining} Days</h1></div>
                <div class="content">
                    <p>Hi {user_name},</p>
                    <p>Your free trial of the <strong>{plan_name}</strong> plan ends in <strong>{days_remaining} days</strong>.</p>
                    <p>If you have a payment method on file, your subscription will continue automatically — no action needed. If not, please add one to keep your access:</p>
                    <div style="text-align: center;">
                        <a href="{account_url}" class="button">Manage Subscription →</a>
                    </div>
                    <p style="font-size: 14px; color: #6b7280;">If you'd rather not continue, you can cancel anytime from your account settings before the trial ends — you won't be charged.</p>
                    <p style="font-size: 14px; color: #6b7280;">Questions? <a href="mailto:support@nwc-analytics.com" style="color: #0d9488;">support@nwc-analytics.com</a></p>
                </div>
                <div class="footer">
                    <p><strong>NWC-Analytics</strong></p>
                    <p>Intelligent Stock Analysis & Portfolio Management</p>
                </div>
            </div>
        </body>
        </html>
        """

        return self.send_email(
            to_email=to_email,
            subject=f"Your NWC-Analytics Trial Ends in {days_remaining} Days",
            html_content=html_content,
            from_email_override=self.sales_email
        )


# Singleton instance
email_service = EmailService()