import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { authAPI } from '../services/api';
import { User } from '../types';
import ThemeToggle from '../components/ThemeToggle';
import axios from 'axios';

const Pricing: React.FC = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [stripeConfig, setStripeConfig] = useState<any>(null);

  useEffect(() => {
    loadUser();
    loadStripeConfig();
  }, []);

  const loadUser = async () => {
    try {
      const response = await authAPI.getCurrentUser();
      setUser(response.data);
    } catch (error) {
      console.error('Failed to load user:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadStripeConfig = async () => {
    try {
      const response = await axios.get('http://localhost:8000/api/v1/stripe/config');
      setStripeConfig(response.data);
    } catch (error) {
      console.error('Failed to load Stripe config:', error);
    }
  };

  const handleUpgrade = async (tier: string, priceId: string) => {
    try {
        const token = localStorage.getItem('access_token');
        if (!token) {
        navigate('/login');
        return;
        }

        const response = await axios.post(
        'http://localhost:8000/api/v1/stripe/create-checkout-session',
        { price_id: priceId },
        { headers: { Authorization: `Bearer ${token}` } }
        );

        // Redirect to Stripe Checkout
        window.location.href = response.data.checkout_url;
        } catch (error) {
            console.error('Failed to create checkout session:', error);
            alert('Failed to start checkout. Please try again.');
        }
    };

    const handleLogout = () => {
    localStorage.removeItem('access_token');
    navigate('/');
  };

  const getTierBadge = (tier: string) => {
    const badges = {
      free: { bg: 'bg-gray-100 dark:bg-gray-600', text: 'text-gray-800 dark:text-gray-200', label: 'Free' },
      casual: { bg: 'bg-primary-100 dark:bg-primary-900/50', text: 'text-primary-800 dark:text-primary-200', label: 'Casual' },
      active: { bg: 'bg-purple-100 dark:bg-purple-900/50', text: 'text-purple-800 dark:text-purple-200', label: 'Active' },
      unlimited: { bg: 'bg-yellow-100 dark:bg-yellow-900/50', text: 'text-yellow-800 dark:text-yellow-200', label: 'Unlimited' },
    };
    const badge = badges[tier as keyof typeof badges] || badges.free;
    return (
      <span className={`px-3 py-1 rounded-full text-sm font-semibold ${badge.bg} ${badge.text}`}>
        {badge.label}
      </span>
    );
  };

  const pricingTiers = [
    {
      name: 'Free',
      tierSlug: 'free',
      price: '$0',
      period: 'forever',
      description: 'Perfect for getting started with stock tracking',
      features: [
        { text: '5 watchlist stocks', included: true },
        { text: '5 portfolio entries', included: true },
        { text: '5 stock reviews', included: true },
        { text: 'Real-time market data', included: true },
        { text: 'Basic stock search', included: true },
        { text: 'Technical Analysis', included: false },
        { text: 'DCF Valuation', included: false },
        { text: 'Advanced charts', included: false },
      ],
      buttonText: 'Get Started',
      buttonLink: '/register',
      priceId: '',
      current: user?.subscription_tier === 'free',
      highlight: false,
    },
    {
      name: 'Casual Retail Investor',
      tierSlug: 'casual',
      price: '$20',
      period: 'per month',
      description: 'For investors tracking a moderate portfolio',
      features: [
        { text: '20 watchlist stocks', included: true },
        { text: '20 portfolio entries', included: true },
        { text: '5 stock reviews per week', included: true },
        { text: '5 DCF valuations per week', included: true },
        { text: 'Real-time market data', included: true },
        { text: 'Technical Analysis', included: true },
        { text: 'Advanced charts', included: true },
        { text: 'Email support', included: true },
        { text: 'Export to Excel/CSV', included: true },
      ],
      buttonText: user?.subscription_tier === 'casual' ? 'Current Plan' : 'Upgrade to Casual',
      buttonLink: '',
      priceId: 'casual',
      current: user?.subscription_tier === 'casual',
      highlight: true,
    },
    {
      name: 'Active Retail Investor',
      tierSlug: 'active',
      price: '$40',
      period: 'per month',
      description: 'For active traders with larger portfolios',
      features: [
        { text: '45 watchlist stocks', included: true },
        { text: '45 portfolio entries', included: true },
        { text: '5 stock reviews daily', included: true },
        { text: '5 DCF valuations daily', included: true },
        { text: 'Real-time market data', included: true },
        { text: 'Advanced Technical Analysis', included: true },
        { text: 'Premium charting tools', included: true },
        { text: 'Historical data (5 years)', included: true },
        { text: 'Priority email support', included: true },
        { text: 'Custom alerts', included: true },
      ],
      buttonText: user?.subscription_tier === 'active' ? 'Current Plan' : 'Upgrade to Active',
      buttonLink: '',
      priceId: 'active',
      current: user?.subscription_tier === 'active',
      highlight: false,
    },
    {
      name: 'Unlimited Investor',
      tierSlug: 'unlimited',
      price: '$100',
      period: 'per month',
      description: 'Ultimate tools for professional traders',
      features: [
        { text: 'Unlimited watchlist stocks', included: true },
        { text: 'Unlimited portfolio entries', included: true },
        { text: 'Unlimited stock reviews', included: true },
        { text: 'Unlimited DCF valuations', included: true },
        { text: 'Real-time market data', included: true },
        { text: 'Advanced Technical Analysis', included: true },
        { text: 'Professional charting suite', included: true },
        { text: 'Historical data (unlimited)', included: true },
        { text: 'API access', included: true },
        { text: 'Priority chat support', included: true },
        { text: 'Custom integrations', included: true },
        { text: 'White-glove onboarding', included: true },
      ],
      buttonText: user?.subscription_tier === 'unlimited' ? 'Current Plan' : 'Upgrade to Unlimited',
      buttonLink: '',
      priceId: 'unlimited',
      current: user?.subscription_tier === 'unlimited',
      highlight: false,
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      {/* Navigation */}
      <nav className="bg-gray-800 dark:bg-gray-900 shadow-sm border-b border-gray-700 dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <Link to="/" className="flex items-center">
                <img src="/images/logo.png" alt="Northwest Creek" className="h-10 w-10 mr-3" />
                <span className="text-xl font-bold text-primary-400">Northwest Creek</span>
              </Link>
            </div>
            
            <div className="flex items-center space-x-4">
              <ThemeToggle />
              {user ? (
                <>
                  <Link to="/dashboard" className="text-gray-300 hover:text-white text-sm font-medium">
                    Dashboard
                  </Link>
                  <span className="text-sm text-gray-300">{user.email}</span>
                  {getTierBadge(user.subscription_tier)}
                  <button onClick={handleLogout} className="text-gray-300 hover:text-white text-sm font-medium">
                    Logout
                  </button>
                </>
              ) : (
                <>
                  <Link to="/login" className="text-gray-300 hover:text-white text-sm font-medium">
                    Login
                  </Link>
                  <Link to="/register" className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg text-sm font-medium">
                    Sign Up
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* Header */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center">
        <h1 className="text-5xl font-extrabold text-gray-900 dark:text-white mb-4">
          Choose Your Plan
        </h1>
        <p className="text-xl text-gray-600 dark:text-gray-400 max-w-3xl mx-auto">
          Start with our free tier and upgrade anytime as your needs grow. All plans include real-time market data.
        </p>
        {user && (
          <div className="mt-4 inline-flex items-center px-4 py-2 bg-primary-50 dark:bg-primary-900/30 rounded-lg border border-primary-200 dark:border-primary-800">
            <span className="text-primary-900 dark:text-primary-200 font-medium">
              Your current plan: {getTierBadge(user.subscription_tier)}
            </span>
          </div>
        )}
      </div>

      {/* Pricing Cards */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {pricingTiers.map((tier) => (
            <div
              key={tier.tierSlug}
              className={`relative bg-white dark:bg-gray-700 rounded-xl shadow-xl dark:shadow-gray-200/20 overflow-hidden transition-transform hover:scale-105 ${
                tier.highlight ? 'ring-4 ring-primary-500 dark:ring-primary-400' : 'border dark:border-gray-500'
              }`}
            >
              {tier.highlight && (
                <div className="absolute top-0 right-0 bg-primary-600 text-white px-4 py-1 rounded-bl-lg text-sm font-semibold">
                  POPULAR
                </div>
              )}
              
              {tier.current && (
                <div className="absolute top-0 left-0 bg-green-600 text-white px-4 py-1 rounded-br-lg text-sm font-semibold">
                  CURRENT
                </div>
              )}

              <div className="p-6">
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                  {tier.name}
                </h3>
                <div className="mb-4">
                  <span className="text-4xl font-extrabold text-gray-900 dark:text-white">
                    {tier.price}
                  </span>
                  {tier.period && (
                    <span className="text-gray-600 dark:text-gray-400 ml-2 text-sm">
                      {tier.period}
                    </span>
                  )}
                </div>
                <p className="text-gray-600 dark:text-gray-400 text-sm mb-6">
                  {tier.description}
                </p>

                {/* Features List */}
                <ul className="space-y-2 mb-6">
                  {tier.features.map((feature, index) => (
                    <li key={index} className="flex items-start text-sm">
                      {feature.included ? (
                        <svg className="h-5 w-5 text-green-500 mr-2 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        <svg className="h-5 w-5 text-gray-400 mr-2 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      )}
                      <span className={feature.included ? 'text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-500'}>
                        {feature.text}
                      </span>
                    </li>
                  ))}
                </ul>

                {/* CTA Button */}
                {tier.current ? (
                <button
                    disabled
                    className="w-full px-6 py-3 bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-400 font-semibold rounded-lg cursor-not-allowed"
                >
                    Current Plan
                </button>
                ) : tier.priceId ? (
                <button
                    onClick={() => handleUpgrade(tier.name, 
                    tier.priceId === 'pro' ? stripeConfig?.pro_price_id : stripeConfig?.enterprise_price_id
                    )}
                    className={`w-full px-6 py-3 font-semibold rounded-lg transition-colors ${
                    tier.highlight
                        ? 'bg-primary-600 hover:bg-primary-700 text-white'
                        : 'bg-gray-900 hover:bg-gray-800 dark:bg-gray-600 dark:hover:bg-gray-500 text-white'
                    }`}
                >
                    {tier.buttonText}
                </button>
                ) : (
                <Link
                    to="/register"
                    className="block w-full px-6 py-3 text-center bg-gray-900 hover:bg-gray-800 dark:bg-gray-600 dark:hover:bg-gray-500 text-white font-semibold rounded-lg transition-colors"
                >
                    Get Started
                </Link>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Feature Comparison Table */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-16">
        <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-8 text-center">
          Compare Plans
        </h2>
        <div className="bg-white dark:bg-gray-700 rounded-xl shadow-xl dark:shadow-gray-200/20 overflow-hidden border dark:border-gray-500">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-600">
              <thead className="bg-gray-50 dark:bg-gray-800">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Feature
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Free
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Casual
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Active
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Unlimited
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-700 divide-y divide-gray-200 dark:divide-gray-600">
                <tr>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white font-medium">
                    Watchlist Stocks
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-center text-gray-600 dark:text-gray-400">5</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-center text-gray-600 dark:text-gray-400">20</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-center text-gray-600 dark:text-gray-400">45</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-center text-green-600 dark:text-green-400 font-semibold">Unlimited</td>
                </tr>
                <tr className="bg-gray-50 dark:bg-gray-800">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white font-medium">
                    Portfolio Entries
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-center text-gray-600 dark:text-gray-400">5</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-center text-gray-600 dark:text-gray-400">20</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-center text-gray-600 dark:text-gray-400">45</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-center text-green-600 dark:text-green-400 font-semibold">Unlimited</td>
                </tr>
                <tr>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white font-medium">
                    Stock Reviews
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-center text-gray-600 dark:text-gray-400">5 total</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-center text-gray-600 dark:text-gray-400">5/week</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-center text-gray-600 dark:text-gray-400">5/day</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-center text-green-600 dark:text-green-400 font-semibold">Unlimited</td>
                </tr>
                <tr className="bg-gray-50 dark:bg-gray-800">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white font-medium">
                    DCF Valuations
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-center">
                    <span className="text-gray-400">—</span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-center text-gray-600 dark:text-gray-400">5/week</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-center text-gray-600 dark:text-gray-400">5/day</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-center text-green-600 dark:text-green-400 font-semibold">Unlimited</td>
                </tr>
                <tr>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white font-medium">
                    Technical Analysis
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-center">
                    <span className="text-gray-400">—</span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-center">
                    <span className="text-green-500">✓</span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-center">
                    <span className="text-green-500">✓</span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-center">
                    <span className="text-green-500">✓</span>
                  </td>
                </tr>
                <tr className="bg-gray-50 dark:bg-gray-800">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white font-medium">
                    API Access
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-center">
                    <span className="text-gray-400">—</span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-center">
                    <span className="text-gray-400">—</span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-center">
                    <span className="text-gray-400">—</span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-center">
                    <span className="text-green-500">✓</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* FAQ Section */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pb-16">
        <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-8 text-center">
          Frequently Asked Questions
        </h2>
        <div className="space-y-6">
          <div className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 p-6 border dark:border-gray-500">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              Can I switch plans anytime?
            </h3>
            <p className="text-gray-600 dark:text-gray-400">
              Yes! You can upgrade or downgrade your plan at any time. Changes take effect immediately, and we'll prorate any charges.
            </p>
          </div>

          <div className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 p-6 border dark:border-gray-500">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              What payment methods do you accept?
            </h3>
            <p className="text-gray-600 dark:text-gray-400">
              We accept all major credit cards and debit cards through our secure Stripe payment processing.
            </p>
          </div>

          <div className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 p-6 border dark:border-gray-500">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              What happens when I reach my limits?
            </h3>
            <p className="text-gray-600 dark:text-gray-400">
              You'll receive a notification when you're approaching your plan limits. You can upgrade anytime to increase your limits.
            </p>
          </div>

          <div className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 p-6 border dark:border-gray-500">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              Do you offer annual subscriptions?
            </h3>
            <p className="text-gray-600 dark:text-gray-400">
              Yes! Save 20% when you choose annual billing. Contact us at <a href="mailto:support@northwestcreek.com" className="text-primary-600 dark:text-primary-400 hover:underline">support@northwestcreek.com</a> for details.
            </p>
          </div>
        </div>
      </div>

      {/* Contact Section */}
      <div className="bg-gradient-to-r from-primary-600 to-purple-600 py-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl font-bold text-white mb-4">
            Need Help Choosing a Plan?
          </h2>
          <p className="text-primary-100 mb-8 text-lg">
            Our team is here to help you find the perfect plan for your needs.
          </p>
          <div className="flex flex-col sm:flex-row justify-center gap-4">
            
              href="mailto:support@northwestcreek.com"
              className="px-8 py-3 bg-white text-primary-600 font-semibold rounded-lg hover:bg-gray-100 transition-colors"
            <a>
              Email Us
            </a>
            <Link
              to="/dashboard"
              className="px-8 py-3 bg-transparent border-2 border-white text-white font-semibold rounded-lg hover:bg-white hover:text-primary-600 transition-colors"
            >
              Back to Dashboard
            </Link>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-gray-800 dark:bg-gray-900 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <p className="text-gray-400">
            © 2026 Northwest Creek. All rights reserved.
          </p>
          <div className="mt-4 space-x-6">
            <a href="#" className="text-gray-400 hover:text-white text-sm">Terms of Service</a>
            <a href="#" className="text-gray-400 hover:text-white text-sm">Privacy Policy</a>
            <a href="mailto:support@northwestcreek.com" className="text-gray-400 hover:text-white text-sm">Support</a>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Pricing;