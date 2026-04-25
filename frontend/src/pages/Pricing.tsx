import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { authAPI } from '../services/api';
import { User } from '../types';
import ThemeToggle from '../components/ThemeToggle';
import BackToTop from '../components/BackToTop';
import { PRICING_TIERS } from '../data/pricingTiers';
import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

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
      const response = await axios.get(`${API_URL}/api/v1/stripe/config`);
      setStripeConfig(response.data);
    } catch (error) {
      console.error('Failed to load Stripe config:', error);
    }
  };

  const handleUpgrade = async (tier: string, priceId: string) => {
    const token = localStorage.getItem('access_token');
    if (!token) {
      // Not logged in — send to registration with tier
      navigate(`/registerwithpayment?tier=${tier}`);
      return;
    }
    // Logged in — go directly to in-app payment page
    navigate(`/payment?tier=${tier}`);
  };

    const handleLogout = () => {
    localStorage.removeItem('access_token');
    navigate('/');
  };

  const getTierBadge = (tier: string) => {
    const badges = {
      beginner: { bg: 'bg-gray-100 dark:bg-gray-600', text: 'text-gray-800 dark:text-gray-200', label: 'Beginner' },
      casual: { bg: 'bg-primary-100 dark:bg-primary-900/50', text: 'text-primary-800 dark:text-primary-200', label: 'Casual' },
      active: { bg: 'bg-purple-100 dark:bg-purple-900/50', text: 'text-purple-800 dark:text-purple-200', label: 'Active' },
      professional: { bg: 'bg-yellow-100 dark:bg-yellow-900/50', text: 'text-yellow-800 dark:text-yellow-200', label: 'Professional' },
    };
    const badge = badges[tier as keyof typeof badges] || badges.beginner;
    return (
      <span className={`px-3 py-1 rounded-full text-sm font-semibold ${badge.bg} ${badge.text}`}>
        {badge.label}
      </span>
    );
  };

  const pricingTiers = PRICING_TIERS.map((tier) => ({
    ...tier,
    current: user?.subscription_tier === tier.slug,
    buttonText:
      user?.subscription_tier === tier.slug
        ? 'Current Plan'
        : tier.hasTrial
        ? 'Start Free Trial'
        : `Upgrade to ${tier.shortName}`,
  }));

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      {/* Navigation */}
      <nav className="bg-gray-800 dark:bg-gray-900 shadow-sm border-b border-gray-700 dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <Link to="/" className="flex items-center">
                <img src="/images/logo.png" alt="NWC-Analytics" className="h-10 w-10 mr-3" />
                <span className="text-xl font-bold text-primary-400 dark:text-primary-400" style={{ fontFamily: "'Viner Hand ITC', 'Caveat', cursive", fontSize: '1.8rem', fontStyle: 'italic' }}>NWC-Analytics</span>
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
          Start with a 14-day free trial and upgrade anytime as your needs grow.
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
              key={tier.slug}
              className={`relative bg-white dark:bg-gray-700 rounded-xl shadow-xl dark:shadow-gray-200/20 overflow-hidden transition-transform hover:scale-105 ${
                tier.popular ? 'ring-4 ring-primary-500 dark:ring-primary-400' : 'border dark:border-gray-500'
              }`}
            >
              {tier.popular && (
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
                  <span className="text-gray-600 dark:text-gray-400 text-sm">
                    {tier.period}
                  </span>
                  {tier.hasTrial && tier.trialBadge && (
                    <p className="text-sm text-emerald-600 dark:text-emerald-400 font-medium mt-1">
                      {tier.trialBadge}
                    </p>
                  )}
                </div>
                <p className="text-gray-600 dark:text-gray-400 text-sm mb-6">
                  {tier.description}
                </p>

                {/* Features List */}
                <ul className="space-y-2 mb-6">
                  {tier.highlightedBullet && (
                    <li className="flex items-start text-sm">
                      <svg className="h-5 w-5 text-green-500 mr-2 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                      </svg>
                      <span className="font-bold text-gray-900 dark:text-white">{tier.highlightedBullet}</span>
                    </li>
                  )}
                  {tier.bullets.map((bullet, index) => (
                    <li key={index} className="flex items-start text-sm">
                      <svg className="h-5 w-5 text-green-500 mr-2 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                      </svg>
                      <span className="text-gray-900 dark:text-white">{bullet}</span>
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
                ) : (
                  <button
                    onClick={() => handleUpgrade(tier.slug, tier.slug)}
                    className={`w-full px-6 py-3 font-semibold rounded-lg transition-colors ${
                      tier.popular
                        ? 'bg-primary-600 hover:bg-primary-700 text-white'
                        : 'bg-gray-900 hover:bg-gray-800 dark:bg-gray-600 dark:hover:bg-gray-500 text-white'
                    }`}
                  >
                    {tier.buttonText}
                  </button>
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
                    Beginner
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Casual
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Active
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Professional
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-700 divide-y divide-gray-200 dark:divide-gray-600">
                {[
                  { label: 'Watchlist Stocks',         values: ['10', '20', '45', '75'] },
                  { label: 'Portfolio Entries',        values: ['10', '20', '45', '75'] },
                  { label: 'Price Alerts',             values: ['5', '10', '20', '50'] },
                  { label: 'Stock Reviews',            values: ['5/week', '15/week', '20/day', '40/day'] },
                  { label: 'DCF Valuations',           values: ['5/week', '15/week', '20/day', '40/day'] },
                  { label: 'Technical Analysis',       values: ['5/week', '15/week', '20/day', '40/day'] },
                  { label: 'AI Stock & Portfolio Analysis', values: ['—', '5/week', '10/day', '25/day'] },
                  { label: 'Smart Technical Alerts',   values: ['—', '—', '5/day', '20/day'] },
                  { label: 'Saved Screens',            values: ['—', '—', '15', '50'] },
                  { label: 'Options Calculator',       values: ['—', '—', '✓', '✓'] },
                  { label: 'Email Alerts',             values: ['✓', '✓', '✓', '✓'] },
                  { label: '14-Day Free Trial',        values: ['✓', '✓', '—', '—'] },
                ].map((row, rowIdx) => (
                  <tr key={row.label} className={rowIdx % 2 === 1 ? 'bg-gray-50 dark:bg-gray-800' : ''}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white font-medium">
                      {row.label}
                    </td>
                    {row.values.map((value, colIdx) => {
                      const isLast = colIdx === row.values.length - 1;
                      const isDash = value === '—';
                      const isCheck = value === '✓';
                      const cls = isDash
                        ? 'text-gray-400'
                        : isCheck
                        ? 'text-green-500'
                        : isLast
                        ? 'text-green-600 dark:text-green-400 font-semibold'
                        : 'text-gray-600 dark:text-gray-400';
                      return (
                        <td key={colIdx} className="px-6 py-4 whitespace-nowrap text-sm text-center">
                          <span className={cls}>{value}</span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
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
              Yes! Save 20% when you choose annual billing. Contact us at <a href="mailto:sales@nwc-analytics.com" className="text-primary-600 dark:text-primary-400 hover:underline">sales@nwc-analytics.com</a> for details.
            </p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-forest-800 dark:bg-gray-950 text-gray-300 dark:text-gray-400 py-12 mt-32">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <div className="flex items-center mb-4 md:mb-0">
              <img
                src="/images/logo.png"
                alt="NWC-Analytics, LLC"
                className="h-12 w-12 mr-3"
              />
              <div>
                <p className="text-xl font-bold text-white">NWC-Analytics</p>
                <p className="text-sm">Professional stock analysis for retail investors</p>
              </div>
            </div>
            <div className="text-center md:text-right">
              <p className="text-sm">© 2026 NWC-Analytics, LLC. All rights reserved.</p>
              <p className="text-sm mt-1">Post Falls, Idaho</p>
            </div>
          </div>
          <div className="mt-6 flex justify-center flex-wrap gap-x-6 gap-y-2 text-sm">
            <Link to="/terms" className="hover:text-white transition-colors">Terms</Link>
            <Link to="/privacy" className="hover:text-white transition-colors">Privacy</Link>
            <Link to="/faq" className="hover:text-white transition-colors">FAQ</Link>
            <a href="mailto:support@nwc-analytics.com" className="hover:text-white transition-colors">Support</a>
          </div>
        </div>
        <BackToTop />
      </footer>
    </div>
  );
};

export default Pricing;