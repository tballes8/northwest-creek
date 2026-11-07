import { normCdf, bsPrice, bsGreeks, binomialPrice, impliedVol } from './blackScholes';

// Reference values: standard normal tables, and the textbook Black-Scholes
// case S=100, K=100, T=1, r=5%, vol=20% (call 10.4506, put 5.5735).

test('normCdf matches the standard normal table', () => {
  const table: [number, number][] = [
    [-3, 0.0013499], [-2, 0.0227501], [-1, 0.1586553], [-0.5, 0.3085375],
    [0, 0.5], [0.5, 0.6914625], [1, 0.8413447], [2, 0.9772499], [3, 0.9986501],
  ];
  for (const [x, expected] of table) expect(normCdf(x)).toBeCloseTo(expected, 6);
});

test('Black-Scholes prices match the textbook case', () => {
  expect(bsPrice(100, 100, 1, 0.05, 0.2, 'call')).toBeCloseTo(10.4506, 3);
  expect(bsPrice(100, 100, 1, 0.05, 0.2, 'put')).toBeCloseTo(5.5735, 3);
});

test('Greeks match the textbook case', () => {
  const g = bsGreeks(100, 100, 1, 0.05, 0.2, 'call');
  expect(g.delta).toBeCloseTo(0.6368, 4);
  expect(g.gamma).toBeCloseTo(0.018762, 5);
  expect(g.vega).toBeCloseTo(0.37524, 4); // per vol point
  expect(g.theta).toBeCloseTo(-6.4140 / 365, 5); // per calendar day
  expect(g.rho).toBeCloseTo(0.53232, 4); // per rate point
  expect(bsGreeks(100, 100, 1, 0.05, 0.2, 'put').delta).toBeCloseTo(0.6368 - 1, 4);
});

test('put-call parity holds, with and without a dividend yield', () => {
  const cases = [[48.42, 50, 30 / 365, 0.04, 0.99, 0], [349.51, 325, 30 / 365, 0.04, 0.238, 0.0045], [150, 150, 2, 0.045, 0.25, 0.03]];
  for (const [S, K, T, r, v, q] of cases) {
    const parity = bsPrice(S, K, T, r, v, 'call', q) - bsPrice(S, K, T, r, v, 'put', q);
    expect(parity).toBeCloseTo(S * Math.exp(-q * T) - K * Math.exp(-r * T), 8);
  }
});

test('dividend yield: Black-Scholes-Merton textbook case', () => {
  // Hull, index option example: S=930, K=900, r=8%, q=3%, vol=20%, 2 months → 51.83
  expect(bsPrice(930, 900, 2 / 12, 0.08, 0.2, 'call', 0.03)).toBeCloseTo(51.83, 2);
  // A dividend lowers a call and raises a put.
  expect(bsPrice(100, 100, 1, 0.05, 0.2, 'call', 0.02)).toBeLessThan(bsPrice(100, 100, 1, 0.05, 0.2, 'call'));
  expect(bsPrice(100, 100, 1, 0.05, 0.2, 'put', 0.02)).toBeGreaterThan(bsPrice(100, 100, 1, 0.05, 0.2, 'put'));
});

test('Greeks with a dividend yield match finite differences of the price', () => {
  const [S, K, T, r, v, q] = [293.69, 295, 30 / 365, 0.04, 0.525, 0.008];
  for (const type of ['call', 'put'] as const) {
    const P = (s = S, t = T, rr = r, vv = v) => bsPrice(s, K, t, rr, vv, type, q);
    const g = bsGreeks(S, K, T, r, v, type, q);
    const h = 1e-3;
    expect(g.delta).toBeCloseTo((P(S + h) - P(S - h)) / (2 * h), 5);
    expect(g.gamma).toBeCloseTo((P(S + h) - 2 * P() + P(S - h)) / (h * h), 3);
    expect(g.vega).toBeCloseTo((P(S, T, r, v + h) - P(S, T, r, v - h)) / (2 * h) / 100, 5);
    expect(g.rho).toBeCloseTo((P(S, T, r + h) - P(S, T, r - h)) / (2 * h) / 100, 5);
    // 4 places: the difference quotient's own error near expiry is ~5e-6. A
    // missing dividend term would be off by ~3e-3, so this still catches one.
    expect(g.theta).toBeCloseTo(-(P(S, T + h) - P(S, T - h)) / (2 * h) / 365, 4);
  }
});

test('binomial converges to Black-Scholes', () => {
  const T = 30 / 365;
  // The page's own example: before the fix this showed $6.08 against $4.53.
  expect(bsPrice(150, 150, T, 0.04, 0.25, 'call')).toBeCloseTo(4.53, 2);
  expect(binomialPrice(150, 150, T, 0.04, 0.25, 'call', { american: false })).toBeCloseTo(bsPrice(150, 150, T, 0.04, 0.25, 'call'), 1);
  expect(binomialPrice(150, 150, T, 0.04, 0.25, 'put', { american: false, q: 0.02 })).toBeCloseTo(bsPrice(150, 150, T, 0.04, 0.25, 'put', 0.02), 1);
});

test('early-exercise premium: none for a call without dividends, real for puts and dividend payers', () => {
  const premium = (type: 'call' | 'put', S: number, q: number) =>
    binomialPrice(S, 100, 1, 0.05, 0.25, type, { q }) - binomialPrice(S, 100, 1, 0.05, 0.25, type, { q, american: false });
  // Exactly zero, not merely small: holding a non-dividend call always beats exercising it.
  for (const S of [60, 100, 160]) expect(premium('call', S, 0)).toBe(0);
  expect(premium('put', 90, 0)).toBeGreaterThan(0.1);
  expect(premium('call', 160, 0.06)).toBeGreaterThan(0.1);
});

test('implied volatility round-trips', () => {
  for (const v of [0.15, 0.25, 0.6, 1.2]) {
    const price = bsPrice(100, 105, 0.25, 0.04, v, 'call');
    expect(impliedVol(100, 105, 0.25, 0.04, price, 'call')).toBeCloseTo(v, 3);
  }
});
