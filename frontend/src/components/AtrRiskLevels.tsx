import React, { useState, useEffect, useMemo, useRef } from 'react';
import { PortfolioTransaction } from '../services/api';
import { PortfolioPosition } from '../types';

// ─── Types ───────────────────────────────────────────────────────────────

/**
 * Entry-independent levels from the backend. Everything entry-relative is
 * computed here in the browser, so it recomputes on keystroke with no refetch
 * and the formula exists in exactly one language.
 */
export interface AtrRisk {
  atr: number;
  atr_percent: number;
  lookback: number;
  multiplier: number;
  highest_high: number;
  lowest_low: number;
  chandelier_long: number;
  chandelier_short: number;
  long_stop_distance_percent: number | null;
  short_stop_distance_percent: number | null;
  wide_stop: boolean;
  description: string;
}

interface Props {
  atr?: { value: number; percent: number; volatility: string; description: string } | null;
  atrRisk?: AtrRisk | null;
  currentPrice: number;
  analysisDate: string;
  ticker: string;
  position?: PortfolioPosition | null;
  lots?: PortfolioTransaction[];
  lotsTruncated?: boolean;
  /** True when buys exist on record but all predate a position restatement. */
  lotsBeforeAdjust?: boolean;
}

type Direction = 'long' | 'short';

interface Anchor {
  id: string;
  label: string;
  price: number;
}

const MULTIPLIERS = [1.5, 2, 2.5, 3];
const LS_ACCOUNT = 'nwc.atrRisk.accountSize';
const LS_RISK = 'nwc.atrRisk.riskPercent';

// ─── Helpers ─────────────────────────────────────────────────────────────

const lsGet = (key: string, fallback: string): string => {
  try {
    return window.localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
};

const lsSet = (key: string, value: string): void => {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* private mode — the calculator works fine without persistence */
  }
};

const money = (n: number): string =>
  '$' + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const whole = (n: number): string => n.toLocaleString(undefined, { maximumFractionDigits: 0 });

const shortDate = (iso: string): string => {
  const d = new Date(iso + 'T00:00:00');
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

/** Positive finite or null. Deliberately NOT `parseFloat(v) || 0` — an empty
 *  field must not become $0 and produce a negative stop level. */
const num = (v: string): number | null => {
  const n = Number(v);
  return v.trim() !== '' && Number.isFinite(n) && n > 0 ? n : null;
};

// ─── Styling (matches TechnicalAnalysis.tsx) ─────────────────────────────

const CARD =
  'bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 p-6 border dark:border-gray-500';
const INPUT =
  'w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-600 text-gray-900 dark:text-white';
const LABEL = 'block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1';
const HELP = 'text-xs text-gray-500 dark:text-gray-400 mt-1';
const PANEL = 'p-4 bg-gray-50 dark:bg-gray-800 rounded-lg';
const AMBER =
  'mt-3 p-3 rounded-lg text-sm bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-300';
const SEG_ON =
  'bg-primary-600 text-white border-primary-600 dark:bg-primary-500 dark:border-primary-500';
const SEG_OFF =
  'bg-gray-100 dark:bg-gray-600 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-500 hover:border-primary-400 dark:hover:border-primary-400';

const Row: React.FC<{ label: string; value: React.ReactNode; strong?: boolean }> = ({
  label,
  value,
  strong,
}) => (
  <div className="flex justify-between items-center py-1.5">
    <span className="text-gray-600 dark:text-gray-400">{label}</span>
    <span
      className={
        strong
          ? 'font-bold text-lg text-gray-900 dark:text-white'
          : 'font-semibold text-gray-900 dark:text-white'
      }
    >
      {value}
    </span>
  </div>
);

// ─── Component ───────────────────────────────────────────────────────────

const AtrRiskLevels: React.FC<Props> = ({
  atr,
  atrRisk,
  currentPrice,
  analysisDate,
  ticker,
  position,
  lots,
  lotsTruncated,
  lotsBeforeAdjust,
}) => {
  // Anchors: average cost (whole-position basis), each real BUY lot, last close.
  const anchors = useMemo<Anchor[]>(() => {
    const out: Anchor[] = [];
    if (position && position.buy_price > 0) {
      out.push({
        id: 'avg',
        label:
          'Average cost — ' +
          money(position.buy_price) +
          ' · ' +
          whole(position.quantity) +
          ' sh · whole-position basis',
        price: position.buy_price,
      });
    }
    (lots ?? []).forEach((lot, i) => {
      out.push({
        id: 'lot-' + lot.id,
        label:
          (i === 0 ? 'Last buy' : 'Earlier buy') +
          ' — ' +
          money(lot.price) +
          ' · ' +
          whole(lot.quantity) +
          ' sh · ' +
          shortDate(lot.transaction_date),
        price: lot.price,
      });
    });
    out.push({
      id: 'last-close',
      label: 'Last close — ' + money(currentPrice) + ' · ' + analysisDate,
      price: currentPrice,
    });
    return out;
  }, [position, lots, currentPrice, analysisDate]);

  const defaultAnchor = useMemo(
    () => anchors.find((a) => a.id.startsWith('lot-')) ?? anchors[0],
    [anchors]
  );

  const [anchorId, setAnchorId] = useState<string>(() => defaultAnchor?.id ?? 'last-close');
  const [entry, setEntry] = useState<string>(() =>
    (defaultAnchor?.price ?? currentPrice).toFixed(2)
  );
  // Set by typing OR by picking an anchor — both are explicit user choices
  // that late-arriving portfolio data must not overwrite.
  const [dirty, setDirty] = useState(false);
  const seededFor = useRef<string | null>(null);
  const [direction, setDirection] = useState<Direction>('long');
  const [multiplier, setMultiplier] = useState<number>(2);
  const [accountSize, setAccountSize] = useState<string>(() => lsGet(LS_ACCOUNT, ''));
  const [riskPercent, setRiskPercent] = useState<string>(() => lsGet(LS_RISK, '1'));

  // One effect, so a ticker change and a late portfolio fetch can't race:
  //  - new ticker        -> always re-seed and clear the choice
  //  - same ticker, dirty -> the user chose; leave it alone
  //  - same ticker, clean -> anchors arrived late, seed from the best one
  useEffect(() => {
    const isNewTicker = seededFor.current !== ticker;
    if (isNewTicker) seededFor.current = ticker;
    else if (dirty) return;
    if (isNewTicker) setDirty(false);
    setAnchorId(defaultAnchor?.id ?? 'last-close');
    setEntry((defaultAnchor?.price ?? currentPrice).toFixed(2));
  }, [ticker, dirty, defaultAnchor?.id, defaultAnchor?.price, currentPrice]);

  const selectAnchor = (id: string) => {
    const a = anchors.find((x) => x.id === id);
    setAnchorId(id);
    setDirty(true);
    if (a) setEntry(a.price.toFixed(2));
  };

  const onEntryChange = (v: string) => {
    setEntry(v);
    setDirty(true);
    setAnchorId('custom');
  };

  const persistAccount = (v: string) => {
    setAccountSize(v);
    lsSet(LS_ACCOUNT, v);
  };

  const persistRisk = (v: string) => {
    setRiskPercent(v);
    lsSet(LS_RISK, v);
  };

  // ── Derived math ──────────────────────────────────────────────────────
  const calc = useMemo(() => {
    const a = atr?.value;
    const E = num(entry);
    if (!a || a <= 0 || E === null) return null;

    const R = multiplier * a;
    // A long stop at or below $0 is not a number worth clamping into existence.
    if (direction === 'long' && R >= E) return { impossible: true as const, R, E };

    const stop = direction === 'long' ? E - R : E + R;
    const levels = [1, 2, 3].map((n) => ({
      n,
      price: direction === 'long' ? E + n * R : E - n * R,
      pct: ((n * R) / E) * 100,
    }));

    const acct = num(accountSize);
    const riskPct = num(riskPercent);
    const sizingOk = acct !== null && riskPct !== null && riskPct <= 100;
    const riskDollars = sizingOk ? acct! * (riskPct! / 100) : null;
    const shares = riskDollars !== null ? Math.floor(riskDollars / R) : null;
    const capital = shares !== null ? shares * E : null;

    return {
      impossible: false as const,
      R,
      E,
      stop,
      stopPct: (R / E) * 100,
      wideStop: R / E >= 0.25,
      levels,
      sizingOk,
      riskDollars,
      shares,
      capital,
      acct,
      riskPct,
      overCapital: capital !== null && acct !== null && capital > acct,
    };
  }, [atr?.value, entry, multiplier, direction, accountSize, riskPercent]);

  // ── Open risk on a position already held (long only) ──────────────────
  const openRisk = useMemo(() => {
    if (!calc || calc.impossible) return null;
    if (!position || position.quantity <= 0 || direction !== 'long') return null;
    return {
      qty: position.quantity,
      cost: position.buy_price,
      risk: (currentPrice - calc.stop) * position.quantity,
      triggersNow: calc.stop >= currentPrice,
      stopVsCost: calc.stop - position.buy_price,
    };
  }, [calc, position, direction, currentPrice]);

  const heldButShort = !!position && position.quantity > 0 && direction === 'short';

  // ── Null state: say why, don't hide the card ──────────────────────────
  if (!atr?.value || !atrRisk) {
    return (
      <div id="chart-atr-risk" className={CARD}>
        <h4 className="text-lg font-bold text-gray-900 dark:text-white mb-2">
          📐 ATR Stop &amp; Position-Size Calculator
        </h4>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Not enough price history — the 22-bar trailing stop needs at least 22 sessions.
        </p>
      </div>
    );
  }

  const chandelier = direction === 'long' ? atrRisk.chandelier_long : atrRisk.chandelier_short;
  const anchorPoint = direction === 'long' ? atrRisk.highest_high : atrRisk.lowest_low;

  return (
    <div id="chart-atr-risk" className={CARD}>
      <h4 className="text-lg font-bold text-gray-900 dark:text-white mb-2">
        📐 ATR Stop &amp; Position-Size Calculator
      </h4>
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
        Arithmetic on the current ATR. These are volatility distances from a price you enter — not
        entry or exit recommendations. The platform doesn&apos;t know your timeframe or your risk
        tolerance.
      </p>
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
        ATR measures how far this security typically moves in a session. Multiplying it gives a stop
        distance scaled to that movement instead of a round number — a 2× ATR stop sits far enough
        away that ordinary daily noise shouldn&apos;t reach it. Wider isn&apos;t safer: a wider stop
        means a larger loss if it&apos;s hit. ATR is backward-looking and carries no direction, so
        none of these levels implies price will reach any of them.
      </p>

      {/* ── Inputs ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div>
          <label className={LABEL} htmlFor="atr-entry">
            Entry price
          </label>
          <input
            id="atr-entry"
            type="number"
            inputMode="decimal"
            step="0.01"
            value={entry}
            onChange={(e) => onEntryChange(e.target.value)}
            className={INPUT}
          />
          <p className={HELP}>
            Seeded from the {analysisDate} close. Enter your actual fill price.
          </p>
        </div>

        <div>
          <label className={LABEL} htmlFor="atr-anchor">
            Entry anchor
          </label>
          <select
            id="atr-anchor"
            value={anchorId}
            onChange={(e) => selectAnchor(e.target.value)}
            className={INPUT}
          >
            {anchorId === 'custom' && <option value="custom">Custom — your own price</option>}
            {anchors.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
          <p className={HELP}>
            Average cost is your whole-position basis. An individual buy is what you actually paid
            on that tranche. Pick whichever the stop is for, or type your own price.
            {lotsBeforeAdjust &&
              ' Earlier buys sit before a position restatement, so they no longer describe this holding.'}
            {lotsTruncated && ' Showing the 100 most recent ledger rows.'}
          </p>
        </div>

        <div>
          <span className={LABEL}>Direction</span>
          <div className="grid grid-cols-2 gap-2">
            {(['long', 'short'] as Direction[]).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDirection(d)}
                className={
                  'p-2 rounded-lg font-semibold text-sm transition-all border-2 capitalize ' +
                  (direction === d ? SEG_ON : SEG_OFF)
                }
              >
                {d}
              </button>
            ))}
          </div>
        </div>

        <div>
          <span className={LABEL}>ATR multiple</span>
          <div className="grid grid-cols-4 gap-2">
            {MULTIPLIERS.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMultiplier(m)}
                className={
                  'p-2 rounded-lg font-semibold text-sm transition-all border-2 ' +
                  (multiplier === m ? SEG_ON : SEG_OFF)
                }
              >
                {m}×
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Levels ─────────────────────────────────────────────────────── */}
      {calc === null ? (
        <div className={PANEL + ' text-sm text-gray-600 dark:text-gray-400'}>
          Enter a price above $0.
        </div>
      ) : calc.impossible ? (
        <div className={AMBER}>
          {multiplier}× ATR ({money(calc.R)}) is larger than the entry price ({money(calc.E)}). A
          volatility-scaled stop isn&apos;t meaningful at this price.
        </div>
      ) : (
        <>
          <div className={PANEL}>
            <Row label={'Stop level (' + multiplier + '× ATR)'} value={money(calc.stop)} strong />
            <Row label="Stop distance" value={money(calc.R) + ' (' + calc.stopPct.toFixed(1) + '%)'} />
            <Row
              label={
                'Trailing stop — ' +
                atrRisk.lookback +
                '-bar chandelier (' +
                atrRisk.multiplier +
                '× ATR)'
              }
              value={money(chandelier)}
            />
            <p className={HELP}>
              {money(Math.abs(anchorPoint - chandelier))}{' '}
              {direction === 'long' ? 'below' : 'above'} the {atrRisk.lookback}-bar{' '}
              {direction === 'long' ? 'high' : 'low'} of {money(anchorPoint)}. It ratchets{' '}
              {direction === 'long' ? 'up as that high rises' : 'down as that low falls'} and never
              moves back. Fixed at the standard {atrRisk.lookback}-bar / {atrRisk.multiplier}×
              convention.
            </p>
          </div>

          {calc.wideStop && (
            <div className={AMBER}>
              This stop sits {calc.stopPct.toFixed(0)}% {direction === 'long' ? 'below' : 'above'}{' '}
              entry. That&apos;s the volatility, not a recommendation — a stop this wide means far
              more loss per share if it&apos;s reached.
            </div>
          )}

          <div className={'mt-4 ' + PANEL}>
            <h5 className="font-bold text-gray-900 dark:text-white mb-1">
              ATR multiples from entry
            </h5>
            <p className={HELP + ' mb-2'}>
              R is your stop distance, {money(calc.R)}. 2R means price has moved twice your risk in
              your favour. Arithmetic, not forecasts.
            </p>
            {calc.levels.map((l) => (
              <Row
                key={l.n}
                label={l.n + 'R'}
                value={money(l.price) + ' (' + l.pct.toFixed(1) + '%)'}
              />
            ))}
          </div>

          {/* ── Position sizing ──────────────────────────────────────── */}
          <div className={'mt-4 ' + PANEL}>
            <h5 className="font-bold text-gray-900 dark:text-white mb-3">Position size</h5>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-3">
              <div>
                <label className={LABEL} htmlFor="atr-account">
                  Account size
                </label>
                <input
                  id="atr-account"
                  type="number"
                  inputMode="decimal"
                  step="100"
                  placeholder="50000"
                  value={accountSize}
                  onChange={(e) => persistAccount(e.target.value)}
                  className={INPUT}
                />
              </div>
              <div>
                <label className={LABEL} htmlFor="atr-risk-pct">
                  Risk per trade (%)
                </label>
                <input
                  id="atr-risk-pct"
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  value={riskPercent}
                  onChange={(e) => persistRisk(e.target.value)}
                  className={INPUT}
                />
              </div>
            </div>

            {!calc.sizingOk ? (
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Enter an account size and a risk percentage between 0 and 100.
              </p>
            ) : calc.shares === 0 ? (
              <div className={AMBER}>
                At {money(calc.riskDollars!)} of risk and a {money(calc.R)} stop distance, this
                position rounds to zero shares. Either the risk budget is too small or the stop is
                too wide for it.
              </div>
            ) : (
              <>
                <Row label="Position size" value={whole(calc.shares!) + ' shares'} strong />
                <Row
                  label="Amount at risk"
                  value={
                    money(calc.riskDollars!) +
                    ' (' +
                    calc.riskPct!.toFixed(1) +
                    '% of ' +
                    money(calc.acct!) +
                    ')'
                  }
                />
                <Row
                  label="Capital deployed"
                  value={
                    money(calc.capital!) +
                    ' (' +
                    ((calc.capital! / calc.acct!) * 100).toFixed(1) +
                    '% of account)'
                  }
                />
                {calc.overCapital && (
                  <div className={AMBER}>
                    This share count would need {money(calc.capital!)} of capital against a{' '}
                    {money(calc.acct!)} account. Risk-based sizing doesn&apos;t check buying power —
                    size by whichever limit binds first.
                  </div>
                )}
              </>
            )}
            <p className={HELP + ' mt-2'}>
              Share count = (account × risk %) ÷ stop distance. It answers &quot;how many shares
              keeps my loss at that amount if the stop is hit&quot; — nothing more. It doesn&apos;t
              check buying power, commissions, slippage, or whether the trade is a good idea.
            </p>
          </div>

          {/* ── The position already held ────────────────────────────── */}
          {heldButShort && (
            <div className={'mt-4 ' + PANEL + ' text-sm text-gray-600 dark:text-gray-400'}>
              Open risk is shown for long positions — the portfolio doesn&apos;t track shorts.
            </div>
          )}

          {openRisk && (
            <div className={'mt-4 ' + PANEL}>
              <h5 className="font-bold text-gray-900 dark:text-white mb-1">
                Your existing position
              </h5>
              <p className={HELP + ' mb-2'}>
                Sizing above is for a new position and doesn&apos;t net against the{' '}
                {whole(openRisk.qty)} shares you already hold.
              </p>
              <Row
                label="You hold"
                value={whole(openRisk.qty) + ' sh @ ' + money(openRisk.cost) + ' avg'}
              />
              {openRisk.triggersNow ? (
                <div className={AMBER}>
                  This stop is above the current price of {money(currentPrice)} — it would trigger
                  immediately.
                </div>
              ) : (
                <>
                  <Row label="Open risk at this stop" value={money(openRisk.risk)} strong />
                  <p className={HELP}>
                    From {money(currentPrice)} to the stop, × {whole(openRisk.qty)} sh.
                  </p>
                </>
              )}
              <Row
                label="Stop vs your cost"
                value={
                  <span
                    className={
                      openRisk.stopVsCost >= 0
                        ? 'text-green-600 dark:text-green-400'
                        : 'text-red-500'
                    }
                  >
                    {openRisk.stopVsCost >= 0 ? '+' : '−'}
                    {money(Math.abs(openRisk.stopVsCost))}{' '}
                    {openRisk.stopVsCost >= 0 ? 'above' : 'below'}
                  </span>
                }
              />
              {openRisk.stopVsCost > 0 && (
                <p className="text-xs text-green-700 dark:text-green-400 mt-1">
                  This stop is {money(openRisk.stopVsCost)} above your average cost — if it&apos;s
                  hit, the position closes at a gain before costs.
                </p>
              )}
            </div>
          )}
        </>
      )}

      <p className={HELP + ' mt-4'}>
        Levels update as you type. Nothing here is saved to your account, sent anywhere, or used to
        place an order.
      </p>
    </div>
  );
};

export default AtrRiskLevels;
