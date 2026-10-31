"""
Stripe Payment Integration - Handle subscriptions

Subscriptions are created and changed in-app with Stripe Elements
(/create-subscription, /start-trial). Stripe is the authority on subscription
state: after every billing action and webhook, services/subscription_sync.py
copies it onto the user, and core/entitlements.py decides access from that copy.

stripe-python and EmailService are synchronous, so every call to either runs in a
worker thread (stripe_call, _send_email) rather than blocking the event loop.
"""
import asyncio
import logging
import time
from collections import OrderedDict
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status, Request
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
import stripe

from app.db.models import User
from app.api.dependencies import get_current_user_any_subscription
from app.db.session import get_db
from app.config import get_settings
from app.core.entitlements import (
    ACCESS_STATUSES, FIX_PAYMENT_STATUSES, LIVE_STATUSES, is_demo, is_exempt,
)
from app.core.rate_limit import within_rate_limit
from app.services.email_service import email_service
from app.services.subscription_sync import (
    find_customer_id, has_had_trial, list_subscriptions, price_id_of,
    stripe_call, sync_customer, sync_user,
)

logger = logging.getLogger(__name__)
settings = get_settings()


# ---- Webhook Event Deduplication ----
# Prevents duplicate processing when Stripe retries delivery. An event is
# recorded only after its handler succeeds: a failed one returns 500 and must
# stay retryable, or the retry is skipped and the event is lost.
# In memory and per process. Handling is idempotent (a re-read of Stripe), so a
# redelivery after a restart at worst repeats an email.
# TTL-based: entries older than 24h are evicted on lookup.
_PROCESSED_EVENTS: OrderedDict[str, float] = OrderedDict()
_EVENT_TTL = 86400  # 24 hours

def _already_processed(event_id: str) -> bool:
    """Check if this webhook event was already handled successfully."""
    now = time.time()
    # Evict stale entries (oldest are first in OrderedDict)
    while _PROCESSED_EVENTS:
        oldest_key, oldest_ts = next(iter(_PROCESSED_EVENTS.items()))
        if now - oldest_ts > _EVENT_TTL:
            _PROCESSED_EVENTS.pop(oldest_key)
        else:
            break
    return event_id in _PROCESSED_EVENTS


def _mark_processed(event_id: str) -> None:
    _PROCESSED_EVENTS[event_id] = time.time()

router = APIRouter()


# ---- Request Models ----

class SubscriptionRequest(BaseModel):
    tier: str  # 'beginner', 'casual', 'active', 'professional'

class StartTrialRequest(BaseModel):
    setup_intent_id: str


# ---- Helper: Map tier to price ID ----

def get_price_id_for_tier(tier: str) -> str:
    """Get Stripe Price ID for a given tier"""
    tier_map = {
        'beginner': settings.STRIPE_BEGINNER_PRICE_ID,
        'casual': settings.STRIPE_CASUAL_PRICE_ID,
        'active': settings.STRIPE_ACTIVE_PRICE_ID,
        'professional': settings.STRIPE_PROFESSIONAL_PRICE_ID,
    }
    price_id = tier_map.get(tier)
    if not price_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid tier: {tier}. Must be beginner, casual, active, or professional."
        )
    return price_id


def get_plan_name_for_price(price_id: Optional[str]) -> str:
    """Get plan name from price ID"""
    if price_id == getattr(settings, 'STRIPE_BEGINNER_PRICE_ID', None):
        return "Beginner"
    elif price_id == settings.STRIPE_CASUAL_PRICE_ID:
        return "Casual Retail Investor"
    elif price_id == settings.STRIPE_ACTIVE_PRICE_ID:
        return "Active Retail Investor"
    elif price_id == settings.STRIPE_PROFESSIONAL_PRICE_ID:
        return "Professional Investor"
    return "Unknown"


# Tiers that get a 14-day free trial
TRIAL_TIERS = {'beginner', 'casual'}
TRIAL_DAYS = 14


def tier_gets_trial(tier: str) -> bool:
    """Check if a tier is eligible for a free trial"""
    return tier in TRIAL_TIERS


async def _send_email(send, **kwargs) -> None:
    """Send through EmailService in a worker thread. A failure is logged, never
    raised: an email must not fail a billing action or a webhook."""
    try:
        if not await asyncio.to_thread(send, **kwargs):
            logger.warning("%s was not delivered to %s", send.__name__, kwargs.get("to_email"))
    except Exception as e:
        logger.warning("%s failed for %s: %s", send.__name__, kwargs.get("to_email"), e)


async def _sync_after_change(db: AsyncSession, user: User) -> None:
    """Store the user's new state after a billing action. The action has already
    happened in Stripe, so a failed sync must not fail the request: the webhook
    the action triggered syncs again."""
    try:
        await sync_user(db, user)
    except Exception as e:
        logger.warning("Subscription sync after a billing change failed for %s: %s", user.email, e)


# ---- Endpoints ----

@router.post("/create-subscription")
async def create_subscription(
    request: SubscriptionRequest,
    current_user: User = Depends(get_current_user_any_subscription),  # a lapsed user resubscribes here
    db: AsyncSession = Depends(get_db)
):
    """
    Create or upgrade a Stripe subscription.

    - **New subscriber:** Creates a Customer + Subscription, returns client_secret
      for the frontend to confirm payment via Stripe Elements.
    - **New trial:** Creates a SetupIntent only and returns its client_secret. The
      subscription is created by /start-trial once the card is confirmed.
    - **Existing subscriber (upgrade/downgrade):** Modifies the current subscription
      in-place and invoices the prorated difference immediately. If the card on
      file pays it, the tier changes now; otherwise the change is held as a
      pending update and a client_secret is returned to confirm the payment.
    """
    try:
        new_price_id = get_price_id_for_tier(request.tier)
        new_tier = request.tier

        # ── Step 1: Find or create Stripe Customer ────────────
        customer_id = await find_customer_id(current_user)
        if not customer_id:
            customer = await stripe_call(
                stripe.Customer.create,
                email=current_user.email,
                name=current_user.full_name or current_user.email,
                metadata={
                    'user_id': str(current_user.id),
                },
            )
            customer_id = customer.id
            current_user.stripe_customer_id = customer_id
        # Store the customer link before anything else can fail
        await db.commit()

        # ── Step 2: Check for existing subscriptions ──────────
        all_subs = await list_subscriptions(customer_id)

        # A failed payment is fixed, never replaced: a second subscription would
        # bill alongside the one Stripe is still retrying.
        if any(s['status'] in FIX_PAYMENT_STATUSES for s in all_subs):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Your last payment didn't go through. Update your payment method on the Billing page instead of starting a new subscription."
            )

        # Active first, then trialing. Includes subs scheduled to cancel
        # (cancel_at_period_end) — the user still has them until period end.
        active_sub = (
            next((s for s in all_subs if s['status'] == 'active'), None)
            or next((s for s in all_subs if s['status'] == 'trialing'), None)
        )

        if active_sub:
            # ── UPGRADE PATH: Modify existing subscription ────
            current_item = active_sub['items']['data'][0]
            current_price_id = current_item['price']['id']

            if current_price_id == new_price_id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="You're already on this plan."
                )

            # If user had scheduled a cancellation, undo it
            if active_sub.get('cancel_at_period_end'):
                await stripe_call(stripe.Subscription.modify, active_sub.id, cancel_at_period_end=False)

            # Trials belong to the plans that offer one. Moving a trialing
            # Beginner/Casual subscription to Active or Professional ends the trial
            # now, so the new plan is paid for today; Stripe charges its full price
            # and restarts the billing cycle. Between two trial plans the trial
            # carries on.
            end_trial = active_sub['status'] == 'trialing' and not tier_gets_trial(new_tier)

            # Swap the price item and bill the prorated difference now:
            # (new price × remaining days) - (old price × remaining days).
            # pending_if_incomplete: if that charge fails or needs 3D Secure, Stripe
            # holds the swap (and the trial end) as a pending update and the plan
            # doesn't change until it's paid. Pending updates take a restricted set
            # of parameters (trial_end is one), so no metadata here.
            updated_sub = await stripe_call(
                stripe.Subscription.modify,
                active_sub.id,
                items=[{
                    'id': current_item['id'],
                    'price': new_price_id,
                }],
                proration_behavior='always_invoice',
                payment_behavior='pending_if_incomplete',
                **({'trial_end': 'now'} if end_trial else {}),
                expand=['latest_invoice.payment_intent'],
            )

            if updated_sub.get('pending_update'):
                # Not paid yet, so nothing has changed. The frontend confirms the
                # payment with the card entered; Stripe then applies the new price,
                # and the invoice.paid / subscription.updated webhooks sync the tier.
                latest_invoice = updated_sub.latest_invoice
                payment_intent = latest_invoice.payment_intent if latest_invoice else None
                if not payment_intent:
                    raise HTTPException(
                        status_code=status.HTTP_402_PAYMENT_REQUIRED,
                        detail="We couldn't charge your card for the plan change. Please try again or contact support."
                    )
                return {
                    "subscription_id": updated_sub.id,
                    "client_secret": payment_intent.client_secret,
                    "upgrade": True,
                }
            else:
                # Applied: the difference was paid (or nothing was due, e.g. a
                # downgrade, whose credit goes to the customer's balance). The
                # invoice.paid webhook sends the receipt email when money was taken.
                old_tier = current_user.subscription_tier
                await _sync_after_change(db, current_user)
                logger.info(f"User {current_user.email} changed plan from {old_tier} to {new_tier} (prorated)")

                return {
                    "subscription_id": updated_sub.id,
                    "client_secret": None,
                    "upgrade": True,
                    "message": f"Upgraded to {get_plan_name_for_price(new_price_id)}! Prorated charge applied.",
                    "new_tier": new_tier,
                }

        else:
            # ── NEW SUBSCRIPTION PATH ─────────────────────────
            # A returning customer who already had a trial pays from day one —
            # otherwise cancel-and-resubscribe would be an endless free trial.
            is_trial = tier_gets_trial(new_tier) and not (has_had_trial(all_subs) or current_user.has_had_trial)

            if is_trial:
                # Card first, subscription second. Stripe puts a trial subscription
                # in 'trialing' the moment it exists, card or not, so creating it
                # here would grant the trial before the card is confirmed. Only a
                # SetupIntent is created; /start-trial creates the subscription
                # once it succeeds. A declined or abandoned card form leaves no
                # subscription, no access, and the one trial still unused.
                setup_intent = await stripe_call(
                    stripe.SetupIntent.create,
                    customer=customer_id,
                    payment_method_types=['card'],
                    usage='off_session',  # charged at trial end with the user away
                    metadata={
                        'user_id': str(current_user.id),
                        'tier': new_tier,
                    },
                )

                return {
                    "subscription_id": None,
                    "client_secret": setup_intent.client_secret,
                    "is_trial": True,
                    "upgrade": False,
                }
            else:
                # Non-trial: collect payment upfront. The subscription stays
                # 'incomplete' (no access) until the frontend confirms the payment.
                subscription = await stripe_call(
                    stripe.Subscription.create,
                    customer=customer_id,
                    items=[{'price': new_price_id}],
                    payment_behavior='default_incomplete',
                    payment_settings={
                        'save_default_payment_method': 'on_subscription',
                    },
                    expand=['latest_invoice.payment_intent'],
                    metadata={
                        'user_id': str(current_user.id),
                        'plan_name': get_plan_name_for_price(new_price_id),
                    },
                )
                await _sync_after_change(db, current_user)

                return {
                    "subscription_id": subscription.id,
                    "client_secret": subscription.latest_invoice.payment_intent.client_secret,
                    "is_trial": False,
                    "upgrade": False,
                }

    except HTTPException:
        raise
    except stripe.error.StripeError as e:
        logger.error(f"Stripe error in create-subscription for {current_user.email}: {e}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Payment setup failed. Please try again or contact support."
        )
    except Exception as e:
        logger.error(f"Error creating subscription for {current_user.email}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not set up subscription. Please try again."
        )


@router.post("/start-trial")
async def start_trial(
    request: StartTrialRequest,
    current_user: User = Depends(get_current_user_any_subscription),
    db: AsyncSession = Depends(get_db)
):
    """
    Start a free trial once its card is confirmed.

    Second half of the trial path in /create-subscription: the frontend confirms
    that SetupIntent's card, then calls this with its id. The tier comes from the
    SetupIntent's metadata, set server-side, never from the request.
    """
    try:
        setup_intent = await stripe_call(stripe.SetupIntent.retrieve, request.setup_intent_id)
        tier = setup_intent['metadata'].get('tier')
        if (
            setup_intent['metadata'].get('user_id') != str(current_user.id)
            or setup_intent.status != 'succeeded'
            or not tier or not tier_gets_trial(tier)
        ):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Your card hasn't been confirmed. Please enter it again."
            )

        all_subs = await list_subscriptions(setup_intent.customer)
        live_sub = next((s for s in all_subs if s['status'] in LIVE_STATUSES), None)
        if live_sub:
            # A repeat of this same call (double submit, retry after a dropped response)
            if live_sub['metadata'].get('setup_intent') != setup_intent.id:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="You already have a subscription."
                )
            subscription = live_sub
        else:
            if has_had_trial(all_subs) or current_user.has_had_trial:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="This account has already used its free trial."
                )
            price_id = get_price_id_for_tier(tier)
            subscription = await stripe_call(
                stripe.Subscription.create,
                customer=setup_intent.customer,
                items=[{'price': price_id}],
                trial_period_days=TRIAL_DAYS,
                default_payment_method=setup_intent.payment_method,
                payment_settings={
                    'save_default_payment_method': 'on_subscription',
                },
                metadata={
                    'user_id': str(current_user.id),
                    'plan_name': get_plan_name_for_price(price_id),
                    'setup_intent': setup_intent.id,
                },
                # Two concurrent calls with one card create one subscription
                idempotency_key=f"start-trial-{setup_intent.id}",
            )

        # The card is on file, so the trial is real: record it now rather than
        # waiting on the webhook
        await _sync_after_change(db, current_user)
        logger.info(f"User {current_user.email} started {TRIAL_DAYS}-day trial on {tier}")

        return {
            "subscription_id": subscription.id,
            "is_trial": True,
        }

    except HTTPException:
        raise
    except stripe.error.StripeError as e:
        logger.error(f"Stripe error in start-trial for {current_user.email}: {e}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Could not start your trial. Please try again or contact support."
        )
    except Exception as e:
        logger.error(f"Error starting trial for {current_user.email}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not start your trial. Please try again."
        )


# ---- Webhook ----

# Events that can change a customer's subscriptions. Each one triggers a re-read
# of the customer's subscriptions from Stripe (services/subscription_sync), so
# only the payload's customer id matters, and receiving one twice or out of order
# is harmless. The endpoint must be subscribed to these in the Stripe Dashboard.
_SYNC_EVENTS = {
    'customer.subscription.created',
    'customer.subscription.updated',
    'customer.subscription.deleted',
    'customer.subscription.paused',
    'customer.subscription.resumed',
    'customer.subscription.pending_update_applied',
    'customer.subscription.pending_update_expired',
    'customer.subscription.trial_will_end',
    'invoice.paid',
    'invoice.payment_failed',
}


@router.post("/webhook")
async def stripe_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    """Handle Stripe webhook events with deduplication and error logging."""
    payload = await request.body()
    sig_header = request.headers.get('stripe-signature')

    try:
        event = stripe.Webhook.construct_event(
            payload, sig_header, settings.STRIPE_WEBHOOK_SECRET
        )
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid payload")
    except stripe.error.SignatureVerificationError:
        raise HTTPException(status_code=400, detail="Invalid signature")

    event_id = event.get('id', '')
    event_type = event['type']
    logger.info(f"Stripe webhook received: {event_type} (event={event_id})")

    # Deduplicate — Stripe retries on timeout, don't process twice
    if _already_processed(event_id):
        logger.info(f"Skipping duplicate webhook event: {event_id}")
        return {"status": "duplicate_skipped"}

    if event_type not in _SYNC_EVENTS:
        logger.info(f"Unhandled webhook event type: {event_type}")
        _mark_processed(event_id)
        return {"status": "ignored"}

    obj = event['data']['object']
    try:
        result = await sync_customer(db, obj.get('customer'), (obj.get('metadata') or {}).get('user_id'))
        if result is not None:
            user = result.user
            logger.info(
                f"{event_type}: {user.email} is {user.subscription_status} on {user.subscription_tier}"
            )
            if event_type == 'invoice.paid':
                await _on_invoice_paid(obj, result)
            elif event_type == 'invoice.payment_failed':
                await _on_payment_failed(obj, result)
            elif event_type == 'customer.subscription.trial_will_end':
                await _on_trial_will_end(obj, result)

    except Exception as e:
        # Log the full error with context so we can debug subscriber issues
        logger.error(f"WEBHOOK HANDLER FAILED: {event_type} event={event_id} error={e}", exc_info=True)
        # Return 500 so Stripe retries this event
        raise HTTPException(status_code=500, detail=f"Webhook handler error: {event_type}")

    _mark_processed(event_id)
    return {"status": "success"}


# ---- Webhook emails (after the sync) ----

async def _on_invoice_paid(invoice, result) -> None:
    """Confirmation email for money taken to start a subscription or change plan.
    Decided by the invoice, not by a tier change: a page load can sync the new
    tier before this webhook arrives. Renewals and $0 invoices (a trial start, a
    downgrade's credit) send nothing."""
    if (invoice.get('amount_paid') or 0) <= 0:
        return
    if invoice.get('billing_reason') not in ('subscription_create', 'subscription_update'):
        return
    user, sub = result.user, result.subscription
    await _send_email(
        email_service.send_payment_success_email,
        to_email=user.email,
        user_name=user.full_name or user.email,
        plan_name=get_plan_name_for_price(price_id_of(sub) if sub else None),
        tier=user.subscription_tier,
    )


async def _on_payment_failed(invoice, result) -> None:
    """Payment-failed email, for a renewal or the charge at the end of a trial only.
    A declined first payment or plan change is shown on the Payment page as it
    happens; this email's link to /billing is for fixing a subscription.

    Stripe retries failed payments automatically (Smart Retries). If every retry
    fails, the subscription ends and the sync removes access."""
    if invoice.get('billing_reason') != 'subscription_cycle':
        return
    user, sub = result.user, result.subscription
    logger.error(f"Payment failed: {user.email} attempt={invoice.get('attempt_count', 1)}")
    await _send_email(
        email_service.send_payment_failed_email,
        to_email=user.email,
        user_name=user.full_name or user.email,
        plan_name=get_plan_name_for_price(price_id_of(sub) if sub else None),
    )


async def _on_trial_will_end(subscription, result) -> None:
    """Trial ending soon: warn the user so the charge isn't a surprise."""
    sub = result.subscription
    if sub is None or sub['status'] != 'trialing' or sub.get('cancel_at_period_end'):
        return  # cancelled (now or at trial end) or already converted: no charge is coming
    days_remaining = 3  # Stripe fires this event ~3 days before trial end
    trial_end = subscription.get('trial_end')
    if trial_end:
        days_remaining = max(1, int((trial_end - time.time()) / 86400))
    user = result.user
    await _send_email(
        email_service.send_trial_ending_email,
        to_email=user.email,
        user_name=user.full_name or user.email,
        plan_name=get_plan_name_for_price(price_id_of(subscription)),
        days_remaining=days_remaining,
    )


# ---- Cancel Subscription ----

@router.post("/cancel-subscription")
async def cancel_subscription(
    current_user: User = Depends(get_current_user_any_subscription),
    db: AsyncSession = Depends(get_db)
):
    """
    Cancel the user's Stripe subscription.
    Cancels at period end so user keeps access until billing cycle finishes.
    """
    try:
        customer_id = await find_customer_id(current_user)
        subscriptions = [
            s for s in (await list_subscriptions(customer_id) if customer_id else [])
            if s['status'] in ACCESS_STATUSES
        ]
        if not subscriptions:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No active subscription found."
            )

        cancelled_ids = []
        for sub in subscriptions:
            # Cancel at period end — user keeps access until billing cycle ends
            await stripe_call(stripe.Subscription.modify, sub['id'], cancel_at_period_end=True)
            cancelled_ids.append(sub['id'])
            logger.info(f"Subscription {sub['id']} set to cancel at period end for {current_user.email}")
        await _sync_after_change(db, current_user)

        return {
            "status": "cancellation_scheduled",
            "message": "Your subscription will be cancelled at the end of the current billing period. You'll keep access to all features until then.",
            "subscription_ids": cancelled_ids,
        }

    except HTTPException:
        raise
    except stripe.error.StripeError as e:
        logger.error(f"Stripe error cancelling subscription for {current_user.email}: {e}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="We couldn't cancel your subscription. Please try again or contact support."
        )
    except Exception as e:
        logger.error(f"Error cancelling subscription for {current_user.email}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not cancel subscription. Please try again."
        )


@router.post("/cancel-subscription-immediate")
async def cancel_subscription_immediate(
    current_user: User = Depends(get_current_user_any_subscription),
    db: AsyncSession = Depends(get_db)
):
    """
    Immediately cancel the subscription; access ends now.
    Used for trial cancellations (user is not charged) and from /billing, where a
    user with a failed payment can stop the subscription instead of paying it.
    """
    try:
        customer_id = await find_customer_id(current_user)
        if not customer_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No Stripe customer found."
            )

        # Every live subscription, including one stuck on a failed payment
        for sub in await list_subscriptions(customer_id):
            if sub['status'] in LIVE_STATUSES:
                await stripe_call(stripe.Subscription.cancel, sub['id'])
                logger.info(f"Subscription {sub['id']} ({sub['status']}) cancelled immediately for {current_user.email}")
        await _sync_after_change(db, current_user)

        return {
            "status": "cancelled",
            "message": "Your subscription has been cancelled. Your data is preserved — resubscribe anytime to regain access.",
            "account_locked": True,
        }

    except HTTPException:
        raise
    except stripe.error.StripeError as e:
        logger.error(f"Stripe error in immediate cancel for {current_user.email}: {e}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="We couldn't cancel your subscription. Please try again or contact support."
        )
    except Exception as e:
        logger.error(f"Error in immediate cancel for {current_user.email}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not cancel subscription."
        )


# ---- Status & Config ----

def _epoch(dt: Optional[datetime]) -> Optional[int]:
    return int(dt.replace(tzinfo=dt.tzinfo or timezone.utc).timestamp()) if dt else None


@router.get("/subscription-status")
async def get_subscription_status(
    refresh: bool = Query(False, description="Re-read from Stripe first (after a payment)."),
    current_user: User = Depends(get_current_user_any_subscription),
    db: AsyncSession = Depends(get_db),
):
    """Get current user's subscription status including trial info and period end date.

    Works without a live subscription: the route guard reads it to decide where to
    send people. subscription_status: 'active' / 'trialing' (in the app),
    'past_due' / 'unpaid' (fix payment on /billing; open_invoice_url pays it), or
    None (no live subscription — subscribe on /payment; trial_eligible says
    whether a trial applies).

    Answers from the stored state, so a guarded page load with a live subscription
    never calls Stripe. It re-reads Stripe first when asked (refresh, right after a
    payment), when the user was never synced, or when they have no access, which
    is when a payment may just have landed ahead of its webhook. Those re-reads
    are rate-limited per user; over the limit, or if Stripe fails, the stored
    state is the answer.
    """
    has_access_status = current_user.subscription_status in ACCESS_STATUSES
    if (
        refresh
        or current_user.subscription_synced_at is None
        or not (has_access_status or is_exempt(current_user))
    ) and within_rate_limit(f"stripe-sync:{current_user.id}", 10, 60):
        try:
            await sync_user(db, current_user)
        except Exception as e:
            logger.warning(f"Stripe sync failed for {current_user.email}; answering from stored state: {e}")

    if is_exempt(current_user) and current_user.subscription_status not in ACCESS_STATUSES:
        # Admins and the demo account (tutorial recordings) use the app without one
        return {
            "subscription_tier": "professional" if is_demo(current_user) else current_user.subscription_tier,
            "email": current_user.email,
            "subscription_status": "active",
            "trial_end": None,
            "cancel_at_period_end": False,
            "current_period_end": None,
            "open_invoice_url": None,
            "trial_eligible": False,
        }

    sub_status = current_user.subscription_status
    live = sub_status in LIVE_STATUSES

    open_invoice_url = None
    if sub_status in FIX_PAYMENT_STATUSES and current_user.stripe_subscription_id:
        try:
            sub = await stripe_call(stripe.Subscription.retrieve, current_user.stripe_subscription_id)
            if sub.get('latest_invoice'):
                invoice = await stripe_call(stripe.Invoice.retrieve, sub['latest_invoice'])
                if invoice.get('status') == 'open':
                    open_invoice_url = invoice.get('hosted_invoice_url')
        except Exception as e:
            logger.warning(f"Could not fetch the open invoice for {current_user.email}: {e}")

    return {
        "subscription_tier": current_user.subscription_tier,
        "email": current_user.email,
        "subscription_status": sub_status if live else None,
        "trial_end": _epoch(current_user.trial_end) if live else None,  # Unix timestamp
        "cancel_at_period_end": bool(current_user.cancel_at_period_end) if live else False,
        "current_period_end": _epoch(current_user.current_period_end) if live else None,  # Unix timestamp
        "open_invoice_url": open_invoice_url,
        "trial_eligible": not current_user.has_had_trial,
    }


class BillingPortalRequest(BaseModel):
    return_to: str = "account"  # 'account' or 'billing'


@router.post("/billing-portal")
async def create_billing_portal_session(
    request: BillingPortalRequest,
    current_user: User = Depends(get_current_user_any_subscription),
    db: AsyncSession = Depends(get_db),
):
    """Open the Stripe Customer Portal: update the card, pay or download invoices.

    Plan changes and cancellation stay in-app — turn those off in the portal's
    Dashboard settings so they don't bypass create-subscription and the cancel flow.
    """
    return_path = "/billing" if request.return_to == "billing" else "/account"
    try:
        customer_id = await find_customer_id(current_user)
        if not customer_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No billing account found. Choose a plan to get started."
            )
        await db.commit()  # keeps a customer link found by email
        session = await stripe_call(
            stripe.billing_portal.Session.create,
            customer=customer_id,
            return_url=f"{settings.FRONTEND_URL}{return_path}",
        )
        return {"url": session.url}
    except HTTPException:
        raise
    except stripe.error.StripeError as e:
        # Usually: the Customer Portal hasn't been activated in the Stripe Dashboard
        logger.error(f"Billing portal session failed for {current_user.email}: {e}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Billing management is temporarily unavailable. Please contact support@nwc-analytics.com."
        )


@router.get("/config")
async def get_stripe_config():
    """Get Stripe publishable key for frontend"""
    return {
        "publishable_key": settings.STRIPE_PUBLISHABLE_KEY,
        "beginner_price_id": settings.STRIPE_BEGINNER_PRICE_ID,
        "casual_price_id": settings.STRIPE_CASUAL_PRICE_ID,
        "active_price_id": settings.STRIPE_ACTIVE_PRICE_ID,
        "professional_price_id": settings.STRIPE_PROFESSIONAL_PRICE_ID
    }
