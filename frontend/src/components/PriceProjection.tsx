/**
 * EXPERIMENTAL: price projection cone. This feature may be removed; the full
 * removal list is in backend/app/services/price_projection.py.
 *
 * Draws the trailing dividend-adjusted closes, then a fan of the 5th–95th and
 * 25th–75th percentile outcomes from a zero-drift random walk (10,000 simulated
 * paths), starting at the latest close. A range of outcomes, not a forecast.
 *
 * Loads only on an explicit click (one FMP call per ticker per hour, shared
 * through the backend cache). Stocks.tsx keys it by ticker so a new ticker
 * starts unloaded.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Filler,
  ChartData, ChartOptions, Plugin, TooltipItem,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { projectionAPI, PriceProjection as Projection } from '../services/api';
import { useTheme } from '../contexts/ThemeContext';
import { formatDateOnly, parseLocalDate } from '../utils/dates';
import { formatUsd } from '../utils/currency';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Filler);

// Trading days. The backend always returns 252; shorter views slice it.
const HORIZONS = [
  { label: '30D', days: 21, name: '1 month' },
  { label: '90D', days: 63, name: '3 months' },
  { label: '1Y', days: 252, name: '1 year' },
] as const;
type HorizonLabel = typeof HORIZONS[number]['label'];

// Dataset order matters: each band's lower edge fills back to the dataset
// before it (fill: '-1'), so p5 must follow p95 and p25 must follow p75.
const DS = { history: 0, p95: 1, p5: 2, p75: 3, p25: 4, p50: 5 } as const;

// Validated against the card surfaces (white / gray-700) with the dataviz
// palette checker: history keeps the Price History chart's blue, the projection
// is one teal hue stepped by opacity (outer band lightest). Dark mode needs
// more opacity for the outer band to read on gray-700.
const COLORS = {
  light: { history: '#3b82f6', fan: '13, 148, 136', grey: '107, 114, 128', outer: 0.14, inner: 0.3 },
  dark: { history: '#5092f7', fan: '20, 168, 153', grey: '156, 163, 175', outer: 0.22, inner: 0.4 },
};
const MUTED = 'rgb(156, 163, 175)';

const fmtPrice = (v: number | null | undefined): string =>
  v == null ? '—' : v !== 0 && Math.abs(v) < 1 ? `$${v.toFixed(4)}` : formatUsd(v, { compact: false });

// Marks the hand-off from history to projection, plus a hover rule that
// follows the tooltip. Reads everything from the chart, so one instance serves
// every render.
const projectionGuides: Plugin<'line'> = {
  id: 'projectionGuides',
  afterDatasetsDraw(chart) {
    const { ctx, chartArea } = chart;
    const xScale = chart.scales.x;
    const hist = chart.data.datasets[DS.history]?.data as (number | null)[] | undefined;
    if (!xScale || !hist) return;

    let last = -1;
    for (let i = hist.length - 1; i >= 0; i--) {
      if (hist[i] != null) { last = i; break; }
    }
    ctx.save();
    if (last >= 0) {
      const x = xScale.getPixelForValue(last);
      ctx.strokeStyle = 'rgba(156, 163, 175, 0.6)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(x, chartArea.top);
      ctx.lineTo(x, chartArea.bottom);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = MUTED;
      ctx.font = '11px sans-serif';
      ctx.textBaseline = 'top';
      ctx.textAlign = 'right';
      ctx.fillText('History', x - 6, chartArea.top + 4);
      ctx.textAlign = 'left';
      ctx.fillText('Projection', x + 6, chartArea.top + 4);
    }
    const active = chart.tooltip?.getActiveElements();
    if (active && active.length) {
      const x = active[0].element.x;
      ctx.strokeStyle = 'rgba(156, 163, 175, 0.35)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, chartArea.top);
      ctx.lineTo(x, chartArea.bottom);
      ctx.stroke();
    }
    ctx.restore();
  },
};

interface Props {
  ticker: string;
}

const PriceProjection: React.FC<Props> = ({ ticker }) => {
  const { theme } = useTheme();
  const [data, setData] = useState<Projection | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ message: string; retryable: boolean } | null>(null);
  const [horizon, setHorizon] = useState<HorizonLabel>('1Y');
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await projectionAPI.get(ticker);
      if (alive.current) setData(res.data);
    } catch (e) {
      const status = axios.isAxiosError(e) ? e.response?.status : undefined;
      const detail = axios.isAxiosError(e) ? e.response?.data?.detail : null;
      // 400/404/422 describe the ticker itself (e.g. too little history), so
      // asking again can't change the answer; offer a retry only for transient failures.
      const retryable = status === undefined || status >= 500 || status === 429;
      if (alive.current) {
        setError({
          message: typeof detail === 'string' ? detail : 'Could not load the projection. Please try again.',
          retryable,
        });
      }
    } finally {
      if (alive.current) setLoading(false);
    }
  };

  const days = HORIZONS.find(h => h.label === horizon)!.days;
  const low = data?.confidence === 'low';

  const chart = useMemo(() => {
    if (!data) return null;
    const c = COLORS[theme];
    const fan = low ? c.grey : c.fan;
    const rgba = (rgb: string, a: number) => `rgba(${rgb}, ${a})`;

    // Show at least 3 months of history, and twice the horizon up to a year.
    const hist = data.history.slice(-Math.min(data.history.length, Math.max(63, 2 * days)));
    const proj = data.points.slice(0, days);
    const lastIdx = hist.length - 1;
    const dates = [...hist.map(h => h.date), ...proj.map(p => p.date)];
    // Every band starts at the latest close, so the fan opens from the line.
    const band = (k: 'p5' | 'p25' | 'p50' | 'p75' | 'p95'): (number | null)[] => [
      ...Array(lastIdx).fill(null), data.last_price, ...proj.map(p => p[k]),
    ];
    const series = {
      history: [...hist.map(h => h.close), ...Array(proj.length).fill(null)] as (number | null)[],
      p5: band('p5'), p25: band('p25'), p50: band('p50'), p75: band('p75'), p95: band('p95'),
    };
    // A year either side of today needs the year on the axis ("Nov '25");
    // "Nov 25" would read as a day.
    const longSpan = dates.length > 300;
    const tickLabel = (iso: string | undefined) => {
      if (!iso) return '';
      const d = parseLocalDate(iso);
      return longSpan
        ? `${d.toLocaleDateString('en-US', { month: 'short' })} '${String(d.getFullYear()).slice(2)}`
        : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    };

    const edge = { borderColor: 'transparent', borderWidth: 0, pointRadius: 0, pointHoverRadius: 0, tension: 0 };
    const chartData: ChartData<'line', (number | null)[], string> = {
      labels: dates,
      datasets: [
        { label: 'Dividend-adjusted close', data: series.history, borderColor: c.history, borderWidth: 2,
          pointRadius: 0, pointHoverRadius: 3, tension: 0, fill: false },
        { label: '95th percentile', data: series.p95, ...edge, fill: false },
        { label: '5th percentile', data: series.p5, ...edge, fill: '-1', backgroundColor: rgba(fan, c.outer) },
        { label: '75th percentile', data: series.p75, ...edge, fill: false },
        { label: '25th percentile', data: series.p25, ...edge, fill: '-1', backgroundColor: rgba(fan, c.inner) },
        { label: 'Median', data: series.p50, borderColor: rgba(fan, 1), borderWidth: 2, borderDash: [5, 4],
          pointRadius: 0, pointHoverRadius: 3, tension: 0, fill: false },
      ],
    };

    const shown: Record<number, number> = { [DS.history]: 0, [DS.p50]: 1, [DS.p75]: 2, [DS.p95]: 3 };
    const swatch: Record<number, string> = {
      [DS.history]: c.history, [DS.p50]: rgba(fan, 1),
      [DS.p75]: rgba(fan, c.inner + c.outer), [DS.p95]: rgba(fan, c.outer + 0.06),
    };
    const options: ChartOptions<'line'> = {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          // One row per meaning: the band edges collapse into range rows, and
          // the anchor point (every band equal to the close) shows only the close.
          filter: (item: TooltipItem<'line'>) =>
            item.datasetIndex in shown && (item.dataIndex !== lastIdx || item.datasetIndex === DS.history),
          itemSort: (a, b) => shown[a.datasetIndex] - shown[b.datasetIndex],
          callbacks: {
            title: items => (items.length ? formatDateOnly(dates[items[0].dataIndex]) : ''),
            label: item => {
              const i = item.dataIndex;
              switch (item.datasetIndex) {
                case DS.history: return `Adj. close: ${fmtPrice(series.history[i])}`;
                case DS.p50: return `Median: ${fmtPrice(series.p50[i])}`;
                case DS.p75: return `50% range: ${fmtPrice(series.p25[i])} – ${fmtPrice(series.p75[i])}`;
                case DS.p95: return `90% range: ${fmtPrice(series.p5[i])} – ${fmtPrice(series.p95[i])}`;
                default: return '';
              }
            },
            labelColor: item => ({
              borderColor: swatch[item.datasetIndex], backgroundColor: swatch[item.datasetIndex],
              borderWidth: 0, borderRadius: 2,
            }),
          },
        },
      },
      scales: {
        y: {
          ticks: { color: MUTED, callback: v => fmtPrice(Number(v)) },
          grid: { color: 'rgba(156, 163, 175, 0.1)' },
        },
        x: {
          grid: { display: false },
          ticks: { color: MUTED, maxRotation: 0, autoSkip: true, maxTicksLimit: 8,
                   callback: v => tickLabel(dates[Number(v)]) },
        },
      },
    };
    return { chartData, options };
  }, [data, days, theme, low]);

  const palette = COLORS[theme];
  const fan = low ? palette.grey : palette.fan;
  const swatchStyle = (a: number) => ({ backgroundColor: `rgba(${fan}, ${a})` });

  return (
    <div className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 p-6 border dark:border-gray-500">
      <div className="flex flex-wrap justify-between items-center gap-3 mb-2">
        <div className="flex items-center gap-2">
          <h3 className="text-xl font-bold text-gray-900 dark:text-white">Price Projection</h3>
          <span
            className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-600 text-gray-700 dark:text-gray-200 border border-gray-300 dark:border-gray-500"
            title="This feature is being trialled and may be removed."
          >
            Experimental
          </span>
        </div>
        {data && (
          <div className="flex gap-2">
            {HORIZONS.map(h => (
              <button
                key={h.label}
                onClick={() => setHorizon(h.label)}
                className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                  horizon === h.label
                    ? 'bg-primary-600 dark:bg-primary-500 text-white'
                    : 'bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-500'
                }`}
              >
                {h.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {!data && (
        <div className="py-4">
          <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">
            A range of possible prices over the next year, simulated from {ticker}'s own volatility.
            It shows how wide outcomes could plausibly be. It is not a prediction of where the price will go.
          </p>
          {error && <p className="text-sm text-red-600 dark:text-red-400 mb-3">{error.message}</p>}
          {(!error || error.retryable) && (
            <button
              onClick={load}
              disabled={loading}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-primary-600 dark:bg-primary-500 text-white hover:bg-primary-700 dark:hover:bg-primary-600 disabled:opacity-60 transition-colors"
            >
              {loading ? 'Simulating…' : error ? 'Try again' : 'Show projection'}
            </button>
          )}
        </div>
      )}

      {data && chart && (
        <>
          {data.confidence !== 'normal' && (
            <div className={`flex gap-2 rounded-lg border p-3 mb-3 text-sm ${
              low
                ? 'border-red-300 dark:border-red-500/50 bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200'
                : 'border-amber-300 dark:border-amber-500/50 bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-200'
            }`}>
              <svg className="w-4 h-4 mt-0.5 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <div>
                <div className="font-semibold">{low ? 'Low confidence: shown greyed out' : 'Reduced confidence'}</div>
                {data.confidence_notes.map(n => <div key={n}>{n}</div>)}
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-x-4 gap-y-1 mb-2 text-xs text-gray-600 dark:text-gray-300">
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-5 h-0.5" style={{ backgroundColor: palette.history }} />
              Dividend-adjusted close
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-5 border-t-2 border-dashed" style={{ borderColor: `rgb(${fan})` }} />
              Median
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 rounded-sm" style={swatchStyle(palette.inner + palette.outer)} />
              Middle 50% of outcomes
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 rounded-sm" style={swatchStyle(palette.outer + 0.06)} />
              90% of outcomes
            </span>
          </div>

          <div style={{ height: '360px', position: 'relative' }}>
            <Line data={chart.chartData} options={chart.options} plugins={[projectionGuides]} />
          </div>

          <div className="mt-4 overflow-x-auto max-w-3xl">
            <table className="w-full text-xs sm:text-sm whitespace-nowrap">
              <caption className="text-left text-xs text-gray-500 dark:text-gray-400 mb-1">
                Simulated price percentiles from {fmtPrice(data.last_price)}
              </caption>
              <thead>
                <tr className="text-xs text-gray-500 dark:text-gray-400">
                  <th className="text-left font-medium py-1 pr-2">Horizon</th>
                  <th className="text-right font-medium py-1 px-1 sm:px-2">5th</th>
                  <th className="text-right font-medium py-1 px-1 sm:px-2">25th</th>
                  <th className="text-right font-medium py-1 px-1 sm:px-2">Median</th>
                  <th className="text-right font-medium py-1 px-1 sm:px-2">75th</th>
                  <th className="text-right font-medium py-1 pl-1 sm:pl-2">95th</th>
                </tr>
              </thead>
              <tbody>
                {HORIZONS.map(h => {
                  const p = data.points[h.days - 1];
                  if (!p) return null;
                  return (
                    <tr key={h.label} className={`border-t border-gray-200 dark:border-gray-600 ${
                      h.label === horizon ? 'font-semibold' : ''} text-gray-900 dark:text-white`}>
                      <td className="py-1 pr-2">{h.name}</td>
                      <td className="text-right py-1 px-1 sm:px-2 tabular-nums">{fmtPrice(p.p5)}</td>
                      <td className="text-right py-1 px-1 sm:px-2 tabular-nums">{fmtPrice(p.p25)}</td>
                      <td className="text-right py-1 px-1 sm:px-2 tabular-nums">{fmtPrice(p.p50)}</td>
                      <td className="text-right py-1 px-1 sm:px-2 tabular-nums">{fmtPrice(p.p75)}</td>
                      <td className="text-right py-1 pl-1 sm:pl-2 tabular-nums">{fmtPrice(p.p95)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-3 space-y-1 text-xs text-gray-500 dark:text-gray-400">
            <p>
              {data.n_paths.toLocaleString()} simulated paths of a random walk (geometric Brownian motion).
              Volatility {(data.sigma_annual * 100).toFixed(1)}% a year, from {data.observations} {data.returns_used} returns.
              Drift: zero, so the median stays near today's price.
              Prices are dividend-adjusted, as of {formatDateOnly(data.as_of)}.
            </p>
            <p className="font-medium text-gray-600 dark:text-gray-300">
              This is a range of outcomes under a random-walk model, not a forecast. It assumes volatility stays
              at its recent level, and it understates the chance of extreme moves such as earnings surprises,
              takeovers and crashes.
            </p>
          </div>
        </>
      )}
    </div>
  );
};

export default PriceProjection;
