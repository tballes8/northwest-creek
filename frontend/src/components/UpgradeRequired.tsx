/**
 * UpgradeRequired — Reusable 403 / Limit Reached Component
 * 
 * Usage:
 *   <UpgradeRequired
 *     feature="Technical Analysis"
 *     currentTier="free"
 *     limitReached={true}
 *     currentUsage={5}
 *     maxUsage={5}
 *   />
 */
import React from 'react';
import { Link, useNavigate } from 'react-router-dom';

interface UpgradeRequiredProps {
  feature: string;                // e.g. "Technical Analysis", "DCF Valuation", "Portfolio"
  currentTier: string;            // user's current tier
  limitReached?: boolean;         // true = hit usage limit, false = feature locked
  currentUsage?: number;          // how many they've used
  maxUsage?: number;              // their tier limit
  onBack?: () => void;            // custom back action
}

const TIER_INFO: Record<string, {
  name: string;
  price: string;
  color: string;
  bgColor: string;
  features: string[];
}> = {
  free: {
    name: 'Free',
    price: '$0',
    color: 'text-gray-400',
    bgColor: 'bg-gray-500',
    features: [
      '5 watchlist stocks',
      '5 portfolio entries',
      '5 stock reviews (total)',
      '5 technical analyses (total)',
      '5 DCF valuations (total)',
    ],
  },
  casual: {
    name: 'Casual Retail Investor',
    price: '$20/mo',
    color: 'text-teal-400',
    bgColor: 'bg-teal-500',
    features: [
      '20 watchlist stocks',
      '20 portfolio entries',
      '5 stock reviews per week',
      '5 technical analyses per week',
      '5 DCF valuations per week',
      '5 price alerts',
      'Top 10 stock list download',
    ],
  },
  active: {
    name: 'Active Retail Investor',
    price: '$40/mo',
    color: 'text-blue-400',
    bgColor: 'bg-blue-500',
    features: [
      '45 watchlist stocks',
      '45 portfolio entries',
      '5 stock reviews per day',
      '5 technical analyses per day',
      '5 DCF valuations per day',
      '20 price alerts',
      'Level 2 stock list download',
    ],
  },
  professional: {
    name: 'Professional Investor',
    price: '$100/mo',
    color: 'text-purple-400',
    bgColor: 'bg-purple-500',
    features: [
      '75 watchlist stocks',
      '75 portfolio entries',
      '20 stock reviews per day',
      '20 technical analyses per day',
      '20 DCF valuations per day',
      '50 price alerts',
      'Level 3 stock list download',
      'Ad-free experience',
    ],
  },
};

const UPGRADE_PATH: Record<string, string> = {
  free: 'casual',
  casual: 'active',
  active: 'professional',
};

const UpgradeRequired: React.FC<UpgradeRequiredProps> = ({
  feature,
  currentTier,
  limitReached = true,
  currentUsage,
  maxUsage,
  onBack,
}) => {
  const navigate = useNavigate();
  const currentInfo = TIER_INFO[currentTier] || TIER_INFO.free;
  const nextTierKey = UPGRADE_PATH[currentTier];
  const nextInfo = nextTierKey ? TIER_INFO[nextTierKey] : null;

  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      {/* Main Card */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-gray-800 to-gray-900 dark:from-gray-900 dark:to-gray-950 px-8 py-10 text-center">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-teal-500 to-teal-600 text-white text-2xl font-bold mb-5 shadow-lg">
            {limitReached ? (
              <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m0 0v2m0-2h2m-2 0H10m4-6V4a2 2 0 00-2-2h0a2 2 0 00-2 2v5" />
              </svg>
            ) : (
              <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            )}
          </div>
          
          <h1 className="text-3xl font-bold text-white mb-3">
            {limitReached ? `${feature} Limit Reached` : `Upgrade Required`}
          </h1>
          
          <p className="text-gray-300 text-lg max-w-lg mx-auto">
            {limitReached ? (
              <>
                You've used <span className="text-teal-400 font-semibold">{currentUsage ?? maxUsage}</span> of your{' '}
                <span className="text-teal-400 font-semibold">{maxUsage}</span> {feature.toLowerCase()} on the{' '}
                <span className={`font-semibold ${currentInfo.color}`}>{currentInfo.name}</span> plan.
              </>
            ) : (
              <>
                {feature} is not available on the{' '}
                <span className={`font-semibold ${currentInfo.color}`}>{currentInfo.name}</span> plan.
              </>
            )}
          </p>
          
          {/* Usage bar */}
          {limitReached && currentUsage !== undefined && maxUsage !== undefined && maxUsage > 0 && (
            <div className="mt-6 max-w-xs mx-auto">
              <div className="flex justify-between text-sm text-gray-400 mb-1">
                <span>Used</span>
                <span>{currentUsage} / {maxUsage}</span>
              </div>
              <div className="w-full bg-gray-700 rounded-full h-3">
                <div 
                  className="bg-gradient-to-r from-teal-500 to-red-500 h-3 rounded-full transition-all"
                  style={{ width: `${Math.min((currentUsage / maxUsage) * 100, 100)}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Upgrade section */}
        {nextInfo && (
          <div className="px-8 py-8">
            <div className="bg-gradient-to-br from-teal-50 to-cyan-50 dark:from-gray-750 dark:to-gray-700 rounded-xl p-6 border border-teal-200 dark:border-teal-800">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                  Upgrade to {nextInfo.name}
                </h2>
                <span className={`px-4 py-1.5 rounded-full text-sm font-bold text-white ${nextInfo.bgColor}`}>
                  {nextInfo.price}
                </span>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-6">
                {nextInfo.features.map((feat, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className="text-teal-500 mt-0.5 flex-shrink-0">✓</span>
                    <span className="text-sm text-gray-700 dark:text-gray-300">{feat}</span>
                  </div>
                ))}
              </div>
              
              <div className="flex flex-col sm:flex-row gap-3">
                <Link
                  to={`/payment?tier=${nextTierKey}`}
                  className="flex-1 px-6 py-3 bg-gradient-to-r from-teal-600 to-teal-500 hover:from-teal-700 hover:to-teal-600 text-white font-semibold rounded-lg transition-all text-center shadow-lg"
                >
                  Upgrade Now →
                </Link>
                <Link
                  to="/pricing"
                  className="flex-1 px-6 py-3 bg-gray-200 dark:bg-gray-600 text-gray-900 dark:text-white font-semibold rounded-lg hover:bg-gray-300 dark:hover:bg-gray-500 transition-all text-center"
                >
                  Compare All Plans
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* Already on Professional */}
        {!nextInfo && currentTier === 'professional' && (
          <div className="px-8 py-8">
            <div className="bg-purple-50 dark:bg-gray-750 rounded-xl p-6 border border-purple-200 dark:border-purple-800 text-center">
              <p className="text-gray-700 dark:text-gray-300 mb-2">
                You're on our highest plan. Your limits will reset based on your billing cycle.
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Need even more? Contact us at{' '}
                <a href="mailto:support@northwestcreekllc.com" className="text-teal-600 dark:text-teal-400 underline">
                  support@northwestcreekllc.com
                </a>
              </p>
            </div>
          </div>
        )}

        {/* Back button */}
        <div className="px-8 pb-8 text-center">
          <button
            onClick={onBack || (() => navigate(-1))}
            className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 text-sm underline transition-colors"
          >
            ← Go Back
          </button>
        </div>
      </div>
    </div>
  );
};

export default UpgradeRequired;