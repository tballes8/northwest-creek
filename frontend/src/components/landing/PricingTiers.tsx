import React from 'react';
import { Link } from 'react-router-dom';
import { PRICING_TIERS } from '../../data/pricingTiers';

const Check = () => (
  <svg
    className="w-5 h-5 text-emerald-500 dark:text-emerald-400 mr-2 mt-0.5 flex-shrink-0"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
  >
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
  </svg>
);

const PricingTiers: React.FC = () => {
  return (
    <div id="pricing" className="scroll-mt-20">
      <h2 className="text-3xl font-bold text-center text-gray-900 dark:text-white mb-4">
        Simple, Transparent Pricing
      </h2>
      <p className="text-center text-gray-600 dark:text-gray-400 mb-16">
        Every plan starts with a 14-day free trial — no credit card required
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 max-w-25xl mx-auto">
        {PRICING_TIERS.map((tier) => (
          <div
            key={tier.slug}
            className={`bg-white dark:bg-gray-600 p-8 rounded-xl shadow-lg dark:shadow-gray-200/50 hover:shadow-xl transition-shadow border dark:border-gray-300 ${
              tier.popular ? 'relative transform scale-105' : ''
            }`}
          >
            {tier.popular && (
              <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                <span className="bg-primary-600 dark:bg-primary-500 text-white text-sm font-bold px-4 py-1 rounded-full">
                  POPULAR
                </span>
              </div>
            )}
            <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">{tier.name}</h3>
            <div className="mb-2">
              <span className="text-4xl font-bold text-gray-900 dark:text-white">{tier.price}</span>
              <span className="text-gray-600 dark:text-gray-400">/month</span>
            </div>
            {tier.hasTrial ? (
              <p className="text-sm text-emerald-600 dark:text-emerald-400 font-medium mb-6">
                {tier.trialBadge}
              </p>
            ) : (
              <div className="mb-6" />
            )}
            <ul className="space-y-3 mb-8">
              {tier.highlightedBullet && (
                <li className="flex items-start">
                  <Check />
                  <span className="font-bold text-gray-900 dark:text-white">{tier.highlightedBullet}</span>
                </li>
              )}
              {tier.bullets.map((b) => (
                <li key={b} className="flex items-start">
                  <Check />
                  <span className="text-gray-700 dark:text-gray-300">{b}</span>
                </li>
              ))}
            </ul>
            <Link
              to={`/registerwithpayment?tier=${tier.slug}`}
              className="block w-full text-center bg-primary-600 hover:bg-primary-700 dark:bg-primary-500 dark:hover:bg-primary-600 text-white font-semibold py-3 rounded-lg transition-colors"
            >
              {tier.ctaLabel}
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
};

export default PricingTiers;
