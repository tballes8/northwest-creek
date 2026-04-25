import React from 'react';
import { Link } from 'react-router-dom';

interface Tier {
  id: 'beginner' | 'casual' | 'active' | 'professional';
  name: string;
  price: string;
  popular?: boolean;
  trial?: boolean;
  ctaLabel: string;
  highlightedBullet?: string;
  bullets: string[];
}

const TIERS: Tier[] = [
  {
    id: 'beginner',
    name: 'Beginner',
    price: '$10',
    trial: true,
    ctaLabel: 'Start Free Trial',
    bullets: [
      '10 watchlist stocks',
      '10 portfolio entries',
      '5 price alerts',
      '5 stock reviews per week',
      '5 DCF valuations per week',
      '5 technical analyses per week',
      'Real-time WebSocket prices',
      'Stock screener',
    ],
  },
  {
    id: 'casual',
    name: 'Casual Investor',
    price: '$20',
    popular: true,
    trial: true,
    ctaLabel: 'Start Free Trial',
    highlightedBullet: '✦ AI Stock & Portfolio Analysis — 5/week',
    bullets: [
      '20 watchlist stocks',
      '20 portfolio entries',
      '10 price alerts',
      '15 stock reviews per week',
      '15 DCF valuations per week',
      '15 technical analyses per week',
      'Email price alerts',
      'Stock screener',
    ],
  },
  {
    id: 'active',
    name: 'Active Investor',
    price: '$40',
    ctaLabel: 'Get Active',
    highlightedBullet: '✦ AI Stock & Portfolio Analysis — 10/day',
    bullets: [
      '45 watchlist stocks',
      '45 portfolio entries',
      '20 price alerts',
      '20 stock reviews per day',
      '20 DCF valuations per day',
      '20 technical analyses per day',
      '5 smart technical alerts (RSI, MACD, MA cross…)',
      'Email price alerts',
      'Options Calculator',
    ],
  },
  {
    id: 'professional',
    name: 'Professional',
    price: '$50',
    ctaLabel: 'Go Professional',
    highlightedBullet: '✦ AI Stock & Portfolio Analysis — 25/day',
    bullets: [
      '75 watchlist stocks',
      '75 portfolio entries',
      '50 price alerts',
      '40 stock reviews per day',
      '40 DCF valuations per day',
      '40 technical analyses per day',
      '20 smart technical alerts (RSI, MACD, MA cross…)',
      'Email price alerts',
      'Options Calculator',
      'Ad-free experience',
    ],
  },
];

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
        {TIERS.map((tier) => (
          <div
            key={tier.id}
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
            {tier.trial ? (
              <p className="text-sm text-emerald-600 dark:text-emerald-400 font-medium mb-6">
                14-day free trial
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
              to={`/registerwithpayment?tier=${tier.id}`}
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
