"""
Stripe Payment Integration - Handle subscriptions
"""
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import stripe
from typing import Optional

from app.db.models import User
from app.api.dependencies import get_current_user
from app.db.session import get_db
from app.config import settings

router = APIRouter()

# Initialize Stripe
stripe.api_key = settings.STRIPE_SECRET_KEY


@router.post("/create-checkout-session")
async def create_checkout_session(
    price_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Create a Stripe Checkout session for subscription
    
    Parameters:
    - price_id: The Stripe Price ID for the subscription plan
    """
    try:
        # Determine which plan based on price_id
        if price_id == settings.STRIPE_CASUAL_PRICE_ID:
            plan_name = "Casual Retail Investor"
        elif price_id == settings.STRIPE_ACTIVE_PRICE_ID:
            plan_name = "Active Retail Investor"
        elif price_id == settings.STRIPE_UNLIMITED_PRICE_ID:
            plan_name = "Unlimited Investor"
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid price ID"
            )
        
        # Create Stripe Checkout Session
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


@router.post("/webhook")
async def stripe_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    """
    Handle Stripe webhook events
    This endpoint is called by Stripe when subscription events occur
    """
    payload = await request.body()
    sig_header = request.headers.get('stripe-signature')
    
    try:
        event = stripe.Webhook.construct_event(
            payload, sig_header, settings.STRIPE_WEBHOOK_SECRET
        )
    except ValueError as e:
        # Invalid payload
        raise HTTPException(status_code=400, detail="Invalid payload")
    except stripe.error.SignatureVerificationError as e:
        # Invalid signature
        raise HTTPException(status_code=400, detail="Invalid signature")
    
    # Handle the event
    if event['type'] == 'checkout.session.completed':
        session = event['data']['object']
        await handle_checkout_session_completed(session, db)
    
    elif event['type'] == 'customer.subscription.updated':
        subscription = event['data']['object']
        await handle_subscription_updated(subscription, db)
    
    elif event['type'] == 'customer.subscription.deleted':
        subscription = event['data']['object']
        await handle_subscription_deleted(subscription, db)
    
    elif event['type'] == 'invoice.payment_failed':
        invoice = event['data']['object']
        await handle_payment_failed(invoice, db)
    
    return {"status": "success"}


async def handle_checkout_session_completed(session, db: AsyncSession):
    """Handle successful checkout - upgrade user's subscription"""
    user_id = session['metadata'].get('user_id')
    
    if not user_id:
        print("No user_id in session metadata")
        return
    
    # Get subscription from session
    subscription_id = session.get('subscription')
    
    if subscription_id:
        # Retrieve subscription to get price_id
        subscription = stripe.Subscription.retrieve(subscription_id)
        price_id = subscription['items']['data'][0]['price']['id']
        
        # Determine tier based on price_id
        if price_id == settings.STRIPE_CASUAL_PRICE_ID:
            new_tier = 'casual'
        elif price_id == settings.STRIPE_ACTIVE_PRICE_ID:
            new_tier = 'active'
        elif price_id == settings.STRIPE_UNLIMITED_PRICE_ID:
            new_tier = 'unlimited'
        else:
            new_tier = 'free'
        
        # Update user tier
        result = await db.execute(
            select(User).where(User.id == user_id)
        )
        user = result.scalar_one_or_none()
        
        if user:
            user.subscription_tier = new_tier
            await db.commit()
            print(f"✅ User {user.email} upgraded to {new_tier}")


async def handle_subscription_updated(subscription, db: AsyncSession):
    """Handle subscription updates (e.g., plan changes)"""
    user_id = subscription['metadata'].get('user_id')
    
    if not user_id:
        return
    
    # Get price_id from subscription
    price_id = subscription['items']['data'][0]['price']['id']
    
    # Determine tier
    if price_id == settings.STRIPE_CASUAL_PRICE_ID:
        new_tier = 'casual'
    elif price_id == settings.STRIPE_ACTIVE_PRICE_ID:
        new_tier = 'active'
    elif price_id == settings.STRIPE_UNLIMITED_PRICE_ID:
        new_tier = 'unlimited'
    else:
        new_tier = 'free'
    
    # Update user tier
    result = await db.execute(
        select(User).where(User.id == user_id)
    )
    user = result.scalar_one_or_none()
    
    if user:
        user.subscription_tier = new_tier
        await db.commit()
        print(f"✅ User {user.email} subscription updated to {new_tier}")

        
async def handle_subscription_deleted(subscription, db: AsyncSession):
    """Handle subscription cancellation - downgrade to free"""
    user_id = subscription['metadata'].get('user_id')
    
    if not user_id:
        return
    
    # Downgrade user to free tier
    result = await db.execute(
        select(User).where(User.id == user_id)
    )
    user = result.scalar_one_or_none()
    
    if user:
        user.subscription_tier = 'free'
        await db.commit()
        print(f"⚠️ User {user.email} subscription canceled, downgraded to free")


async def handle_payment_failed(invoice, db: AsyncSession):
    """Handle failed payment - could send email notification"""
    customer_email = invoice.get('customer_email')
    print(f"❌ Payment failed for {customer_email}")
    # TODO: Send email notification to user


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
        "unlimited_price_id": settings.STRIPE_UNLIMITED_PRICE_ID
    }