export type TierSlug = 'beginner' | 'casual' | 'active' | 'professional';

export interface PricingTier {
  slug: TierSlug;
  name: string;
  shortName: string;
  price: string;
  period: string;
  monthlyPriceNum: number;
  annualPriceNum: number;
  hasTrial: boolean;
  trialBadge?: string;
  popular?: boolean;
  highlightedBullet?: string;
  bullets: string[];
  ctaLabel: string;
  description: string;
}

export const PRICING_TIERS: PricingTier[] = [
  {
    slug: 'beginner',
    name: 'Beginner',
    shortName: 'Beginner',
    price: '$10',
    period: '/month',
    monthlyPriceNum: 10,
    annualPriceNum: 96,
    hasTrial: true,
    trialBadge: '14-day free trial',
    description: 'Perfect for getting started — 14-day free trial',
    bullets: [
      '10 watchlist stocks',
      '10 portfolio entries',
      '5 price alerts',
      '5 stock reviews per week',
      '5 DCF valuations per week',
      '5 technical analyses per week',
      'Real-time WebSocket prices',
    ],
    ctaLabel: 'Start Free Trial',
  },
  {
    slug: 'casual',
    name: 'Casual Investor',
    shortName: 'Casual',
    price: '$20',
    period: '/month',
    monthlyPriceNum: 20,
    annualPriceNum: 192,
    hasTrial: true,
    trialBadge: '14-day free trial',
    description: 'For investors tracking a moderate portfolio — 14-day free trial',
    highlightedBullet: '✦ AI Stock & Portfolio Analysis — 5/week',
    bullets: [
      '20 watchlist stocks',
      '20 portfolio entries',
      '10 price alerts',
      '15 stock reviews per week',
      '15 DCF valuations per week',
      '15 technical analyses per week',
      'Email price alerts',
    ],
    ctaLabel: 'Start Free Trial',
  },
  {
    slug: 'active',
    name: 'Active Investor',
    shortName: 'Active',
    price: '$40',
    period: '/month',
    monthlyPriceNum: 40,
    annualPriceNum: 384,
    hasTrial: false,
    popular: true,
    description: 'For active traders with larger portfolios',
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
      'Save your screens',
      'Options Calculator',
    ],
    ctaLabel: 'Get Active',
  },
  {
    slug: 'professional',
    name: 'Professional',
    shortName: 'Professional',
    price: '$50',
    period: '/month',
    monthlyPriceNum: 50,
    annualPriceNum: 480,
    hasTrial: false,
    description: 'Ultimate tools for professional traders',
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
      'Save your screens',
      'Options Calculator',
    ],
    ctaLabel: 'Go Professional',
  },
];

export const getTierBySlug = (slug: TierSlug): PricingTier =>
  PRICING_TIERS.find((t) => t.slug === slug) ?? PRICING_TIERS[0];
