import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Treemap, ResponsiveContainer } from 'recharts';
import NavBar from '../components/NavBar';
import BackToTop from '../components/BackToTop';
import { authAPI, sectorRotationAPI } from '../services/api';
import { User } from '../types';

interface SectorReturn {
  ticker: string;
  name: string;
  return_pct: number | null;
  vs_spy_pct: number | null;
}

interface HeatmapPayload {
  as_of: string;
  window: string;
  spy_return_pct: number | null;
  sectors: SectorReturn[];
}

interface TimelapseFrame {
  date: string;
  spy_return_pct: number | null;
  sectors: SectorReturn[];
}

interface TimelapsePayload {
  window: string;
  step_days: number;
  end_date: string;
  frames: TimelapseFrame[];
}

interface CyclePhaseSignal {
  label: string;
  value: string;
  interpretation: string;
}

interface CyclePhasePayload {
  phase: string;
  confidence: string;
  summary: string;
  supporting_signals: CyclePhaseSignal[];
  sector_alignment: string;
  as_of: string;
  disclaimer: string;
}

const phaseAccent = (phase: string): { bar: string; chip: string } => {
  const p = phase.toLowerCase();
  if (p.includes('recovery')) return { bar: 'bg-blue-500', chip: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200' };
  if (p.includes('expansion')) return { bar: 'bg-green-500', chip: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200' };
  if (p.includes('peak')) return { bar: 'bg-amber-500', chip: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200' };
  if (p.includes('contraction')) return { bar: 'bg-red-500', chip: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200' };
  return { bar: 'bg-gray-400', chip: 'bg-gray-100 text-gray-800 dark:bg-gray-600 dark:text-gray-200' };
};

const WINDOWS: { value: string; label: string }[] = [
  { value: '1D', label: '1 Day' },
  { value: '1W', label: '1 Week' },
  { value: '1M', label: '1 Month' },
  { value: '3M', label: '3 Months' },
  { value: '6M', label: '6 Months' },
  { value: '1Y', label: '1 Year' },
];

// Diverging teal-to-red palette around vs_spy_pct = 0 (saturates at +/-5%)
const colorFor = (vsSpy: number | null): string => {
  if (vsSpy === null || isNaN(vsSpy)) return '#6b7280';
  const clamped = Math.max(-5, Math.min(5, vsSpy));
  if (clamped >= 0) {
    const t = clamped / 5;
    // teal-300 (#5eead4) -> teal-700 (#0f766e)
    const r = Math.round(94 + (15 - 94) * t);
    const g = Math.round(234 + (118 - 234) * t);
    const b = Math.round(212 + (110 - 212) * t);
    return `rgb(${r}, ${g}, ${b})`;
  }
  const t = -clamped / 5;
  // red-300 (#fca5a5) -> red-700 (#b91c1c)
  const r = Math.round(252 + (185 - 252) * t);
  const g = Math.round(165 + (28 - 165) * t);
  const b = Math.round(165 + (28 - 165) * t);
  return `rgb(${r}, ${g}, ${b})`;
};

const fmtPct = (v: unknown): string =>
  typeof v === 'number' && !isNaN(v) ? `${v >= 0 ? '+' : ''}${v.toFixed(2)}%` : '—';

const TreemapTile = (props: any) => {
  const { x, y, width, height } = props;
  // Recharts 3.x exposes custom data fields under props.payload, not on props directly.
  const ticker: string = props.payload?.ticker ?? props.ticker ?? '';
  const name: string = props.payload?.name ?? props.name ?? '';
  const return_pct: number | null =
    typeof props.payload?.return_pct === 'number' ? props.payload.return_pct
    : typeof props.return_pct === 'number' ? props.return_pct
    : null;
  const vs_spy_pct: number | null =
    typeof props.payload?.vs_spy_pct === 'number' ? props.payload.vs_spy_pct
    : typeof props.vs_spy_pct === 'number' ? props.vs_spy_pct
    : null;

  if (typeof width !== 'number' || typeof height !== 'number' || width <= 0 || height <= 0) return null;
  const fill = colorFor(vs_spy_pct);
  const showLabel = width > 70 && height > 50;
  const showSubLabel = width > 110 && height > 70;
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        style={{ fill, stroke: '#1f2937', strokeWidth: 2 }}
      />
      {/* Native SVG tooltip — works in every browser without Recharts magic */}
      <title>{`${ticker} — ${name}\nReturn: ${fmtPct(return_pct)}\nvs SPY: ${fmtPct(vs_spy_pct)}`}</title>
      {showLabel && (
        <>
          <text
            x={x + width / 2}
            y={y + height / 2 - (showSubLabel ? 12 : 0)}
            textAnchor="middle"
            fill="#000000"
            fontSize={showSubLabel ? 18 : 14}
            fontWeight={700}
            pointerEvents="none"
          >
            {ticker}
          </text>
          {showSubLabel && (
            <>
              <text
                x={x + width / 2}
                y={y + height / 2 + 6}
                textAnchor="middle"
                fill="#000000"
                fontSize={11}
                pointerEvents="none"
              >
                {name}
              </text>
              <text
                x={x + width / 2}
                y={y + height / 2 + 24}
                textAnchor="middle"
                fill="#000000"
                fontSize={13}
                fontWeight={600}
                pointerEvents="none"
              >
                {fmtPct(return_pct)}
              </text>
            </>
          )}
        </>
      )}
    </g>
  );
};

const SectorHeatmap: React.FC = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [selectedWindow, setSelectedWindow] = useState<string>('1M');
  const [endDate, setEndDate] = useState<string>('');
  const [snapshot, setSnapshot] = useState<HeatmapPayload | null>(null);
  const [snapshotLoading, setSnapshotLoading] = useState(false);
  const [error, setError] = useState<string>('');

  const [timelapse, setTimelapse] = useState<TimelapsePayload | null>(null);
  const [timelapseLoading, setTimelapseLoading] = useState(false);
  const [frameIdx, setFrameIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const playIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [cyclePhase, setCyclePhase] = useState<CyclePhasePayload | null>(null);
  const [cyclePhaseLoading, setCyclePhaseLoading] = useState(false);
  const [cyclePhaseFailed, setCyclePhaseFailed] = useState(false);

  const handleLogout = () => {
    localStorage.removeItem('access_token');
    navigate('/');
  };

  useEffect(() => {
    authAPI.getCurrentUser()
      .then(res => setUser(res.data))
      .catch(err => {
        if (err?.response?.status === 401) navigate('/login');
      });
  }, [navigate]);

  useEffect(() => {
    let cancelled = false;
    const loadSnapshot = async () => {
      setSnapshotLoading(true);
      setError('');
      try {
        const params: any = { window: selectedWindow };
        if (endDate) params.end_date = endDate;
        const res = await sectorRotationAPI.getHeatmap(params);
        if (!cancelled) setSnapshot(res.data);
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.response?.data?.detail || 'Failed to load heatmap.');
          setSnapshot(null);
        }
      } finally {
        if (!cancelled) setSnapshotLoading(false);
      }
    };
    loadSnapshot();
    setTimelapse(null);
    setPlaying(false);
    return () => { cancelled = true; };
  }, [selectedWindow, endDate]);

  // Cycle phase synthesis — fetched once on mount; backend caches system-wide for 24h.
  // Independent of the window/date selectors above.
  useEffect(() => {
    let cancelled = false;
    const loadCyclePhase = async () => {
      setCyclePhaseLoading(true);
      setCyclePhaseFailed(false);
      try {
        const res = await sectorRotationAPI.getCyclePhase();
        if (!cancelled) setCyclePhase(res.data);
      } catch {
        if (!cancelled) {
          setCyclePhase(null);
          setCyclePhaseFailed(true);
        }
      } finally {
        if (!cancelled) setCyclePhaseLoading(false);
      }
    };
    loadCyclePhase();
    return () => { cancelled = true; };
  }, []);

  const loadTimelapse = async () => {
    setTimelapseLoading(true);
    try {
      const params: any = { window: selectedWindow, step_days: 1 };
      if (endDate) params.end_date = endDate;
      const res = await sectorRotationAPI.getTimelapse(params);
      setTimelapse(res.data);
      setFrameIdx(res.data.frames.length - 1);
    } catch {
      setTimelapse(null);
    } finally {
      setTimelapseLoading(false);
    }
  };

  // Time-lapse playback
  useEffect(() => {
    if (!playing || !timelapse) return;
    playIntervalRef.current = setInterval(() => {
      setFrameIdx(prev => {
        const next = prev + 1;
        if (next >= timelapse.frames.length) {
          setPlaying(false);
          return prev;
        }
        return next;
      });
    }, 200);
    return () => {
      if (playIntervalRef.current !== null) {
        clearInterval(playIntervalRef.current);
        playIntervalRef.current = null;
      }
    };
  }, [playing, timelapse]);

  const activeSectors: SectorReturn[] = useMemo(() => {
    if (timelapse && timelapse.frames.length > 0) {
      const frame = timelapse.frames[Math.min(frameIdx, timelapse.frames.length - 1)];
      return frame.sectors;
    }
    return snapshot?.sectors || [];
  }, [snapshot, timelapse, frameIdx]);

  const activeAsOf = useMemo(() => {
    if (timelapse && timelapse.frames.length > 0) {
      return timelapse.frames[Math.min(frameIdx, timelapse.frames.length - 1)].date;
    }
    return snapshot?.as_of || '';
  }, [snapshot, timelapse, frameIdx]);

  const treemapData = useMemo(() => {
    return activeSectors.map(s => ({
      name: s.name,
      ticker: s.ticker,
      size: 100, // equal-size tiles; color encodes performance
      return_pct: s.return_pct,
      vs_spy_pct: s.vs_spy_pct,
    }));
  }, [activeSectors]);

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-800">
      {/* SEO — React 19 hoists to <head> */}
      <title>Sector Heatmap — NWC-Analytics</title>
      <meta name="description" content="Visualize sector and industry performance versus SPY in an interactive market heatmap." />
      <link rel="canonical" href="https://nwc-analytics.com/sector-heatmap" />
      <NavBar currentPage="sector-heatmap" user={user} onLogout={handleLogout} />

      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">Sector Rotation Heatmap</h1>
          <p className="text-gray-600 dark:text-gray-400 max-w-3xl">
            Relative performance of the 11 GICS sector ETFs versus SPY. Color intensity shows how much each sector is
            out- or under-performing the broader market over the selected window. Use the time-lapse slider to scrub
            through history and watch leadership rotate.
          </p>
        </div>

        {/* Controls */}
        <div className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 border dark:border-gray-500 p-5 mb-6">
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Window</label>
              <select
                value={selectedWindow}
                onChange={e => setSelectedWindow(e.target.value)}
                className="px-3 py-2 rounded-md border border-gray-300 dark:border-gray-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
              >
                {WINDOWS.map(w => <option key={w.value} value={w.value}>{w.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">As-of date</label>
              <input
                type="date"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                className="px-3 py-2 rounded-md border border-gray-300 dark:border-gray-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
              />
            </div>
            <button
              onClick={loadTimelapse}
              disabled={timelapseLoading}
              className="px-4 py-2 bg-primary-600 hover:bg-primary-700 dark:bg-primary-500 dark:hover:bg-primary-600 disabled:opacity-50 text-white rounded-lg text-sm font-medium"
            >
              {timelapseLoading ? 'Loading…' : '⏱ Load Time-Lapse'}
            </button>
            {snapshot && (
              <div className="ml-auto text-sm text-gray-600 dark:text-gray-300">
                <div>SPY {snapshot.window}: <span className={`font-semibold ${(snapshot.spy_return_pct ?? 0) >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                  {snapshot.spy_return_pct !== null ? `${snapshot.spy_return_pct >= 0 ? '+' : ''}${snapshot.spy_return_pct.toFixed(2)}%` : '—'}
                </span></div>
                <div className="text-xs text-gray-500 dark:text-gray-400">As of {activeAsOf}</div>
              </div>
            )}
          </div>
        </div>

        {/* Economic cycle phase — AI synthesis. Hidden silently if the endpoint fails
            so a missing card never sits above the actual heatmap. */}
        {!cyclePhaseFailed && (cyclePhaseLoading || cyclePhase) && (
          <div className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 border dark:border-gray-500 p-5 mb-6">
            {cyclePhaseLoading && !cyclePhase ? (
              <div className="flex items-center py-6">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
                <span className="ml-3 text-sm text-gray-500 dark:text-gray-400">
                  Reading the macro tape…
                </span>
              </div>
            ) : cyclePhase ? (
              <>
                <div className="flex items-start gap-3 mb-3">
                  <div className={`w-1 self-stretch rounded-full ${phaseAccent(cyclePhase.phase).bar}`} />
                  <div className="flex-1">
                    <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                      Where we are in the cycle
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`inline-block text-sm font-semibold px-2.5 py-0.5 rounded ${phaseAccent(cyclePhase.phase).chip}`}>
                        {cyclePhase.phase}
                      </span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        confidence: {cyclePhase.confidence}
                      </span>
                    </div>
                  </div>
                </div>

                <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed mb-4">
                  {cyclePhase.summary}
                </p>

                {cyclePhase.supporting_signals.length > 0 && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-4">
                    {cyclePhase.supporting_signals.map((s, i) => (
                      <div key={i} className="bg-gray-50 dark:bg-gray-800/60 rounded px-3 py-2">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{s.label}</span>
                          <span className="text-sm font-semibold text-gray-900 dark:text-white tabular-nums">{s.value}</span>
                        </div>
                        <div className="text-xs text-gray-600 dark:text-gray-300 mt-1">{s.interpretation}</div>
                      </div>
                    ))}
                  </div>
                )}

                {cyclePhase.sector_alignment && (
                  <div className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed border-t border-gray-200 dark:border-gray-600 pt-3 mb-3">
                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide block mb-1">
                      Sector alignment
                    </span>
                    {cyclePhase.sector_alignment}
                  </div>
                )}

                <div className="text-xs text-gray-500 dark:text-gray-400 italic">
                  {cyclePhase.disclaimer}
                  {' '}
                  <a
                    href="https://nwc-analytics.com/blogs"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="not-italic text-primary-600 dark:text-primary-400 hover:underline"
                  >
                    Read the full sector rotation framework →
                  </a>
                </div>
              </>
            ) : null}
          </div>
        )}

        {/* Heatmap */}
        <div className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 border dark:border-gray-500 p-5">
          {/* Time-lapse slider — sits with the heatmap so the slider and what it scrubs stay grouped */}
          {timelapse && timelapse.frames.length > 0 && (
            <div className="mb-5 pb-5 border-b border-gray-200 dark:border-gray-600">
              <div className="flex items-center gap-3 mb-2">
                <button
                  onClick={() => setPlaying(p => !p)}
                  className="px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded text-sm font-medium"
                >
                  {playing ? '⏸ Pause' : '▶ Play'}
                </button>
                <button
                  onClick={() => {
                    setPlaying(false);
                    setFrameIdx(prev => Math.min(prev + 1, timelapse.frames.length - 1));
                  }}
                  disabled={frameIdx >= timelapse.frames.length - 1}
                  title="Step to next interval"
                  className="px-3 py-1.5 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded text-sm font-medium"
                >
                  ⏭ Step
                </button>
                <span className="text-sm text-gray-600 dark:text-gray-300">
                  Frame {frameIdx + 1} / {timelapse.frames.length} — {timelapse.frames[frameIdx]?.date}
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={timelapse.frames.length - 1}
                value={frameIdx}
                onChange={e => setFrameIdx(Number(e.target.value))}
                className="w-full"
              />
            </div>
          )}

          {error && (
            <div className="text-sm text-red-600 dark:text-red-400 mb-3">{error}</div>
          )}
          {snapshotLoading && !snapshot ? (
            <div className="flex items-center justify-center py-20">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600"></div>
              <span className="ml-3 text-gray-500 dark:text-gray-400">Loading heatmap…</span>
            </div>
          ) : treemapData.length === 0 ? (
            <div className="text-center py-20 text-gray-500 dark:text-gray-400">
              No sector data available. Run the backfill script to populate sector_etf_daily_closes.
            </div>
          ) : (
            <div style={{ width: '100%', height: 520 }}>
              <ResponsiveContainer>
                <Treemap
                  data={treemapData}
                  dataKey="size"
                  stroke="#1f2937"
                  content={<TreemapTile />}
                  isAnimationActive={false}
                />
              </ResponsiveContainer>
            </div>
          )}

          {/* Color legend */}
          <div className="mt-4 flex items-center justify-center gap-2 text-xs text-gray-600 dark:text-gray-400">
            <span>Underperforms SPY</span>
            <div className="flex h-3">
              {[-5, -3, -1, 0, 1, 3, 5].map(v => (
                <div key={v} className="w-8" style={{ backgroundColor: colorFor(v) }} />
              ))}
            </div>
            <span>Outperforms SPY</span>
          </div>
        </div>
      </div>
      <BackToTop />
    </div>
  );
};

export default SectorHeatmap;
