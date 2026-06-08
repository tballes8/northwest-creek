import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import {
  AreaChart, Area, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, Customized,
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

interface DrawPoint { time: string; price: number }
interface TrendLine { p1: DrawPoint; p2: DrawPoint }
interface Channel { p1: DrawPoint; p2: DrawPoint; yOffsetPrice: number }
interface Fibonacci { p1: DrawPoint; p2: DrawPoint }

interface ChartPoint {
  time: string;
  price: number | null;
  high: number | null;
  low: number | null;
  open: number | null;
  volume: number | null;
  ma_20?: number | null;
  ma_50?: number | null;
  isLive?: boolean;
}

export interface ScreenerChartPanelProps {
  ticker: string | null;
  onClose: () => void;
  /** 'panel' = floating popup over the page; 'modal' = full centered overlay */
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

const fmtNow = () =>
  new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

const fmtDate = (d: string) => {
  try { return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return d; }
};

// Recharts <Customized> child: reports the computed plot-area `offset` (px) up to
// the parent so the drawing overlay can be pinned to the real plot rectangle.
// Cloned by Recharts with the chart's internal props (incl. `offset`).
const CaptureOffset: React.FC<any> = ({ offset, onRect }) => {
  const prev = useRef('');
  useEffect(() => {
    if (!offset || !onRect) return;
    const key = `${offset.left}|${offset.top}|${offset.width}|${offset.height}`;
    if (key !== prev.current) {
      prev.current = key;
      onRect({ left: offset.left, top: offset.top, width: offset.width, height: offset.height });
    }
  });
  return null;
};

// ─── component ──────────────────────────────────────────────────────────────

const ScreenerChartPanel: React.FC<ScreenerChartPanelProps> = ({
  ticker,
  onClose,
  displayMode = 'panel',
}) => {
  const [snapshot, setSnapshot] = useState<IntradaySnapshot | null>(null);
  const [barsData, setBarsData] = useState<BarsResponse | null>(null);
  const [liveTicks, setLiveTicks] = useState<ChartPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTool, setActiveTool] = useState<'trend' | 'channel' | 'fib' | null>(null);
  const activeToolRef = useRef<'trend' | 'channel' | 'fib' | null>(null);
  const drawingMode = activeTool !== null;
  const [trendLines, setTrendLines] = useState<TrendLine[]>([]);
  const [pendingPoint, setPendingPoint] = useState<DrawPoint | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [pendingChannel, setPendingChannel] = useState<{ p1: DrawPoint; p2: DrawPoint | null } | null>(null);
  const [fibonaccis, setFibonaccis] = useState<Fibonacci[]>([]);
  const [pendingFib, setPendingFib] = useState<DrawPoint | null>(null);
  const [svgMousePos, setSvgMousePos] = useState<{ x: number; y: number } | null>(null);

  // Zoom + pan state
  const [zoomRange, setZoomRange] = useState<{ start: number; end: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const zoomRangeRef = useRef<{ start: number; end: number } | null>(null);
  const displayDataLenRef = useRef<number>(0);
  const wheelCleanupRef = useRef<(() => void) | null>(null);
  const chartWrapperElRef = useRef<HTMLDivElement | null>(null);
  const dragStartXRef = useRef(0);
  const dragStartRangeRef = useRef<{ start: number; end: number }>({ start: 0, end: 0 });

  // Tooltip hover-delay state
  const [showTooltip, setShowTooltip] = useState(false);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastHoveredIndexRef = useRef<number | null>(null);

  // Initial data load when ticker changes
  useEffect(() => {
    if (!ticker) return;
    setActiveTool(null);
    setTrendLines([]);
    setChannels([]);
    setFibonaccis([]);
    setPendingPoint(null);
    setPendingChannel(null);
    setPendingFib(null);
    setLiveTicks([]);
    setZoomRange(null);
    setShowTooltip(false);
    lastHoveredIndexRef.current = null;
    loadData(ticker);
  }, [ticker]); // eslint-disable-line react-hooks/exhaustive-deps

  // 5-second live price polling — stops automatically when market is closed
  useEffect(() => {
    if (!ticker) return;
    let intervalId: ReturnType<typeof setInterval>;
    intervalId = setInterval(async () => {
      try {
        const res = await intradayAPI.getSnapshot(ticker);
        const snap: IntradaySnapshot = res.data;
        setSnapshot(snap);
        if (snap.market_status === 'closed') {
          clearInterval(intervalId);
          return;
        }
        if (snap.price != null) {
          setLiveTicks(prev => [
            ...prev.slice(-180),
            {
              time: fmtNow(),
              price: snap.price,
              high: null, low: null, open: null, volume: null,
              ma_20: null, ma_50: null,
              isLive: true,
            },
          ]);
        }
      } catch {}
    }, 5000);
    return () => clearInterval(intervalId);
  }, [ticker]);

  // Cleanup hover timer on unmount
  useEffect(() => () => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
  }, []);

  // Keep refs in sync
  useEffect(() => { zoomRangeRef.current = zoomRange; }, [zoomRange]);
  useEffect(() => { activeToolRef.current = activeTool; }, [activeTool]);

  // Callback ref — wheel only (drag uses React onMouseDown so it wins over Recharts)
  const chartWrapperCallbackRef = useCallback((el: HTMLDivElement | null) => {
    if (wheelCleanupRef.current) { wheelCleanupRef.current(); wheelCleanupRef.current = null; }
    chartWrapperElRef.current = el;
    if (!el) return;
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const total = displayDataLenRef.current;
      if (total < 2) return;
      const curr = zoomRangeRef.current ?? { start: 0, end: total - 1 };
      const span = curr.end - curr.start;
      const step = Math.max(5, Math.floor(span * 0.1));
      if (e.deltaY < 0) {
        const newStart = curr.start + step;
        if (curr.end - newStart >= 10) setZoomRange({ start: newStart, end: curr.end });
      } else {
        const newStart = Math.max(0, curr.start - step);
        setZoomRange(newStart === 0 && curr.end === total - 1 ? null : { start: newStart, end: curr.end });
      }
    };
    el.addEventListener('wheel', handleWheel, { passive: false });
    wheelCleanupRef.current = () => el.removeEventListener('wheel', handleWheel);
  }, []);

  // React drag handler — fires before Recharts synthetic events, cursor stays in sync via state
  const handleDragStart = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0 || !zoomRangeRef.current || activeToolRef.current) return;
    e.preventDefault();
    dragStartXRef.current = e.clientX;
    dragStartRangeRef.current = { ...zoomRangeRef.current };
    setIsDragging(true);
  }, []);

  // Register mousemove + mouseup on document only while dragging
  useEffect(() => {
    if (!isDragging) return;
    const handleMouseMove = (e: MouseEvent) => {
      const total = displayDataLenRef.current;
      const el = chartWrapperElRef.current;
      if (total < 2 || !el) return;
      const rect = el.getBoundingClientRect();
      const curr = dragStartRangeRef.current;
      const span = curr.end - curr.start;
      const barsPerPixel = span / rect.width;
      const barDelta = -Math.round((e.clientX - dragStartXRef.current) * barsPerPixel);
      let newStart = curr.start + barDelta;
      let newEnd = curr.end + barDelta;
      if (newStart < 0) { newEnd -= newStart; newStart = 0; }
      if (newEnd >= total) { newStart -= (newEnd - (total - 1)); newEnd = total - 1; }
      setZoomRange({ start: Math.max(0, newStart), end: newEnd });
    };
    const handleMouseUp = () => setIsDragging(false);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

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

  // 15-min historical bars
  const barChartData = useMemo<ChartPoint[]>(
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
        isLive: false,
      })) ?? [],
    [barsData],
  );

  // Full display data = historical bars + live 5s ticks appended
  const displayChartData = useMemo<ChartPoint[]>(
    () => [...barChartData, ...liveTicks],
    [barChartData, liveTicks],
  );
  // Keep displayDataLenRef in sync — must be after displayChartData declaration
  useEffect(() => { displayDataLenRef.current = displayChartData.length; }, [displayChartData.length]);

  // Sliced to zoom window when active
  const visibleChartData = useMemo<ChartPoint[]>(
    () => zoomRange
      ? displayChartData.slice(zoomRange.start, zoomRange.end + 1)
      : displayChartData,
    [displayChartData, zoomRange],
  );

  // Recharts' actual plot rectangle (px, relative to the chart wrapper), captured
  // via <Customized> below. The drawing overlay is pinned to this rect so its
  // 0–100% coordinate space matches the rendered price axis exactly — Recharts
  // insets the plot area for the X-axis + legend, so covering the full container
  // would push every fib/trend line below its true price.
  const [plotRect, setPlotRect] = useState<{ left: number; top: number; width: number; height: number } | null>(null);

  // ─── Coordinate helpers (data ↔ SVG-%) ────────────────────────────────────
  // yDomain mirrors what Recharts renders so our SVG overlay stays in sync.
  const yDomain = useMemo<[number, number]>(() => {
    const vals: number[] = [];
    for (const d of visibleChartData) {
      for (const v of [d.price, d.high, d.low]) {
        if (v != null && Number.isFinite(v)) vals.push(v as number);
      }
    }
    if (!vals.length) return [0, 1];
    const lo = Math.min(...vals);
    const hi = Math.max(...vals);
    const pad = (hi - lo) * 0.05 || 0.5;
    return [lo - pad, hi + pad];
  }, [visibleChartData]);

  const priceToSvgY = useCallback(
    (price: number) => ((yDomain[1] - price) / (yDomain[1] - yDomain[0])) * 100,
    [yDomain],
  );
  const svgYToPrice = useCallback(
    (svgY: number) => yDomain[1] - (svgY / 100) * (yDomain[1] - yDomain[0]),
    [yDomain],
  );

  const timeToIdx = useCallback(
    (time: string) => visibleChartData.findIndex(d => d.time === time),
    [visibleChartData],
  );
  const idxToSvgX = useCallback(
    (idx: number) =>
      visibleChartData.length <= 1 ? 0 : (idx / (visibleChartData.length - 1)) * 100,
    [visibleChartData.length],
  );
  const svgXToNearestTime = useCallback(
    (svgX: number): string | null => {
      if (!visibleChartData.length) return null;
      const raw = Math.round((svgX / 100) * (visibleChartData.length - 1));
      const i = Math.max(0, Math.min(visibleChartData.length - 1, raw));
      return visibleChartData[i].time;
    },
    [visibleChartData],
  );
  const toSvgPoint = useCallback(
    (p: DrawPoint): { x: number; y: number } | null => {
      const i = timeToIdx(p.time);
      if (i < 0) return null;
      return { x: idxToSvgX(i), y: priceToSvgY(p.price) };
    },
    [timeToIdx, idxToSvgX, priceToSvgY],
  );

  const priceColor = () => {
    if (!snapshot?.session?.change) return '#3b82f6';
    return snapshot.session.change >= 0 ? '#10b981' : '#ef4444';
  };

  const changeColorCls = (v: number | null | undefined) =>
    v == null ? 'text-gray-400' : v >= 0 ? 'text-green-400' : 'text-red-400';

  // ─── 3-second hover delay for tooltip ─────────────────────────────────────

  const handleChartMouseMove = useCallback((state: any) => {
    if (!state?.isTooltipActive) {
      if (hoverTimerRef.current) { clearTimeout(hoverTimerRef.current); hoverTimerRef.current = null; }
      setShowTooltip(false);
      lastHoveredIndexRef.current = null;
      return;
    }
    const idx = state.activeTooltipIndex;
    if (idx !== lastHoveredIndexRef.current) {
      lastHoveredIndexRef.current = idx;
      setShowTooltip(false);
      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = setTimeout(() => setShowTooltip(true), 3000);
    }
  }, []);

  const handleChartMouseLeave = useCallback(() => {
    if (hoverTimerRef.current) { clearTimeout(hoverTimerRef.current); hoverTimerRef.current = null; }
    setShowTooltip(false);
    lastHoveredIndexRef.current = null;
  }, []);

  // Inline tooltip — closure over showTooltip so it reacts to the delay
  const ChartTooltip = ({ active, payload }: any) => {
    if (!showTooltip || !active || !payload?.length) return null;
    const d = payload[0].payload as ChartPoint;
    return (
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-3 text-xs">
        <p className="font-semibold text-gray-900 dark:text-white mb-1">{d.time}</p>
        <p className="text-gray-600 dark:text-gray-400">
          Price: <span className="font-semibold text-gray-900 dark:text-white">${fmt2(d.price)}</span>
          {d.isLive && <span className="ml-1 text-teal-400">● live</span>}
        </p>
        {d.high != null && <p className="text-gray-500 dark:text-gray-400">H: ${fmt2(d.high)} | L: ${fmt2(d.low)}</p>}
        {d.volume != null && <p className="text-gray-500 dark:text-gray-400">Vol: {fmtLg(d.volume)}</p>}
      </div>
    );
  };

  // ─── SVG drawing overlay ───────────────────────────────────────────────────

  const handleSvgClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!activeTool) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;

    const time = svgXToNearestTime(x);
    if (time == null) return;
    const pt: DrawPoint = { time, price: svgYToPrice(y) };

    if (activeTool === 'trend') {
      if (!pendingPoint) {
        setPendingPoint(pt);
      } else {
        setTrendLines(lines => [...lines, { p1: pendingPoint, p2: pt }]);
        setPendingPoint(null);
      }
    } else if (activeTool === 'channel') {
      if (!pendingChannel) {
        setPendingChannel({ p1: pt, p2: null });
      } else if (pendingChannel.p2 === null) {
        setPendingChannel(c => (c ? { ...c, p2: pt } : null));
      } else {
        const { p1, p2 } = pendingChannel as { p1: DrawPoint; p2: DrawPoint };
        const i1 = timeToIdx(p1.time);
        const i2 = timeToIdx(p2.time);
        const iC = timeToIdx(pt.time);
        const slope = i2 !== i1 ? (p2.price - p1.price) / (i2 - i1) : 0;
        const onLine = p1.price + slope * (iC - i1);
        const yOffsetPrice = pt.price - onLine;
        setChannels(ch => [...ch, { p1, p2, yOffsetPrice }]);
        setPendingChannel(null);
      }
    } else if (activeTool === 'fib') {
      if (!pendingFib) {
        setPendingFib(pt);
      } else {
        setFibonaccis(fs => [...fs, { p1: pt, p2: pendingFib }]);
        setPendingFib(null);
      }
    }
  };

  const handleSvgMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!drawingMode) return;
    const rect = e.currentTarget.getBoundingClientRect();
    setSvgMousePos({
      x: ((e.clientX - rect.left) / rect.width) * 100,
      y: ((e.clientY - rect.top) / rect.height) * 100,
    });
  };

  const startTool = (tool: 'trend' | 'channel' | 'fib') => {
    setActiveTool(t => t === tool ? null : tool);
    setPendingPoint(null);
    setPendingChannel(null);
    setPendingFib(null);
  };

  if (!ticker) return null;

  const chartHeight = displayMode === 'modal' ? 360 : 240;

  // Custom dot: show a small dot only on live ticks, hidden on 15-min bars
  const renderDot = (props: any) => {
    if (!props.payload?.isLive) return <g key={props.key} />;
    return (
      <circle
        key={props.key}
        cx={props.cx}
        cy={props.cy}
        r={3}
        fill={priceColor()}
        stroke="#1f2937"
        strokeWidth={1}
      />
    );
  };

  // ─── shared chart content ──────────────────────────────────────────────────

  const content = (
    <div className="flex flex-col h-full">

      {/* Header */}
      <div className="flex items-center px-4 py-3 border-b border-gray-200 dark:border-gray-700 shrink-0 gap-3">
        {/* Left: ticker + company name */}
        <div className="flex-1 min-w-0">
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

        {/* Center: drawing tools */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => startTool('trend')}
            className={`px-3 py-1.5 text-xs rounded-lg border font-medium transition-colors ${
              activeTool === 'trend'
                ? 'bg-teal-600 border-teal-600 text-white'
                : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:border-teal-500 hover:text-teal-600 dark:hover:text-teal-400'
            }`}
          >
            {activeTool === 'trend'
              ? (pendingPoint ? 'Click 2nd point…' : 'Click 1st point…')
              : 'Trend Line'}
          </button>
          <button
            onClick={() => startTool('channel')}
            className={`px-3 py-1.5 text-xs rounded-lg border font-medium transition-colors ${
              activeTool === 'channel'
                ? 'bg-blue-600 border-blue-600 text-white'
                : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:border-blue-500 hover:text-blue-600 dark:hover:text-blue-400'
            }`}
          >
            {activeTool === 'channel'
              ? (!pendingChannel ? 'Click start…'
                : pendingChannel.p2 === null ? 'Click end of line…'
                : 'Click to set width…')
              : 'Channel'}
          </button>
          <button
            onClick={() => startTool('fib')}
            className={`px-3 py-1.5 text-xs rounded-lg border font-medium transition-colors ${
              activeTool === 'fib'
                ? 'bg-violet-600 border-violet-600 text-white'
                : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:border-violet-500 hover:text-violet-600 dark:hover:text-violet-400'
            }`}
          >
            {activeTool === 'fib'
              ? (pendingFib == null ? 'Click start of move…' : 'Click end / 0%…')
              : 'Fibonacci'}
          </button>
          {(trendLines.length > 0 || channels.length > 0 || fibonaccis.length > 0) && (
            <button
              onClick={() => {
                setTrendLines([]); setChannels([]); setFibonaccis([]);
                setPendingPoint(null); setPendingChannel(null); setPendingFib(null);
              }}
              className="px-3 py-1.5 text-xs rounded-lg border border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-red-500 hover:text-red-500 transition-colors"
            >
              Clear All
            </button>
          )}
          {drawingMode && (
            <button
              onClick={() => {
                setActiveTool(null);
                setPendingPoint(null); setPendingChannel(null); setPendingFib(null);
              }}
              className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            >
              Cancel
            </button>
          )}
        </div>

        {/* Right: price + close */}
        <div className="flex items-center gap-3 flex-1 justify-end shrink-0">
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
            <button onClick={() => loadData(ticker)} className="text-sm text-teal-400 hover:text-teal-300">
              Retry
            </button>
          </div>
        )}

        {!loading && !error && snapshot && (
          <div className="p-3 space-y-3">

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
            </div>

            {/* Chart */}
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-2">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">Intraday Chart</span>
                <span className="text-xs text-gray-400">
                  {zoomRange
                    ? `${zoomRange.end - zoomRange.start + 1} / ${displayChartData.length} bars`
                    : `${barsData?.count ?? 0} bars`} · 1-min
                  {!zoomRange && liveTicks.length > 0 && (
                    <span className="text-teal-400"> + {liveTicks.length} live</span>
                  )}
                </span>
              </div>

              {visibleChartData.length > 0 ? (
                <div
                  className="relative select-none"
                  ref={chartWrapperCallbackRef}
                  onMouseDown={handleDragStart}
                  style={{ cursor: zoomRange ? (isDragging ? 'grabbing' : 'grab') : 'default' }}
                >
                  <ResponsiveContainer width="100%" height={chartHeight}>
                    <AreaChart
                      data={visibleChartData}
                      onMouseMove={handleChartMouseMove}
                      onMouseLeave={handleChartMouseLeave}
                    >
                      <defs>
                        <linearGradient id="scpPriceFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%"  stopColor="rgb(59,130,246)" stopOpacity={0.6} />
                          <stop offset="95%" stopColor="rgb(59,130,246)" stopOpacity={0.03} />
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
                        orientation="right"
                        stroke="#9ca3af"
                        domain={yDomain}
                        style={{ fontSize: '10px' }}
                        tickFormatter={v => `$${v < 10 ? v.toFixed(2) : v < 100 ? v.toFixed(1) : v.toFixed(0)}`}
                        width={55}
                      />
                      {/* Report the real plot rect so the drawing overlay aligns with the axis */}
                      <Customized component={<CaptureOffset onRect={setPlotRect} />} />
                      {/* 3-second delay tooltip */}
                      <Tooltip content={<ChartTooltip />} />
                      <Legend wrapperStyle={{ fontSize: '11px' }} />

                      {/* Price area — dots rendered only on live ticks */}
                      <Area
                        type="monotone"
                        dataKey="price"
                        stroke={priceColor()}
                        strokeWidth={2}
                        fill="url(#scpPriceFill)"
                        dot={renderDot}
                        activeDot={{ r: 5, strokeWidth: 0 }}
                        name="Price"
                        isAnimationActive={false}
                      />
                    </AreaChart>
                  </ResponsiveContainer>

                  {/* SVG drawing overlay — pinned to Recharts' real plot rect so 0–100%
                      maps to the rendered price axis (falls back to full container pre-capture) */}
                  <svg
                    className="absolute"
                    style={{
                      left: plotRect ? plotRect.left : 0,
                      top: plotRect ? plotRect.top : 0,
                      width: plotRect ? plotRect.width : '100%',
                      height: plotRect ? plotRect.height : chartHeight,
                      pointerEvents: drawingMode ? 'all' : 'none',
                      cursor: drawingMode ? 'crosshair' : 'inherit',
                    }}
                    viewBox="0 0 100 100"
                    preserveAspectRatio="none"
                    onClick={handleSvgClick}
                    onMouseMove={handleSvgMouseMove}
                    onMouseLeave={() => setSvgMousePos(null)}
                  >
                    {/* Completed trend lines */}
                    {trendLines.map((l, i) => {
                      const a = toSvgPoint(l.p1);
                      const b = toSvgPoint(l.p2);
                      if (!a || !b) return null;
                      return (
                        <line key={`tl-${i}`}
                          x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                          stroke="#f59e0b" strokeWidth={2} strokeLinecap="round"
                          vectorEffect="non-scaling-stroke"
                        />
                      );
                    })}

                    {/* Completed channels */}
                    {channels.map((ch, i) => {
                      const a = toSvgPoint(ch.p1);
                      const b = toSvgPoint(ch.p2);
                      if (!a || !b) return null;
                      const aOff = { x: a.x, y: priceToSvgY(ch.p1.price + ch.yOffsetPrice) };
                      const bOff = { x: b.x, y: priceToSvgY(ch.p2.price + ch.yOffsetPrice) };
                      return (
                        <g key={`ch-${i}`}>
                          <polygon
                            points={`${a.x},${a.y} ${b.x},${b.y} ${bOff.x},${bOff.y} ${aOff.x},${aOff.y}`}
                            fill="rgba(59,130,246,0.12)" stroke="none"
                          />
                          <line x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                            stroke="#3b82f6" strokeWidth={1.5} strokeLinecap="round"
                            vectorEffect="non-scaling-stroke"
                          />
                          <line x1={aOff.x} y1={aOff.y} x2={bOff.x} y2={bOff.y}
                            stroke="#3b82f6" strokeWidth={1.5} strokeLinecap="round"
                            vectorEffect="non-scaling-stroke"
                          />
                        </g>
                      );
                    })}

                    {/* Completed fibonacci levels (lines only — labels rendered as HTML below) */}
                    {fibonaccis.map((fib, i) => {
                      const range = fib.p2.price - fib.p1.price;
                      const levels = [
                        ...[0, 0.236, 0.382, 0.5, 0.618, 0.786, 1.0].map(r => ({ r, dashed: false })),
                        ...[1.272, 1.618, 2.618].map(r => ({ r, dashed: true })),
                      ];
                      return (
                        <g key={`fib-${i}`}>
                          {levels.map(({ r, dashed }) => {
                            const price = fib.p1.price + range * r;
                            const yPct = priceToSvgY(price);
                            if (yPct < -2 || yPct > 102) return null;
                            return (
                              <line key={r}
                                x1={0} y1={yPct} x2={100} y2={yPct}
                                stroke="#ffffff" strokeWidth={1}
                                strokeDasharray={dashed ? '2 1.5' : undefined}
                                vectorEffect="non-scaling-stroke" opacity={0.9}
                              />
                            );
                          })}
                        </g>
                      );
                    })}

                    {/* Trend line pending first point */}
                    {activeTool === 'trend' && pendingPoint && (() => {
                      const a = toSvgPoint(pendingPoint);
                      if (!a) return null;
                      return (
                        <circle cx={a.x} cy={a.y} r={1.5}
                          fill="#f59e0b" vectorEffect="non-scaling-stroke"
                        />
                      );
                    })()}
                    {/* Trend line preview */}
                    {activeTool === 'trend' && pendingPoint && svgMousePos && (() => {
                      const a = toSvgPoint(pendingPoint);
                      if (!a) return null;
                      return (
                        <line x1={a.x} y1={a.y}
                          x2={svgMousePos.x} y2={svgMousePos.y}
                          stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="4 3"
                          vectorEffect="non-scaling-stroke"
                        />
                      );
                    })()}

                    {/* Channel: step 1→2 — drawing main line */}
                    {activeTool === 'channel' && pendingChannel && pendingChannel.p2 === null && svgMousePos && (() => {
                      const a = toSvgPoint(pendingChannel.p1);
                      if (!a) return null;
                      return (
                        <>
                          <circle cx={a.x} cy={a.y} r={1.5}
                            fill="#3b82f6" vectorEffect="non-scaling-stroke"
                          />
                          <line x1={a.x} y1={a.y}
                            x2={svgMousePos.x} y2={svgMousePos.y}
                            stroke="#3b82f6" strokeWidth={1.5} strokeDasharray="4 3"
                            vectorEffect="non-scaling-stroke"
                          />
                        </>
                      );
                    })()}
                    {/* Channel: step 2→3 — main line set, previewing parallel */}
                    {activeTool === 'channel' && pendingChannel && pendingChannel.p2 !== null && svgMousePos && (() => {
                      const a = toSvgPoint(pendingChannel.p1);
                      const b = toSvgPoint(pendingChannel.p2);
                      if (!a || !b) return null;
                      const yOff = svgMousePos.y - a.y;
                      return (
                        <>
                          <polygon
                            points={`${a.x},${a.y} ${b.x},${b.y} ${b.x},${b.y + yOff} ${a.x},${a.y + yOff}`}
                            fill="rgba(59,130,246,0.12)" stroke="none"
                          />
                          <line x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                            stroke="#3b82f6" strokeWidth={1.5} strokeLinecap="round"
                            vectorEffect="non-scaling-stroke"
                          />
                          <line x1={a.x} y1={a.y + yOff} x2={b.x} y2={b.y + yOff}
                            stroke="#3b82f6" strokeWidth={1.5} strokeDasharray="4 3"
                            vectorEffect="non-scaling-stroke"
                          />
                        </>
                      );
                    })()}

                    {/* Fibonacci preview: dashed lines at first-click price and current mouse-y */}
                    {activeTool === 'fib' && pendingFib && svgMousePos && (() => {
                      const y1 = priceToSvgY(pendingFib.price);
                      const y2 = svgMousePos.y;
                      return (
                        <>
                          <line x1={0} y1={y1} x2={100} y2={y1}
                            stroke="#ffffff" strokeWidth={1} strokeDasharray="4 3"
                            vectorEffect="non-scaling-stroke" opacity={0.6}
                          />
                          <line x1={0} y1={y2} x2={100} y2={y2}
                            stroke="#ffffff" strokeWidth={1} strokeDasharray="4 3"
                            vectorEffect="non-scaling-stroke" opacity={0.6}
                          />
                        </>
                      );
                    })()}
                  </svg>

                  {/* Fibonacci labels (HTML overlay — real px font size, no SVG stretch) */}
                  {fibonaccis.length > 0 && (
                    <div
                      className="absolute pointer-events-none"
                      style={{
                        left: plotRect ? plotRect.left : 0,
                        top: plotRect ? plotRect.top : 0,
                        width: plotRect ? plotRect.width : '100%',
                        height: plotRect ? plotRect.height : chartHeight,
                      }}
                    >
                      {fibonaccis.flatMap((fib, fi) => {
                        const range = fib.p2.price - fib.p1.price;
                        const ratios = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1.0, 1.272, 1.618, 2.618];
                        return ratios.map(r => {
                          const price = fib.p1.price + range * r;
                          const yPct = priceToSvgY(price);
                          if (yPct < 0 || yPct > 100) return null;
                          return (
                            <div
                              key={`fib-lbl-${fi}-${r}`}
                              className="absolute font-mono"
                              style={{
                                top: `${yPct}%`,
                                left: 8,
                                transform: 'translateY(-100%)',
                                color: '#ffffff',
                                fontSize: '11px',
                                fontWeight: 600,
                                lineHeight: 1,
                                textShadow: '0 0 3px rgba(0,0,0,0.9), 0 0 2px rgba(0,0,0,0.9)',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {`${(r * 100).toFixed(1)}%  $${price.toFixed(2)}`}
                            </div>
                          );
                        });
                      })}
                    </div>
                  )}
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

            {/* Bottom toolbar: zoom + live indicator */}
            <div className="flex items-center gap-2 pb-1">
              {zoomRange && (
                <button
                  onClick={() => setZoomRange(null)}
                  className="px-3 py-1.5 text-xs rounded-lg border border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-teal-500 hover:text-teal-400 transition-colors"
                >
                  Reset Zoom
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

  // ─── modal wrapper (Watchlist / Portfolio) ────────────────────────────────
  if (displayMode === 'modal') {
    return (
      <div
        className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4"
        onClick={onClose}
      >
        <div
          className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl w-full max-w-7xl h-[65vh] flex flex-col overflow-hidden"
          onClick={e => e.stopPropagation()}
        >
          {content}
        </div>
      </div>
    );
  }

  // ─── floating popup (Screener panel mode) ────────────────────────────────
  return (
    <>
      {/* Invisible backdrop — click outside to close */}
      <div className="fixed inset-0 z-30" onClick={onClose} />

      {/* Floating popup card */}
      <div className="fixed top-20 right-4 z-40 w-96 bg-white dark:bg-gray-900 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 flex flex-col overflow-hidden max-h-[calc(100vh-5.5rem)]">
        {content}
      </div>
    </>
  );
};

export default ScreenerChartPanel;
