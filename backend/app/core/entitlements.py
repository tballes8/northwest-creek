"""
Who may use the app. One rule, used by the request dependency (api/dependencies.py),
the live-price WebSocket and both alert checkers, so they can never disagree.

A user has access when their account is enabled (is_active) and either their
subscription is live (active or trialing) or the account is exempt (admins, the
demo account). users.subscription_status is a cached copy of Stripe's state,
written only by services/subscription_sync.py.

is_active means "account enabled". It is not a subscription flag: before migration
037 it was set False when a subscription lapsed, and that is now subscription_status.
"""
from sqlalchemy import and_, or_

from app.db.models import User

ACCESS_STATUSES = ("active", "trialing")        # in the app
FIX_PAYMENT_STATUSES = ("past_due", "unpaid")   # a payment failed: fix it on /billing
LIVE_STATUSES = ACCESS_STATUSES + FIX_PAYMENT_STATUSES

# Demo account for tutorial recordings: full access with no subscription
DEMO_EMAILS = frozenset({"john.smith@nwc-analytics.com"})


def is_demo(user: User) -> bool:
    return (user.email or "").lower() in DEMO_EMAILS


def is_exempt(user: User) -> bool:
    """Full access without a subscription: admins (they run the site) and the demo account."""
    return bool(user.is_admin) or is_demo(user)


def has_app_access(user: User) -> bool:
    if not user.is_active:
        return False
    return is_exempt(user) or user.subscription_status in ACCESS_STATUSES


def app_access_clause():
    """has_app_access as a SQL condition on User, for queries that load many users'
    rows at once (the alert checkers). Keep the two in step."""
    return and_(
        User.is_active.is_(True),
        or_(
            User.is_admin.is_(True),
            User.email.in_(DEMO_EMAILS),
            User.subscription_status.in_(ACCESS_STATUSES),
        ),
    )
