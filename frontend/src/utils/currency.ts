// Money formatting. Every money figure the API returns is in US dollars — the
// backend converts foreign filers' statements (Toyota reports in yen) before
// sending them — so this only ever prints "$".

/**
 * Format a dollar amount. Compact by default ("$391.04B", "-$1.20B");
 * `compact: false` for per-share figures ("$22.54", "$1,180.23").
 */
export const formatUsd = (
  val: number | null | undefined,
  opts: { compact?: boolean } = {},
): string => {
  if (val == null) return '—';
  const { compact = true } = opts;
  const abs = Math.abs(val);
  let body: string;
  if (!compact) body = abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  else if (abs >= 1e12) body = `${(abs / 1e12).toFixed(2)}T`;
  else if (abs >= 1e9) body = `${(abs / 1e9).toFixed(2)}B`;
  else if (abs >= 1e6) body = `${(abs / 1e6).toFixed(1)}M`;
  else if (abs >= 1e3) body = `${(abs / 1e3).toFixed(1)}K`;
  else body = abs.toFixed(2);
  return `${val < 0 ? '-' : ''}$${body}`;
};
