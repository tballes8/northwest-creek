import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { loadStripe, Stripe, StripeElements } from '@stripe/stripe-js';
import {
  Elements,
  CardNumberElement,
  CardExpiryElement,
  CardCvcElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js';
import axios from 'axios';
import { PRICING_TIERS, TierSlug } from '../data/pricingTiers';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

type Tier = TierSlug;

interface TierInfo {
  name: string;
  price: string;
  priceNum: number;
  period: string;
  features: string[];
}

const PRICE_NUMS: Record<Tier, number> = {
  beginner: 10,
  casual: 20,
  active: 40,
  professional: 50,
};

const TIER_INFO: Record<Tier, TierInfo> = PRICING_TIERS.reduce((acc, t) => {
  acc[t.slug] = {
    name: t.name,
    price: t.price,
    priceNum: PRICE_NUMS[t.slug],
    period: t.period,
    features: t.highlightedBullet ? [t.highlightedBullet, ...t.bullets] : t.bullets,
  };
  return acc;
}, {} as Record<Tier, TierInfo>);

// Stripe Element styling for dark theme
const CARD_ELEMENT_OPTIONS = {
  style: {
    base: {
      color: '#ffffff',
      fontSize: '16px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      '::placeholder': {
        color: '#9ca3af',
      },
    },
    invalid: {
      color: '#ef4444',
      iconColor: '#ef4444',
    },
  },
};

// Tiers that start with a 14-day free trial
const TRIAL_TIERS: Tier[] = ['beginner', 'casual'];
const CheckoutForm: React.FC<{ tier: Tier; onSuccess: (isTrial: boolean) => void }> = ({ tier, onSuccess }) => {
  const stripe = useStripe();
  const elements = useElements();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [cardComplete, setCardComplete] = useState({ number: false, expiry: false, cvc: false });

  const tierInfo = TIER_INFO[tier];
  const isTrial = TRIAL_TIERS.includes(tier);
  const allComplete = cardComplete.number && cardComplete.expiry && cardComplete.cvc;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;

    setError('');
    setLoading(true);

    try {
      const token = localStorage.getItem('access_token');
      if (!token) {
        setError('You must be logged in. Please go back and verify your email.');
        setLoading(false);
        return;
      }

      // Step 1: Create or upgrade subscription on backend
      const response = await axios.post(
        `${API_URL}/api/v1/stripe/create-subscription`,
        { tier },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      const { client_secret, subscription_id, upgrade, message, new_tier, is_trial } = response.data;

      // If upgrade was auto-charged (card already on file), no confirmation needed
      if (upgrade && !client_secret) {
        onSuccess(false);
        return;
      }

      // Step 2: Confirm card
      const cardNumber = elements.getElement(CardNumberElement);
      if (!cardNumber) {
        setError('Card element not found.');
        setLoading(false);
        return;
      }

      if (is_trial) {
        // Trial: save card for future charges via SetupIntent
        const { error: setupError, setupIntent } = await stripe.confirmCardSetup(client_secret, {
          payment_method: { card: cardNumber },
        });

        if (setupError) {
          setError(setupError.message || 'Card setup failed. Please try again.');
          setLoading(false);
          return;
        }

        if (setupIntent?.status === 'succeeded') {
          onSuccess(true);
        } else {
          setError('Card verification is being processed. Please wait a moment.');
          setLoading(false);
        }
      } else {
        // Non-trial: charge immediately via PaymentIntent
        const { error: stripeError, paymentIntent } = await stripe.confirmCardPayment(client_secret, {
          payment_method: { card: cardNumber },
        });

        if (stripeError) {
          setError(stripeError.message || 'Payment failed. Please try again.');
          setLoading(false);
          return;
        }

        if (paymentIntent?.status === 'succeeded') {
          onSuccess(false);
        } else {
          setError('Payment is being processed. You will be notified once confirmed.');
          setLoading(false);
        }
      }
    } catch (err: any) {
      console.error('Payment error:', err);
      const detail = err.response?.data?.detail;
      setError(detail || 'Payment failed. Please check your card details and try again.');
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="bg-red-900/30 border border-red-700 text-red-400 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Card Number */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Card Number
        </label>
        <div className="bg-gray-800 border border-gray-600 rounded-lg px-4 py-3 focus-within:border-primary-500 focus-within:ring-1 focus-within:ring-primary-500 transition-colors">
          <CardNumberElement
            options={CARD_ELEMENT_OPTIONS}
            onChange={(e) => setCardComplete((prev) => ({ ...prev, number: e.complete }))}
          />
        </div>
      </div>

      {/* Expiry + CVC row */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Expiration
          </label>
          <div className="bg-gray-800 border border-gray-600 rounded-lg px-4 py-3 focus-within:border-primary-500 focus-within:ring-1 focus-within:ring-primary-500 transition-colors">
            <CardExpiryElement
              options={CARD_ELEMENT_OPTIONS}
              onChange={(e) => setCardComplete((prev) => ({ ...prev, expiry: e.complete }))}
            />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            CVC
          </label>
          <div className="bg-gray-800 border border-gray-600 rounded-lg px-4 py-3 focus-within:border-primary-500 focus-within:ring-1 focus-within:ring-primary-500 transition-colors">
            <CardCvcElement
              options={CARD_ELEMENT_OPTIONS}
              onChange={(e) => setCardComplete((prev) => ({ ...prev, cvc: e.complete }))}
            />
          </div>
        </div>
      </div>

      {/* Trial notice */}
      {isTrial && (
        <div className="bg-primary-900/20 border border-primary-700/50 rounded-lg px-4 py-3 text-sm text-primary-300">
          <strong>14-day free trial:</strong> Your card won't be charged today. After 14 days, you'll be automatically billed {tierInfo.price}{tierInfo.period}. Cancel anytime before to avoid charges.
        </div>
      )}

      {/* Security note */}
      <div className="flex items-center space-x-2 text-sm text-gray-400">
        <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
        </svg>
        <span>Secured by Stripe. Your card details never touch our servers.</span>
      </div>

      {/* Submit */}
      <button
        type="submit"
        disabled={loading || !stripe || !allComplete}
        className="w-full py-4 px-4 bg-primary-600 hover:bg-primary-700 text-white font-bold rounded-lg text-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
      >
        {loading ? (
          <>
            <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <span>Processing...</span>
          </>
        ) : isTrial ? (
          <span>Start 14-Day Free Trial</span>
        ) : (
          <span>Subscribe — {tierInfo.price}{tierInfo.period}</span>
        )}
      </button>
    </form>
  );
};

// ----- Main Payment Page -----
const Payment: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const tierParam = searchParams.get('tier') as Tier | null;
  const tier = tierParam && TIER_INFO[tierParam] ? tierParam : 'casual';

  const [stripePromise, setStripePromise] = useState<Promise<Stripe | null> | null>(null);
  const [loadError, setLoadError] = useState('');
  const [success, setSuccess] = useState(false);
  const [trialStarted, setTrialStarted] = useState(false);

  useEffect(() => {
    // Check if user is logged in
    const token = localStorage.getItem('access_token');
    if (!token) {
      navigate('/login');
      return;
    }

    // Load Stripe publishable key from backend
    const loadStripeKey = async () => {
      try {
        const response = await axios.get(`${API_URL}/api/v1/stripe/config`);
        const pk = response.data.publishable_key;
        if (pk) {
          setStripePromise(loadStripe(pk));
        } else {
          setLoadError('Payment configuration not available. Please contact support.');
        }
      } catch (err) {
        console.error('Failed to load Stripe config:', err);
        setLoadError('Unable to load payment system. Please try again later.');
      }
    };

    loadStripeKey();
  }, [navigate]);

  const tierInfo = TIER_INFO[tier];

  // Success state
  if (success) {
    return (
      <div className="min-h-screen bg-gray-900 flex flex-col justify-center py-12 px-4">
        <div className="max-w-md mx-auto w-full">
          <div className="bg-gray-800 border border-gray-700 rounded-2xl p-8 text-center">
            <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-green-900/50 border-2 border-green-500 mb-6">
              <svg className="h-8 w-8 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h3 className="text-2xl font-bold text-white mb-2">
              {trialStarted ? 'Free Trial Started!' : 'Payment Successful!'}
            </h3>
            <p className="text-gray-400 mb-2">
              Welcome to the <strong className="text-primary-400">{tierInfo.name}</strong> plan.
            </p>
            <p className="text-sm text-gray-500 mb-6">
              {trialStarted
                ? `Your 14-day free trial is active. You'll be billed ${tierInfo.price}${tierInfo.period} after the trial ends unless you cancel.`
                : 'Your subscription is now active. All premium features have been unlocked.'}
            </p>
            <Link
              to="/dashboard"
              className="block w-full py-3 px-4 bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-lg transition-colors text-center"
            >
              Go to Dashboard
            </Link>
            <p className="text-xs text-gray-500 mt-4">Redirecting in 5 seconds...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col justify-center py-12 px-4">
      {/* SEO — React 19 hoists to <head> */}
      <title>Checkout — NWC-Analytics</title>
      <meta name="description" content="Complete your NWC-Analytics subscription." />
      <link rel="canonical" href="https://nwc-analytics.com/payment" />
      <div className="max-w-lg mx-auto w-full">
        {/* Header */}
        <div className="text-center mb-8">
          <Link to="/" className="inline-block mb-4">
            <img src="/images/logo.png" alt="NWC-Analytics" className="h-12 w-12 mx-auto" />
            <span className="text-xl font-bold text-primary-400 dark:text-primary-400" style={{ fontFamily: "'Viner Hand ITC', 'Caveat', cursive", fontSize: '1rem', fontStyle: 'italic' }}>NWC-Analytics</span>
          </Link>
          <h1 className="text-3xl font-bold text-white">
            {TRIAL_TIERS.includes(tier) ? 'Start Your Free Trial' : 'Complete Your Subscription'}
          </h1>
          <p className="mt-2 text-gray-400">
            {TRIAL_TIERS.includes(tier) 
              ? 'Enter your card to start your 14-day free trial. You won\'t be charged today.'
              : 'Secure payment powered by Stripe'}
          </p>
        </div>

        {/* Plan Summary Card */}
        <div className="bg-gray-800/60 border border-gray-700 rounded-xl p-5 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-400">Selected Plan</p>
              <div className="flex items-center gap-2">
                <p className="text-lg font-bold text-white">{tierInfo.name}</p>
                {TRIAL_TIERS.includes(tier) && (
                  <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-green-900/40 text-green-400 border border-green-700/50">
                    14-day free trial
                  </span>
                )}
              </div>
            </div>
            <div className="text-right">
              <p className="text-3xl font-bold text-white">
                {tierInfo.price}
                <span className="text-base font-normal text-gray-400">{tierInfo.period}</span>
              </p>
              {TRIAL_TIERS.includes(tier) && (
                <p className="text-xs text-gray-500">billed after trial</p>
              )}
            </div>
          </div>

          {/* Expandable features */}
          <div className="mt-4 pt-4 border-t border-gray-700">
            <div className="grid grid-cols-2 gap-2">
              {tierInfo.features.map((feature, idx) => (
                <div key={idx} className="flex items-center text-sm text-gray-300">
                  <svg className="h-4 w-4 text-primary-400 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                  </svg>
                  {feature}
                </div>
              ))}
            </div>
          </div>

          {/* Change plan link */}
          <div className="mt-4 pt-3 border-t border-gray-700 text-center">
            <Link
              to="/registerwithpayment"
              className="text-sm text-primary-400 hover:text-primary-300 transition-colors"
            >
              ← Change plan
            </Link>
          </div>
        </div>

        {/* Payment Form */}
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-6 flex items-center">
            <svg className="w-5 h-5 text-primary-400 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
            </svg>
            Payment Details
          </h2>

          {loadError ? (
            <div className="text-center py-8">
              <p className="text-red-400 mb-4">{loadError}</p>
              <button
                onClick={() => window.location.reload()}
                className="text-primary-400 hover:text-primary-300 text-sm"
              >
                Try Again
              </button>
            </div>
          ) : stripePromise ? (
            <Elements stripe={stripePromise}>
              <CheckoutForm
                tier={tier}
                onSuccess={(isTrial: boolean) => {
                  setTrialStarted(isTrial);
                  setSuccess(true);
                  setTimeout(() => navigate('/dashboard'), 5000);
                }}
              />
            </Elements>
          ) : (
            <div className="flex items-center justify-center py-12">
              <svg className="animate-spin h-8 w-8 text-primary-400" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <span className="ml-3 text-gray-400">Loading payment form...</span>
            </div>
          )}
        </div>

        {/* Trust badges */}
        <div className="mt-6 flex items-center justify-center space-x-6 text-gray-500 text-xs">
          <div className="flex items-center space-x-1">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
            </svg>
            <span>256-bit SSL</span>
          </div>
          <div className="flex items-center space-x-1">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            <span>PCI Compliant</span>
          </div>
          <div className="flex items-center space-x-1">
            <span>Powered by</span>
            <span className="font-semibold text-gray-400">Stripe</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Payment;