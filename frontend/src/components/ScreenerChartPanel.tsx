import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import {
  AreaChart, Area, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, Customized, ReferenceLine,
} from 'recharts';
import { intradayAPI } from '../services/api';
import { useTheme } from '../contexts/ThemeContext';
import { formatDateOnly } from '../utils/dates';
import {
  DrawingOverlay, DrawingToolbar, useDrawingTools, DrawTool, FrameSource,
} from './DrawingTools';

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
  multiplier: number; // minutes per bar
  note?: string;
}

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
  try { return formatDateOnly(d); }
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
  const { theme } = useTheme();
  const [snapshot, setSnapshot] = useState<IntradaySnapshot | null>(null);
  const [barsData, setBarsData] = useState<BarsResponse | null>(null);
  const [liveTicks, setLiveTicks] = useState<ChartPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Drawing tools; a new ticker starts a clean chart
  const drawing = useDrawingTools(ticker);
  const activeToolRef = useRef<DrawTool | null>(null);

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
  useEffect(() => { activeToolRef.current = drawing.tool; }, [drawing.tool]);

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
  // via <Customized> below. The drawing frame maps prices into this rect — Recharts
  // insets the plot area for the X-axis + legend, so mapping onto the full
  // container would push every drawing below its true price.
  const [plotRect, setPlotRect] = useState<{ left: number; top: number; width: number; height: number } | null>(null);

  // Day's open for the above/below-open split. The snapshot's session open is
  // only trustworthy when the bars are today's; on a closed-market fallback day
  // the first bar's open is the open of the day actually being charted.
  const dayOpen = useMemo<number | null>(() => {
    const firstBarOpen = barsData?.bars[0]?.open ?? null;
    if (barsData?.is_today && snapshot?.session?.open != null) return snapshot.session.open;
    return firstBarOpen;
  }, [barsData, snapshot?.session?.open]);

  // Where the open sits within each gradient's bounding box (0 = top, 1 = bottom).
  // Both gradients use objectBoundingBox (monotone interpolation never overshoots):
  //  - stroke: the line's own min→max price span, so the color flips exactly at the open
  //  - fill: the area is filled down/up to the open (baseValue), so its box also
  //    stretches to include the open
  // null = zero-height box (can't take a gradient) or no open.
  const { openSplitOffset, fillSplitOffset } = useMemo<{
    openSplitOffset: number | null;
    fillSplitOffset: number | null;
  }>(() => {
    const none = { openSplitOffset: null, fillSplitOffset: null };
    if (dayOpen == null) return none;
    const prices = visibleChartData
      .map(d => d.price)
      .filter((v): v is number => v != null && Number.isFinite(v));
    if (!prices.length) return none;
    const hi = Math.max(...prices);
    const lo = Math.min(...prices);
    const top = Math.max(hi, dayOpen);
    const bottom = Math.min(lo, dayOpen);
    return {
      openSplitOffset: hi === lo ? null : Math.max(0, Math.min(1, (hi - dayOpen) / (hi - lo))),
      fillSplitOffset: top === bottom ? null : (top - dayOpen) / (top - bottom),
    };
  }, [visibleChartData, dayOpen]);

  // The y axis's domain, set explicitly so the drawing frame maps prices exactly
  // as Recharts renders them.
  const yDomain = useMemo<[number, number]>(() => {
    const vals: number[] = [];
    // Keep the open line on-screen even when the visible window never touches it
    if (dayOpen != null && Number.isFinite(dayOpen)) vals.push(dayOpen);
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
  }, [visibleChartData, dayOpen]);

  // Drawing-tool frame: Recharts' plot rect plus the same axis mappings it draws
  // with. A drawing's xi is its index in the full series (bars + live ticks), so
  // drawings keep their place while zoomed or panned.
  const drawingFrame = useMemo<FrameSource>(() => ({
    getFrame: () => {
      const len = visibleChartData.length;
      if (!plotRect || !len) return null;
      const start = zoomRange?.start ?? 0;
      const step = len > 1 ? plotRect.width / (len - 1) : 0;
      const [lo, hi] = yDomain;
      const span = hi - lo || 1;
      return {
        plot: {
          left: plotRect.left,
          top: plotRect.top,
          right: plotRect.left + plotRect.width,
          bottom: plotRect.top + plotRect.height,
        },
        xToPx: xi => plotRect.left + (xi - start) * step,
        pxToX: px => start + (step ? Math.max(0, Math.min(len - 1, Math.round((px - plotRect.left) / step))) : 0),
        yToPx: price => plotRect.top + ((hi - price) / span) * plotRect.height,
        pxToY: py => hi - ((py - plotRect.top) / plotRect.height) * span,
      };
    },
  }), [plotRect, visibleChartData.length, zoomRange, yDomain]);

  const priceColor = () => {
    if (!snapshot?.session?.change) return '#3b82f6';
    return snapshot.session.change >= 0 ? '#10b981' : '#ef4444';
  };

  // Above/at open = green, below = red; falls back to the day-change color without an open
  const colorVsOpen = (price: number | null | undefined) => {
    if (dayOpen == null || price == null) return priceColor();
    return price >= dayOpen ? '#10b981' : '#ef4444';
  };

  // Flat line or no open → solid color; otherwise the green/red split gradient
  const priceStroke = openSplitOffset == null
    ? colorVsOpen(visibleChartData[visibleChartData.length - 1]?.price)
    : 'url(#scpOpenSplit)';

  // With an open the area is a baseline fill between price and open (nothing to
  // fill if the line sits on the open); without one it fades to the axis floor.
  const priceFill = dayOpen == null
    ? 'url(#scpPriceFill)'
    : fillSplitOffset == null ? 'none' : 'url(#scpOpenFill)';

  const openLineColor = theme === 'dark' ? '#ffffff' : '#374151';

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
        fill={colorVsOpen(props.payload?.price)}
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
                    : `${barsData?.count ?? 0} bars`}{barsData ? ` · ${barsData.multiplier}-min` : ''}
                  {!zoomRange && liveTicks.length > 0 && (
                    <span className="text-teal-400"> + {liveTicks.length} live</span>
                  )}
                </span>
              </div>
              {visibleChartData.length > 0 && <DrawingToolbar drawing={drawing} className="mb-2" />}

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
                          <stop offset="5%"  stopColor={priceColor()} stopOpacity={0.6} />
                          <stop offset="95%" stopColor={priceColor()} stopOpacity={0.03} />
                        </linearGradient>
                        {/* Hard stop at the open: green above, red below */}
                        {openSplitOffset != null && (
                          <linearGradient id="scpOpenSplit" x1="0" y1="0" x2="0" y2="1">
                            <stop offset={openSplitOffset} stopColor="#10b981" />
                            <stop offset={openSplitOffset} stopColor="#ef4444" />
                          </linearGradient>
                        )}
                        {/* Fill: same split, each side fading toward the open line */}
                        {fillSplitOffset != null && (
                          <linearGradient id="scpOpenFill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset={0}               stopColor="#10b981" stopOpacity={0.5} />
                            <stop offset={fillSplitOffset} stopColor="#10b981" stopOpacity={0.1} />
                            <stop offset={fillSplitOffset} stopColor="#ef4444" stopOpacity={0.1} />
                            <stop offset={1}               stopColor="#ef4444" stopOpacity={0.5} />
                          </linearGradient>
                        )}
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

                      {/* Day-open reference line, full width */}
                      {dayOpen != null && (
                        <ReferenceLine
                          y={dayOpen}
                          stroke={openLineColor}
                          strokeDasharray="4 4"
                          strokeWidth={1}
                          label={{
                            value: `Open $${fmt2(dayOpen)}`,
                            position: 'insideTopLeft',
                            fill: openLineColor,
                            fontSize: 10,
                          }}
                        />
                      )}

                      {/* Price area — green above the open, red below; dots only on live ticks */}
                      <Area
                        type="monotone"
                        dataKey="price"
                        baseValue={dayOpen ?? undefined}
                        stroke={priceStroke}
                        strokeWidth={2}
                        fill={priceFill}
                        dot={renderDot}
                        activeDot={{ r: 5, strokeWidth: 0 }}
                        name="Price"
                        isAnimationActive={false}
                      />
                    </AreaChart>
                  </ResponsiveContainer>

                  <DrawingOverlay drawing={drawing} frame={drawingFrame} />
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
