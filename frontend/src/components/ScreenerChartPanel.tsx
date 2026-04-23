import React, { useEffect, useState, useMemo } from 'react';
import {
  AreaChart, Area, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { intradayAPI } from '../services/api';

interface IntradaySnapshot {
  ticker: string;
  name: string | null;
  market_status: string | null;
  price: number | null;
  session: {
    open: number | null;
    high: number | null;
    low: number | null;
    close: number | null;
    volume: number | null;
    previous_close: number | null;
    change: number | null;
    change_percent: number | null;
  } | null;
}

interface BarData {
  timestamp: string;
  close: number | null;
  high: number | null;
  low: number | null;
  open: number | null;
  volume: number | null;
  ma_20?: number | null;
  ma_50?: number | null;
}

interface BarsResponse {
  ticker: string;
  bars: BarData[];
  data_date: string;
  is_today: boolean;
  market_status: string;
  moving_averages: { ma_20: number | null; ma_50: number | null };
  count: number;
  note?: string;
}

interface TrendLine { x1: number; y1: number; x2: number; y2: number }

export interface ScreenerChartPanelProps {
  ticker: string | null;
  onClose: () => void;
  /** 'panel' renders as a right-side drawer; 'modal' renders as a full overlay */
  displayMode?: 'panel' | 'modal';
}

// ─── helpers ────────────────────────────────────────────────────────────────

const fmt2 = (n: number | null | undefined) => (n == null ? 'N/A' : n.toFixed(2));

const fmtLg = (n: number | null | undefined) => {
  if (n == null) return 'N/A';
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(2)}K`;
  return n.toString();
};

const fmtTime = (ts: string) => {
  try { return new Date(ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }); }
  catch { return ts; }
};

const fmtDate = (d: string) => {
  try { return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return d; }
};

// ─── tooltip ────────────────────────────────────────────────────────────────

const ChartTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-3 text-xs">
      <p className="font-semibold text-gray-900 dark:text-white mb-1">{d.time}</p>
      <p className="text-gray-600 dark:text-gray-400">
        Price: <span className="font-semibold text-gray-900 dark:text-white">${fmt2(d.price)}</span>
      </p>
      <p className="text-gray-500 dark:text-gray-400">H: ${fmt2(d.high)} | L: ${fmt2(d.low)}</p>
      {d.volume && <p className="text-gray-500 dark:text-gray-400">Vol: {fmtLg(d.volume)}</p>}
      {d.ma_20 && <p style={{ color: 'rgb(234,179,8)' }}>20d MA: ${fmt2(d.ma_20)}</p>}
      {d.ma_50 && <p style={{ color: 'rgb(168,85,247)' }}>50d MA: ${fmt2(d.ma_50)}</p>}
    </div>
  );
};

// ─── component ──────────────────────────────────────────────────────────────

const ScreenerChartPanel: React.FC<ScreenerChartPanelProps> = ({
  ticker,
  onClose,
  displayMode = 'panel',
}) => {
  const [snapshot, setSnapshot] = useState<IntradaySnapshot | null>(null);
  const [barsData, setBarsData] = useState<BarsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drawingMode, setDrawingMode] = useState(false);
  const [trendLines, setTrendLines] = useState<TrendLine[]>([]);
  const [pendingPoint, setPendingPoint] = useState<{ x: number; y: number } | null>(null);

  // Initial load whenever ticker changes
  useEffect(() => {
    if (!ticker) return;
    setDrawingMode(false);
    setTrendLines([]);
    setPendingPoint(null);
    loadData(ticker);
  }, [ticker]); // eslint-disable-line react-hooks/exhaustive-deps

  // Live price polling — 5-second interval, snapshot endpoint only
  useEffect(() => {
    if (!ticker) return;
    const id = setInterval(async () => {
      try {
        const res = await intradayAPI.getSnapshot(ticker);
        setSnapshot(res.data);
      } catch {}
    }, 5000);
    return () => clearInterval(id);
  }, [ticker]);

  const loadData = async (t: string) => {
    setLoading(true);
    setError(null);
    try {
      const [snapRes, barsRes] = await Promise.all([
        intradayAPI.getSnapshot(t),
        intradayAPI.getBarsWithMA(t),
      ]);
      const snap: IntradaySnapshot = snapRes.data;
      const bars: BarsResponse = barsRes.data;
      // Fall back to last bar close if snapshot has no price
      if (!snap.price && bars.bars?.length) {
        snap.price = bars.bars[bars.bars.length - 1].close;
      }
      setSnapshot(snap);
      setBarsData(bars);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to load intraday data');
    } finally {
      setLoading(false);
    }
  };

  const chartData = useMemo(
    () =>
      barsData?.bars.map(b => ({
        time: fmtTime(b.timestamp),
        price: b.close,
        high: b.high,
        low: b.low,
        open: b.open,
        volume: b.volume,
        ma_20: b.ma_20,
        ma_50: b.ma_50,
      })) ?? [],
    [barsData],
  );

  const priceColor = () => {
    if (!snapshot?.session?.change) return '#3b82f6';
    return snapshot.session.change >= 0 ? '#10b981' : '#ef4444';
  };

  const changeColorCls = (v: number | null | undefined) =>
    v == null ? 'text-gray-400' : v >= 0 ? 'text-green-400' : 'text-red-400';

  // SVG overlay click handler for two-click trend line drawing
  const handleSvgClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!drawingMode) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    if (!pendingPoint) {
      setPendingPoint({ x, y });
    } else {
      setTrendLines(lines => [
        ...lines,
        { x1: pendingPoint.x, y1: pendingPoint.y, x2: x, y2: y },
      ]);
      setPendingPoint(null);
    }
  };

  const toggleDrawing = () => {
    setDrawingMode(m => !m);
    setPendingPoint(null);
  };

  if (!ticker) return null;

  const chartHeight = displayMode === 'modal' ? 320 : 220;

  // ─── shared inner content ───────────────────────────────────────────────
  const content = (
    <div className="flex flex-col h-full">

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700 shrink-0">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-base font-bold text-gray-900 dark:text-white truncate">
              {snapshot?.ticker ?? ticker}
            </span>
            {barsData && !barsData.is_today && (
              <span className="px-1.5 py-0.5 bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200 text-xs rounded shrink-0">
                {fmtDate(barsData.data_date)}
              </span>
            )}
          </div>
          {snapshot?.name && (
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{snapshot.name}</p>
          )}
        </div>
        <div className="flex items-center gap-3 shrink-0 ml-3">
          {snapshot?.price != null && (
            <div className="text-right">
              <div className="text-base font-bold text-gray-900 dark:text-white">
                ${fmt2(snapshot.price)}
              </div>
              {snapshot.session?.change_percent != null && (
                <div className={`text-xs font-semibold ${changeColorCls(snapshot.session.change_percent)}`}>
                  {snapshot.session.change_percent >= 0 ? '+' : ''}
                  {fmt2(snapshot.session.change_percent)}%
                </div>
              )}
            </div>
          )}
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="flex items-center justify-center h-40">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600" />
          </div>
        )}

        {error && !loading && (
          <div className="flex flex-col items-center justify-center h-40 gap-2">
            <p className="text-sm text-red-400">{error}</p>
            <button
              onClick={() => loadData(ticker)}
              className="text-sm text-teal-400 hover:text-teal-300"
            >
              Retry
            </button>
          </div>
        )}

        {!loading && !error && snapshot && (
          <div className="p-3 space-y-3">

            {/* Previous-day notice */}
            {barsData && !barsData.is_today && (
              <div className="flex items-center gap-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg px-3 py-2">
                <svg className="w-4 h-4 text-blue-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-xs text-blue-700 dark:text-blue-300">
                  Market closed — showing <strong>{fmtDate(barsData.data_date)}</strong>
                </p>
              </div>
            )}

            {/* Session stats */}
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-2">
                <div className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">Day Range</div>
                <div className="text-sm font-semibold text-gray-900 dark:text-white">
                  ${fmt2(snapshot.session?.low)} – ${fmt2(snapshot.session?.high)}
                </div>
              </div>
              <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-2">
                <div className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">Volume</div>
                <div className="text-sm font-semibold text-gray-900 dark:text-white">
                  {fmtLg(snapshot.session?.volume)}
                </div>
              </div>
              <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-2">
                <div className="text-xs mb-0.5" style={{ color: 'rgb(234,179,8)' }}>20d MA</div>
                <div className="text-sm font-semibold text-gray-900 dark:text-white">
                  {barsData?.moving_averages.ma_20 ? `$${fmt2(barsData.moving_averages.ma_20)}` : 'N/A'}
                </div>
              </div>
              <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-2">
                <div className="text-xs mb-0.5" style={{ color: 'rgb(168,85,247)' }}>50d MA</div>
                <div className="text-sm font-semibold text-gray-900 dark:text-white">
                  {barsData?.moving_averages.ma_50 ? `$${fmt2(barsData.moving_averages.ma_50)}` : 'N/A'}
                </div>
              </div>
            </div>

            {/* Chart + drawing overlay */}
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-2">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                  Intraday Chart
                </span>
                <span className="text-xs text-gray-400">
                  {barsData?.count ?? 0} bars · 15-min
                </span>
              </div>

              {chartData.length > 0 ? (
                <div className="relative">
                  <ResponsiveContainer width="100%" height={chartHeight}>
                    <AreaChart data={chartData}>
                      <defs>
                        <linearGradient id="scpPriceFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%"  stopColor="rgb(59,130,246)" stopOpacity={0.7} />
                          <stop offset="95%" stopColor="rgb(59,130,246)" stopOpacity={0.05} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.2} />
                      <XAxis
                        dataKey="time"
                        stroke="#9ca3af"
                        style={{ fontSize: '10px' }}
                        interval="preserveStartEnd"
                      />
                      <YAxis
                        stroke="#9ca3af"
                        domain={['auto', 'auto']}
                        style={{ fontSize: '10px' }}
                        tickFormatter={v => `$${v.toFixed(0)}`}
                        width={45}
                      />
                      <Tooltip content={<ChartTooltip />} />
                      <Legend wrapperStyle={{ fontSize: '11px' }} />
                      <Area
                        type="monotone"
                        dataKey="price"
                        stroke={priceColor()}
                        strokeWidth={2}
                        fill="url(#scpPriceFill)"
                        dot={false}
                        name="Price"
                        isAnimationActive={false}
                      />
                      {barsData?.moving_averages.ma_20 && (
                        <Line
                          type="monotone"
                          dataKey="ma_20"
                          stroke="rgb(234,179,8)"
                          strokeWidth={1.5}
                          dot={false}
                          name="20d MA"
                          connectNulls
                          isAnimationActive={false}
                        />
                      )}
                      {barsData?.moving_averages.ma_50 && (
                        <Line
                          type="monotone"
                          dataKey="ma_50"
                          stroke="rgb(168,85,247)"
                          strokeWidth={1.5}
                          dot={false}
                          name="50d MA"
                          connectNulls
                          isAnimationActive={false}
                        />
                      )}
                    </AreaChart>
                  </ResponsiveContainer>

                  {/* Transparent SVG overlay for trend line drawing */}
                  <svg
                    className="absolute inset-0 w-full"
                    style={{
                      height: chartHeight,
                      pointerEvents: drawingMode ? 'all' : 'none',
                      cursor: drawingMode ? 'crosshair' : 'default',
                    }}
                    viewBox="0 0 100 100"
                    preserveAspectRatio="none"
                    onClick={handleSvgClick}
                  >
                    {trendLines.map((l, i) => (
                      <line
                        key={i}
                        x1={l.x1} y1={l.y1}
                        x2={l.x2} y2={l.y2}
                        stroke="#f59e0b"
                        strokeWidth={2}
                        strokeLinecap="round"
                        vectorEffect="non-scaling-stroke"
                      />
                    ))}
                    {pendingPoint && (
                      <circle
                        cx={pendingPoint.x}
                        cy={pendingPoint.y}
                        r={1.5}
                        fill="#f59e0b"
                        vectorEffect="non-scaling-stroke"
                      />
                    )}
                  </svg>
                </div>
              ) : (
                <div
                  className="flex items-center justify-center text-gray-400 dark:text-gray-500 text-sm"
                  style={{ height: chartHeight }}
                >
                  No intraday data available
                </div>
              )}
            </div>

            {/* Drawing toolbar */}
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={toggleDrawing}
                className={`px-3 py-1.5 text-xs rounded-lg border font-medium transition-colors ${
                  drawingMode
                    ? 'bg-teal-600 border-teal-600 text-white'
                    : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:border-teal-500 hover:text-teal-600 dark:hover:text-teal-400'
                }`}
              >
                {drawingMode
                  ? pendingPoint
                    ? 'Click 2nd point…'
                    : 'Click 1st point…'
                  : 'Draw Trend Line'}
              </button>

              {trendLines.length > 0 && (
                <button
                  onClick={() => { setTrendLines([]); setPendingPoint(null); }}
                  className="px-3 py-1.5 text-xs rounded-lg border border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-red-500 hover:text-red-500 transition-colors"
                >
                  Clear Lines
                </button>
              )}

              {drawingMode && (
                <button
                  onClick={() => { setDrawingMode(false); setPendingPoint(null); }}
                  className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                >
                  Cancel
                </button>
              )}

              <div className="ml-auto flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-teal-500 animate-pulse inline-block" />
                <span className="text-xs text-gray-400">Live · 5s</span>
              </div>
            </div>

          </div>
        )}
      </div>
    </div>
  );

  // ─── modal wrapper (Watchlist / Portfolio) ───────────────────────────────
  if (displayMode === 'modal') {
    return (
      <div
        className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4"
        onClick={onClose}
      >
        <div
          className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl w-full max-w-4xl h-[85vh] flex flex-col overflow-hidden"
          onClick={e => e.stopPropagation()}
        >
          {content}
        </div>
      </div>
    );
  }

  // ─── panel wrapper (Screener) ────────────────────────────────────────────
  return (
    <div className="w-80 shrink-0 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 flex flex-col overflow-hidden">
      {content}
    </div>
  );
};

export default ScreenerChartPanel;
