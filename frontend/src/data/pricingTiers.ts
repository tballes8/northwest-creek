export type TierSlug = 'beginner' | 'casual' | 'active' | 'professional';

/**
 * What a plan allows. Mirrors TIER_LIMITS in backend core/tier_limits.py, which is
 * what's enforced: change both together. The card bullets, the AI highlight and the
 * comparison tables are all generated from these numbers, so no screen can show a
 * limit of its own.
 */
export interface PlanLimits {
  watchlist: number;
  portfolio: number;
  priceAlerts: number;
  /** review_period: stock reviews, DCF valuations, TA and AI reset per this */
  period: 'week' | 'day';
  stockReviews: number;
  dcf: number;
  technicalAnalysis: number;
  /** 0 = not included */
  aiAnalysis: number;
  /** indicator_alerts: a total that can be active at once, not per period; 0 = not included */
  smartAlerts: number;
  /** 0 = not included */
  savedScreens: number;
  optionsCalculator: boolean;
}

export interface PricingTier {
  slug: TierSlug;
  name: string;
  shortName: string;
  price: string;
  period: string;
  monthlyPriceNum: number;
  hasTrial: boolean;
  trialBadge?: string;
  popular?: boolean;
  limits: PlanLimits;
  highlightedBullet?: string;
  bullets: string[];
  ctaLabel: string;
  description: string;
}

type TierDefinition = Omit<PricingTier, 'highlightedBullet' | 'bullets'> & {
  /** Card lines that aren't limits, listed after the generated ones */
  extraBullets?: string[];
};

const TIER_DEFINITIONS: TierDefinition[] = [
  {
    slug: 'beginner',
    name: 'Beginner',
    shortName: 'Beginner',
    price: '$10',
    period: '/month',
    monthlyPriceNum: 10,
    hasTrial: true,
    trialBadge: '14-day free trial',
    description: 'Perfect for getting started — 14-day free trial',
    limits: {
      watchlist: 10, portfolio: 10, priceAlerts: 5, period: 'week',
      stockReviews: 5, dcf: 5, technicalAnalysis: 5, aiAnalysis: 0,
      smartAlerts: 0, savedScreens: 0, optionsCalculator: false,
    },
    extraBullets: ['Real-time WebSocket prices'],
    ctaLabel: 'Start Free Trial',
  },
  {
    slug: 'casual',
    name: 'Casual Investor',
    shortName: 'Casual',
    price: '$20',
    period: '/month',
    monthlyPriceNum: 20,
    hasTrial: true,
    trialBadge: '14-day free trial',
    description: 'For investors tracking a moderate portfolio — 14-day free trial',
    limits: {
      watchlist: 20, portfolio: 20, priceAlerts: 10, period: 'week',
      stockReviews: 15, dcf: 15, technicalAnalysis: 15, aiAnalysis: 5,
      smartAlerts: 0, savedScreens: 0, optionsCalculator: false,
    },
    ctaLabel: 'Start Free Trial',
  },
  {
    slug: 'active',
    name: 'Active Investor',
    shortName: 'Active',
    price: '$40',
    period: '/month',
    monthlyPriceNum: 40,
    hasTrial: false,
    popular: true,
    description: 'For active traders with larger portfolios',
    limits: {
      watchlist: 45, portfolio: 45, priceAlerts: 20, period: 'day',
      stockReviews: 20, dcf: 20, technicalAnalysis: 10, aiAnalysis: 10,
      smartAlerts: 5, savedScreens: 15, optionsCalculator: true,
    },
    ctaLabel: 'Get Active',
  },
  {
    slug: 'professional',
    name: 'Professional',
    shortName: 'Professional',
    price: '$50',
    period: '/month',
    monthlyPriceNum: 50,
    hasTrial: false,
    description: 'Ultimate tools for professional traders',
    limits: {
      watchlist: 75, portfolio: 75, priceAlerts: 50, period: 'day',
      stockReviews: 40, dcf: 40, technicalAnalysis: 20, aiAnalysis: 25,
      smartAlerts: 20, savedScreens: 50, optionsCalculator: true,
    },
    ctaLabel: 'Go Professional',
  },
];

const limitBullets = (l: PlanLimits): string[] => [
  `${l.watchlist} watchlist stocks`,
  `${l.portfolio} portfolio entries`,
  `${l.priceAlerts} price alerts`,
  `${l.stockReviews} stock reviews per ${l.period}`,
  `${l.dcf} DCF valuations per ${l.period}`,
  `${l.technicalAnalysis} technical analyses per ${l.period}`,
  ...(l.smartAlerts ? [`${l.smartAlerts} smart technical alerts (RSI, MACD, MA cross…)`] : []),
  'Email price alerts',
  ...(l.savedScreens ? ['Save your screens'] : []),
  ...(l.optionsCalculator ? ['Options Calculator'] : []),
];

export const PRICING_TIERS: PricingTier[] = TIER_DEFINITIONS.map(({ extraBullets, ...tier }) => ({
  ...tier,
  highlightedBullet: tier.limits.aiAnalysis
    ? `✦ AI Stock & Portfolio Analysis — ${tier.limits.aiAnalysis}/${tier.limits.period}`
    : undefined,
  bullets: [...limitBullets(tier.limits), ...(extraBullets ?? [])],
}));

export const getTierBySlug = (slug: TierSlug): PricingTier =>
  PRICING_TIERS.find((t) => t.slug === slug) ?? PRICING_TIERS[0];

/** "Beginner and Casual" — the plans with a free trial (backend: TRIAL_TIERS in stripe_payments.py). */
export const TRIAL_PLAN_NAMES = PRICING_TIERS.filter((t) => t.hasTrial)
  .map((t) => t.shortName)
  .join(' and ');

/**
 * Price label and full feature list for compact tier cards (upgrade prompts,
 * account page). Those screens used to keep their own copies, and every copy
 * drifted from the backend's tier_limits.py — this file is the one to update.
 */
export const getTierSummary = (slug: TierSlug): { price: string; features: string[] } => {
  const t = getTierBySlug(slug);
  return {
    price: `${t.price}/mo`,
    features: [
      ...(t.highlightedBullet ? [t.highlightedBullet.replace(/^✦\s*/, '')] : []),
      ...t.bullets,
    ],
  };
};

/** One row of a plan comparison table: true = ✓, false = not included. */
export interface ComparisonRow {
  label: string;
  values: Record<TierSlug, string | boolean>;
}

const comparisonRow = (label: string, value: (t: PricingTier) => string | boolean): ComparisonRow => ({
  label,
  values: Object.fromEntries(PRICING_TIERS.map((t) => [t.slug, value(t)])) as Record<TierSlug, string | boolean>,
});

const perPeriod = (n: number, t: PricingTier) => `${n}/${t.limits.period}`;

/** The plan comparison, for the Pricing page and the Upgrade Required page. */
export const COMPARISON_ROWS: ComparisonRow[] = [
  comparisonRow('Watchlist Stocks', (t) => String(t.limits.watchlist)),
  comparisonRow('Portfolio Entries', (t) => String(t.limits.portfolio)),
  comparisonRow('Price Alerts', (t) => String(t.limits.priceAlerts)),
  comparisonRow('Stock Reviews', (t) => perPeriod(t.limits.stockReviews, t)),
  comparisonRow('DCF Valuations', (t) => perPeriod(t.limits.dcf, t)),
  comparisonRow('Technical Analysis', (t) => perPeriod(t.limits.technicalAnalysis, t)),
  comparisonRow('AI Stock & Portfolio Analysis', (t) => (t.limits.aiAnalysis ? perPeriod(t.limits.aiAnalysis, t) : false)),
  comparisonRow('Smart Technical Alerts', (t) => (t.limits.smartAlerts ? String(t.limits.smartAlerts) : false)),
  comparisonRow('Saved Screens', (t) => (t.limits.savedScreens ? String(t.limits.savedScreens) : false)),
  comparisonRow('Options Calculator', (t) => t.limits.optionsCalculator),
  comparisonRow('Email Alerts', () => true),
  comparisonRow('14-Day Free Trial', (t) => t.hasTrial),
];
