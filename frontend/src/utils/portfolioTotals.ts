// The one rule for portfolio totals, shared by Portfolio and Dashboard (which
// used to compute them three different ways). A position with no price is left
// out of value AND cost: counting its cost against a value of zero showed it as
// a total loss, so a quote outage read as -100%. Falling back to the buy price
// hid it as break-even instead. Callers show `unpriced` so the gap is visible.
export interface PortfolioTotals {
  value: number;
  cost: number;
  pl: number;
  plPercent: number;
  unpriced: number;
}

export const summarizePositions = (
  rows: { quantity: number; buy_price: number; total_value?: number | null }[]
): PortfolioTotals => {
  let value = 0;
  let cost = 0;
  let unpriced = 0;
  for (const row of rows) {
    if (row.total_value == null) {
      unpriced += 1;
      continue;
    }
    value += row.total_value;
    cost += row.buy_price * row.quantity;
  }
  const pl = value - cost;
  return { value, cost, pl, plPercent: cost > 0 ? (pl / cost) * 100 : 0, unpriced };
};
