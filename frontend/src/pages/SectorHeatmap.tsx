import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Treemap, ResponsiveContainer, Tooltip as RTooltip } from 'recharts';
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

const TreemapTile = (props: any) => {
  const { x, y, width, height, ticker, name, return_pct, vs_spy_pct } = props;
  if (width <= 0 || height <= 0) return null;
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
      {showLabel && (
        <>
          <text
            x={x + width / 2}
            y={y + height / 2 - (showSubLabel ? 12 : 0)}
            textAnchor="middle"
            fill="#ffffff"
            fontSize={showSubLabel ? 18 : 14}
            fontWeight={700}
          >
            {ticker}
          </text>
          {showSubLabel && (
            <>
              <text
                x={x + width / 2}
                y={y + height / 2 + 6}
                textAnchor="middle"
                fill="#ffffff"
                fontSize={11}
                opacity={0.9}
              >
                {name}
              </text>
              <text
                x={x + width / 2}
                y={y + height / 2 + 24}
                textAnchor="middle"
                fill="#ffffff"
                fontSize={13}
                fontWeight={600}
              >
                {return_pct !== null ? `${return_pct >= 0 ? '+' : ''}${return_pct.toFixed(2)}%` : '—'}
              </text>
            </>
          )}
        </>
      )}
    </g>
  );
};

const HeatmapTooltip = ({ active, payload }: any) => {
  if (!active || !payload || !payload.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-gray-900 border border-gray-600 rounded-lg p-3 text-sm shadow-xl">
      <div className="font-semibold text-white">{d.ticker} — {d.name}</div>
      <div className="text-gray-300 mt-1">
        Return: <span className={d.return_pct >= 0 ? 'text-green-400' : 'text-red-400'}>
          {d.return_pct !== null ? `${d.return_pct >= 0 ? '+' : ''}${d.return_pct.toFixed(2)}%` : '—'}
        </span>
      </div>
      <div className="text-gray-300">
        vs SPY: <span className={d.vs_spy_pct >= 0 ? 'text-teal-400' : 'text-red-400'}>
          {d.vs_spy_pct !== null ? `${d.vs_spy_pct >= 0 ? '+' : ''}${d.vs_spy_pct.toFixed(2)}%` : '—'}
        </span>
      </div>
    </div>
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

          {/* Time-lapse slider */}
          {timelapse && timelapse.frames.length > 0 && (
            <div className="mt-5 pt-5 border-t border-gray-200 dark:border-gray-600">
              <div className="flex items-center gap-3 mb-2">
                <button
                  onClick={() => setPlaying(p => !p)}
                  className="px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded text-sm font-medium"
                >
                  {playing ? '⏸ Pause' : '▶ Play'}
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
        </div>

        {/* Heatmap */}
        <div className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 border dark:border-gray-500 p-5">
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
                >
                  <RTooltip content={<HeatmapTooltip />} />
                </Treemap>
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
