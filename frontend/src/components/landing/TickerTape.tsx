import React, { useEffect, useState } from 'react';
import { marketAPI } from '../../services/api';

interface TapeQuote {
  ticker: string;
  price: number;
  change_percent: number;
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

const TickerTape: React.FC = () => {
  const [quotes, setQuotes] = useState<TapeQuote[]>([]);

  useEffect(() => {
    let cancelled = false;
    marketAPI
      .getTickerTape()
      .then((res) => {
        if (cancelled) return;
        const data: TapeQuote[] = res.data?.data || [];
        setQuotes(data.length > 0 ? data : FALLBACK);
      })
      .catch(() => {
        if (!cancelled) setQuotes(FALLBACK);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (quotes.length === 0) {
    return <div className="h-12 border-y border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900" />;
  }

  const loop = [...quotes, ...quotes];

  return (
    <div className="relative overflow-hidden border-y border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 group">
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
        <div className="nwc-ticker-track flex w-max py-3">
          {loop.map((q, i) => {
            const up = q.change_percent >= 0;
            return (
              <div
                key={`${q.ticker}-${i}`}
                className="flex items-center gap-2 px-6 text-sm shrink-0"
              >
                <span className="font-bold text-gray-900 dark:text-white tracking-tight">
                  {q.ticker}
                </span>
                <span className="text-gray-700 dark:text-gray-300 tabular-nums">
                  ${q.price.toFixed(2)}
                </span>
                <span
                  className={`font-semibold tabular-nums ${
                    up ? 'text-green-500 dark:text-green-400' : 'text-red-500 dark:text-red-400'
                  }`}
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
