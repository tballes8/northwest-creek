"""
Stripe Payment Integration - Handle subscriptions
Supports both:
  - Stripe Checkout (redirect) via /create-checkout-session
  - Stripe Elements (in-app) via /create-subscription
"""
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

router = APIRouter()

# Initialize Stripe
stripe.api_key = settings.STRIPE_SECRET_KEY


# ---- Request Models ----

class CheckoutRequest(BaseModel):
    price_id: str

class SubscriptionRequest(BaseModel):
    tier: str  # 'casual', 'active', 'professional'


# ---- Helper: Map tier to price ID ----

def get_price_id_for_tier(tier: str) -> str:
    """Get Stripe Price ID for a given tier"""
    tier_map = {
        'casual': settings.STRIPE_CASUAL_PRICE_ID,
        'active': settings.STRIPE_ACTIVE_PRICE_ID,
        'professional': settings.STRIPE_PROFESSIONAL_PRICE_ID,
    }
    price_id = tier_map.get(tier)
    if not price_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid tier: {tier}. Must be casual, active, or professional."
        )
    return price_id


def get_plan_name_for_price(price_id: str) -> str:
    """Get plan name from price ID"""
    if price_id == settings.STRIPE_CASUAL_PRICE_ID:
        return "Casual Retail Investor"
    elif price_id == settings.STRIPE_ACTIVE_PRICE_ID:
        return "Active Retail Investor"
    elif price_id == settings.STRIPE_PROFESSIONAL_PRICE_ID:
        return "Professional Investor"
    return "Unknown"


def get_tier_for_price(price_id: str) -> str:
    """Get tier slug from price ID"""
    if price_id == settings.STRIPE_CASUAL_PRICE_ID:
        return 'casual'
    elif price_id == settings.STRIPE_ACTIVE_PRICE_ID:
        return 'active'
    elif price_id == settings.STRIPE_PROFESSIONAL_PRICE_ID:
        return 'professional'
    return 'free'


# ---- Endpoints ----

@router.post("/create-subscription")
async def create_subscription(
    request: SubscriptionRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Create a Stripe Customer + Subscription for in-app payment via Stripe Elements.
    Returns the client_secret for the frontend to confirm payment.
    """
    try:
        price_id = get_price_id_for_tier(request.tier)
        
        # Step 1: Find or create Stripe Customer
        # Search by email to avoid duplicates
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
        
        # Step 2: Create Subscription with incomplete payment
        # This creates an Invoice + PaymentIntent automatically
        subscription = stripe.Subscription.create(
            customer=customer.id,
            items=[{'price': price_id}],
            payment_behavior='default_incomplete',
            payment_settings={
                'save_default_payment_method': 'on_subscription',
            },
            expand=['latest_invoice.payment_intent'],
            metadata={
                'user_id': str(current_user.id),
                'plan_name': get_plan_name_for_price(price_id),
            },
        )
        
        # Extract client_secret from the PaymentIntent
        client_secret = subscription.latest_invoice.payment_intent.client_secret
        
        return {
            "subscription_id": subscription.id,
            "client_secret": client_secret,
        }
        
    except stripe.error.StripeError as e:
        print(f"Stripe error in create-subscription: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Payment setup failed: {str(e)}"
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
                }
            }
        )
        
        return {
            "checkout_url": checkout_session.url,
            "session_id": checkout_session.id
        }
        
    except stripe.error.StripeError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Stripe error: {str(e)}"
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
    """Handle Stripe webhook events"""
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
    
    event_type = event['type']
    print(f"📨 Stripe webhook: {event_type}")
    
    if event_type == 'checkout.session.completed':
        session = event['data']['object']
        await handle_checkout_completed(session, db)
    
    elif event_type == 'invoice.paid':
        # This fires for both Checkout and Elements-based subscriptions
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
    
    return {"status": "success"}


# ---- Webhook Handlers ----

async def handle_checkout_completed(session, db: AsyncSession):
    """Handle successful Stripe Checkout — upgrade user's subscription"""
    user_id = session['metadata'].get('user_id')
    if not user_id:
        print("No user_id in checkout session metadata")
        return
    
    subscription_id = session.get('subscription')
    if subscription_id:
        subscription = stripe.Subscription.retrieve(subscription_id)
        price_id = subscription['items']['data'][0]['price']['id']
        new_tier = get_tier_for_price(price_id)
        
        result = await db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        
        if user:
            user.subscription_tier = new_tier
            await db.commit()
            print(f"✅ User {user.email} upgraded to {new_tier} (via Checkout)")


async def handle_invoice_paid(invoice, db: AsyncSession):
    """Handle successful invoice payment — works for both Checkout and Elements flows"""
    subscription_id = invoice.get('subscription')
    if not subscription_id:
        return
    
    try:
        subscription = stripe.Subscription.retrieve(subscription_id)
        user_id = subscription['metadata'].get('user_id')
        
        if not user_id:
            print(f"No user_id in subscription {subscription_id} metadata")
            return
        
        price_id = subscription['items']['data'][0]['price']['id']
        new_tier = get_tier_for_price(price_id)
        
        result = await db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        
        if user:
            user.subscription_tier = new_tier
            await db.commit()
            print(f"✅ User {user.email} upgraded to {new_tier} (via invoice.paid)")
    except Exception as e:
        print(f"Error handling invoice.paid: {e}")


async def handle_subscription_updated(subscription, db: AsyncSession):
    """Handle subscription updates (e.g., plan changes)"""
    user_id = subscription['metadata'].get('user_id')
    if not user_id:
        return
    
    price_id = subscription['items']['data'][0]['price']['id']
    new_tier = get_tier_for_price(price_id)
    
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    
    if user:
        user.subscription_tier = new_tier
        await db.commit()
        print(f"✅ User {user.email} subscription updated to {new_tier}")

        
async def handle_subscription_deleted(subscription, db: AsyncSession):
    """Handle subscription cancellation — downgrade to free"""
    user_id = subscription['metadata'].get('user_id')
    if not user_id:
        return
    
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    
    if user:
        user.subscription_tier = 'free'
        await db.commit()
        print(f"⚠️ User {user.email} subscription canceled, downgraded to free")


async def handle_payment_failed(invoice, db: AsyncSession):
    """Handle failed payment"""
    customer_email = invoice.get('customer_email')
    print(f"❌ Payment failed for {customer_email}")


# ---- Status & Config ----

@router.get("/subscription-status")
async def get_subscription_status(
    current_user: User = Depends(get_current_user)
):
    """Get current user's subscription status"""
    return {
        "subscription_tier": current_user.subscription_tier,
        "email": current_user.email
    }


@router.get("/config")
async def get_stripe_config():
    """Get Stripe publishable key for frontend"""
    return {
        "publishable_key": settings.STRIPE_PUBLISHABLE_KEY,
        "casual_price_id": settings.STRIPE_CASUAL_PRICE_ID,
        "active_price_id": settings.STRIPE_ACTIVE_PRICE_ID,
        "professional_price_id": settings.STRIPE_PROFESSIONAL_PRICE_ID
    }