/**
 * UpgradeRequired — General-purpose 403 / tier-gate page
 *
 * Usage:
 *   <UpgradeRequired
 *     user={user}
 *     feature="Technical Analysis"
 *     featureDescription="Access powerful technical indicators and real-time market analysis tools."
 *     minimumTier="casual"
 *     onLogout={handleLogout}
 *   />
 *
 * Renders the user's current tier, what they'd unlock at each tier above theirs,
 * and a CTA to the pricing page.
 */
import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import NavBar from '../components/NavBar';
import { getTierBadge } from '../components/NavBar';
import { User } from '../types';

// ── Tier metadata ──────────────────────────────────────────────

type TierKey = 'beginner' | 'casual' | 'active' | 'professional';

const TIER_ORDER: TierKey[] = ['beginner', 'casual', 'active', 'professional'];

interface TierMeta {
  label: string;
  price: string;
  color: string;          // tailwind text color
  badgeBg: string;
  badgeText: string;
  gradient: string;       // for the CTA button
  features: string[];     // what's NEW at this tier (not cumulative)
}

const TIERS: Record<TierKey, TierMeta> = {
  beginner: {
    label: 'Beginner',
    price: '$10/mo',
    color: 'text-gray-400',
    badgeBg: 'bg-gray-100 dark:bg-gray-600',
    badgeText: 'text-gray-800 dark:text-gray-200',
    gradient: 'from-gray-500 to-gray-600',
    features: [
      '10 watchlist stocks',
      '10 portfolio entries',
      '5 price alerts',
      '5 stock reviews/week',
      '5 technical analyses/week',
      '5 DCF valuations/week',
      'Real-time market data',
      '14-day free trial',
    ],
  },
  casual: {
    label: 'Casual Investor',
    price: '$20/mo',
    color: 'text-teal-400',
    badgeBg: 'bg-primary-100 dark:bg-primary-900/50',
    badgeText: 'text-primary-800 dark:text-primary-200',
    gradient: 'from-teal-600 to-teal-500',
    features: [
      '20 watchlist stocks',
      '20 portfolio entries',
      '10 price alerts',
      '15 stock reviews/week',
      '15 technical analyses/week',
      '15 DCF valuations/week',
      'Email alerts',
      '14-day free trial',
    ],
  },
  active: {
    label: 'Active Investor',
    price: '$40/mo',
    color: 'text-blue-400',
    badgeBg: 'bg-blue-100 dark:bg-blue-900/50',
    badgeText: 'text-blue-800 dark:text-blue-200',
    gradient: 'from-blue-600 to-blue-500',
    features: [
      '45 watchlist stocks',
      '45 portfolio entries',
      '20 price alerts',
      '10 stock reviews/day',
      '10 technical analyses/day',
      '10 DCF valuations/day',
      'Email alerts',
    ],
  },
  professional: {
    label: 'Professional Investor',
    price: '$50/mo',
    color: 'text-purple-400',
    badgeBg: 'bg-purple-100 dark:bg-purple-900/50',
    badgeText: 'text-purple-800 dark:text-purple-200',
    gradient: 'from-purple-600 to-purple-500',
    features: [
      '75 watchlist stocks',
      '75 portfolio entries',
      '50 price alerts',
      '20 stock reviews/day',
      '20 technical analyses/day',
      '20 DCF valuations/day',
      'Email & indicator alerts',
    ],
  },
};

// ── Props ──────────────────────────────────────────────────────

interface UpgradeRequiredProps {
  user: User | null;
  /** Human-readable feature name, e.g. "Technical Analysis" or "Email Alerts" */
  feature: string;
  /** One-liner description shown below the feature name */
  featureDescription?: string;
  /** Lowest tier that can access this feature (defaults to 'casual') */
  minimumTier?: TierKey;
  onLogout: () => void;
}

// ── Component ──────────────────────────────────────────────────

const UpgradeRequired: React.FC<UpgradeRequiredProps> = ({
  user,
  feature,
  featureDescription,
  minimumTier = 'casual',
  onLogout,
}) => {
  const navigate = useNavigate();
  const currentTier: TierKey = (user?.subscription_tier as TierKey) || 'beginner';
  const currentIndex = TIER_ORDER.indexOf(currentTier);
  const minIndex = TIER_ORDER.indexOf(minimumTier);

  // Every tier above the user's current tier
  const upgradeTiers = TIER_ORDER.filter((_, i) => i > currentIndex);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-800">
      <NavBar currentPage="dashboard" user={user} onLogout={onLogout} />

      {/* Main Content */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">

        {/* ── Hero / 403 Header ──────────────────────────────── */}
        <div className="bg-white dark:bg-gray-700 rounded-xl shadow-lg border dark:border-gray-500 p-8 mb-8 text-center">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-primary-500 to-purple-600 text-white text-3xl font-bold mb-5">
            403
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white mb-3">
            {feature} Requires an Upgrade
          </h1>
          {featureDescription && (
            <p className="text-lg text-gray-500 dark:text-gray-400 mb-4 max-w-2xl mx-auto">
              {featureDescription}
            </p>
          )}
          {user && (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Your current plan: {getTierBadge(user.subscription_tier)}
            </p>
          )}
        </div>

        {/* ── Tier Upgrade Cards ─────────────────────────────── */}
        <div className="grid gap-6 mb-8">
          {upgradeTiers.map((tierKey) => {
            const tier = TIERS[tierKey];
            const isMinimum = tierKey === minimumTier;
            const tierIndex = TIER_ORDER.indexOf(tierKey);

            return (
              <div
                key={tierKey}
                className={`bg-white dark:bg-gray-700 rounded-xl shadow-lg border overflow-hidden ${
                  isMinimum
                    ? 'border-primary-400 dark:border-primary-500 ring-2 ring-primary-200 dark:ring-primary-800'
                    : 'dark:border-gray-500'
                }`}
              >
                {/* Card header */}
                <div className={`px-6 py-4 border-b dark:border-gray-600 flex items-center justify-between ${
                  isMinimum ? 'bg-primary-50 dark:bg-primary-900/20' : 'bg-gray-50 dark:bg-gray-750'
                }`}>
                  <div className="flex items-center gap-3">
                    <span className={`text-lg font-bold ${tier.color}`}>
                      {tier.label}
                    </span>
                    {isMinimum && (
                      <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-primary-100 dark:bg-primary-900/50 text-primary-700 dark:text-primary-300">
                        Unlocks {feature}
                      </span>
                    )}
                  </div>
                  <span className="text-xl font-bold text-gray-900 dark:text-white">{tier.price}</span>
                </div>

                {/* Features grid */}
                <div className="px-6 py-5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                    {tier.features.map((feat, i) => (
                      <div key={i} className="flex items-start gap-2 text-sm">
                        <span className="text-green-500 mt-0.5 flex-shrink-0">✓</span>
                        <span className="text-gray-700 dark:text-gray-300">{feat}</span>
                      </div>
                    ))}
                  </div>

                  {/* CTA */}
                  <div className="mt-5">
                    <Link
                      to="/pricing"
                      className={`inline-block px-6 py-2.5 bg-gradient-to-r ${tier.gradient} hover:opacity-90 text-white font-semibold rounded-lg transition-all shadow text-sm`}
                    >
                      {isMinimum ? `Upgrade to ${tier.label}` : `Go ${tier.label}`}
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Comparison Table ───────────────────────────────── */}
        <div className="bg-white dark:bg-gray-700 rounded-xl shadow-lg border dark:border-gray-500 p-6 mb-8 overflow-x-auto">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-5">Plan Comparison</h2>
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-600 text-sm">
            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Feature</th>
                {TIER_ORDER.map((t) => {
                  const meta = TIERS[t];
                  const isCurrent = t === currentTier;
                  return (
                    <th
                      key={t}
                      className={`px-4 py-3 text-center text-xs font-medium uppercase tracking-wider ${
                        isCurrent ? 'text-primary-600 dark:text-primary-400' : 'text-gray-500 dark:text-gray-400'
                      }`}
                    >
                      {meta.label}
                      {isCurrent && <span className="block text-[10px] normal-case font-normal mt-0.5">(current)</span>}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-600">
              {COMPARISON_ROWS.map((row, i) => (
                <tr key={row.label} className={i % 2 === 1 ? 'bg-gray-50 dark:bg-gray-800' : ''}>
                  <td className="px-4 py-3 text-gray-900 dark:text-white whitespace-nowrap">{row.label}</td>
                  {TIER_ORDER.map((t) => {
                    const val = row.values[t];
                    return (
                      <td key={t} className="px-4 py-3 text-center whitespace-nowrap">
                        {val === true ? (
                          <span className="text-green-500">✓</span>
                        ) : val === false ? (
                          <span className="text-gray-300 dark:text-gray-600">—</span>
                        ) : (
                          <span className="text-gray-700 dark:text-gray-300">{val}</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* ── Back Link ──────────────────────────────────────── */}
        <div className="text-center">
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-2 text-gray-500 dark:text-gray-400 hover:text-primary-500 dark:hover:text-primary-400 transition-colors text-sm"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
};

// ── Comparison table data ────────────────────────────────────

interface ComparisonRow {
  label: string;
  values: Record<TierKey, string | boolean>;
}

const COMPARISON_ROWS: ComparisonRow[] = [
  {
    label: 'Watchlist Stocks',
    values: { beginner: '10', casual: '20', active: '45', professional: '75' },
  },
  {
    label: 'Portfolio Entries',
    values: { beginner: '10', casual: '20', active: '45', professional: '75' },
  },
  {
    label: 'Stock Reviews',
    values: { beginner: '5/week', casual: '15/week', active: '10/day', professional: '20/day' },
  },
  {
    label: 'Technical Analysis',
    values: { beginner: '5/week', casual: '15/week', active: '10/day', professional: '20/day' },
  },
  {
    label: 'DCF Valuations',
    values: { beginner: '5/week', casual: '15/week', active: '10/day', professional: '20/day' },
  },
  {
    label: 'Price Alerts',
    values: { beginner: '5', casual: '10', active: '20', professional: '50' },
  },
  {
    label: 'Email Alerts',
    values: { beginner: false, casual: true, active: true, professional: true },
  },
  {
    label: 'Indicator Alerts',
    values: { beginner: false, casual: false, active: false, professional: true },
  },
  {
    label: 'Options Calculator',
    values: { beginner: false, casual: false, active: true, professional: true },
  },
  {
    label: '14-Day Free Trial',
    values: { beginner: true, casual: true, active: false, professional: false },
  },
];

export default UpgradeRequired;