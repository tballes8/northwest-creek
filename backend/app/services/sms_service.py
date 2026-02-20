"""
SMS Service — Twilio integration for OTP verification and alert notifications.

Required env vars (add to app/config.py Settings):
    TWILIO_ACCOUNT_SID: str = ""
    TWILIO_AUTH_TOKEN: str = ""
    TWILIO_FROM_NUMBER: str = ""      # E.164 format, e.g. +12085559999
"""
import re
import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional, Tuple

from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings

settings = get_settings()


def _get_twilio_client():
    """Lazy-load Twilio client so the app doesn't crash if twilio isn't installed yet."""
    from twilio.rest import Client
    return Client(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN)


def format_phone_e164(raw: str) -> Optional[str]:
    """
    Normalize a US phone number to E.164 format (+1XXXXXXXXXX).
    Returns None if the input can't be parsed.
    """
    digits = re.sub(r"[^\d]", "", raw)

    # Strip leading '1' country code if 11 digits
    if len(digits) == 11 and digits.startswith("1"):
        digits = digits[1:]

    if len(digits) != 10:
        return None

    return f"+1{digits}"


def _hash_otp(code: str) -> str:
    """SHA-256 hash an OTP code so we never store plaintext."""
    return hashlib.sha256(code.encode()).hexdigest()


# ──────────────────────────────────────────────
#  OTP — generate, send, verify
# ──────────────────────────────────────────────

OTP_LENGTH = 6
OTP_TTL_MINUTES = 10


def generate_otp() -> Tuple[str, str, datetime]:
    """
    Returns (plain_code, hashed_code, expiry_dt).
    """
    code = "".join([str(secrets.randbelow(10)) for _ in range(OTP_LENGTH)])
    hashed = _hash_otp(code)
    expires = datetime.now(timezone.utc) + timedelta(minutes=OTP_TTL_MINUTES)
    return code, hashed, expires


def verify_otp(submitted_code: str, stored_hash: str, expires_at: datetime) -> bool:
    """
    Compare a submitted OTP against the stored hash.
    Returns False if expired or mismatched.
    """
    if datetime.now(timezone.utc) > expires_at:
        return False
    return _hash_otp(submitted_code) == stored_hash


def send_otp_sms(phone_e164: str, code: str) -> bool:
    """
    Send the OTP code via Twilio SMS.
    Returns True on success, False on failure.
    """
    try:
        client = _get_twilio_client()
        client.messages.create(
            body=(
                f"Your Northwest Creek verification code is: {code}\n"
                f"This code expires in {OTP_TTL_MINUTES} minutes.\n"
                f"If you didn't request this, ignore this message."
            ),
            from_=settings.TWILIO_FROM_NUMBER,
            to=phone_e164,
        )
        return True
    except Exception as e:
        print(f"❌ Twilio OTP send failed: {e}")
        return False


# ──────────────────────────────────────────────
#  Alert notifications
# ──────────────────────────────────────────────

def send_alert_sms(phone_e164: str, ticker: str, message: str) -> bool:
    """
    Send a triggered-alert notification.
    Message should be pre-formatted by the caller (alert_checker).
    Appends opt-out footer automatically.
    Returns True on success.
    """
    try:
        client = _get_twilio_client()
        full_message = f"{message}\nReply STOP to opt out."
        client.messages.create(
            body=full_message,
            from_=settings.TWILIO_FROM_NUMBER,
            to=phone_e164,
        )
        return True
    except Exception as e:
        print(f"❌ Twilio alert SMS failed for {ticker} → {phone_e164}: {e}")
        return False


def build_price_alert_message(
    ticker: str,
    current_price: float,
    target_price: float,
    condition: str,
) -> str:
    """Build a concise SMS body for a triggered price alert (< 160 chars)."""
    direction = "rose above" if condition == "above" else "dropped below"
    return (
        f"NWC Alert: {ticker} {direction} your ${target_price:.2f} target — "
        f"now trading at ${current_price:.2f}."
    )