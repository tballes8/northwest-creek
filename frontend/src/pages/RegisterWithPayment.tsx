import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { authAPI } from '../services/api';

type Step = 'plan' | 'account' | 'success';
type Tier = 'free' | 'casual' | 'active' | 'professional';

const RegisterWithPayment: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const urlTier = searchParams.get('tier') as Tier | null;

  // If a tier was passed via URL, skip straight to account creation
  const [step, setStep] = useState<Step>(urlTier ? 'account' : 'plan');
  const [selectedTier, setSelectedTier] = useState<Tier>(urlTier || 'casual');
  
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    full_name: '',
  });
  
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handlePlanSelect = (tier: Tier) => {
    setSelectedTier(tier);
    setError('');
    setStep('account');
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

    setLoading(true);

    try {
      // Create account — pass selected tier so backend embeds it in verification email URL
      await authAPI.register({
        email: formData.email,
        password: formData.password,
        full_name: formData.full_name,
      });

      // Show success — user must verify email first, then they'll be redirected to Stripe for paid tiers
      setStep('success');
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Registration failed. Please try again.');
      setLoading(false);
    }
  };

  const tierLabels: Record<Tier, string> = {
    free: 'Free',
    casual: 'Casual Investor — $20/mo',
    active: 'Active Investor — $40/mo',
    professional: 'Professional — $100/mo',
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
        '5 stock reviews (total)',
        'Real-time market data',
        'Basic stock search',
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
        'Priority support',
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
        '20 price alerts',
        '5 stock reviews/day',
        '5 DCF valuations/day',
        'Advanced Technical Analysis',
        'Priority support',
      ],
      highlight: false,
    },
    {
      name: 'Professional Investor',
      tier: 'professional' as Tier,
      price: '$100',
      period: '/month',
      features: [
        '75 watchlist stocks',
        '75 portfolio entries',
        '50 price alerts',
        '20 stock reviews/day',
        '20 DCF valuations/day',
        'Full Technical Analysis suite',
        'Priority support',
      ],
      highlight: false,
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 via-white to-emerald-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto">
        {/* Logo */}
        <div className="text-center mb-6">
          <Link to="/" className="inline-block">
            <img src="/images/logo.png" alt="Northwest Creek" className="h-16 w-16 mx-auto" />
            <span className="text-xl font-bold text-primary-400 dark:text-primary-400" style={{ fontFamily: "'Viner Hand ITC', 'Caveat', cursive", fontSize: '1rem', fontStyle: 'italic' }}>Northwest Creek</span>
          </Link>
        </div>

        {/* Progress Steps */}
        <div className="mb-8">
          <div className="flex items-center justify-center">
            <div className={`flex items-center ${step === 'plan' ? 'text-primary-600 dark:text-primary-400' : step === 'account' || step === 'success' ? 'text-green-600 dark:text-green-400' : 'text-gray-400'}`}>
              <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 text-sm font-bold ${
                step === 'plan' 
                  ? 'border-primary-600 bg-primary-600 text-white' 
                  : step === 'account' || step === 'success'
                  ? 'border-green-600 bg-green-600 text-white'
                  : 'border-gray-300 text-gray-400'
              }`}>
                {step === 'account' || step === 'success' ? '✓' : '1'}
              </div>
              <span className="ml-2 font-medium">Choose Plan</span>
            </div>
            
            <div className={`w-16 h-1 mx-4 ${step !== 'plan' ? 'bg-primary-600 dark:bg-primary-500' : 'bg-gray-300 dark:bg-gray-600'}`}></div>
            
            <div className={`flex items-center ${step === 'account' ? 'text-primary-600 dark:text-primary-400' : step === 'success' ? 'text-green-600 dark:text-green-400' : 'text-gray-400'}`}>
              <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 text-sm font-bold ${
                step === 'account' 
                  ? 'border-primary-600 bg-primary-600 text-white' 
                  : step === 'success'
                  ? 'border-green-600 bg-green-600 text-white'
                  : 'border-gray-300 text-gray-400'
              }`}>
                {step === 'success' ? '✓' : '2'}
              </div>
              <span className="ml-2 font-medium">Create Account</span>
            </div>
            
            <div className={`w-16 h-1 mx-4 ${step === 'success' ? 'bg-primary-600 dark:bg-primary-500' : 'bg-gray-300 dark:bg-gray-600'}`}></div>
            
            <div className={`flex items-center ${step === 'success' ? 'text-primary-600 dark:text-primary-400' : 'text-gray-400'}`}>
              <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 text-sm font-bold ${
                step === 'success' ? 'border-primary-600 bg-primary-600 text-white' : 'border-gray-300 text-gray-400'
              }`}>
                3
              </div>
              <span className="ml-2 font-medium">Get Started</span>
            </div>
          </div>
        </div>

        {/* Step 1: Plan Selection */}
        {step === 'plan' && (
          <div>
            <div className="text-center mb-8">
              <h2 className="text-3xl font-extrabold text-gray-900 dark:text-white">
                Choose Your Plan
              </h2>
              <p className="mt-2 text-gray-600 dark:text-gray-400">
                Pick the plan that fits your investing style — you can always upgrade later
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {pricingTiers.map((tier) => (
                <div
                  key={tier.tier}
                  className={`bg-white dark:bg-gray-700 rounded-xl shadow-lg border p-6 transition-all ${
                    tier.highlight 
                      ? 'ring-2 ring-primary-500 transform scale-105' 
                      : 'dark:border-gray-500 hover:shadow-xl'
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
                    onClick={() => handlePlanSelect(tier.tier)}
                    className={`w-full py-3 px-4 rounded-lg font-semibold transition-colors ${
                      tier.highlight
                        ? 'bg-primary-600 hover:bg-primary-700 text-white'
                        : 'bg-gray-900 hover:bg-gray-800 dark:bg-gray-600 dark:hover:bg-gray-500 text-white'
                    }`}
                  >
                    {tier.tier === 'free' ? 'Start Free' : `Choose ${tier.name}`}
                  </button>
                </div>
              ))}
            </div>

            <div className="mt-8 text-center">
              <p className="text-gray-500 dark:text-gray-400 text-sm">
                Already have an account?{' '}
                <Link to="/login" className="font-medium text-primary-600 dark:text-primary-400 hover:underline">
                  Sign in
                </Link>
              </p>
            </div>
          </div>
        )}

        {/* Step 2: Create Account */}
        {step === 'account' && (
          <div className="max-w-md mx-auto">
            <div className="text-center mb-6">
              <h2 className="text-3xl font-extrabold text-gray-900 dark:text-white">
                Create Your Account
              </h2>
              <div className="mt-3 inline-flex items-center px-4 py-2 rounded-full text-sm font-semibold bg-primary-100 dark:bg-primary-900/30 text-primary-800 dark:text-primary-200">
                Selected Plan: {tierLabels[selectedTier]}
              </div>
              <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
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
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
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
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
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
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
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
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 px-4 bg-primary-600 hover:bg-primary-700 dark:bg-primary-500 dark:hover:bg-primary-600 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading 
                    ? 'Creating account...' 
                    : selectedTier === 'free' 
                    ? 'Create Free Account' 
                    : 'Create Account & Continue to Payment'}
                </button>
              </form>

              <div className="mt-4 text-center">
                <button
                  onClick={() => { setStep('plan'); setError(''); }}
                  className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                >
                  ← Change plan
                </button>
              </div>
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
                We've sent a verification link to <strong className="text-gray-900 dark:text-white">{formData.email}</strong>
              </p>

              {selectedTier !== 'free' && (
                <div className="bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-700 rounded-lg p-4 mb-4">
                  <p className="text-sm text-primary-800 dark:text-primary-200">
                    <strong>Next step:</strong> After verifying your email, you'll be automatically redirected to complete your <strong>{selectedTier}</strong> subscription payment.
                  </p>
                </div>
              )}

              <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 rounded-lg p-4 mb-6">
                <p className="text-sm text-yellow-800 dark:text-yellow-200">
                  <strong>📧 Can't find the email?</strong> Check your <strong>spam or junk folder</strong> — verification emails sometimes end up there.
                </p>
              </div>
              
              <Link
                to="/login"
                className="inline-block px-6 py-3 bg-primary-600 hover:bg-primary-700 dark:bg-primary-500 dark:hover:bg-primary-600 text-white font-semibold rounded-lg transition-colors"
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
