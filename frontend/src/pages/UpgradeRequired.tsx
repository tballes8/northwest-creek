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
import React, { useState, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import ThemeToggle from '../components/ThemeToggle';
import { User } from '../types';

// ── Tier metadata ──────────────────────────────────────────────

type TierKey = 'free' | 'casual' | 'active' | 'professional';

const TIER_ORDER: TierKey[] = ['free', 'casual', 'active', 'professional'];

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
  free: {
    label: 'Free',
    price: '$0/mo',
    color: 'text-gray-400',
    badgeBg: 'bg-gray-100 dark:bg-gray-600',
    badgeText: 'text-gray-800 dark:text-gray-200',
    gradient: 'from-gray-500 to-gray-600',
    features: [
      '5 watchlist stocks',
      '5 portfolio entries',
      '5 stock reviews',
      '5 technical analyses',
      '5 DCF valuations',
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
      '5 stock reviews per week',
      '5 technical analyses per week',
      '5 DCF valuations per week',
      '5 price alerts',
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
      '5 stock reviews per day',
      '5 technical analyses per day',
      '5 DCF valuations per day',
      '20 price alerts',
      'SMS text alerts',
    ],
  },
  professional: {
    label: 'Professional Investor',
    price: '$100/mo',
    color: 'text-purple-400',
    badgeBg: 'bg-purple-100 dark:bg-purple-900/50',
    badgeText: 'text-purple-800 dark:text-purple-200',
    gradient: 'from-purple-600 to-purple-500',
    features: [
      '75 watchlist stocks',
      '75 portfolio entries',
      '20 stock reviews per day',
      '20 technical analyses per day',
      '20 DCF valuations per day',
      '50 price alerts',
      'SMS text alerts',
      'Indicator-based alerts',
      'Ad-free experience',
    ],
  },
};

// ── Props ──────────────────────────────────────────────────────

interface UpgradeRequiredProps {
  user: User | null;
  /** Human-readable feature name, e.g. "Technical Analysis" or "SMS Text Alerts" */
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
  const currentTier: TierKey = (user?.subscription_tier as TierKey) || 'free';
  const currentIndex = TIER_ORDER.indexOf(currentTier);
  const minIndex = TIER_ORDER.indexOf(minimumTier);

  // Every tier above the user's current tier
  const upgradeTiers = TIER_ORDER.filter((_, i) => i > currentIndex);

  // User menu
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  const getTierBadge = (tier: string) => {
    const meta = TIERS[tier as TierKey] || TIERS.free;
    return (
      <span className={`px-3 py-1 rounded-full text-sm font-semibold ${meta.badgeBg} ${meta.badgeText}`}>
        {meta.label}
      </span>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-800">
      {/* Navigation */}
      <nav className="bg-gray-900 dark:bg-gray-900 shadow-sm border-b border-gray-700 dark:border-gray-700">
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <img src="/images/logo.png" alt="Northwest Creek" className="h-10 w-10 mr-3" />
              <span
                className="text-xl font-bold text-primary-400 dark:text-primary-400"
                style={{ fontFamily: "'Viner Hand ITC', 'Caveat', cursive", fontSize: '1.8rem', fontStyle: 'italic' }}
              >
                Northwest Creek
              </span>
            </div>

            <div className="hidden md:flex items-center space-x-8">
              <Link to="/dashboard" className="text-gray-400 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">Dashboard</Link>
              <Link to="/watchlist" className="text-gray-400 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">Watchlist</Link>
              <Link to="/portfolio" className="text-gray-400 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">Portfolio</Link>
              <Link to="/alerts" className="text-gray-400 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">Alerts</Link>
              <Link to="/stocks" className="text-gray-400 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">Stocks</Link>
              <Link to="/technical-analysis" className="text-gray-400 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">Technical Analysis</Link>
              <Link to="/dcf-valuation" className="text-gray-400 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">DCF Valuation</Link>
            </div>

            <div className="flex items-center space-x-4">
              <div className="relative" ref={userMenuRef}>
                <button
                  onClick={() => setUserMenuOpen(!userMenuOpen)}
                  className="flex items-center gap-2 text-sm text-gray-300 hover:text-teal-400 transition-colors focus:outline-none"
                >
                  <span className="hidden lg:inline">{user?.email}</span>
                  <span className="lg:hidden">{user?.email?.split('@')[0]}</span>
                  {user && getTierBadge(user.subscription_tier)}
                  <svg className={`w-4 h-4 transition-transform ${userMenuOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {userMenuOpen && (
                  <div className="absolute right-0 mt-2 w-56 bg-gray-800 border border-gray-600 rounded-lg shadow-xl z-50 py-1 animate-in fade-in duration-150">
                    <div className="px-4 py-2 border-b border-gray-700">
                      <p className="text-sm font-medium text-white truncate">{user?.full_name || user?.email}</p>
                      <p className="text-xs text-gray-400 truncate">{user?.email}</p>
                    </div>
                    <Link to="/account" onClick={() => setUserMenuOpen(false)} className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-300 hover:bg-gray-700 hover:text-white transition-colors">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                      Account Settings
                    </Link>
                    <Link to="/tutorials" onClick={() => setUserMenuOpen(false)} className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-300 hover:bg-gray-700 hover:text-white transition-colors">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                      Tutorials
                    </Link>
                    <Link to="/blogs" onClick={() => setUserMenuOpen(false)} className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-300 hover:bg-gray-700 hover:text-white transition-colors">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" /></svg>
                      Blog
                    </Link>
                    {user?.is_admin && (
                      <>
                        <div className="border-t border-gray-700 my-1"></div>
                        <Link to="/admin" onClick={() => setUserMenuOpen(false)} className="flex items-center gap-3 px-4 py-2.5 text-sm text-amber-400 hover:bg-gray-700 hover:text-amber-300 transition-colors">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                          Admin Panel
                        </Link>
                      </>
                    )}
                    <div className="border-t border-gray-700 my-1"></div>
                    <button
                      onClick={() => { setUserMenuOpen(false); onLogout(); }}
                      className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-red-400 hover:bg-gray-700 hover:text-red-300 transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                      Logout
                    </button>
                  </div>
                )}
              </div>
              <ThemeToggle />
            </div>
          </div>
        </div>
      </nav>

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
    values: { free: '5', casual: '20', active: '45', professional: '75' },
  },
  {
    label: 'Portfolio Entries',
    values: { free: '5', casual: '20', active: '45', professional: '75' },
  },
  {
    label: 'Stock Reviews',
    values: { free: '5 total', casual: '5/week', active: '5/day', professional: '20/day' },
  },
  {
    label: 'Technical Analysis',
    values: { free: '5 total', casual: '5/week', active: '5/day', professional: '20/day' },
  },
  {
    label: 'DCF Valuations',
    values: { free: '5 total', casual: '5/week', active: '5/day', professional: '20/day' },
  },
  {
    label: 'Price Alerts',
    values: { free: false, casual: '5', active: '20', professional: '50' },
  },
  {
    label: 'SMS Text Alerts',
    values: { free: false, casual: false, active: true, professional: true },
  },
  {
    label: 'Indicator Alerts',
    values: { free: false, casual: false, active: false, professional: true },
  },
  {
    label: 'Ad-Free',
    values: { free: false, casual: false, active: false, professional: true },
  },
];

export default UpgradeRequired;