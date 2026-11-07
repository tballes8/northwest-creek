// Expiration payoff of a multi-leg options position, solved exactly.
//
// At expiration the P&L is piecewise linear with kinks only at the strikes, so
// max profit, max loss and breakevens come from the strikes and the slope past
// the highest one, not from sampling a chart. Sampling made them depend on the
// chart's price range: a straddle showed a finite "max profit" (the edge of
// the chart) and a breakeven outside the range simply went missing.
//
// All amounts are per share. netCost is what opening the position cost per
// share: positive for a net debit paid, negative for a net credit received.

export interface PayoffLeg {
  type: 'call' | 'put';
  K: number;
  /** +1 bought, -1 sold */
  dir: number;
}

export interface PayoffSummary {
  /** Infinity when the upside is unlimited */
  maxProfit: number;
  /** -Infinity when the loss is unlimited */
  maxLoss: number;
  /** ascending stock prices where the expiration P&L crosses zero */
  breakevens: number[];
  /** maxProfit / |maxLoss|, or null when either side is unlimited or there is no risk or no reward */
  rewardToRisk: number | null;
}

export function expiryPnl(legs: PayoffLeg[], netCost: number, price: number): number {
  return legs.reduce(
    (sum, l) => sum + l.dir * Math.max(l.type === 'call' ? price - l.K : l.K - price, 0),
    0,
  ) - netCost;
}

export function summarizePayoff(legs: PayoffLeg[], netCost: number): PayoffSummary {
  const kinks = Array.from(new Set(legs.map((l) => l.K))).sort((a, b) => a - b);
  const xs = [0, ...kinks];
  const ys = xs.map((x) => expiryPnl(legs, netCost, x));
  // Past the highest strike every call adds its direction per $1; puts are worthless.
  const slopeUp = legs.reduce((s, l) => s + (l.type === 'call' ? l.dir : 0), 0);

  const maxProfit = slopeUp > 0 ? Infinity : Math.max(...ys);
  const maxLoss = slopeUp < 0 ? -Infinity : Math.min(...ys);

  const breakevens: number[] = [];
  for (let i = 1; i < xs.length; i++) {
    const [x0, x1, y0, y1] = [xs[i - 1], xs[i], ys[i - 1], ys[i]];
    // A crossing that lands exactly on a strike is counted once, by the segment ending there.
    if ((y0 < 0 && y1 >= 0) || (y0 > 0 && y1 <= 0)) breakevens.push(x0 + (-y0 * (x1 - x0)) / (y1 - y0));
  }
  const top = xs[xs.length - 1], yTop = ys[ys.length - 1];
  // Past the top strike the line heads back through zero only if it is below
  // zero and rising, or above zero and falling.
  if (slopeUp !== 0 && yTop !== 0 && (yTop < 0) === (slopeUp > 0)) breakevens.push(top - yTop / slopeUp);

  const rewardToRisk =
    Number.isFinite(maxProfit) && Number.isFinite(maxLoss) && maxProfit > 0 && maxLoss < 0
      ? maxProfit / -maxLoss
      : null;
  return { maxProfit, maxLoss, breakevens, rewardToRisk };
}
