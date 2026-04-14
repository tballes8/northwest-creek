"""
Stripe Payment Integration - Handle subscriptions
Supports both:
  - Stripe Checkout (redirect) via /create-checkout-session
  - Stripe Elements (in-app) via /create-subscription
"""
import logging
import time
from collections import OrderedDict
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
import stripe
from typing import Optional

from app.db.models import User
from app.api.dependencies import get_current_user
from app.db.session import get_db
from app.config import settings
from app.services.email_service import email_service

logger = logging.getLogger(__name__)


# ---- Webhook Event Deduplication ----
# Prevents duplicate processing when Stripe retries delivery.
# TTL-based: entries older than 24h are evicted on insert.
_PROCESSED_EVENTS: OrderedDict[str, float] = OrderedDict()
_EVENT_TTL = 86400  # 24 hours

def _is_duplicate_event(event_id: str) -> bool:
    """Check if we've already processed this webhook event."""
    now = time.time()
    # Evict stale entries (oldest are first in OrderedDict)
    while _PROCESSED_EVENTS:
        oldest_key, oldest_ts = next(iter(_PROCESSED_EVENTS.items()))
        if now - oldest_ts > _EVENT_TTL:
            _PROCESSED_EVENTS.pop(oldest_key)
        else:
            break
    if event_id in _PROCESSED_EVENTS:
        return True
    _PROCESSED_EVENTS[event_id] = now
    return False

router = APIRouter()

# Initialize Stripe
stripe.api_key = settings.STRIPE_SECRET_KEY


# ---- Request Models ----

class CheckoutRequest(BaseModel):
    price_id: str

class SubscriptionRequest(BaseModel):
    tier: str  # 'beginner', 'casual', 'active', 'professional'


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


def get_plan_name_for_price(price_id: str) -> str:
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


def get_tier_for_price(price_id: str) -> str:
    """Get tier slug from price ID"""
    if price_id == getattr(settings, 'STRIPE_BEGINNER_PRICE_ID', None):
        return 'beginner'
    elif price_id == settings.STRIPE_CASUAL_PRICE_ID:
        return 'casual'
    elif price_id == settings.STRIPE_ACTIVE_PRICE_ID:
        return 'active'
    elif price_id == settings.STRIPE_PROFESSIONAL_PRICE_ID:
        return 'professional'
    return 'beginner'


# Tiers that get a 14-day free trial
TRIAL_TIERS = {'beginner', 'casual'}
TRIAL_DAYS = 14


def tier_gets_trial(tier: str) -> bool:
    """Check if a tier is eligible for a free trial"""
    return tier in TRIAL_TIERS


def price_gets_trial(price_id: str) -> bool:
    """Check if a price ID maps to a trial-eligible tier"""
    return get_tier_for_price(price_id) in TRIAL_TIERS


# ---- Endpoints ----

@router.post("/create-subscription")
async def create_subscription(
    request: SubscriptionRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Create or upgrade a Stripe subscription.

    - **New subscriber:** Creates a Customer + Subscription, returns client_secret
      for the frontend to confirm payment via Stripe Elements.
    - **Existing subscriber (upgrade/downgrade):** Modifies the current subscription
      in-place, swapping the price item with proration. Stripe automatically
      calculates the credit from the old plan and charges the difference.
      If the customer already has a payment method on file, the prorated
      invoice is paid automatically — no client_secret needed.
    """
    try:
        new_price_id = get_price_id_for_tier(request.tier)

        # ── Step 1: Find or create Stripe Customer ────────────
        customers = stripe.Customer.list(email=current_user.email, limit=1)

        if customers.data:
            customer = customers.data[0]
        else:
            customer = stripe.Customer.create(
                email=current_user.email,
                name=current_user.full_name or current_user.email,
                metadata={
                    'user_id': str(current_user.id),
                }
            )

        # Cache Stripe customer ID on user record to avoid future lookups
        if not current_user.stripe_customer_id or current_user.stripe_customer_id != customer.id:
            current_user.stripe_customer_id = customer.id
            await db.commit()

        # ── Step 2: Check for existing active subscription ────
        existing_subs = stripe.Subscription.list(
            customer=customer.id,
            status='active',
            limit=10,
        )

        # Also check for subscriptions scheduled to cancel (cancel_at_period_end)
        # — the user may have cancelled but still has an active sub until period end
        if not existing_subs.data:
            existing_subs = stripe.Subscription.list(
                customer=customer.id,
                status='trialing',
                limit=10,
            )

        active_sub = existing_subs.data[0] if existing_subs.data else None

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
                stripe.Subscription.modify(
                    active_sub.id,
                    cancel_at_period_end=False,
                )

            # Swap the price item with proration
            # Stripe calculates: (new price × remaining days) - (old price × remaining days)
            updated_sub = stripe.Subscription.modify(
                active_sub.id,
                items=[{
                    'id': current_item['id'],
                    'price': new_price_id,
                }],
                proration_behavior='create_prorations',
                metadata={
                    'user_id': str(current_user.id),
                    'plan_name': get_plan_name_for_price(new_price_id),
                },
                expand=['latest_invoice.payment_intent'],
            )

            # The prorated invoice is usually paid automatically if the customer
            # has a default payment method on file. Check if we need a client_secret.
            latest_invoice = updated_sub.latest_invoice
            payment_intent = latest_invoice.payment_intent if latest_invoice else None

            if payment_intent and payment_intent.status in ('requires_payment_method', 'requires_confirmation', 'requires_action'):
                # Customer needs to confirm payment (e.g., no card on file, 3D Secure)
                return {
                    "subscription_id": updated_sub.id,
                    "client_secret": payment_intent.client_secret,
                    "upgrade": True,
                }
            else:
                # Payment succeeded automatically — update tier immediately
                new_tier = get_tier_for_price(new_price_id)
                old_tier = current_user.subscription_tier
                current_user.subscription_tier = new_tier
                await db.commit()
                print(f"✅ User {current_user.email} upgraded from {old_tier} to {new_tier} (prorated)")

                # Send upgrade email
                try:
                    plan_name = get_plan_name_for_price(new_price_id)
                    email_service.send_payment_success_email(
                        to_email=current_user.email,
                        user_name=current_user.full_name or current_user.email,
                        plan_name=plan_name,
                        tier=new_tier,
                    )
                except Exception as email_err:
                    print(f"⚠️ Upgrade email failed: {email_err}")

                return {
                    "subscription_id": updated_sub.id,
                    "client_secret": None,
                    "upgrade": True,
                    "message": f"Upgraded to {get_plan_name_for_price(new_price_id)}! Prorated charge applied.",
                    "new_tier": new_tier,
                }

        else:
            # ── NEW SUBSCRIPTION PATH ─────────────────────────
            tier = get_tier_for_price(new_price_id)
            is_trial = tier_gets_trial(tier)

            if is_trial:
                # Trial subscription: $0 first invoice, collect card via SetupIntent
                subscription = stripe.Subscription.create(
                    customer=customer.id,
                    items=[{'price': new_price_id}],
                    trial_period_days=TRIAL_DAYS,
                    payment_settings={
                        'save_default_payment_method': 'on_subscription',
                    },
                    expand=['pending_setup_intent'],
                    metadata={
                        'user_id': str(current_user.id),
                        'plan_name': get_plan_name_for_price(new_price_id),
                    },
                )

                setup_intent = subscription.pending_setup_intent
                client_secret = setup_intent.client_secret if setup_intent else None

                # Trial starts immediately — upgrade user now
                current_user.subscription_tier = tier
                await db.commit()
                print(f"✅ User {current_user.email} started {TRIAL_DAYS}-day trial on {tier}")

                return {
                    "subscription_id": subscription.id,
                    "client_secret": client_secret,
                    "is_trial": True,
                    "upgrade": False,
                }
            else:
                # Non-trial: collect payment upfront
                subscription = stripe.Subscription.create(
                    customer=customer.id,
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

                client_secret = subscription.latest_invoice.payment_intent.client_secret

                return {
                    "subscription_id": subscription.id,
                    "client_secret": client_secret,
                    "is_trial": False,
                    "upgrade": False,
                }

    except HTTPException:
        raise
    except stripe.error.StripeError as e:
        print(f"Stripe error in create-subscription: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Payment setup failed. Please try again or contact support."
        )
    except Exception as e:
        print(f"Error creating subscription: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not set up subscription. Please try again."
        )


@router.post("/create-checkout-session")
async def create_checkout_session(
    request: CheckoutRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Create a Stripe Checkout session (redirect-based).
    Kept for backward compatibility with Pricing page upgrades.
    """
    try:
        price_id = request.price_id
        plan_name = get_plan_name_for_price(price_id)
        
        if plan_name == "Unknown":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid price ID"
            )
        
        checkout_session = stripe.checkout.Session.create(
            customer_email=current_user.email,
            payment_method_types=['card'],
            line_items=[
                {
                    'price': price_id,
                    'quantity': 1,
                },
            ],
            mode='subscription',
            success_url=f"{settings.FRONTEND_URL}/payment-success?session_id={{CHECKOUT_SESSION_ID}}",
            cancel_url=f"{settings.FRONTEND_URL}/pricing?canceled=true",
            metadata={
                'user_id': str(current_user.id),
                'plan_name': plan_name,
            },
            subscription_data={
                'metadata': {
                    'user_id': str(current_user.id),
                },
                **(
                    {'trial_period_days': TRIAL_DAYS}
                    if price_gets_trial(price_id) else {}
                ),
            }
        )
        
        return {
            "checkout_url": checkout_session.url,
            "session_id": checkout_session.id
        }
        
    except stripe.error.StripeError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Payment setup failed. Please try again or contact support."
        )
    except Exception as e:
        print(f"Error creating checkout session: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not create checkout session"
        )


# ---- Webhook ----

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
    if _is_duplicate_event(event_id):
        logger.info(f"Skipping duplicate webhook event: {event_id}")
        return {"status": "duplicate_skipped"}

    try:
        if event_type == 'checkout.session.completed':
            session = event['data']['object']
            await handle_checkout_completed(session, db)

        elif event_type == 'invoice.paid':
            invoice = event['data']['object']
            await handle_invoice_paid(invoice, db)

        elif event_type == 'customer.subscription.updated':
            subscription = event['data']['object']
            await handle_subscription_updated(subscription, db)

        elif event_type == 'customer.subscription.deleted':
            subscription = event['data']['object']
            await handle_subscription_deleted(subscription, db)

        elif event_type == 'invoice.payment_failed':
            invoice = event['data']['object']
            await handle_payment_failed(invoice, db)

        elif event_type == 'customer.subscription.trial_will_end':
            subscription = event['data']['object']
            await handle_trial_will_end(subscription, db)

        else:
            logger.info(f"Unhandled webhook event type: {event_type}")

    except Exception as e:
        # Log the full error with context so we can debug subscriber issues
        logger.error(f"WEBHOOK HANDLER FAILED: {event_type} event={event_id} error={e}", exc_info=True)
        # Return 500 so Stripe retries this event
        raise HTTPException(status_code=500, detail=f"Webhook handler error: {event_type}")

    return {"status": "success"}


# ---- Webhook Handlers ----

async def handle_checkout_completed(session, db: AsyncSession):
    """Handle successful Stripe Checkout — upgrade user's subscription."""
    user_id = session['metadata'].get('user_id')
    if not user_id:
        logger.warning("No user_id in checkout session metadata")
        return

    subscription_id = session.get('subscription')
    if not subscription_id:
        return

    subscription = stripe.Subscription.retrieve(subscription_id)
    price_id = subscription['items']['data'][0]['price']['id']
    new_tier = get_tier_for_price(price_id)

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user:
        logger.error(f"User {user_id} not found in DB for checkout.session.completed")
        return

    old_tier = user.subscription_tier
    user.subscription_tier = new_tier
    user.is_active = True
    await db.commit()
    logger.info(f"User {user.email} tier updated: {old_tier} -> {new_tier} (checkout.session.completed)")

    if old_tier != new_tier:
        try:
            plan_name = get_plan_name_for_price(price_id)
            email_service.send_payment_success_email(
                to_email=user.email,
                user_name=user.full_name or user.email,
                plan_name=plan_name,
                tier=new_tier
            )
        except Exception as email_err:
            logger.warning(f"Payment success email failed for {user.email}: {email_err}")


async def handle_invoice_paid(invoice, db: AsyncSession):
    """Handle successful invoice payment — works for both Checkout and Elements flows.

    This is the AUTHORITATIVE tier update path. If this fails, the user's tier
    won't match their Stripe subscription, so errors must propagate (not be swallowed).
    """
    subscription_id = invoice.get('subscription')
    if not subscription_id:
        return

    subscription = stripe.Subscription.retrieve(subscription_id)
    user_id = subscription['metadata'].get('user_id')

    if not user_id:
        logger.warning(f"No user_id in subscription {subscription_id} metadata — cannot update tier")
        return

    price_id = subscription['items']['data'][0]['price']['id']
    new_tier = get_tier_for_price(price_id)

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user:
        logger.error(f"User {user_id} not found in DB for invoice.paid (subscription={subscription_id})")
        return

    old_tier = user.subscription_tier
    user.subscription_tier = new_tier
    # Ensure account is active (could have been degraded by a prior payment failure)
    user.is_active = True
    await db.commit()
    logger.info(f"User {user.email} tier updated: {old_tier} -> {new_tier} (invoice.paid)")

    if old_tier != new_tier:
        try:
            plan_name = get_plan_name_for_price(price_id)
            email_service.send_payment_success_email(
                to_email=user.email,
                user_name=user.full_name or user.email,
                plan_name=plan_name,
                tier=new_tier
            )
        except Exception as email_err:
            # Email failure is non-critical — log but don't fail the webhook
            logger.warning(f"Payment success email failed for {user.email}: {email_err}")


async def handle_subscription_updated(subscription, db: AsyncSession):
    """Handle subscription updates (e.g., plan changes, status transitions)."""
    user_id = subscription['metadata'].get('user_id')
    if not user_id:
        return

    sub_status = subscription.get('status')
    price_id = subscription['items']['data'][0]['price']['id']
    new_tier = get_tier_for_price(price_id)

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user:
        logger.warning(f"User {user_id} not found for subscription.updated")
        return

    # If subscription moved to past_due or unpaid, don't upgrade — keep current tier
    # and let handle_payment_failed deal with the notification
    if sub_status in ('past_due', 'unpaid', 'canceled'):
        logger.info(f"Subscription {subscription['id']} status={sub_status} for {user.email} — skipping tier update")
        return

    old_tier = user.subscription_tier
    user.subscription_tier = new_tier
    await db.commit()
    logger.info(f"User {user.email} subscription updated: {old_tier} -> {new_tier} (status={sub_status})")


async def handle_subscription_deleted(subscription, db: AsyncSession):
    """Handle subscription end — lock account.

    Fires when: cancel-at-period-end reaches its end, or all payment retries exhausted.
    Account is locked (is_active=False) but data is preserved in DB.
    User can resubscribe to unlock.
    """
    user_id = subscription['metadata'].get('user_id')
    if not user_id:
        return

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if user:
        old_tier = user.subscription_tier
        user.is_active = False
        await db.commit()
        logger.info(f"User {user.email} subscription ended: was {old_tier}, account locked (data preserved)")


async def handle_payment_failed(invoice, db: AsyncSession):
    """Handle failed payment — notify user and log for monitoring.

    Stripe will retry failed payments automatically (Smart Retries).
    We don't downgrade immediately — let Stripe exhaust retries first.
    If all retries fail, Stripe sends customer.subscription.deleted which downgrades.
    """
    subscription_id = invoice.get('subscription')
    customer_email = invoice.get('customer_email')
    attempt_count = invoice.get('attempt_count', 1)

    logger.error(f"Payment failed: email={customer_email} subscription={subscription_id} attempt={attempt_count}")

    # Look up user to send notification
    if subscription_id:
        try:
            subscription = stripe.Subscription.retrieve(subscription_id)
            user_id = subscription['metadata'].get('user_id')

            if user_id:
                result = await db.execute(select(User).where(User.id == user_id))
                user = result.scalar_one_or_none()

                if user:
                    price_id = subscription['items']['data'][0]['price']['id']
                    plan_name = get_plan_name_for_price(price_id)
                    try:
                        email_service.send_payment_failed_email(
                            to_email=user.email,
                            user_name=user.full_name or user.email,
                            plan_name=plan_name,
                        )
                        logger.info(f"Payment failed email sent to {user.email}")
                    except Exception as email_err:
                        logger.warning(f"Payment failed email could not be sent to {user.email}: {email_err}")
        except Exception as e:
            logger.error(f"Error looking up user for payment failure: {e}")


async def handle_trial_will_end(subscription, db: AsyncSession):
    """Handle trial ending soon — send warning email so user isn't surprised by charge."""
    user_id = subscription['metadata'].get('user_id')
    if not user_id:
        return

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user:
        logger.warning(f"User {user_id} not found for trial_will_end")
        return

    trial_end = subscription.get('trial_end')
    days_remaining = 3  # Stripe fires this event ~3 days before trial end
    if trial_end:
        import time as _time
        days_remaining = max(1, int((trial_end - _time.time()) / 86400))

    price_id = subscription['items']['data'][0]['price']['id']
    plan_name = get_plan_name_for_price(price_id)

    try:
        email_service.send_trial_ending_email(
            to_email=user.email,
            user_name=user.full_name or user.email,
            plan_name=plan_name,
            days_remaining=days_remaining,
        )
        logger.info(f"Trial ending email sent to {user.email} ({days_remaining} days left)")
    except Exception as email_err:
        logger.warning(f"Trial ending email failed for {user.email}: {email_err}")


# ---- Cancel Subscription ----

@router.post("/cancel-subscription")
async def cancel_subscription(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Cancel the user's Stripe subscription.
    Cancels at period end so user keeps access until billing cycle finishes.
    """
    try:
        # Find customer by email
        customers = stripe.Customer.list(email=current_user.email, limit=1)
        if not customers.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No Stripe customer found for this account."
            )
        
        customer = customers.data[0]
        
        # Find active subscriptions
        subscriptions = stripe.Subscription.list(
            customer=customer.id,
            status='active',
            limit=10
        )
        
        if not subscriptions.data:
            # Check for trialing subscriptions too
            subscriptions = stripe.Subscription.list(
                customer=customer.id,
                status='trialing',
                limit=10
            )
        
        if not subscriptions.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No active subscription found."
            )
        
        cancelled_ids = []
        for sub in subscriptions.data:
            # Cancel at period end — user keeps access until billing cycle ends
            stripe.Subscription.modify(
                sub.id,
                cancel_at_period_end=True
            )
            cancelled_ids.append(sub.id)
            print(f"🚫 Subscription {sub.id} set to cancel at period end for {current_user.email}")
        
        return {
            "status": "cancellation_scheduled",
            "message": "Your subscription will be cancelled at the end of the current billing period. You'll keep access to all features until then.",
            "subscription_ids": cancelled_ids,
        }
        
    except HTTPException:
        raise
    except stripe.error.StripeError as e:
        print(f"Stripe error cancelling subscription: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to cancel subscription: {str(e)}"
        )
    except Exception as e:
        print(f"Error cancelling subscription: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not cancel subscription. Please try again."
        )


@router.post("/cancel-subscription-immediate")
async def cancel_subscription_immediate(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Immediately cancel subscription and lock account.
    Used for trial cancellations — user is not charged, account is deactivated.
    """
    try:
        customers = stripe.Customer.list(email=current_user.email, limit=1)
        if not customers.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No Stripe customer found."
            )
        
        customer = customers.data[0]

        # Search both active and trialing subscriptions
        cancelled_ids = []
        for sub_status in ('active', 'trialing'):
            subscriptions = stripe.Subscription.list(
                customer=customer.id,
                status=sub_status,
                limit=10
            )
            for sub in subscriptions.data:
                stripe.Subscription.cancel(sub.id)
                cancelled_ids.append(sub.id)
                print(f"🚫 Subscription {sub.id} ({sub_status}) cancelled immediately for {current_user.email}")
        
        # Trial cancel: lock immediately — no paid time remaining
        old_tier = current_user.subscription_tier
        current_user.is_active = False
        await db.commit()

        logger.info(f"User {current_user.email} trial cancelled immediately: was {old_tier}, account locked")

        return {
            "status": "cancelled",
            "message": "Your trial has been cancelled. Your data is preserved — resubscribe anytime to regain access.",
            "account_locked": True,
        }
        
    except HTTPException:
        raise
    except stripe.error.StripeError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to cancel: {str(e)}"
        )
    except Exception as e:
        print(f"Error in immediate cancel: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not cancel subscription."
        )


# ---- Status & Config ----

@router.get("/subscription-status")
async def get_subscription_status(
    current_user: User = Depends(get_current_user)
):
    """Get current user's subscription status including trial info and period end date."""
    # Demo account bypass for tutorial recordings
    DEMO_EMAILS = {"john.smith@nwc-analytics.com"}
    if current_user.email in DEMO_EMAILS:
        return {
            "subscription_tier": "professional",
            "email": current_user.email,
            "subscription_status": "active",
            "trial_end": None,
            "cancel_at_period_end": False,
            "current_period_end": None,
        }

    trial_end = None
    subscription_status = None
    cancel_at_period_end = False
    current_period_end = None

    try:
        customers = stripe.Customer.list(email=current_user.email, limit=1)
        if customers.data:
            customer = customers.data[0]
            # Check trialing first, then active
            for sub_status in ('trialing', 'active'):
                subs = stripe.Subscription.list(
                    customer=customer.id,
                    status=sub_status,
                    limit=1,
                )
                if subs.data:
                    sub = subs.data[0]
                    subscription_status = sub['status']
                    cancel_at_period_end = sub.get('cancel_at_period_end', False)
                    current_period_end = sub.get('current_period_end')  # Unix timestamp
                    if sub.get('trial_end'):
                        trial_end = sub['trial_end']  # Unix timestamp
                    break
    except Exception as e:
        logger.warning(f"Error fetching Stripe subscription status for {current_user.email}: {e}")

    return {
        "subscription_tier": current_user.subscription_tier,
        "email": current_user.email,
        "subscription_status": subscription_status,
        "trial_end": trial_end,
        "cancel_at_period_end": cancel_at_period_end,
        "current_period_end": current_period_end,
    }


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