/**
 * Chart drawing tools — Trend Line, Channel, Fibonacci — for every chart that
 * offers them: Stocks Price History, the intraday popup (ScreenerChartPanel)
 * and the Technical Analysis Moving Averages chart. One implementation, so a
 * tool looks and behaves the same everywhere; don't add drawing code to a page.
 *
 * The overlay works in pixels on top of any chart library. A chart supplies a
 * ChartFrame (its plot rectangle plus data↔pixel conversions):
 *   - Chart.js: `useChartJsFrame(chartRef)`, and pass its `plugin` to the chart
 *     so the overlay follows every re-layout (resize, new data, rescale).
 *   - Recharts: render <RechartsPlotArea onChange={setPlotRect} /> inside the
 *     chart and build the FrameSource from that rect, the y domain and the zoom
 *     window; see ScreenerChartPanel.
 *
 * Usage:
 *   const drawing = useDrawingTools(resetKey);
 *   <DrawingToolbar drawing={drawing} />
 *   <div className="relative">{chart}<DrawingOverlay drawing={drawing} frame={frame} /></div>
 */
import React, { useCallback, useEffect, useId, useMemo, useReducer, useRef, useState } from 'react';
import { usePlotArea } from 'recharts';
import { useTheme } from '../contexts/ThemeContext';

// ─── model ──────────────────────────────────────────────────────────────────

export type DrawTool = 'trendline' | 'channel' | 'fibonacci';

/** A point in data space: `xi` is the bar index in the chart's series, `price` the y value. */
export interface DrawPoint { xi: number; price: number }

export type DrawingShape =
  | { type: 'trendline'; p1: DrawPoint; p2: DrawPoint }
  // Base line p1→p2; the parallel line passes through p3
  | { type: 'channel'; p1: DrawPoint; p2: DrawPoint; p3: DrawPoint }
  // p1 = end of the move (0%), p2 = its start (100%)
  | { type: 'fibonacci'; p1: DrawPoint; p2: DrawPoint };

/** A chart's plot area and data↔pixel mapping, in px relative to the chart's box. */
export interface ChartFrame {
  plot: { left: number; top: number; right: number; bottom: number };
  xToPx: (xi: number) => number;
  /** Nearest bar index to a pixel */
  pxToX: (px: number) => number;
  yToPx: (price: number) => number;
  pxToY: (py: number) => number;
}

export interface FrameSource {
  /** Read at render time; null until the chart has laid out. */
  getFrame: () => ChartFrame | null;
  /** For charts that re-lay out outside React (Chart.js): calls `onChange` after each layout. */
  subscribe?: (onChange: () => void) => () => void;
}

const POINTS_NEEDED: Record<DrawTool, number> = { trendline: 2, channel: 3, fibonacci: 2 };

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// ─── state ──────────────────────────────────────────────────────────────────

export interface DrawingState {
  tool: DrawTool | null;
  /** Clicks so far on the shape being drawn */
  pending: DrawPoint[];
  drawings: DrawingShape[];
  /** Arms a tool, or disarms it if it is already armed */
  toggleTool: (tool: DrawTool) => void;
  addPoint: (pt: DrawPoint) => void;
  clear: () => void;
}

/** Drawing state for one chart. Everything resets when `resetKey` changes (new ticker, new range). */
export function useDrawingTools(resetKey?: unknown): DrawingState {
  const [tool, setTool] = useState<DrawTool | null>(null);
  const [pending, setPending] = useState<DrawPoint[]>([]);
  const [drawings, setDrawings] = useState<DrawingShape[]>([]);

  // Drawings are in bar-index space, so they mean nothing on another series
  useEffect(() => {
    setTool(null);
    setPending([]);
    setDrawings([]);
  }, [resetKey]);

  const toggleTool = useCallback((t: DrawTool) => {
    setTool(cur => (cur === t ? null : t));
    setPending([]);
  }, []);

  const addPoint = useCallback((pt: DrawPoint) => {
    if (!tool) return;
    const next = [...pending, pt];
    if (next.length < POINTS_NEEDED[tool]) {
      setPending(next);
      return;
    }
    const shape: DrawingShape =
      tool === 'trendline' ? { type: 'trendline', p1: next[0], p2: next[1] }
      : tool === 'channel' ? { type: 'channel', p1: next[0], p2: next[1], p3: next[2] }
      : { type: 'fibonacci', p1: next[1], p2: next[0] };
    setDrawings(d => [...d, shape]);
    setPending([]);
  }, [tool, pending]);

  const clear = useCallback(() => {
    setDrawings([]);
    setPending([]);
  }, []);

  return useMemo(
    () => ({ tool, pending, drawings, toggleTool, addPoint, clear }),
    [tool, pending, drawings, toggleTool, addPoint, clear],
  );
}

// ─── Chart.js adapter ───────────────────────────────────────────────────────

export interface ChartJsFrameSource extends FrameSource {
  /** Pass to the chart: `plugins={[frame.plugin]}` (react-chartjs-2 reads it once, at creation). */
  plugin: { id: string; afterUpdate: () => void };
}

/** Frame for a Chart.js chart with a category x axis (bar index = label index). */
export function useChartJsFrame(chartRef: React.RefObject<any>, yAxisId = 'y'): ChartJsFrameSource {
  const listeners = useRef(new Set<() => void>());
  return useMemo<ChartJsFrameSource>(() => ({
    plugin: {
      id: 'drawingToolsSync',
      afterUpdate: () => listeners.current.forEach(fn => fn()),
    },
    subscribe: (fn) => {
      listeners.current.add(fn);
      return () => { listeners.current.delete(fn); };
    },
    getFrame: () => {
      const chart = chartRef.current;
      const x = chart?.scales?.x;
      const y = chart?.scales?.[yAxisId];
      const area = chart?.chartArea;
      const n: number = chart?.data?.labels?.length ?? 0;
      if (!x || !y || !area || !n) return null;
      return {
        plot: { left: area.left, top: area.top, right: area.right, bottom: area.bottom },
        xToPx: xi => x.getPixelForValue(xi),
        pxToX: px => clamp(Math.round(x.getValueForPixel(px) ?? 0), 0, n - 1),
        yToPx: price => y.getPixelForValue(price),
        pxToY: py => y.getValueForPixel(py) ?? 0,
      };
    },
  }), [chartRef, yAxisId]);
}

// ─── Recharts adapter ───────────────────────────────────────────────────────

/** A plot rectangle in px, relative to the chart's own box. */
export interface PlotRect { left: number; top: number; width: number; height: number }

/**
 * Reports a Recharts chart's plot area, the rect its axes and legend leave for
 * the data. Render it as a child of the chart: `<RechartsPlotArea onChange={setPlotRect} />`.
 * Recharts 3 gives custom children no layout props (v2's <Customized> injected
 * `offset`); the plot area comes from usePlotArea(), which only works inside a chart.
 */
export const RechartsPlotArea: React.FC<{ onChange: (rect: PlotRect) => void }> = ({ onChange }) => {
  const area = usePlotArea();
  const left = area?.x;
  const top = area?.y;
  const width = area?.width;
  const height = area?.height;
  useEffect(() => {
    if (left == null || top == null || width == null || height == null) return;
    onChange({ left, top, width, height });
  }, [left, top, width, height, onChange]);
  return null;
};

// ─── toolbar ────────────────────────────────────────────────────────────────

const INACTIVE_BTN =
  'bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-500';

const TOOL_BUTTONS: { tool: DrawTool; label: string; activeCls: string; icon: React.ReactNode }[] = [
  {
    tool: 'trendline',
    label: 'Trend Line',
    activeCls: 'bg-amber-500/20 text-amber-500 border border-amber-500/50',
    icon: (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
        <line x1="1" y1="13" x2="13" y2="1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    tool: 'channel',
    label: 'Channel',
    activeCls: 'bg-orange-500/20 text-orange-500 border border-orange-500/50',
    icon: (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
        <line x1="1" y1="10" x2="13" y2="3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="1" y1="13" x2="13" y2="6" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeDasharray="2 1.5" />
      </svg>
    ),
  },
  {
    tool: 'fibonacci',
    label: 'Fibonacci',
    activeCls: 'bg-violet-500/20 text-violet-500 border border-violet-500/50',
    icon: (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
        <line x1="1" y1="2" x2="13" y2="2" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
        <line x1="1" y1="5" x2="13" y2="5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
        <line x1="1" y1="8" x2="13" y2="8" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
        <line x1="1" y1="11" x2="13" y2="11" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeDasharray="2 1.5" />
      </svg>
    ),
  },
];

const hintFor = (tool: DrawTool, clicks: number) => {
  if (tool === 'fibonacci') return clicks === 0 ? 'Click start of move' : 'Click end of move (0%)';
  if (clicks === 0) return 'Click to set start point';
  if (clicks === 1) return 'Click to set end point';
  return 'Click to set channel width';
};

export const DrawingToolbar: React.FC<{ drawing: DrawingState; className?: string }> = ({
  drawing,
  className = '',
}) => {
  const { tool, pending, drawings, toggleTool, clear } = drawing;
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-gray-500 dark:text-gray-400 select-none">Draw:</span>
        {TOOL_BUTTONS.map(b => (
          <button
            key={b.tool}
            type="button"
            aria-pressed={tool === b.tool}
            onClick={() => toggleTool(b.tool)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-colors ${
              tool === b.tool ? b.activeCls : INACTIVE_BTN
            }`}
          >
            {b.icon}
            {b.label}
          </button>
        ))}
      </div>
      {(drawings.length > 0 || tool) && (
        <div className="flex flex-wrap items-center gap-3">
          {drawings.length > 0 && (
            <button
              type="button"
              onClick={clear}
              className="flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium bg-red-500/10 text-red-500 border border-red-500/30 hover:bg-red-500/20 transition-colors"
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
                <path d="M1 1l8 8M9 1L1 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              Clear
            </button>
          )}
          {tool && (
            <span className="text-xs text-gray-400 dark:text-gray-500">{hintFor(tool, pending.length)}</span>
          )}
        </div>
      )}
    </div>
  );
};

// ─── overlay ────────────────────────────────────────────────────────────────

const TREND_COLOR = 'rgba(251,191,36,0.9)';          // amber-400
const CHANNEL_COLOR = 'rgba(249,115,22,0.9)';        // orange-500
const CHANNEL_FILL = 'rgba(249,115,22,0.07)';
const CHANNEL_PREVIEW_BASE = 'rgba(249,115,22,0.7)';
const CHANNEL_PREVIEW_PARALLEL = 'rgba(249,115,22,0.4)';
const FIB_LEVELS = [
  ...[0, 0.236, 0.382, 0.5, 0.618, 0.786, 1].map(r => ({ r, extension: false })),
  ...[1.272, 1.618, 2.618].map(r => ({ r, extension: true })),
];
const DOT_RADIUS = 4;
const LABEL_FONT = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
const PREVIEW_DASH = '5 5';

type Pt = { x: number; y: number };

/** The line a→b shifted in price so it passes through c */
const parallelThrough = (a: DrawPoint, b: DrawPoint, c: DrawPoint): [DrawPoint, DrawPoint] => {
  const slope = b.xi !== a.xi ? (b.price - a.price) / (b.xi - a.xi) : 0;
  const offset = c.price - (a.price + slope * (c.xi - a.xi));
  return [{ xi: a.xi, price: a.price + offset }, { xi: b.xi, price: b.price + offset }];
};

/**
 * Draws the shapes over the chart and takes the clicks while a tool is armed.
 * Place it inside the chart's `relative` box, after the chart. It ignores the
 * mouse when no tool is armed, so the chart's own hover, zoom and pan still work.
 */
export const DrawingOverlay: React.FC<{ drawing: DrawingState; frame: FrameSource }> = ({ drawing, frame }) => {
  const { theme } = useTheme();
  const clipId = `drawing-clip-${useId().replace(/[^\w-]/g, '')}`;
  const [mouse, setMouse] = useState<Pt | null>(null);
  const [, relayout] = useReducer((n: number) => n + 1, 0);
  useEffect(() => frame.subscribe?.(relayout), [frame]);

  const { tool, pending, drawings, addPoint } = drawing;
  const armed = tool !== null;

  const localPoint = (e: React.MouseEvent<SVGSVGElement>): Pt => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  // Pixel → data, clamped into the plot so a click just past an edge lands on it
  const toData = (fr: ChartFrame, p: Pt): DrawPoint => ({
    xi: fr.pxToX(clamp(p.x, fr.plot.left, fr.plot.right)),
    price: fr.pxToY(clamp(p.y, fr.plot.top, fr.plot.bottom)),
  });

  const handleClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!armed) return;
    const fr = frame.getFrame();
    if (fr) addPoint(toData(fr, localPoint(e)));
  };

  const style: React.CSSProperties = {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    zIndex: 1,
    pointerEvents: armed ? 'auto' : 'none',
    cursor: armed ? 'crosshair' : 'default',
  };

  const f = frame.getFrame();
  const clipped: React.ReactNode[] = []; // lines and bands, clipped to the plot
  const marks: React.ReactNode[] = [];   // dots and labels, drawn on top

  if (f) {
    const { plot } = f;
    const dark = theme === 'dark';
    // White on the dark theme, near-black on the light one
    const neutral = (a: number) => (dark ? `rgba(255,255,255,${a})` : `rgba(31,41,55,${a})`);
    const labelOutline = dark ? 'rgba(0,0,0,0.9)' : 'rgba(255,255,255,0.9)';

    const toPx = (p: DrawPoint): Pt => ({ x: f.xToPx(p.xi), y: f.yToPx(p.price) });
    // The line through a and b, extended to the plot's left and right edges
    const extend = (a: DrawPoint, b: DrawPoint): [Pt, Pt] => {
      const pa = toPx(a);
      const pb = toPx(b);
      const dx = pb.x - pa.x;
      if (Math.abs(dx) < 0.001) return [{ x: pa.x, y: plot.top }, { x: pa.x, y: plot.bottom }];
      const slope = (pb.y - pa.y) / dx;
      return [
        { x: plot.left, y: pa.y + slope * (plot.left - pa.x) },
        { x: plot.right, y: pa.y + slope * (plot.right - pa.x) },
      ];
    };
    const line = (key: string, a: DrawPoint, b: DrawPoint, color: string, width: number, dash?: string) => {
      const [s, e] = extend(a, b);
      clipped.push(
        <line key={key} x1={s.x} y1={s.y} x2={e.x} y2={e.y}
          stroke={color} strokeWidth={width} strokeDasharray={dash} />,
      );
    };
    const level = (key: string, price: number, color: string, dash?: string) => {
      const y = f.yToPx(price);
      clipped.push(
        <line key={key} x1={plot.left} y1={y} x2={plot.right} y2={y}
          stroke={color} strokeWidth={1} strokeDasharray={dash} />,
      );
    };
    // Skipped once zoom, pan or a rescaled axis moves the anchor off the plot
    const dot = (key: string, p: DrawPoint, color: string) => {
      const c = toPx(p);
      if (c.x < plot.left - 0.5 || c.x > plot.right + 0.5 || c.y < plot.top - 0.5 || c.y > plot.bottom + 0.5) return;
      marks.push(<circle key={key} cx={c.x} cy={c.y} r={DOT_RADIUS} fill={color} />);
    };

    drawings.forEach((d, i) => {
      const k = `d${i}`;
      if (d.type === 'trendline') {
        line(`${k}-line`, d.p1, d.p2, TREND_COLOR, 1.5);
        dot(`${k}-1`, d.p1, TREND_COLOR);
        dot(`${k}-2`, d.p2, TREND_COLOR);
      } else if (d.type === 'channel') {
        const [q1, q2] = parallelThrough(d.p1, d.p2, d.p3);
        const [s1, e1] = extend(d.p1, d.p2);
        const [s2, e2] = extend(q1, q2);
        clipped.push(
          <polygon key={`${k}-band`} fill={CHANNEL_FILL}
            points={`${s1.x},${s1.y} ${e1.x},${e1.y} ${e2.x},${e2.y} ${s2.x},${s2.y}`} />,
        );
        line(`${k}-base`, d.p1, d.p2, CHANNEL_COLOR, 1.5);
        line(`${k}-parallel`, q1, q2, CHANNEL_COLOR, 1.5);
        dot(`${k}-1`, d.p1, CHANNEL_COLOR);
        dot(`${k}-2`, d.p2, CHANNEL_COLOR);
        dot(`${k}-3`, d.p3, CHANNEL_COLOR);
      } else {
        const range = d.p2.price - d.p1.price;
        FIB_LEVELS.forEach(({ r, extension }) => {
          const price = d.p1.price + range * r;
          const y = f.yToPx(price);
          if (y < plot.top - 1 || y > plot.bottom + 1) return;
          level(`${k}-${r}`, price, neutral(0.9), extension ? '4 3' : undefined);
          marks.push(
            <text key={`${k}-${r}-label`} x={plot.left + 8} y={y - 4}
              fill={neutral(1)} stroke={labelOutline} strokeWidth={3} strokeLinejoin="round" paintOrder="stroke"
              fontFamily={LABEL_FONT} fontSize={11} fontWeight={600}>
              {`${(r * 100).toFixed(1)}%  $${price.toFixed(2)}`}
            </text>,
          );
        });
        dot(`${k}-1`, d.p1, neutral(1));
        dot(`${k}-2`, d.p2, neutral(1));
      }
    });

    // The shape being drawn, with a guide following the cursor (snapped to the bar a click would take)
    if (tool && pending.length > 0) {
      const m = mouse ? toData(f, mouse) : null;
      const [a, b] = pending;
      if (tool === 'fibonacci') {
        level('pv-start', a.price, neutral(0.6), PREVIEW_DASH);
        if (m) level('pv-end', m.price, neutral(0.6), PREVIEW_DASH);
        dot('pv-1', a, neutral(0.9));
      } else if (pending.length === 1) {
        if (m) line('pv-line', a, m, neutral(0.35), 1, PREVIEW_DASH);
        dot('pv-1', a, neutral(0.6));
      } else {
        // Channel with its base line set; the cursor sets the width
        line('pv-base', a, b, CHANNEL_PREVIEW_BASE, 1.5);
        if (m) {
          const [q1, q2] = parallelThrough(a, b, m);
          line('pv-parallel', q1, q2, CHANNEL_PREVIEW_PARALLEL, 1, PREVIEW_DASH);
        }
        dot('pv-1', a, CHANNEL_COLOR);
        dot('pv-2', b, CHANNEL_COLOR);
      }
    }
  }

  return (
    <svg
      style={style}
      onClick={handleClick}
      onMouseMove={armed ? e => setMouse(localPoint(e)) : undefined}
      onMouseLeave={() => setMouse(null)}
    >
      {f && (
        <>
          <defs>
            <clipPath id={clipId}>
              <rect x={f.plot.left} y={f.plot.top}
                width={Math.max(0, f.plot.right - f.plot.left)} height={Math.max(0, f.plot.bottom - f.plot.top)} />
            </clipPath>
          </defs>
          <g clipPath={`url(#${clipId})`}>{clipped}</g>
          {marks}
        </>
      )}
    </svg>
  );
};
