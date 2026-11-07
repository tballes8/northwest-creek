import React, { useEffect, useRef, useState } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
} from 'chart.js';
import { Line } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip);

// A labelled sample, not a quote: the AI summary runs only on a click inside the
// app (CLAUDE.md), so the landing page can't show a live one. Its figures follow
// the product's own outputs and the brief's rules: the AI target range as a
// bear-to-bull range (no single fair value, no "upside"), indicator readings
// described as conditions, and a Bullish/Bearish trend label.
// Scaled to AAPL's level in Nov 2026 ($342) so it doesn't contradict the live
// tape above it; rescale MOCK_PRICES and the range if AAPL moves far from it.
const MOCK_PRICES = [
  317.6, 319.8, 321.0, 318.9, 323.2, 326.2, 328.9, 326.5, 329.9, 332.2,
  334.7, 331.9, 336.0, 337.1, 335.1, 339.0, 341.3, 339.2, 342.4, 341.9,
  344.0, 342.9, 340.8, 343.6, 345.6, 343.1, 340.4, 342.8, 344.4, 342.4,
];
const LAST = MOCK_PRICES[MOCK_PRICES.length - 1];
const CHANGE_PCT = (LAST / MOCK_PRICES[MOCK_PRICES.length - 2] - 1) * 100;
const RANGE_BEAR = 310;
const RANGE_BULL = 385;

const SUMMARY =
  `AAPL is consolidating near $${Math.round(LAST)}. RSI at 58 is in neutral territory, below the 70 level traders call overbought. ` +
  `The 50-day moving average sits above the 200-day, a pattern traders read as bullish. ` +
  `NWC's AI target range runs from $${RANGE_BEAR} in the bear case to $${RANGE_BULL} in the bull case.`;

const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const HeroDemoCard: React.FC = () => {
  const [reduceMotion] = useState<boolean>(prefersReducedMotion);
  const [typed, setTyped] = useState(reduceMotion ? SUMMARY : '');
  const indexRef = useRef(0);

  useEffect(() => {
    if (reduceMotion) return;
    const id = setInterval(() => {
      indexRef.current += 1;
      setTyped(SUMMARY.slice(0, indexRef.current));
      if (indexRef.current >= SUMMARY.length) clearInterval(id);
    }, 18);
    return () => clearInterval(id);
  }, [reduceMotion]);

  const chartData = {
    labels: MOCK_PRICES.map((_, i) => `D${i + 1}`),
    datasets: [
      {
        data: MOCK_PRICES,
        borderColor: '#0d9488',
        backgroundColor: 'rgba(13, 148, 136, 0.15)',
        borderWidth: 2,
        fill: true,
        tension: 0.35,
        pointRadius: 0,
        pointHoverRadius: 0,
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: { enabled: false },
    },
    scales: {
      x: { display: false },
      y: { display: false },
    },
    animation: reduceMotion ? false as const : undefined,
  };

  return (
    <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-2xl shadow-primary-500/10 p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="font-bold text-gray-900 dark:text-white">AAPL</span>
          <span className="text-xs text-gray-500 dark:text-gray-400">Apple Inc.</span>
          <span className="text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400">
            Sample
          </span>
        </div>
        <div className="text-right">
          <div className="font-bold text-gray-900 dark:text-white tabular-nums">${LAST.toFixed(2)}</div>
          <div className={`text-xs font-semibold tabular-nums ${CHANGE_PCT >= 0 ? 'text-green-500' : 'text-red-500'}`}>
            {CHANGE_PCT >= 0 ? '+' : ''}{CHANGE_PCT.toFixed(2)}%
          </div>
        </div>
      </div>

      <div className="rounded-lg bg-gray-50 dark:bg-gray-800/60 px-3 py-2 mb-4">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[10px] uppercase tracking-wider font-semibold text-primary-600 dark:text-primary-400">
            AI Summary
          </span>
          <span className="w-1.5 h-1.5 rounded-full bg-primary-500 animate-pulse" />
        </div>
        <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed min-h-[5.5rem]">
          {typed}
          {!reduceMotion && typed.length < SUMMARY.length && (
            <span className="inline-block w-1.5 h-4 bg-primary-500 align-middle ml-0.5 animate-pulse" />
          )}
        </p>
      </div>

      <div className="h-32">
        <Line data={chartData} options={chartOptions} />
      </div>

      <div className="grid grid-cols-3 gap-2 mt-4 text-center">
        <div>
          <div className="text-[10px] text-gray-500 dark:text-gray-400 uppercase tracking-wide">RSI</div>
          <div className="text-sm font-semibold text-gray-900 dark:text-white">58</div>
        </div>
        <div>
          <div className="text-[10px] text-gray-500 dark:text-gray-400 uppercase tracking-wide">AI Target Range</div>
          <div className="text-sm font-semibold text-gray-900 dark:text-white tabular-nums">
            ${RANGE_BEAR}–${RANGE_BULL}
          </div>
        </div>
        <div>
          <div className="text-[10px] text-gray-500 dark:text-gray-400 uppercase tracking-wide">Trend</div>
          <div className="text-sm font-semibold text-primary-600 dark:text-primary-400">Bullish</div>
        </div>
      </div>

      <p className="mt-4 text-[11px] text-center text-gray-400 dark:text-gray-500">
        Sample output for illustration, not live data.
      </p>
    </div>
  );
};

export default HeroDemoCard;
