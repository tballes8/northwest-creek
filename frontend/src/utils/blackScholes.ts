// Option pricing: the one copy, used by the Options Calculator and the DCF
// page's "Trade This" suggestion. Client-side by design (the Options
// Calculator gate is frontend-only; see CLAUDE.md). No dividends: every model
// here assumes the underlying pays none.
//
// Checked against textbook values in blackScholes.test.ts.

export type OptionType = 'call' | 'put';

export interface Greeks {
  delta: number;
  gamma: number;
  /** per calendar day */
  theta: number;
  /** per 1 point of volatility */
  vega: number;
  /** per 1 point of interest rate */
  rho: number;
}

const intrinsic = (S: number, K: number, type: OptionType) =>
  Math.max(type === 'call' ? S - K : K - S, 0);

export function normPdf(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

// Standard normal CDF from Abramowitz & Stegun 7.1.26 (|error| < 1.5e-7).
// That formula approximates erf, so the argument is scaled by 1/√2:
// Φ(x) = ½(1 + erf(x/√2)). The two copies this replaced skipped the scaling
// in one of the two places, which overpriced a 30-day at-the-money call by
// about a third and skewed every Black-Scholes figure derived from it.
export function normCdf(x: number): number {
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741, a4 = -1.453152027, a5 = 1.061405429;
  const p = 0.3275911;
  const z = Math.abs(x) / Math.SQRT2;
  const t = 1 / (1 + p * z);
  const erf = 1 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-z * z);
  return 0.5 * (1 + (x < 0 ? -erf : erf));
}

/** European option price. T in years; r and sigma as decimals (0.04, 0.25). */
export function bsPrice(S: number, K: number, T: number, r: number, sigma: number, type: OptionType): number {
  if (T <= 0 || sigma <= 0) return intrinsic(S, K, type);
  const d1 = (Math.log(S / K) + (r + (sigma * sigma) / 2) * T) / (sigma * Math.sqrt(T));
  const d2 = d1 - sigma * Math.sqrt(T);
  if (type === 'call') return S * normCdf(d1) - K * Math.exp(-r * T) * normCdf(d2);
  return K * Math.exp(-r * T) * normCdf(-d2) - S * normCdf(-d1);
}

export function bsGreeks(S: number, K: number, T: number, r: number, sigma: number, type: OptionType): Greeks {
  if (T <= 0 || sigma <= 0) return { delta: 0, gamma: 0, theta: 0, vega: 0, rho: 0 };
  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(S / K) + (r + (sigma * sigma) / 2) * T) / (sigma * sqrtT);
  const d2 = d1 - sigma * sqrtT;
  const nd1 = normPdf(d1);
  const disc = K * Math.exp(-r * T);
  const thetaCommon = -(S * nd1 * sigma) / (2 * sqrtT);
  return {
    delta: type === 'call' ? normCdf(d1) : normCdf(d1) - 1,
    gamma: nd1 / (S * sigma * sqrtT),
    theta: (type === 'call' ? thetaCommon - r * disc * normCdf(d2) : thetaCommon + r * disc * normCdf(-d2)) / 365,
    vega: (S * nd1 * sqrtT) / 100,
    rho: (type === 'call' ? T * disc * normCdf(d2) : -T * disc * normCdf(-d2)) / 100,
  };
}

/** American option price on a Cox-Ross-Rubinstein tree. */
export function binomialPrice(
  S: number, K: number, T: number, r: number, sigma: number, type: OptionType, steps = 100,
): number {
  if (T <= 0) return intrinsic(S, K, type);
  const dt = T / steps;
  const u = Math.exp(sigma * Math.sqrt(dt));
  const d = 1 / u;
  const p = (Math.exp(r * dt) - d) / (u - d);
  const disc = Math.exp(-r * dt);
  const values = new Array<number>(steps + 1);
  for (let i = 0; i <= steps; i++) {
    values[i] = intrinsic(S * Math.pow(u, steps - i) * Math.pow(d, i), K, type);
  }
  for (let j = steps - 1; j >= 0; j--) {
    for (let i = 0; i <= j; i++) {
      const hold = disc * (p * values[i] + (1 - p) * values[i + 1]);
      const exercise = intrinsic(S * Math.pow(u, j - i) * Math.pow(d, i), K, type);
      values[i] = Math.max(hold, exercise);
    }
  }
  return values[0];
}

/** Volatility (decimal) at which the Black-Scholes price equals marketPrice. Bisection over 0.1%–500%. */
export function impliedVol(S: number, K: number, T: number, r: number, marketPrice: number, type: OptionType): number {
  let lo = 0.001, hi = 5, mid = (lo + hi) / 2;
  for (let i = 0; i < 100; i++) {
    mid = (lo + hi) / 2;
    const price = bsPrice(S, K, T, r, mid, type);
    if (Math.abs(price - marketPrice) < 0.0001) return mid;
    if (price > marketPrice) hi = mid; else lo = mid;
  }
  return mid;
}
