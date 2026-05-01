import React from 'react';
import { Link } from 'react-router-dom';
import { PricingTier } from '../../data/pricingTiers';

interface Props {
  tier: PricingTier;
  billing: 'monthly' | 'annual';
}

const PricingCard: React.FC<Props> = ({ tier, billing }) => {
  const annual = billing === 'annual';
  const effectiveMonthly = annual
    ? (tier.annualPriceNum / 12).toFixed(2).replace(/\.00$/, '')
    : tier.monthlyPriceNum.toString();
  const isPopular = !!tier.popular;

  return (
    <div
      className={`relative rounded-2xl p-6 flex flex-col bg-white dark:bg-gray-900 transition-shadow ${
        isPopular
          ? 'border-2 border-primary-500 shadow-xl shadow-primary-500/20'
          : 'border border-gray-200 dark:border-gray-700 shadow-sm'
      }`}
    >
      {isPopular && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary-600 text-white text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider whitespace-nowrap">
          Most Popular
        </div>
      )}

      <h3 className="text-lg font-bold text-gray-900 dark:text-white">{tier.name}</h3>
      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 min-h-[2.5rem]">
        {tier.description}
      </p>

      <div className="mt-4 flex items-baseline gap-1">
        <span className="text-4xl font-extrabold text-gray-900 dark:text-white tabular-nums">
          ${effectiveMonthly}
        </span>
        <span className="text-sm text-gray-500 dark:text-gray-400">/mo</span>
      </div>
      {annual ? (
        <div className="mt-1 flex items-center gap-2">
          <span className="text-xs text-gray-400 line-through">
            ${tier.monthlyPriceNum}/mo
          </span>
          <span className="text-xs font-semibold text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/30 px-2 py-0.5 rounded">
            Save 20%
          </span>
        </div>
      ) : (
        <div className="mt-1 text-xs text-gray-400 h-4">
          {tier.hasTrial ? tier.trialBadge : ''}
        </div>
      )}

      {tier.highlightedBullet && (
        <div className="mt-4 px-3 py-2 rounded-lg bg-primary-50 dark:bg-primary-900/20 text-xs font-semibold text-primary-700 dark:text-primary-300">
          {tier.highlightedBullet}
        </div>
      )}

      <ul className="mt-4 space-y-2 flex-1">
        {tier.bullets.map((b, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
            <svg
              className="w-4 h-4 text-primary-500 mt-0.5 shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            <span>{b}</span>
          </li>
        ))}
      </ul>

      <Link
        to={`/registerwithpayment?tier=${tier.slug}&billing=${billing}`}
        className={`mt-6 w-full inline-flex items-center justify-center px-4 py-2.5 rounded-lg font-semibold text-sm transition-colors ${
          isPopular
            ? 'bg-primary-600 hover:bg-primary-700 text-white'
            : 'bg-gray-900 dark:bg-white hover:bg-gray-800 dark:hover:bg-gray-100 text-white dark:text-gray-900'
        }`}
      >
        {tier.ctaLabel}
      </Link>
    </div>
  );
};

export default PricingCard;
