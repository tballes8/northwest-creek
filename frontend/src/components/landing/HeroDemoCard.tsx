import React, { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
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

const SUMMARY =
  "AAPL is consolidating near $192 after a strong earnings beat. RSI at 58 shows healthy momentum without overbought conditions, while the 50-day MA crossing above the 200-day MA last week signals a continuation of the uptrend. DCF puts fair value around $215 — roughly 12% upside from here.";

const MOCK_PRICES = [
  178.2, 179.4, 180.1, 178.9, 181.3, 183.0, 184.5, 183.2, 185.1, 186.4,
  187.8, 186.2, 188.5, 189.1, 188.0, 190.2, 191.5, 190.3, 192.1, 191.8,
  193.0, 192.4, 191.2, 192.8, 193.9, 192.5, 191.0, 192.3, 193.2, 192.1,
];

const HeroDemoCard: React.FC = () => {
  const reduceMotion = useReducedMotion();
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
        </div>
        <div className="text-right">
          <div className="font-bold text-gray-900 dark:text-white tabular-nums">$192.10</div>
          <div className="text-xs text-green-500 font-semibold">+1.84%</div>
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
          <div className="text-[10px] text-gray-500 dark:text-gray-400 uppercase tracking-wide">DCF Fair</div>
          <div className="text-sm font-semibold text-green-500">$215</div>
        </div>
        <div>
          <div className="text-[10px] text-gray-500 dark:text-gray-400 uppercase tracking-wide">Trend</div>
          <div className="text-sm font-semibold text-primary-600 dark:text-primary-400">Bullish</div>
        </div>
      </div>
    </div>
  );
};

export default HeroDemoCard;
