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

test('put-call parity holds', () => {
  for (const [S, K, T, r, v] of [[48.42, 50, 30 / 365, 0.04, 0.99], [349.51, 325, 30 / 365, 0.04, 0.238], [150, 150, 2, 0.045, 0.25]]) {
    const parity = bsPrice(S, K, T, r, v, 'call') - bsPrice(S, K, T, r, v, 'put');
    expect(parity).toBeCloseTo(S - K * Math.exp(-r * T), 8);
  }
});

test('binomial converges to Black-Scholes for a call (no dividends: no early-exercise premium)', () => {
  const T = 30 / 365;
  // The page's own example: before the fix this showed $6.08 against $4.53.
  expect(binomialPrice(150, 150, T, 0.04, 0.25, 'call', 200)).toBeCloseTo(bsPrice(150, 150, T, 0.04, 0.25, 'call'), 1);
  expect(bsPrice(150, 150, T, 0.04, 0.25, 'call')).toBeCloseTo(4.53, 2);
  // An American put is worth at least the European one.
  expect(binomialPrice(150, 150, T, 0.04, 0.25, 'put', 200)).toBeGreaterThanOrEqual(bsPrice(150, 150, T, 0.04, 0.25, 'put') - 0.01);
});

test('implied volatility round-trips', () => {
  for (const v of [0.15, 0.25, 0.6, 1.2]) {
    const price = bsPrice(100, 105, 0.25, 0.04, v, 'call');
    expect(impliedVol(100, 105, 0.25, 0.04, price, 'call')).toBeCloseTo(v, 3);
  }
});
