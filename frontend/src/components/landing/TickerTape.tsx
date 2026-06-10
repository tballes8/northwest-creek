import React, { useEffect, useState } from 'react';
import { marketAPI } from '../../services/api';

interface TapeQuote {
  ticker: string;
  price: number;
  change_percent: number;
  tag?: 'breakout' | 'squeeze';
}

const FALLBACK: TapeQuote[] = [
  { ticker: 'AAPL', price: 0, change_percent: 0 },
  { ticker: 'MSFT', price: 0, change_percent: 0 },
  { ticker: 'GOOGL', price: 0, change_percent: 0 },
  { ticker: 'AMZN', price: 0, change_percent: 0 },
  { ticker: 'NVDA', price: 0, change_percent: 0 },
  { ticker: 'META', price: 0, change_percent: 0 },
  { ticker: 'TSLA', price: 0, change_percent: 0 },
  { ticker: 'SPY', price: 0, change_percent: 0 },
  { ticker: 'QQQ', price: 0, change_percent: 0 },
  { ticker: 'DIA', price: 0, change_percent: 0 },
];

interface TickerTapeProps {
  /** When true, render dark-consistent styling that blends into the (always-dark) NavBar. */
  embedded?: boolean;
  /** 'most-active' (default): FMP volume-sorted most-actives. 'screens': High
   *  Volume Breakout + In Squeeze quick-screen results. */
  source?: 'most-active' | 'screens';
}

const POLL_MS = 60_000;

const TickerTape: React.FC<TickerTapeProps> = ({
  embedded = false,
  source = 'most-active',
}) => {
  const [quotes, setQuotes] = useState<TapeQuote[]>([]);
  const isScreens = source === 'screens';

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      const req = isScreens
        ? marketAPI.getScreensTickerTape()
        : marketAPI.getTickerTape();
      req
        .then((res) => {
          if (cancelled) return;
          const data: TapeQuote[] = res.data?.data || [];
          // Keep showing whatever we have on an empty/failed refresh; only fall
          // back to the hardcoded list when we have nothing yet. The screens
          // tape has no fallback — it can be legitimately empty.
          setQuotes((prev) =>
            data.length > 0 ? data : prev.length > 0 || isScreens ? prev : FALLBACK
          );
        })
        .catch(() => {
          if (!cancelled)
            setQuotes((prev) => (prev.length > 0 || isScreens ? prev : FALLBACK));
        });
    };
    load();
    const id = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [isScreens]);

  // Styling differs between the landing pages (theme-aware) and the embedded
  // NavBar strip (always dark, since the nav is always gray-900).
  // When stacked below the most-active tape on the landing page, use border-b
  // only so the seam between the two tapes is a single 1px divider.
  const containerCls = embedded
    ? 'relative overflow-hidden bg-gray-900 border-b border-gray-700 group'
    : `relative overflow-hidden ${isScreens ? 'border-b' : 'border-y'} border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 group`;
  const tickerCls = embedded
    ? 'font-bold text-white tracking-tight'
    : 'font-bold text-gray-900 dark:text-white tracking-tight';
  const priceCls = embedded
    ? 'text-gray-300 tabular-nums'
    : 'text-gray-700 dark:text-gray-300 tabular-nums';
  const upCls = embedded ? 'text-green-400' : 'text-green-500 dark:text-green-400';
  const downCls = embedded ? 'text-red-400' : 'text-red-500 dark:text-red-400';
  const badgeBreakoutCls = embedded
    ? 'bg-primary-500/20 text-primary-400'
    : 'bg-primary-500/10 text-primary-600 dark:bg-primary-500/20 dark:text-primary-400';
  const badgeSqueezeCls = embedded
    ? 'bg-amber-500/20 text-amber-400'
    : 'bg-amber-500/10 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400';

  if (quotes.length === 0) {
    // The screens tape collapses entirely when empty (no breakouts on a red
    // day, or no snapshot data yet) instead of holding a blank strip.
    if (isScreens) return null;
    return (
      <div
        className={
          embedded
            ? 'h-12 border-b border-gray-700 bg-gray-900'
            : 'h-12 border-y border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900'
        }
      />
    );
  }

  const loop = [...quotes, ...quotes];

  return (
    <div className={containerCls}>
      <style>{`
        @keyframes nwc-ticker-scroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .nwc-ticker-track {
          animation: nwc-ticker-scroll 60s linear infinite;
        }
        .nwc-ticker-wrap:hover .nwc-ticker-track {
          animation-play-state: paused;
        }
        @media (prefers-reduced-motion: reduce) {
          .nwc-ticker-track { animation: none; }
        }
      `}</style>
      <div className="nwc-ticker-wrap">
        {/* The screens tape scrolls the opposite way so the stacked tapes read
            as two distinct streams. The duplicated-list loop is symmetric, so
            reversing the same keyframes stays seamless; the inline longhand
            wins over the class's animation shorthand. */}
        <div
          className="nwc-ticker-track flex w-max py-3"
          style={isScreens ? { animationDirection: 'reverse' } : undefined}
        >
          {loop.map((q, i) => {
            const up = q.change_percent >= 0;
            return (
              <div
                key={`${q.ticker}-${i}`}
                className="flex items-center gap-2 px-6 text-sm shrink-0"
              >
                {q.tag && (
                  <span
                    className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                      q.tag === 'breakout' ? badgeBreakoutCls : badgeSqueezeCls
                    }`}
                  >
                    {q.tag === 'breakout' ? 'BO' : 'SQZ'}
                  </span>
                )}
                <span className={tickerCls}>
                  {q.ticker}
                </span>
                <span className={priceCls}>
                  ${q.price.toFixed(2)}
                </span>
                <span
                  className={`font-semibold tabular-nums ${up ? upCls : downCls}`}
                >
                  {up ? '+' : ''}
                  {q.change_percent.toFixed(2)}%
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default TickerTape;
