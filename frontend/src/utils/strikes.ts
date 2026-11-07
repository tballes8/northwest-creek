// Option strikes are listed on a fixed grid, not at any price. These are the
// usual increments for a stock at a given price. Heavily traded names often
// list finer strikes too, but a strike on this grid is usually listed, so the
// calculators' default strikes land on it. There is no options-chain feed
// behind this: the user's broker's chain is the authority on what exists.

export function strikeStep(price: number): number {
  if (price < 5) return 0.5;
  if (price < 25) return 1;
  if (price < 50) return 2.5;
  if (price < 500) return 5;
  return 10;
}

export const roundStrike = (x: number, step: number): number => Math.round(x / step) * step;

// The tolerance keeps a price already on the grid from moving a whole step on float noise.
export const strikeAtOrBelow = (x: number, step: number): number => Math.floor(x / step + 1e-9) * step;
export const strikeAtOrAbove = (x: number, step: number): number => Math.ceil(x / step - 1e-9) * step;

// Default spread strikes: on the grid for the stock's price, at the usual
// distances from it, and never collapsed onto one strike (a $10 stock rounds
// both 3% strikes to $10). Null for a missing or non-positive price.

/** Two strikes about 3% either side of the price, lower first. */
export function defaultVerticalStrikes(S: number): [number, number] | null {
  if (!(S > 0)) return null;
  const step = strikeStep(S);
  let lo = roundStrike(S * 0.97, step), hi = roundStrike(S * 1.03, step);
  if (hi <= lo) { lo = strikeAtOrBelow(S * 0.97, step); hi = strikeAtOrAbove(S * 1.03, step); }
  return [lo, hi];
}

/** Iron condor strikes, ascending: put wing, put short, call short, call wing. */
export function defaultCondorStrikes(S: number): [number, number, number, number] | null {
  if (!(S > 0)) return null;
  const step = strikeStep(S);
  // Short strikes at least 5% out of the money; wings about 10% out and always beyond them.
  const putShort = strikeAtOrBelow(S * 0.95, step), callShort = strikeAtOrAbove(S * 1.05, step);
  const putWing = Math.min(roundStrike(S * 0.90, step), putShort - step);
  const callWing = Math.max(roundStrike(S * 1.10, step), callShort + step);
  return [putWing, putShort, callShort, callWing];
}

/**
 * Whether a strike could plausibly be listed: whole dollars or $0.50 steps.
 * Other cents ($284.88) almost never are; the rare exception is a contract
 * adjusted after a split or special dividend.
 */
export function isPlausibleStrike(k: number): boolean {
  return Number.isFinite(k) && k > 0 && Math.abs(k * 2 - Math.round(k * 2)) < 1e-6;
}
