import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { authAPI } from '../services/api';
import axios from 'axios';

type Step = 'account' | 'plan' | 'success';
type Tier = 'free' | 'casual' | 'active' | 'unlimited';

const RegisterWithPayment: React.FC = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('account');
  const [selectedTier, setSelectedTier] = useState<Tier>('free');
  const [stripeConfig, setStripeConfig] = useState<any>(null);

  const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';
  
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    full_name: '',
  });
  
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadStripeConfig();
  }, []);

  const loadStripeConfig = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/v1/stripe/config`);
      setStripeConfig(response.data);
    } catch (error) {
      console.error('Failed to load Stripe config:', error);
    }
  };

  const handleAccountSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (formData.password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    setStep('plan');
  };

  const handlePlanSelection = async (tier: Tier) => {
    setSelectedTier(tier);
    
    if (tier === 'free') {
      // Register with free tier
      await registerUser('free');
    } else {
      // Show payment confirmation
      setLoading(true);
      await registerUser(tier);
    }
  };

  const registerUser = async (tier: Tier) => {
    setLoading(true);
    
    try {
      // Create account
      await authAPI.register({
        email: formData.email,
        password: formData.password,
        full_name: formData.full_name,
      });

      if (tier === 'free') {
        // Free tier - show success
        setStep('success');
      } else {
        // Paid tier - login and redirect to Stripe
        const loginResponse = await authAPI.login({
          email: formData.email,
          password: formData.password,
        });
        
        localStorage.setItem('access_token', loginResponse.data.access_token);
        
        // Redirect to Stripe checkout
        const priceId = tier === 'casual' 
          ? stripeConfig?.casual_price_id
          : tier === 'active'
          ? stripeConfig?.active_price_id
          : stripeConfig?.unlimited_price_id;

        const checkoutResponse = await axios.post(
          'http://localhost:8000/api/v1/stripe/create-checkout-session',
          { price_id: priceId },
          { 
            headers: { 
              Authorization: `Bearer ${loginResponse.data.access_token}` 
            } 
          }
        );

        // Redirect to Stripe
        window.location.href = checkoutResponse.data.checkout_url;
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Registration failed. Please try again.');
      setLoading(false);
    }
  };

  const pricingTiers = [
    {
      name: 'Free',
      tier: 'free' as Tier,
      price: '$0',
      period: 'forever',
      features: [
        '5 watchlist stocks',
        '5 portfolio entries',
        '5 stock reviews',
        'Real-time market data',
      ],
      highlight: false,
    },
    {
      name: 'Casual Retail Investor',
      tier: 'casual' as Tier,
      price: '$20',
      period: '/month',
      features: [
        '20 watchlist stocks',
        '20 portfolio entries',
        '5 stock reviews/week',
        '5 DCF valuations/week',
        'Technical Analysis',
      ],
      highlight: true,
    },
    {
      name: 'Active Retail Investor',
      tier: 'active' as Tier,
      price: '$40',
      period: '/month',
      features: [
        '45 watchlist stocks',
        '45 portfolio entries',
        '5 stock reviews/day',
        '5 DCF valuations/day',
        'Advanced Technical Analysis',
      ],
      highlight: false,
    },
    {
      name: 'Unlimited Investor',
      tier: 'unlimited' as Tier,
      price: '$100',
      period: '/month',
      features: [
        'Unlimited watchlist stocks',
        'Unlimited portfolio entries',
        'Unlimited stock reviews',
        'Unlimited DCF valuations',
        'API access',
      ],
      highlight: false,
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 via-white to-emerald-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto">
        {/* Progress Steps */}
        <div className="mb-8">
          <div className="flex items-center justify-center">
            <div className={`flex items-center ${step === 'account' ? 'text-primary-600' : 'text-gray-400'}`}>
              <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 ${
                step === 'account' ? 'border-primary-600 bg-primary-600 text-white' : 'border-gray-300'
              }`}>
                1
              </div>
              <span className="ml-2 font-medium">Create Account</span>
            </div>
            
            <div className="w-16 h-1 mx-4 bg-gray-300"></div>
            
            <div className={`flex items-center ${step === 'plan' ? 'text-primary-600' : 'text-gray-400'}`}>
              <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 ${
                step === 'plan' ? 'border-primary-600 bg-primary-600 text-white' : 'border-gray-300'
              }`}>
                2
              </div>
              <span className="ml-2 font-medium">Choose Plan</span>
            </div>
            
            <div className="w-16 h-1 mx-4 bg-gray-300"></div>
            
            <div className={`flex items-center ${step === 'success' ? 'text-primary-600' : 'text-gray-400'}`}>
              <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 ${
                step === 'success' ? 'border-primary-600 bg-primary-600 text-white' : 'border-gray-300'
              }`}>
                3
              </div>
              <span className="ml-2 font-medium">Complete</span>
            </div>
          </div>
        </div>

        {/* Step 1: Account Creation */}
        {step === 'account' && (
          <div className="max-w-md mx-auto">
            <div className="text-center mb-6">
              <Link to="/">
                <img src="/images/logo.png" alt="Northwest Creek" className="h-16 w-16 mx-auto" />
              </Link>
              <h2 className="mt-4 text-3xl font-extrabold text-gray-900 dark:text-white">
                Create your account
              </h2>
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                Already have an account?{' '}
                <Link to="/login" className="font-medium text-primary-600 dark:text-primary-400 hover:underline">
                  Sign in
                </Link>
              </p>
            </div>

            <div className="bg-white dark:bg-gray-700 py-8 px-6 shadow-xl rounded-lg border dark:border-gray-500">
              <form onSubmit={handleAccountSubmit} className="space-y-6">
                {error && (
                  <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 text-red-600 dark:text-red-400 px-4 py-3 rounded-lg">
                    {error}
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Full name
                  </label>
                  <input
                    type="text"
                    value={formData.full_name}
                    onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Email address
                  </label>
                  <input
                    type="email"
                    required
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Password
                  </label>
                  <input
                    type="password"
                    required
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  />
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    Must be at least 8 characters
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Confirm password
                  </label>
                  <input
                    type="password"
                    required
                    value={formData.confirmPassword}
                    onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full py-3 px-4 bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-lg transition-colors"
                >
                  Continue to Plan Selection
                </button>
              </form>
            </div>
          </div>
        )}

        {/* Step 2: Plan Selection */}
        {step === 'plan' && (
          <div>
            <div className="text-center mb-8">
              <h2 className="text-3xl font-extrabold text-gray-900 dark:text-white">
                Choose Your Plan
              </h2>
              <p className="mt-2 text-gray-600 dark:text-gray-400">
                Start with our free tier or upgrade for advanced features
              </p>
            </div>

            {error && (
              <div className="max-w-2xl mx-auto mb-6 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 text-red-600 dark:text-red-400 px-4 py-3 rounded-lg">
                {error}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {pricingTiers.map((tier) => (
                <div
                  key={tier.tier}
                  className={`bg-white dark:bg-gray-700 rounded-xl shadow-lg border p-6 ${
                    tier.highlight ? 'ring-2 ring-primary-500' : 'dark:border-gray-500'
                  }`}
                >
                  {tier.highlight && (
                    <div className="text-center mb-2">
                      <span className="bg-primary-600 text-white px-3 py-1 rounded-full text-xs font-semibold">
                        POPULAR
                      </span>
                    </div>
                  )}
                  
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                    {tier.name}
                  </h3>
                  
                  <div className="mb-4">
                    <span className="text-3xl font-extrabold text-gray-900 dark:text-white">
                      {tier.price}
                    </span>
                    {tier.period && (
                      <span className="text-gray-600 dark:text-gray-400 text-sm">
                        {tier.period}
                      </span>
                    )}
                  </div>

                  <ul className="space-y-2 mb-6">
                    {tier.features.map((feature, idx) => (
                      <li key={idx} className="flex items-start text-sm">
                        <svg className="h-5 w-5 text-green-500 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                        </svg>
                        <span className="text-gray-900 dark:text-white">{feature}</span>
                      </li>
                    ))}
                  </ul>

                  <button
                    onClick={() => handlePlanSelection(tier.tier)}
                    disabled={loading}
                    className={`w-full py-3 px-4 rounded-lg font-semibold transition-colors ${
                      tier.highlight
                        ? 'bg-primary-600 hover:bg-primary-700 text-white'
                        : 'bg-gray-900 hover:bg-gray-800 dark:bg-gray-600 dark:hover:bg-gray-500 text-white'
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    {loading && selectedTier === tier.tier
                      ? 'Processing...'
                      : tier.tier === 'free'
                      ? 'Start Free'
                      : `Choose ${tier.name}`}
                  </button>
                </div>
              ))}
            </div>

            <div className="mt-6 text-center">
              <button
                onClick={() => setStep('account')}
                className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
              >
                ← Back to Account Details
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Success */}
        {step === 'success' && (
          <div className="max-w-md mx-auto">
            <div className="bg-white dark:bg-gray-700 py-8 px-6 shadow-xl rounded-lg border dark:border-gray-500 text-center">
              <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-green-100 dark:bg-green-900/50 mb-4">
                <svg className="h-10 w-10 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
                </svg>
              </div>
              
              <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                Check Your Email!
              </h3>
              
              <p className="text-gray-600 dark:text-gray-400 mb-4">
                We've sent a verification link to <strong>{formData.email}</strong>
              </p>
              
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
                Click the link in the email to verify your account and start using Northwest Creek.
              </p>
              
              <Link
                to="/login"
                className="inline-block px-6 py-3 bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-lg transition-colors"
              >
                Go to Login
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default RegisterWithPayment;
