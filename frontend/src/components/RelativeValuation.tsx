import React, { useState, useEffect, useCallback } from 'react';
import { relvalAPI, screenerAPI } from '../services/api';
import { User } from '../types';
import UpgradeRequired from './UpgradeRequired';

// ─── Types ───────────────────────────────────────────────────────────────
interface Peer {
  ticker: string;
  name: string | null;
  sector: string | null;
  industry: string | null;
  pe: number | null;
  ps: number | null;
  ev_ebitda: number | null;
  revenue_growth_yoy: number | null;
  gross_margin: number | null;
}

type SourceTag = 'estimate' | 'actual' | 'live' | null;

interface RelvalInputs {
  ticker: string;
  company_name: string;
  sector: string | null;
  industry: string | null;
  estimate_year: number | null;
  inputs: {
    forward_eps: number | null;
    forward_revenue_b: number | null;
    forward_ebitda_b: number | null;
    net_debt_b: number | null;
    diluted_shares_m: number | null;
    current_price: number | null;
  };
  sources: Record<string, SourceTag>;
  trailing_pe: number | null;
}

interface RelvalResult {
  targets: { pe: number; ps: number; ev_ebitda: number };
  central_estimate: string;
  range: { low: number; high: number };
  current_price: number | null;
  upside_to_midpoint_pct: number | null;
  pe_method_reliable: boolean;
  pe_warning: string | null;
  sensitivity: {
    revenue_steps: number[];
    multiple_steps: number[];
    rows: { revenue_step: number; cells: number[] }[];
  };
  disclaimer: string;
}

interface Props {
  ticker: string;
  currentPrice?: number | null;
  user: User | null;
  onTickerChange?: (t: string) => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────
const median = (vals: (number | null | undefined)[]): number | null => {
  const a = vals.filter((v): v is number => v != null && isFinite(v)).sort((x, y) => x - y);
  if (!a.length) return null;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};

const numOrNull = (s: string): number | null => {
  if (s.trim() === '') return null;
  const n = Number(s);
  return isFinite(n) ? n : null;
};

const fmtMult = (v: number | null): string => (v == null ? '—' : `${v.toFixed(1)}×`);
const fmtPct = (v: number | null): string => (v == null ? '—' : `${v.toFixed(1)}%`);
const fmtUsd = (v: number | null | undefined): string =>
  v == null ? '—' : `$${v.toFixed(2)}`;

const SourceBadge: React.FC<{ src: SourceTag }> = ({ src }) => {
  if (src === 'estimate')
    return <span className="ml-2 text-[10px] font-medium text-orange-600 dark:text-orange-400">⚠ Estimate</span>;
  if (src === 'actual')
    return <span className="ml-2 text-[10px] font-medium text-green-600 dark:text-green-400">✓ Actual</span>;
  if (src === 'live')
    return <span className="ml-2 text-[10px] font-medium text-teal-600 dark:text-teal-400">● Live</span>;
  return null;
};

const inputClass =
  'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-600 text-gray-900 dark:text-white text-sm';

// ─── Component ───────────────────────────────────────────────────────────
const RelativeValuation: React.FC<Props> = ({ ticker, currentPrice, user, onTickerChange }) => {
  const [tickerInput, setTickerInput] = useState(ticker);
  useEffect(() => setTickerInput(ticker), [ticker]);
  const submitTicker = () => {
    const t = tickerInput.toUpperCase().trim();
    if (t && t !== ticker && onTickerChange) onTickerChange(t);
  };
  // Editable model inputs (kept as strings for controlled <input>s).
  const [form, setForm] = useState({
    forward_eps: '',
    forward_revenue_b: '',
    forward_ebitda_b: '',
    net_debt_b: '',
    diluted_shares_m: '',
    current_price: '',
  });
  const [sources, setSources] = useState<Record<string, SourceTag>>({});
  const [trailingPe, setTrailingPe] = useState<number | null>(null);
  const [companyName, setCompanyName] = useState('');
  const [subjectSector, setSubjectSector] = useState<string | null>(null);
  const [subjectIndustry, setSubjectIndustry] = useState<string | null>(null);
  const [estimateYear, setEstimateYear] = useState<number | null>(null);
  const [loadingInputs, setLoadingInputs] = useState(false);

  // Editable peer-median multiples (auto-filled from peers, user-overridable).
  const [medianPe, setMedianPe] = useState('');
  const [medianPs, setMedianPs] = useState('');
  const [medianEve, setMedianEve] = useState('');

  // Peer set.
  const [peers, setPeers] = useState<Peer[]>([]);
  const [peerInput, setPeerInput] = useState('');
  const [loadingPeers, setLoadingPeers] = useState(false);

  // Results.
  const [result, setResult] = useState<RelvalResult | null>(null);
  const [calculating, setCalculating] = useState(false);
  const [error, setError] = useState('');
  const [limitData, setLimitData] = useState<{ currentUsage: number; maxUsage: number } | null>(null);

  // ── Load pre-filled inputs when the ticker changes ──────────────────────
  const loadInputs = useCallback(async () => {
    if (!ticker) return;
    setLoadingInputs(true);
    setError('');
    setResult(null);
    try {
      const res = await relvalAPI.getInputs(ticker);
      const data: RelvalInputs = res.data;
      const i = data.inputs;
      setForm({
        forward_eps: i.forward_eps != null ? String(i.forward_eps) : '',
        forward_revenue_b: i.forward_revenue_b != null ? String(i.forward_revenue_b) : '',
        forward_ebitda_b: i.forward_ebitda_b != null ? String(i.forward_ebitda_b) : '',
        net_debt_b: i.net_debt_b != null ? String(i.net_debt_b) : '',
        diluted_shares_m: i.diluted_shares_m != null ? String(i.diluted_shares_m) : '',
        current_price:
          i.current_price != null ? String(i.current_price) : currentPrice != null ? String(currentPrice) : '',
      });
      setSources(data.sources || {});
      setTrailingPe(data.trailing_pe);
      setCompanyName(data.company_name || ticker);
      setSubjectSector(data.sector);
      setSubjectIndustry(data.industry);
      setEstimateYear(data.estimate_year);
    } catch (e: any) {
      setError(e.response?.data?.detail || 'Could not load inputs for this ticker.');
    } finally {
      setLoadingInputs(false);
    }
  }, [ticker, currentPrice]);

  useEffect(() => {
    loadInputs();
    setPeers([]);
    setMedianPe('');
    setMedianPs('');
    setMedianEve('');
  }, [loadInputs]);

  // ── Auto-fill median multiples from the (cut) peer set ──────────────────
  useEffect(() => {
    if (peers.length) {
      const mp = median(peers.map((p) => p.pe));
      const ms = median(peers.map((p) => p.ps));
      const me = median(peers.map((p) => p.ev_ebitda));
      if (mp != null) setMedianPe(mp.toFixed(2));
      if (ms != null) setMedianPs(ms.toFixed(2));
      if (me != null) setMedianEve(me.toFixed(2));
    }
  }, [peers]);

  // ── Peer fetching ───────────────────────────────────────────────────────
  const addPeerRatios = async (tickers: string[]) => {
    const fresh = tickers
      .map((t) => t.toUpperCase().trim())
      .filter((t) => t && t !== ticker.toUpperCase() && !peers.some((p) => p.ticker === t));
    if (!fresh.length) return;
    setLoadingPeers(true);
    setError('');
    try {
      const res = await relvalAPI.getPeerRatios(fresh);
      setPeers((prev) => [...prev, ...(res.data.peers || [])]);
    } catch (e: any) {
      setError(e.response?.data?.detail || 'Could not fetch peer ratios.');
    } finally {
      setLoadingPeers(false);
    }
  };

  const handleManualAdd = () => {
    const tickers = peerInput.split(/[\s,]+/).filter(Boolean);
    if (tickers.length) {
      addPeerRatios(tickers);
      setPeerInput('');
    }
  };

  const handlePullFromScreener = async () => {
    if (!subjectSector && !subjectIndustry) {
      setError('No sector/industry available for this ticker — add peers manually.');
      return;
    }
    setLoadingPeers(true);
    setError('');
    try {
      const criteria: any = {
        market_cap: { min: 300_000_000 },
        exclude_etfs: true,
        page_size: 25,
        sort_by: 'market_cap',
        sort_desc: true,
      };
      if (subjectIndustry) criteria.industry = [subjectIndustry];
      else if (subjectSector) criteria.sector = [subjectSector];
      const res = await screenerAPI.runScreen(criteria);
      const symbols: string[] = (res.data.results || [])
        .map((r: any) => r.symbol)
        .filter((s: string) => s && s !== ticker.toUpperCase());
      if (!symbols.length) {
        setError('Screener returned no peers for this sector/industry — add peers manually.');
        return;
      }
      await addPeerRatios(symbols.slice(0, 20));
    } catch (e: any) {
      setError(e.response?.data?.detail || 'Could not pull peers from screener.');
    } finally {
      setLoadingPeers(false);
    }
  };

  const removePeer = (t: string) => setPeers((prev) => prev.filter((p) => p.ticker !== t));

  // Live median preview (independent of the editable override fields).
  const livePe = median(peers.map((p) => p.pe));
  const livePs = median(peers.map((p) => p.ps));
  const liveEve = median(peers.map((p) => p.ev_ebitda));
  // Fundamental-context medians (decision-support only — not valuation inputs).
  const liveGrowth = median(peers.map((p) => p.revenue_growth_yoy));
  const liveMargin = median(peers.map((p) => p.gross_margin));
  // A peer is flagged a growth outlier when its growth clearly exceeds the set
  // median (>1.5×). Visual cue only — the cut stays the user's call.
  const isGrowthOutlier = (g: number | null): boolean =>
    g != null && liveGrowth != null && liveGrowth > 0 && g > liveGrowth * 1.5;

  // ── Calculate ─────────────────────────────────────────────────────────
  const handleCalculate = async () => {
    setError('');
    const payload = {
      fwd_eps: numOrNull(form.forward_eps),
      fwd_revenue_b: numOrNull(form.forward_revenue_b),
      fwd_ebitda_b: numOrNull(form.forward_ebitda_b),
      net_debt_b: numOrNull(form.net_debt_b),
      diluted_shares_m: numOrNull(form.diluted_shares_m),
      current_price: numOrNull(form.current_price),
      median_pe: numOrNull(medianPe),
      median_ps: numOrNull(medianPs),
      median_ev_ebitda: numOrNull(medianEve),
      trailing_pe: trailingPe,
    };

    const required: [string, number | null][] = [
      ['Forward EPS', payload.fwd_eps],
      ['Forward revenue', payload.fwd_revenue_b],
      ['Forward EBITDA', payload.fwd_ebitda_b],
      ['Net debt', payload.net_debt_b],
      ['Diluted shares', payload.diluted_shares_m],
      ['Median P/E', payload.median_pe],
      ['Median P/S', payload.median_ps],
      ['Median EV/EBITDA', payload.median_ev_ebitda],
    ];
    const missing = required.filter(([, v]) => v == null).map(([n]) => n);
    if (missing.length) {
      setError(`Missing required input(s): ${missing.join(', ')}.`);
      return;
    }
    if ((payload.diluted_shares_m as number) <= 0) {
      setError('Diluted shares must be greater than zero.');
      return;
    }

    setCalculating(true);
    try {
      const res = await relvalAPI.calculate(payload as any);
      setResult(res.data);
    } catch (e: any) {
      const detail = e.response?.data?.detail;
      if (e.response?.status === 403 && detail && typeof detail === 'object' && 'max_usage' in detail) {
        setLimitData({ currentUsage: detail.current_usage, maxUsage: detail.max_usage });
      } else {
        setError(typeof detail === 'string' ? detail : 'Could not calculate relative valuation.');
      }
    } finally {
      setCalculating(false);
    }
  };

  const setField = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  if (limitData) {
    return (
      <UpgradeRequired
        feature="Relative Valuation"
        currentTier={user?.subscription_tier || 'beginner'}
        limitReached={true}
        currentUsage={limitData.currentUsage}
        maxUsage={limitData.maxUsage}
        onBack={() => setLimitData(null)}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Intro / framing */}
      <div className="bg-white dark:bg-gray-700 rounded-xl shadow-md p-6">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">
          Relative Valuation{ticker ? ` — ${companyName || ticker}` : ''}
        </h2>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
          Applies peer-<strong>median</strong> multiples to forward estimates across three methods
          (P/E, P/S, EV/EBITDA) to produce a target-price <strong>range</strong>. The spread between
          methods — not any single number — is the point.
        </p>
        {onTickerChange && (
          <div className="flex gap-2 mt-4 max-w-sm">
            <input
              type="text"
              value={tickerInput}
              onChange={(e) => setTickerInput(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === 'Enter' && submitTicker()}
              placeholder="e.g., AAPL"
              className={inputClass}
            />
            <button
              onClick={submitTicker}
              className="px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium whitespace-nowrap"
            >
              Load
            </button>
          </div>
        )}
      </div>

      {!ticker && (
        <div className="bg-white dark:bg-gray-700 rounded-xl shadow-md p-6 text-sm text-gray-500 dark:text-gray-400">
          Enter a ticker above to load forward estimates and build a peer set.
        </div>
      )}

      {ticker && (
      <>
      {/* ── Model inputs ──────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-gray-700 rounded-xl shadow-md p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Forward Estimates &amp; Balance Sheet
          {estimateYear && (
            <span className="ml-2 text-xs font-normal text-gray-500 dark:text-gray-400">
              (estimates for FY{estimateYear})
            </span>
          )}
        </h3>
        {loadingInputs ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">Loading inputs…</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Forward EPS <SourceBadge src={sources.forward_eps} />
              </label>
              <input className={inputClass} type="number" step="0.01" value={form.forward_eps}
                onChange={(e) => setField('forward_eps', e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Forward Revenue ($B) <SourceBadge src={sources.forward_revenue_b} />
              </label>
              <input className={inputClass} type="number" step="0.01" value={form.forward_revenue_b}
                onChange={(e) => setField('forward_revenue_b', e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Forward EBITDA ($B)
                <SourceBadge src={sources.forward_ebitda_b} />
                {sources.forward_ebitda_b == null && (
                  <span className="ml-2 text-[10px] font-medium text-gray-500 dark:text-gray-400">Manual</span>
                )}
              </label>
              <input className={inputClass} type="number" step="0.01" value={form.forward_ebitda_b}
                onChange={(e) => setField('forward_ebitda_b', e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Net Debt ($B) <SourceBadge src={sources.net_debt_b} />
              </label>
              <input className={inputClass} type="number" step="0.01" value={form.net_debt_b}
                onChange={(e) => setField('net_debt_b', e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Diluted Shares (M) <SourceBadge src={sources.diluted_shares_m} />
              </label>
              <input className={inputClass} type="number" step="0.1" value={form.diluted_shares_m}
                onChange={(e) => setField('diluted_shares_m', e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Current Price <SourceBadge src={sources.current_price} />
              </label>
              <input className={inputClass} type="number" step="0.01" value={form.current_price}
                onChange={(e) => setField('current_price', e.target.value)} />
            </div>
          </div>
        )}
      </div>

      {/* ── Peer set ──────────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-gray-700 rounded-xl shadow-md p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">Peer Set</h3>
        <p className="text-xs text-gray-600 dark:text-gray-400 mb-4">
          Pull comps by sector/industry or add them manually, then <strong>remove any bad comps</strong>{' '}
          before the medians are used. Industry tags from the data vendor are imperfect — hand-cutting
          mis-tagged companies is part of the job. The <strong>revenue-growth</strong> and{' '}
          <strong>gross-margin</strong> columns are context, not inputs: a size-matched name with a very
          different growth or margin profile is what skews a multiple median. Rows whose growth runs well
          above the set median are flagged <span className="text-amber-500">⚡</span>.
        </p>

        <div className="flex flex-wrap items-center gap-2 mb-4">
          <button
            onClick={handlePullFromScreener}
            disabled={loadingPeers || (!subjectSector && !subjectIndustry)}
            className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            {loadingPeers ? 'Loading…' : `Pull peers (${subjectIndustry || subjectSector || 'n/a'})`}
          </button>
          <div className="flex items-center gap-2">
            <input
              className={inputClass + ' !w-48'}
              placeholder="Add tickers e.g. NKE, SKX"
              value={peerInput}
              onChange={(e) => setPeerInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleManualAdd()}
            />
            <button
              onClick={handleManualAdd}
              disabled={loadingPeers}
              className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            >
              Add
            </button>
          </div>
        </div>

        {peers.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-600">
                  <th className="py-2 pr-4">Ticker</th>
                  <th className="py-2 pr-4">Name</th>
                  <th className="py-2 pr-4">Industry</th>
                  <th className="py-2 pr-4 text-right">P/E</th>
                  <th className="py-2 pr-4 text-right">P/S</th>
                  <th className="py-2 pr-4 text-right">EV/EBITDA</th>
                  <th className="py-2 pr-4 text-right">Rev Growth</th>
                  <th className="py-2 pr-4 text-right">Gross Margin</th>
                  <th className="py-2"></th>
                </tr>
              </thead>
              <tbody>
                {peers.map((p) => {
                  const outlier = isGrowthOutlier(p.revenue_growth_yoy);
                  return (
                    <tr
                      key={p.ticker}
                      className={`border-b border-gray-100 dark:border-gray-600/50 ${
                        outlier ? 'bg-amber-50 dark:bg-amber-900/20' : ''
                      }`}
                    >
                      <td className="py-2 pr-4 font-semibold text-gray-900 dark:text-white">{p.ticker}</td>
                      <td className="py-2 pr-4 text-gray-700 dark:text-gray-300 max-w-[180px] truncate">{p.name || '—'}</td>
                      <td className="py-2 pr-4 text-gray-500 dark:text-gray-400 text-xs max-w-[160px] truncate">{p.industry || '—'}</td>
                      <td className="py-2 pr-4 text-right tabular-nums text-gray-900 dark:text-white">{fmtMult(p.pe)}</td>
                      <td className="py-2 pr-4 text-right tabular-nums text-gray-900 dark:text-white">{fmtMult(p.ps)}</td>
                      <td className="py-2 pr-4 text-right tabular-nums text-gray-900 dark:text-white">{fmtMult(p.ev_ebitda)}</td>
                      <td className="py-2 pr-4 text-right tabular-nums text-gray-900 dark:text-white">
                        <span className="inline-flex items-center gap-1 justify-end">
                          {outlier && (
                            <span title="Growth well above the peer median — check comparability before keeping" className="text-amber-500">⚡</span>
                          )}
                          {fmtPct(p.revenue_growth_yoy)}
                        </span>
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums text-gray-900 dark:text-white">{fmtPct(p.gross_margin)}</td>
                      <td className="py-2 text-right">
                        <button
                          onClick={() => removePeer(p.ticker)}
                          className="text-red-500 hover:text-red-700 font-bold px-2"
                          title="Remove this comp"
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  );
                })}
                <tr className="border-t-2 border-gray-300 dark:border-gray-500 font-semibold bg-gray-50 dark:bg-gray-800/40">
                  <td className="py-2 pr-4 text-gray-900 dark:text-white" colSpan={3}>
                    Median ({peers.length} {peers.length === 1 ? 'peer' : 'peers'})
                  </td>
                  <td className="py-2 pr-4 text-right tabular-nums text-teal-700 dark:text-teal-300">{fmtMult(livePe)}</td>
                  <td className="py-2 pr-4 text-right tabular-nums text-teal-700 dark:text-teal-300">{fmtMult(livePs)}</td>
                  <td className="py-2 pr-4 text-right tabular-nums text-teal-700 dark:text-teal-300">{fmtMult(liveEve)}</td>
                  <td className="py-2 pr-4 text-right tabular-nums text-gray-500 dark:text-gray-400">{fmtPct(liveGrowth)}</td>
                  <td className="py-2 pr-4 text-right tabular-nums text-gray-500 dark:text-gray-400">{fmtPct(liveMargin)}</td>
                  <td></td>
                </tr>
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            No peers added yet. Pull a set or enter median multiples directly below.
          </p>
        )}

        {/* Editable median multiples (auto-filled from peers, overridable) */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Median P/E ×</label>
            <input className={inputClass} type="number" step="0.1" value={medianPe} onChange={(e) => setMedianPe(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Median P/S ×</label>
            <input className={inputClass} type="number" step="0.1" value={medianPs} onChange={(e) => setMedianPs(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Median EV/EBITDA ×</label>
            <input className={inputClass} type="number" step="0.1" value={medianEve} onChange={(e) => setMedianEve(e.target.value)} />
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-600 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      <button
        onClick={handleCalculate}
        disabled={calculating}
        className="w-full px-6 py-3 bg-purple-600 hover:bg-purple-700 dark:bg-purple-500 dark:hover:bg-purple-600 text-white rounded-lg font-semibold transition-colors disabled:opacity-50"
      >
        {calculating ? 'Calculating…' : '📐 Calculate Valuation Range'}
      </button>

      {/* ── Results ───────────────────────────────────────────────────── */}
      {result && <RelvalResults result={result} />}
      </>
      )}
    </div>
  );
};

// ─── Results sub-view ──────────────────────────────────────────────────────
const RelvalResults: React.FC<{ result: RelvalResult }> = ({ result }) => {
  const { targets, range, current_price, upside_to_midpoint_pct } = result;
  const methods = [
    { key: 'pe', label: 'P/E', value: targets.pe, central: result.central_estimate === 'pe' },
    { key: 'ps', label: 'P/S', value: targets.ps, central: result.central_estimate === 'ps' },
    { key: 'ev_ebitda', label: 'EV/EBITDA', value: targets.ev_ebitda, central: result.central_estimate === 'ev_ebitda' },
  ];

  // Range-bar scale spans all targets + current price, with a little padding.
  const allVals = [range.low, range.high, ...(current_price ? [current_price] : [])];
  const lo = Math.min(...allVals);
  const hi = Math.max(...allVals);
  const span = hi - lo || 1;
  const pad = span * 0.08;
  const axisLo = lo - pad;
  const axisHi = hi + pad;
  const pct = (v: number) => ((v - axisLo) / (axisHi - axisLo)) * 100;

  // Sensitivity color scale.
  const cells = result.sensitivity.rows.flatMap((r) => r.cells);
  const cMin = Math.min(...cells);
  const cMax = Math.max(...cells);
  const cellColor = (v: number) => {
    const t = cMax === cMin ? 0.5 : (v - cMin) / (cMax - cMin); // 0..1
    // teal scale: light → saturated
    const light = 92 - t * 42; // 92% → 50%
    return `hsl(174, 60%, ${light}%)`;
  };
  const stepLabel = (s: number) => (s === 0 ? 'Base' : `${s > 0 ? '+' : ''}${Math.round(s * 100)}%`);

  return (
    <div className="space-y-6">
      {/* Range headline */}
      <div className="bg-white dark:bg-gray-700 rounded-xl shadow-md p-6">
        <div className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
          Target-Price Range
        </div>
        <div className="mt-1 text-4xl font-bold text-gray-900 dark:text-white">
          {fmtUsd(range.low)} <span className="text-gray-400">–</span> {fmtUsd(range.high)}
        </div>
        {current_price != null && (
          <div className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            Current price {fmtUsd(current_price)}
            {upside_to_midpoint_pct != null && (
              <span className={upside_to_midpoint_pct >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
                {' '}· {upside_to_midpoint_pct >= 0 ? '+' : ''}{upside_to_midpoint_pct}% to midpoint
              </span>
            )}
          </div>
        )}

        {/* Range bar */}
        <div className="relative mt-8 mb-10 h-3">
          <div className="absolute inset-0 rounded-full bg-gray-200 dark:bg-gray-600" />
          <div
            className="absolute h-3 rounded-full bg-gradient-to-r from-teal-400 to-teal-600"
            style={{ left: `${pct(range.low)}%`, width: `${pct(range.high) - pct(range.low)}%` }}
          />
          {methods.map((m) => (
            <div
              key={m.key}
              className="absolute -top-1.5"
              style={{ left: `${pct(m.value)}%`, transform: 'translateX(-50%)' }}
            >
              <div className={`w-2 h-6 rounded ${m.central ? 'bg-purple-600' : 'bg-gray-800 dark:bg-white'}`} />
              <div className="mt-1 text-[10px] whitespace-nowrap text-gray-600 dark:text-gray-300 -translate-x-1/2 ml-1">
                {m.label} {fmtUsd(m.value)}
              </div>
            </div>
          ))}
          {current_price != null && (
            <div className="absolute -bottom-7" style={{ left: `${pct(current_price)}%`, transform: 'translateX(-50%)' }}>
              <div className="w-0.5 h-6 bg-red-500 mx-auto" />
              <div className="text-[10px] whitespace-nowrap text-red-500">Now {fmtUsd(current_price)}</div>
            </div>
          )}
        </div>

        {/* Method cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {methods.map((m) => (
            <div
              key={m.key}
              className={`rounded-lg p-4 border ${
                m.central
                  ? 'border-purple-400 dark:border-purple-500 bg-purple-50 dark:bg-purple-900/20'
                  : 'border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800/40'
              }`}
            >
              <div className="text-xs font-medium text-gray-500 dark:text-gray-400 flex items-center gap-2">
                {m.label} method
                {m.central && (
                  <span className="text-[9px] font-semibold text-purple-700 dark:text-purple-300 bg-purple-200 dark:bg-purple-800/60 px-1.5 py-0.5 rounded">
                    CENTRAL
                  </span>
                )}
              </div>
              <div className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{fmtUsd(m.value)}</div>
              {m.key === 'pe' && !result.pe_method_reliable && (
                <div className="text-[10px] text-orange-600 dark:text-orange-400 mt-1">⚠ Unreliable for this name</div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* P/E reliability warning */}
      {!result.pe_method_reliable && result.pe_warning && (
        <div className="bg-orange-50 dark:bg-orange-900/30 border border-orange-300 dark:border-orange-600 text-orange-800 dark:text-orange-300 px-4 py-3 rounded-lg text-sm">
          <strong>P/E method caution:</strong> {result.pe_warning}
        </div>
      )}

      {/* Sensitivity grid */}
      <div className="bg-white dark:bg-gray-700 rounded-xl shadow-md p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">P/S Sensitivity (±10%)</h3>
        <p className="text-xs text-gray-600 dark:text-gray-400 mb-4">
          How the P/S target moves as the multiple and forward revenue each flex ±10%. This is where you
          see which assumption your thesis really rides on.
        </p>
        <div className="overflow-x-auto">
          <table className="text-sm border-collapse">
            <thead>
              <tr>
                <th className="p-2 text-xs text-gray-500 dark:text-gray-400 font-medium text-right">Rev ↓ / Mult →</th>
                {result.sensitivity.multiple_steps.map((s) => (
                  <th key={s} className="p-2 text-xs text-gray-500 dark:text-gray-400 font-medium text-center min-w-[64px]">
                    {stepLabel(s)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.sensitivity.rows.map((row) => (
                <tr key={row.revenue_step}>
                  <td className="p-2 text-xs text-gray-500 dark:text-gray-400 font-medium text-right">
                    {stepLabel(row.revenue_step)}
                  </td>
                  {row.cells.map((c, j) => {
                    const isBase = row.revenue_step === 0 && result.sensitivity.multiple_steps[j] === 0;
                    return (
                      <td
                        key={j}
                        className={`p-2 text-center tabular-nums text-gray-900 ${isBase ? 'font-bold ring-2 ring-purple-500' : ''}`}
                        style={{ backgroundColor: cellColor(c) }}
                      >
                        {fmtUsd(c)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Disclaimer */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg p-4 text-sm text-blue-800 dark:text-blue-300">
        <strong>This is a valuation range, not a price target.</strong> {result.disclaimer}
      </div>
    </div>
  );
};

export default RelativeValuation;
