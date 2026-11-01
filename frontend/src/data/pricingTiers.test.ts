/**
 * Parity: the plan data the frontend shows (pricingTiers.ts) against what the
 * backend enforces (TIER_LIMITS and PLAN_NAMES in backend/app/core/tier_limits.py).
 * A limit changed on one side only fails here instead of on a customer's screen.
 *
 * Run from frontend/:
 *   CI=true npx react-scripts test --watchAll=false src/data/pricingTiers.test.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import { PRICING_TIERS, PlanLimits, TIER_ORDER } from './pricingTiers';

const BACKEND_FILE = path.resolve(__dirname, '../../../backend/app/core/tier_limits.py');

// backend TIER_LIMITS key -> frontend PlanLimits key
const MIRRORED: Record<string, keyof PlanLimits> = {
  watchlist_stocks: 'watchlist',
  portfolio_entries: 'portfolio',
  alerts: 'priceAlerts',
  dcf_valuations: 'dcf',
  technical_analysis: 'technicalAnalysis',
  ai_analysis: 'aiAnalysis',
  indicator_alerts: 'smartAlerts',
  saved_screens: 'savedScreens',
  watchlist_screens: 'watchlistScreens',
  review_period: 'period',
};

type PyValue = number | string | boolean;

/** The body of a top-level `NAME = { ... }` dict (closed by a `}` at column 0). */
const topLevelDict = (source: string, name: string): string => {
  const match = source.match(new RegExp(`^${name}\\s*=\\s*\\{([\\s\\S]*?)^\\}`, 'm'));
  if (!match) throw new Error(`${name} = {...} not found in ${BACKEND_FILE}`);
  return match[1];
};

/** `"key": value` pairs with number, string or bool values; trailing # comments are ignored. */
const parseEntries = (body: string): Record<string, PyValue> => {
  const out: Record<string, PyValue> = {};
  const entry = /"(\w+)"\s*:\s*("[^"]*"|-?\d+(?:\.\d+)?|True|False)/g;
  let m: RegExpExecArray | null;
  while ((m = entry.exec(body)) !== null) {
    const raw = m[2];
    out[m[1]] = raw === 'True' ? true : raw === 'False' ? false : raw.startsWith('"') ? raw.slice(1, -1) : Number(raw);
  }
  return out;
};

/** TIER_LIMITS as { tier: { key: value } }. Tier dicts hold no nested braces. */
const parseTierLimits = (source: string): Record<string, Record<string, PyValue>> => {
  const out: Record<string, Record<string, PyValue>> = {};
  const tierBlock = /"(\w+)"\s*:\s*\{([^{}]*)\}/g;
  const body = topLevelDict(source, 'TIER_LIMITS');
  let m: RegExpExecArray | null;
  while ((m = tierBlock.exec(body)) !== null) out[m[1]] = parseEntries(m[2]);
  return out;
};

const backendPresent = fs.existsSync(BACKEND_FILE);
if (!backendPresent) {
  // eslint-disable-next-line no-console
  console.warn(`Skipping plan parity tests: ${BACKEND_FILE} not found (frontend checked out without the backend).`);
}
const describeWithBackend = backendPresent ? describe : describe.skip;

describeWithBackend('pricingTiers.ts mirrors backend tier_limits.py', () => {
  const source = backendPresent ? fs.readFileSync(BACKEND_FILE, 'utf8') : '';
  const backend = backendPresent ? parseTierLimits(source) : {};

  it('has the same tiers', () => {
    expect(Object.keys(backend).sort()).toEqual([...TIER_ORDER].sort());
  });

  describe.each(PRICING_TIERS.map((t) => [t.slug, t] as const))('%s', (slug, tier) => {
    it.each(Object.entries(MIRRORED))('%s matches limits.%s', (backendKey, frontendKey) => {
      const tierLimits = backend[slug];
      expect(tierLimits).toBeDefined();
      // A missing key would read as 0 on the server (get_tier_limit's default): fail instead.
      expect(Object.keys(tierLimits)).toContain(backendKey);
      expect(tier.limits[frontendKey]).toEqual(tierLimits[backendKey]);
    });
  });

  it('plan names match PLAN_NAMES', () => {
    const names = parseEntries(topLevelDict(source, 'PLAN_NAMES'));
    for (const t of PRICING_TIERS) expect(names[t.slug]).toBe(t.name);
  });
});
