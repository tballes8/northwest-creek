"""
Stripe → users: the one place that writes a user's subscription fields
(subscription_status, subscription_tier, trial and period dates; migration 037).

Stripe is the authority. Webhooks, the billing endpoints, /stripe/subscription-status
and a periodic reconcile all come through here, and every path re-reads the
customer's subscriptions from Stripe rather than trusting an event payload. Events
arrive late, out of order and more than once; a fresh read makes each sync
idempotent and order-independent. Only the customer id is taken from an event, so
payload differences between Stripe API versions don't matter here.

stripe-python is synchronous: every call goes through stripe_call(), which runs it
in a worker thread instead of blocking the event loop.
"""
import asyncio
import logging
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Optional

import stripe
from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.core.entitlements import ACCESS_STATUSES, LIVE_STATUSES
from app.db.models import User

logger = logging.getLogger(__name__)
settings = get_settings()

stripe.api_key = settings.STRIPE_SECRET_KEY

# A live subscription not synced for this long is re-read by the reconcile job: the
# backstop for a webhook that never arrived. Stripe retries a failed one for 3 days.
RECONCILE_MAX_AGE = timedelta(hours=12)

# Subscription states in order of precedence when a customer has several
_STATUS_RANK = {"active": 0, "trialing": 1, "past_due": 2, "unpaid": 3}


async def stripe_call(fn, *args, **kwargs):
    """Run a blocking stripe-python call in a worker thread."""
    return await asyncio.to_thread(fn, *args, **kwargs)


def tier_for_price(price_id: Optional[str]) -> Optional[str]:
    """Tier slug for one of the four plan prices; None for any other price."""
    if not price_id:
        return None
    return {
        settings.STRIPE_BEGINNER_PRICE_ID: "beginner",
        settings.STRIPE_CASUAL_PRICE_ID: "casual",
        settings.STRIPE_ACTIVE_PRICE_ID: "active",
        settings.STRIPE_PROFESSIONAL_PRICE_ID: "professional",
    }.get(price_id)


def price_id_of(sub) -> Optional[str]:
    items = (sub.get("items") or {}).get("data") or []
    return items[0]["price"]["id"] if items else None


def has_had_trial(subs: list) -> bool:
    """One trial per customer (Terms): any past or current trial counts."""
    return any(s.get("trial_start") for s in subs)


def governing_subscription(subs: list):
    """The subscription that decides the user's state: active, then trialing, then
    one with a failed payment; otherwise the newest (cancelled, incomplete, …)."""
    if not subs:
        return None
    return min(subs, key=lambda s: (_STATUS_RANK.get(s["status"], len(_STATUS_RANK)), -(s.get("created") or 0)))


def _period_end(sub) -> Optional[int]:
    end = sub.get("current_period_end")
    if end is None:
        # Stripe API 2025-03-31 and later moved it onto the subscription item
        items = (sub.get("items") or {}).get("data") or []
        end = items[0].get("current_period_end") if items else None
    return end


def _utc(ts: Optional[int]) -> Optional[datetime]:
    return datetime.fromtimestamp(ts, tz=timezone.utc) if ts else None


def apply_subscriptions(user: User, subs: list):
    """Write the customer's governing subscription onto the user. Pure: no I/O, no
    commit. Returns the governing subscription, or None."""
    sub = governing_subscription(subs)
    # Never cleared: a deleted and recreated Stripe customer must not get a second trial
    user.has_had_trial = bool(user.has_had_trial) or has_had_trial(subs)
    user.subscription_synced_at = datetime.now(timezone.utc)

    if sub is None:
        user.subscription_status = None
        user.stripe_subscription_id = None
        user.trial_end = None
        user.current_period_end = None
        user.cancel_at_period_end = False
        return None

    user.subscription_status = sub["status"]
    user.stripe_subscription_id = sub["id"]
    user.trial_end = _utc(sub.get("trial_end"))
    user.current_period_end = _utc(_period_end(sub))
    user.cancel_at_period_end = bool(sub.get("cancel_at_period_end"))

    # The tier follows the plan only while the subscription grants access; a
    # past_due or cancelled one keeps the last tier for when it comes back.
    if sub["status"] in ACCESS_STATUSES:
        price_id = price_id_of(sub)
        tier = tier_for_price(price_id)
        if tier:
            user.subscription_tier = tier
        else:
            # A price created in Stripe without updating the STRIPE_*_PRICE_ID
            # settings. Keep the tier the user paid for rather than guess.
            logger.error(
                "Subscription %s (%s) is on price %s, which matches no STRIPE_*_PRICE_ID "
                "setting; tier kept at %s. Update the price IDs in Railway.",
                sub["id"], user.email, price_id, user.subscription_tier,
            )
    return sub


async def find_customer_id(user: User) -> Optional[str]:
    """The user's Stripe customer: the stored id, else a lookup by email, which is
    then stored on the user (the caller commits)."""
    if user.stripe_customer_id:
        return user.stripe_customer_id
    customers = await stripe_call(stripe.Customer.list, email=user.email, limit=1)
    if not customers.data:
        return None
    user.stripe_customer_id = customers.data[0].id
    return user.stripe_customer_id


async def list_subscriptions(customer_id: str) -> list:
    """Every subscription the customer has had, any status, newest first."""
    result = await stripe_call(stripe.Subscription.list, customer=customer_id, status="all", limit=100)
    return list(result.data)


async def sync_user(db: AsyncSession, user: User):
    """Re-read the user's subscriptions from Stripe, store the result and commit.
    Returns the governing subscription. A Stripe error propagates and leaves the
    stored state as it was."""
    customer_id = await find_customer_id(user)
    subs = []
    if customer_id:
        try:
            subs = await list_subscriptions(customer_id)
        except stripe.error.InvalidRequestError as e:
            if getattr(e, "code", None) != "resource_missing":
                raise
            # The customer was deleted in the Stripe Dashboard
            logger.warning("Stripe customer %s for %s no longer exists; unlinking", customer_id, user.email)
            user.stripe_customer_id = None
    sub = apply_subscriptions(user, subs)
    await db.commit()
    return sub


@dataclass
class SyncResult:
    user: User
    subscription: Optional[dict]  # the governing subscription after the sync
    old_tier: Optional[str]


async def _user_for_customer(db: AsyncSession, customer_id: str, user_id_hint: Optional[str]) -> Optional[User]:
    user = (await db.execute(select(User).where(User.stripe_customer_id == customer_id))).scalars().first()
    if user is not None:
        return user

    # Not linked yet: the user_id we put in subscription metadata, then the email
    candidate = None
    try:
        if user_id_hint:
            candidate = await db.get(User, uuid.UUID(str(user_id_hint)))
    except ValueError:
        pass
    if candidate is None:
        customer = await stripe_call(stripe.Customer.retrieve, customer_id)
        email = (customer.get("email") or "").strip().lower()
        if email:
            candidate = (await db.execute(
                select(User).where(func.lower(User.email) == email)
            )).scalars().first()

    if candidate is None:
        return None
    if candidate.stripe_customer_id and candidate.stripe_customer_id != customer_id:
        # Two Stripe customers for one user. Applying this one's subscriptions
        # would overwrite the other's; it needs a person to merge them.
        logger.error(
            "Stripe customer %s matches %s, who is linked to customer %s; not syncing",
            customer_id, candidate.email, candidate.stripe_customer_id,
        )
        return None
    candidate.stripe_customer_id = customer_id
    return candidate


async def sync_customer(db: AsyncSession, customer_id: Optional[str], user_id_hint: Optional[str] = None) -> Optional[SyncResult]:
    """Sync the user behind a Stripe customer; a webhook names only the customer.
    Returns None when no user matches."""
    if not customer_id:
        return None
    user = await _user_for_customer(db, customer_id, user_id_hint)
    if user is None:
        logger.warning("Stripe customer %s matches no user; nothing synced", customer_id)
        return None
    old_tier = user.subscription_tier
    sub = apply_subscriptions(user, await list_subscriptions(customer_id))
    await db.commit()
    return SyncResult(user=user, subscription=sub, old_tier=old_tier)


async def reconcile_subscriptions() -> dict:
    """Sync every user not synced yet (the first run after migration 037 backfills
    everyone) and every live subscription last synced over RECONCILE_MAX_AGE ago.
    Scheduled in main.py: at startup, then every 6 hours."""
    from app.db.session import async_session

    cutoff = datetime.now(timezone.utc) - RECONCILE_MAX_AGE
    async with async_session() as db:
        ids = (await db.execute(
            select(User.id).where(or_(
                User.subscription_synced_at.is_(None),
                and_(User.subscription_status.in_(LIVE_STATUSES), User.subscription_synced_at < cutoff),
            ))
        )).scalars().all()

    synced = failed = 0
    for user_id in ids:
        async with async_session() as db:
            user = await db.get(User, user_id)
            if user is None:
                continue
            try:
                await sync_user(db, user)
                synced += 1
            except Exception as e:
                failed += 1
                logger.warning("Subscription reconcile failed for %s: %s", user.email, e)
    if ids:
        logger.info("Subscription reconcile: %d synced, %d failed", synced, failed)
    return {"synced": synced, "failed": failed}
