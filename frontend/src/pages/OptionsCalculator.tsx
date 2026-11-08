// @ts-nocheck
import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { authAPI, stocksAPI } from "../services/api";
import NavBar from "../components/NavBar";
import { useTheme } from "../contexts/ThemeContext";
import UpgradeRequired from "../components/UpgradeRequired";
import { lowestTierWith, planIncludes } from "../data/pricingTiers";
import { setActiveTicker } from "../utils/activeTicker";
import { bsPrice, bsGreeks, binomialPrice, impliedVol } from "../utils/blackScholes";
import { expiryPnl, summarizePayoff } from "../utils/spreadPayoff";
import { formatUsd } from "../utils/currency";
import { strikeStep, roundStrike, defaultVerticalStrikes, defaultCondorStrikes, isPlausibleStrike } from "../utils/strikes";

// Pricing math (Black-Scholes, binomial, implied vol) lives in utils/blackScholes.ts,
// shared with the DCF page's "Trade This" suggestion.

// ─── Color System ───
const CDark = {
  bg: "#1f2937",          // gray-800 — main page bg
  card: "#374151",        // gray-700 — card bg
  cardAlt: "#1f2937",     // gray-800 — nested/alt bg
  border: "#4b5563",      // gray-600
  borderLight: "#6b7280", // gray-500
  accent: "#2dd4bf",      // teal-400
  accentHover: "#14b8a6", // teal-500
  accentStrong: "#0d9488", // teal-600
  accentGlow: "rgba(45,212,191,0.1)",
  accentGlow2: "rgba(45,212,191,0.2)",
  text: "#f9fafb",        // gray-50
  textSec: "#d1d5db",     // gray-300
  textDim: "#9ca3af",     // gray-400
  textMuted: "#6b7280",   // gray-500
  green: "#22c55e",
  greenDim: "#166534",
  greenText: "#4ade80",
  red: "#ef4444",
  redDim: "#991b1b",
  redText: "#f87171",
  yellow: "#eab308",
  purple: "#a855f7",
};

const CLight = {
  bg: "#f9fafb",          // gray-50
  card: "#ffffff",        // white
  cardAlt: "#f3f4f6",    // gray-100
  border: "#d1d5db",      // gray-300
  borderLight: "#e5e7eb", // gray-200
  accent: "#0d9488",      // teal-600
  accentHover: "#0f766e", // teal-700
  accentStrong: "#115e59", // teal-800
  accentGlow: "rgba(13,148,136,0.08)",
  accentGlow2: "rgba(13,148,136,0.15)",
  text: "#111827",        // gray-900
  textSec: "#374151",     // gray-700
  textDim: "#6b7280",     // gray-500
  textMuted: "#9ca3af",   // gray-400
  green: "#16a34a",       // green-600
  greenDim: "#dcfce7",    // green-100
  greenText: "#15803d",   // green-700
  red: "#dc2626",         // red-600
  redDim: "#fee2e2",      // red-100
  redText: "#b91c1c",     // red-700
  yellow: "#ca8a04",      // yellow-600
  purple: "#9333ea",      // purple-600
};

// Mutable reference — set by the main component before each render
let C = CDark;

const inputGroup = { display: "flex", flexDirection: "column", gap: 4 };
const labelStyle = () => ({ fontSize: 11, color: C.textDim, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em" });
const inputStyle = () => ({
  background: C.cardAlt, border: `1px solid ${C.border}`, borderRadius: 6, color: C.text,
  padding: "8px 10px", fontSize: 14, outline: "none", width: "100%", boxSizing: "border-box",
});
const selectStyle = () => ({ ...inputStyle(), cursor: "pointer" });
const cardBox = () => ({ background: C.card, borderRadius: 10, border: `1px solid ${C.border}`, padding: 16 });
const pillBtn = (active) => ({
  padding: "6px 16px", borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: "pointer",
  border: `1px solid ${active ? C.accent : C.border}`,
  background: active ? C.accentGlow2 : "transparent", color: active ? C.accent : C.textDim,
  transition: "all 0.15s",
});

// ─── Input Panel (shared) ───
// Nearest listed-looking strike to the stock price (grid in utils/strikes.ts),
// so the default strike sits at the money on a strike that usually exists.
function nearestStrike(price) {
  const p = Number(price);
  if (!isFinite(p) || p <= 0) return null;
  return roundStrike(p, strikeStep(p));
}

// Approximate calendar days for each Treasury maturity the API returns.
const TREASURY_MATURITY_DAYS = {
  "1 Month": 30, "2 Month": 60, "3 Month": 91, "6 Month": 182,
  "1 Year": 365, "2 Year": 730, "3 Year": 1095, "5 Year": 1825,
  "7 Year": 2555, "10 Year": 3650, "20 Year": 7300, "30 Year": 10950,
};

// Pick the live Treasury yield whose maturity is closest to the option's
// days-to-expiry — the correct risk-free rate for Black-Scholes is the one
// matching the option's tenor (30-day option → ~1-month bill, 2yr LEAP → 2yr).
function nearestTreasuryRate(rates, days) {
  const d = Number(days);
  if (!isFinite(d) || d <= 0 || !rates || !rates.length) return null;
  let best = null, bestDiff = Infinity;
  for (const r of rates) {
    const md = TREASURY_MATURITY_DAYS[r.name];
    if (md == null || r.value == null) continue;
    const diff = Math.abs(md - d);
    if (diff < bestDiff) { bestDiff = diff; best = r; }
  }
  return best ? Number(best.value) : null;
}

// Small note under an input saying where its value came from.
function FieldHint({ children, warn = false }) {
  return <span style={{ fontSize: 11, color: warn ? C.yellow : C.textMuted, lineHeight: 1.4 }}>{children}</span>;
}

// Strike fields take any number, but only listed strikes can be traded, and
// there is no options-chain feed to offer them. So: a standing reminder, and a
// warning when a strike has cents no listed strike has.
function StrikeHint({ strikes }) {
  const odd = strikes.find(k => k > 0 && !isPlausibleStrike(k));
  return odd != null
    ? <FieldHint warn>${odd.toFixed(2)} is almost certainly not a listed strike, so this prices a contract you can't trade. Use the exact strikes in your broker's options chain.</FieldHint>
    : <FieldHint>Use strikes listed in your broker's options chain.</FieldHint>;
}

function InputPanel({ params, setParams, page, autoLookup }) {
  // Typing over a fetched volatility or dividend yield makes it the user's own
  // number, so its "where this came from" note no longer applies.
  const SOURCE_KEY = { sigma: "volSource", q: "divSource" };
  const set = (k) => (e) => setParams(p => ({
    ...p,
    [k]: e.target.value,
    ...(SOURCE_KEY[k] ? { [SOURCE_KEY[k]]: null } : {}),
  }));
  const [tickerInput, setTickerInput] = useState(params.ticker || "");
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupStatus, setLookupStatus] = useState<{ ok: boolean; msg: string } | null>(null);

  // Sync ticker prefill when URL params populate it post-mount
  useEffect(() => {
    if (params.ticker && params.ticker !== tickerInput) {
      setTickerInput(params.ticker);
    }
  }, [params.ticker]); // eslint-disable-line react-hooks/exhaustive-deps

  // The ticker whose price and vol the inputs hold, and the last one asked for.
  // A ticker that arrived with its own values ("Trade This") counts as loaded,
  // so clicking in and out of the box doesn't replace them.
  const loadedTicker = useRef(autoLookup ? null : (params.ticker || null));
  const requestedTicker = useRef(loadedTicker.current);

  const runLookup = async () => {
    const sym = tickerInput.trim().toUpperCase();
    if (!sym) return;
    requestedTicker.current = sym;
    setLookupLoading(true);
    setLookupStatus(null);
    try {
      const [quoteRes, ivRes, divRes] = await Promise.all([
        stocksAPI.getQuote(sym).catch(() => null),
        stocksAPI.getImpliedVolatility(sym, 30).catch(() => null),
        stocksAPI.getDividends(sym).catch(() => null),
      ]);
      const newPrice = quoteRes?.data?.price;
      const ivVal = ivRes?.data?.value;
      const ivSource = ivRes?.data?.source === "realized" ? "realized" : "default";
      if (newPrice == null && ivVal == null) {
        setLookupStatus({ ok: false, msg: `No data for ${sym}` });
        return;
      }
      // Dividend yield from /stocks/dividends, which already refuses a stale
      // or suspended dividend. A failed or un-annualizable lookup is flagged
      // and modelled as 0% rather than carrying over the last ticker's yield.
      const div = divRes?.data;
      const divStatus = div?.dividend_status;
      let q = "0.0", divSource;
      if (divStatus === "active" && div.annual_yield != null) {
        q = Number(div.annual_yield).toFixed(2);
        divSource = { kind: "active", freq: (div.frequency_label || "").toLowerCase() };
      } else if (divStatus === "none" || divStatus === "suspended") {
        divSource = { kind: divStatus };
      } else {
        divSource = { kind: "unavailable" };
      }
      // A new company needs a strike near its price. Re-fetching the one already
      // loaded is a refresh: price and vol update, the strike the user set stays.
      const isNewTicker = sym !== loadedTicker.current;
      setParams(p => {
        const next = { ...p, ticker: sym, q, divSource };
        if (newPrice != null) {
          next.S = Number(newPrice).toFixed(2);
          const k = isNewTicker ? nearestStrike(newPrice) : null;
          if (k != null) next.K = k.toFixed(2);
        }
        if (ivVal != null) {
          next.sigma = (Number(ivVal) * 100).toFixed(1);
          next.volSource = ivSource;
        }
        // Kept apart from the Volatility field so the IV Solver can still compare
        // against it after the user types the chain's implied volatility there.
        next.realizedVol = ivVal != null && ivSource === "realized" ? Number(ivVal) * 100 : null;
        return next;
      });
      if (newPrice != null) {
        loadedTicker.current = sym;
        setActiveTicker(sym);
      }
      setLookupStatus({ ok: true, msg: newPrice != null ? `${sym} · $${Number(newPrice).toFixed(2)}` : `${sym} · price unavailable` });
    } catch {
      setLookupStatus({ ok: false, msg: `Lookup failed for ${sym}` });
    } finally {
      setLookupLoading(false);
    }
  };

  // Arriving with a ticker from another page (the nav carries the active
  // ticker): fill in its price and volatility instead of leaving the defaults.
  // Once per visit; the ref also absorbs StrictMode's double effect run.
  const autoLookupDone = useRef(false);
  useEffect(() => {
    if (!autoLookup || autoLookupDone.current || !tickerInput.trim()) return;
    autoLookupDone.current = true;
    runLookup();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Leaving the box fetches only a ticker that isn't already loaded or on its
  // way. Enter and the button always fetch: that is an explicit refresh.
  const onTickerBlur = () => {
    const sym = tickerInput.trim().toUpperCase();
    if (sym && sym !== requestedTicker.current) runLookup();
  };

  const div = params.divSource;
  const divHint = !div ? null
    : div.kind === "active" ? <FieldHint>Latest {div.freq ? `${div.freq} ` : ""}payment, annualized</FieldHint>
    : div.kind === "none" ? <FieldHint>No dividend</FieldHint>
    : div.kind === "suspended" ? <FieldHint>Dividend suspended</FieldHint>
    : <FieldHint warn>Couldn't load dividends; assumed 0%. Enter it if the stock pays one.</FieldHint>;
  const volHint = params.volSource === "realized"
    ? <FieldHint>Last 30 days' actual (realized) volatility, not implied</FieldHint>
    : params.volSource === "default"
      ? <FieldHint warn>Realized volatility unavailable; 30% placeholder</FieldHint>
      : null;

  return (
    <div style={{ ...cardBox(), display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 10, flexWrap: "wrap" }}>
        {page !== "spreads" && (
          // Highlighted and first: it is the one input with no usable default,
          // and every result on the non-spread tabs waits for it.
          <div style={{ ...inputGroup, flex: "0 0 220px" }}>
            <span style={{ ...labelStyle(), color: C.accent, fontWeight: 700 }}>Option Type</span>
            <select
              style={{
                ...selectStyle(),
                border: `2px solid ${C.accent}`,
                boxShadow: `0 0 0 3px ${C.accentGlow2}`,
                padding: "7px 9px", // keeps the box the same height despite the 2px border
                color: params.type ? C.text : C.textDim,
              }}
              value={params.type}
              onChange={set("type")}
            >
              <option value="" disabled>Select Type</option>
              <option value="call">Call (Right to buy)</option>
              <option value="put">Put (Right to sell)</option>
            </select>
          </div>
        )}
        <div style={{ ...inputGroup, flex: "0 0 160px" }}>
          <span style={labelStyle()}>Ticker (optional)</span>
          <input
            style={inputStyle()}
            type="text"
            value={tickerInput}
            placeholder="e.g. CRCL"
            onChange={e => setTickerInput(e.target.value.toUpperCase())}
            onBlur={onTickerBlur}
            onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); runLookup(); } }}
          />
        </div>
        <button
          // Keep focus in the box: otherwise the box's blur fetches, then the click fetches again
          onMouseDown={e => e.preventDefault()}
          onClick={runLookup}
          disabled={lookupLoading || !tickerInput.trim()}
          style={{
            ...pillBtn(false),
            padding: "8px 16px",
            cursor: lookupLoading || !tickerInput.trim() ? "not-allowed" : "pointer",
            opacity: lookupLoading || !tickerInput.trim() ? 0.5 : 1,
          }}
        >
          {lookupLoading ? "Loading…" : "Fetch price, vol + dividend"}
        </button>
        {lookupStatus && (
          <span style={{ fontSize: 12, color: lookupStatus.ok ? C.greenText : C.redText, alignSelf: "center" }}>
            {lookupStatus.msg}
          </span>
        )}
      </div>

      <div style={{
        display: "grid",
        gridTemplateColumns: page === "spreads" ? "repeat(5, 1fr)" : "1fr 1fr 1fr",
        gap: 12,
      }}>
        <div style={inputGroup}>
          <span style={labelStyle()}>Stock Price ($)</span>
          <input style={inputStyle()} type="number" step="0.01" value={params.S} onChange={set("S")} />
        </div>
        {page !== "spreads" && (
          <div style={inputGroup}>
            <span style={labelStyle()}>Strike Price ($)</span>
            <input style={inputStyle()} type="number" step="0.01" value={params.K} onChange={set("K")} />
            <StrikeHint strikes={[+params.K]} />
          </div>
        )}
        <div style={inputGroup}>
          <span style={labelStyle()}>Days to Expiry</span>
          <input style={inputStyle()} type="number" step="1" value={params.days} onChange={set("days")} />
        </div>
        <div style={inputGroup}>
          <span style={labelStyle()}>Risk-Free Rate (%)</span>
          <input style={inputStyle()} type="number" step="0.1" value={params.r} onChange={set("r")} />
        </div>
        <div style={inputGroup}>
          <span style={labelStyle()}>Volatility (%)</span>
          <input style={inputStyle()} type="number" step="0.1" value={params.sigma} onChange={set("sigma")} />
          {volHint}
        </div>
        <div style={inputGroup}>
          <span style={labelStyle()}>Dividend Yield (%)</span>
          <input style={inputStyle()} type="number" step="0.01" min="0" value={params.q} onChange={set("q")} />
          {divHint}
        </div>
      </div>
    </div>
  );
}

// Within this distance of the strike an option is called at the money. A
// 0.4%-out-of-the-money option behaves like an at-the-money one, and a red
// "OTM" badge made it read worse than it is.
const ATM_BAND = 0.01;

// ─── Pricing Page ───
function PricingPage({ params, onOpenIV }) {
  const S = +params.S, K = +params.K, T = +params.days/365, r = +params.r/100, sig = +params.sigma/100, tp = params.type, q = +params.q/100 || 0;
  const bs = bsPrice(S, K, T, r, sig, tp, q);
  // Both from one 200-step tree: American minus European is the early-exercise
  // premium with the tree's rounding cancelled. Measuring it against
  // Black-Scholes instead reported that rounding as a premium.
  const american = binomialPrice(S, K, T, r, sig, tp, { steps: 200, q });
  const european = binomialPrice(S, K, T, r, sig, tp, { steps: 200, q, american: false });
  const earlyExercise = Math.max(american - european, 0);
  const noEarlyExercise = tp === "call" && q <= 0;
  const intrinsic = Math.max(tp === "call" ? S - K : K - S, 0);
  const timeVal = bs - intrinsic;
  const gap = K > 0 ? (S - K) / K : 0;
  const moneyness = Math.abs(gap) <= ATM_BAND ? "ATM"
    : (tp === "call" ? S > K : S < K) ? "ITM" : "OTM";
  const mColor = moneyness === "ITM" ? C.greenText : moneyness === "OTM" ? C.redText : C.accent;
  const gapText = S === K ? "Stock at the strike" : `Stock ${Math.abs(gap * 100).toFixed(1)}% ${S > K ? "above" : "below"} strike`;

  const Stat = ({ label: l, value: v, sub, color }) => (
    <div style={{ ...cardBox(), flex: 1, textAlign: "center" }}>
      <div style={{ fontSize: 11, color: C.textDim, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>{l}</div>
      <div style={{ fontSize: 26, fontWeight: 700, color: color || C.text }}>{v}</div>
      {sub && <div style={{ fontSize: 11, color: C.textMuted, marginTop: 4 }}>{sub}</div>}
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", gap: 12 }}>
        <Stat label="Black-Scholes" value={`$${bs.toFixed(4)}`} sub="European-style" />
        <Stat label="Binomial (200 steps)" value={`$${american.toFixed(4)}`} sub="American-style" />
        <Stat
          label="Early Exercise Premium"
          value={`$${earlyExercise.toFixed(4)}`}
          sub={noEarlyExercise
            ? "None: exercising a call early never pays without a dividend"
            : "Extra value from the right to exercise before expiry"}
        />
      </div>
      <div style={{ display: "flex", gap: 12 }}>
        <Stat label="Intrinsic Value" value={`$${intrinsic.toFixed(2)}`} />
        <Stat label="Time Value" value={`$${timeVal.toFixed(4)}`} />
        <Stat label="Moneyness" value={moneyness} color={mColor} sub={gapText} />
      </div>
      {/* What these numbers are, and aren't: a theoretical value at the
          volatility above, not a forecast of the market's quote. */}
      <div style={{ ...cardBox(), display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap", fontSize: 13, color: C.textSec, lineHeight: 1.55 }}>
        <div style={{ flex: "1 1 420px" }}>
          {params.volSource === "realized" ? (
            <>
              These values use <strong>{(+params.sigma).toFixed(1)}%</strong> volatility: {params.ticker || "the stock"}'s
              actual volatility over the last 30 days. They show what the option is worth if the next month moves like the
              last one. They are not a prediction of the market quote, which is priced on <em>implied</em> volatility and
              can differ a lot, especially around earnings.
            </>
          ) : (
            <>
              These are theoretical values at the volatility you entered. A market quote is priced on <em>implied</em>{" "}
              volatility, which may differ.
            </>
          )}{" "}
          To compare with a real quote, enter its price in the IV Solver.
        </div>
        <button onClick={onOpenIV} style={{ ...pillBtn(true), padding: "8px 16px" }}>Open IV Solver</button>
      </div>
    </div>
  );
}

// ─── Greeks Page ───
function GreeksPage({ params }) {
  const S = +params.S, K = +params.K, T = +params.days/365, r = +params.r/100, sig = +params.sigma/100, tp = params.type, q = +params.q/100 || 0;
  const g = bsGreeks(S, K, T, r, sig, tp, q);
  const [openInfo, setOpenInfo] = useState(null);

  const greekData = [
    { name: "Delta", val: g.delta, fmt: g.delta.toFixed(4), desc: `Option price moves ${Math.abs(g.delta).toFixed(2)} per share (${usd(Math.abs(g.delta) * 100)} per contract) for each $1 stock move`,
      info: {
        means: "How much the option's price moves for a $1 move in the underlying stock.",
        how: "Calls range from 0 to 1, puts from −1 to 0. A delta of 0.69 means the option gains roughly $0.69 when the stock rises $1 (and loses the same when it falls). It also doubles as a rough probability of finishing in-the-money. Deep in-the-money options approach ±1 and move nearly dollar-for-dollar with the stock; far out-of-the-money options approach 0.",
      } },
    { name: "Gamma", val: g.gamma, fmt: g.gamma.toFixed(4), desc: `Delta changes by ${g.gamma.toFixed(4)} per $1 stock move`,
      info: {
        means: "How much Delta itself changes for a $1 move in the stock.",
        how: "Think of it as the acceleration of the option's price. It is highest for at-the-money options near expiry. High gamma means your directional exposure (delta) shifts quickly — which cuts both ways: gains compound faster, but so do losses.",
      } },
    { name: "Theta", val: g.theta, fmt: g.theta.toFixed(4), desc: `Option ${g.theta <= 0 ? "loses" : "gains"} ${Math.abs(g.theta).toFixed(4)} per share (${usd(Math.abs(g.theta) * 100)} per contract) each day from time decay`,
      info: {
        means: "How much value the option loses each day simply from time passing (time decay).",
        how: "It is negative for buyers — you are fighting the clock — and positive for sellers, who collect the decay. Theta accelerates as expiration approaches, especially for at-the-money options.",
      } },
    { name: "Vega", val: g.vega, fmt: g.vega.toFixed(4), desc: `Option moves ${Math.abs(g.vega).toFixed(4)} per share (${usd(Math.abs(g.vega) * 100)} per contract) per 1-point volatility change`,
      info: {
        means: "How much the option's price moves for a 1-point change in implied volatility.",
        how: "Both calls and puts gain value when volatility rises and lose value when it falls. Vega is largest for longer-dated, at-the-money options. Note this is sensitivity to implied volatility, not to the stock actually moving.",
      } },
    { name: "Rho", val: g.rho, fmt: g.rho.toFixed(4), desc: `Option moves ${Math.abs(g.rho).toFixed(4)} per share (${usd(Math.abs(g.rho) * 100)} per contract) per 1-point rate change`,
      info: {
        means: "How much the option's price moves for a 1-point change in interest rates.",
        how: "Calls have positive Rho, puts negative. It is the least impactful Greek for short-dated options and matters most for long-dated positions (LEAPS).",
      } },
  ];

  const icons = { Delta: "Δ", Gamma: "Γ", Theta: "Θ", Vega: "ν", Rho: "ρ" };
  const barColors = { Delta: C.accent, Gamma: C.purple, Theta: C.redText, Vega: C.yellow, Rho: C.accentHover };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {greekData.map(gd => {
        const pct = gd.name === "Delta" ? Math.abs(gd.val) * 100
          : gd.name === "Theta" ? Math.min(Math.abs(gd.val) / 0.05 * 100, 100)
          : gd.name === "Gamma" ? Math.min(gd.val / 0.02 * 100, 100)
          : gd.name === "Vega" ? Math.min(gd.val / 0.3 * 100, 100)
          : Math.min(Math.abs(gd.val) / 0.3 * 100, 100);
        return (
          <div key={gd.name} style={cardBox()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
              <div onClick={() => setOpenInfo(gd)} title="What does this mean?" style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                <span style={{ fontSize: 18, fontWeight: 700, color: barColors[gd.name], fontFamily: "serif", width: 20, textAlign: "center" }}>{icons[gd.name]}</span>
                <span style={{ fontSize: 14, fontWeight: 600, color: C.text, borderBottom: `1px dotted ${C.textMuted}` }}>{gd.name}</span>
                <span style={{ fontSize: 12, color: C.textMuted }}>ⓘ</span>
              </div>
              <span style={{ fontSize: 20, fontWeight: 700, color: C.text, fontFamily: "monospace" }}>{gd.fmt}</span>
            </div>
            <div style={{ height: 6, background: C.cardAlt, borderRadius: 3, overflow: "hidden", marginBottom: 6 }}>
              <div style={{ height: "100%", width: `${Math.min(pct, 100)}%`, background: barColors[gd.name], borderRadius: 3, transition: "width 0.3s" }} />
            </div>
            <div style={{ fontSize: 13, color: C.text }}>{gd.desc}</div>
          </div>
        );
      })}

      {openInfo && (
        <div onClick={() => setOpenInfo(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ ...cardBox(), maxWidth: 440, width: "100%", padding: 24, boxShadow: "0 10px 40px rgba(0,0,0,0.45)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 24, fontWeight: 700, color: barColors[openInfo.name], fontFamily: "serif" }}>{icons[openInfo.name]}</span>
                <span style={{ fontSize: 18, fontWeight: 700, color: C.text }}>{openInfo.name}</span>
              </div>
              <span onClick={() => setOpenInfo(null)} style={{ cursor: "pointer", fontSize: 22, color: C.textDim, lineHeight: 1 }}>×</span>
            </div>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: C.accent, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 5 }}>What it means</div>
              <div style={{ fontSize: 13, color: C.textSec, lineHeight: 1.55 }}>{openInfo.info.means}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: C.accent, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 5 }}>How it works</div>
              <div style={{ fontSize: 13, color: C.textSec, lineHeight: 1.55 }}>{openInfo.info.how}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── P&L Payoff Page ───
function PayoffPage({ params }) {
  const S = +params.S, K = +params.K, T = +params.days/365, r = +params.r/100, sig = +params.sigma/100, tp = params.type, q = +params.q/100 || 0;
  const premium = bsPrice(S, K, T, r, sig, tp, q);
  const legs = [{ type: tp, K, dir: 1 }];
  const payoff = summarizePayoff(legs, premium);
  const be = payoff.breakevens[0];

  // Past the strike a single option's line keeps climbing (or falling), so the
  // chart shows more of it than a spread's flat tails: half the expected move.
  const sd = S * sig * Math.sqrt(T); // 1σ move by expiration, $
  const [lo, hi] = fitPriceRange(S, sd, [K, S, ...payoff.breakevens], 0.5);

  // Four cards, not the Spreads tab's five: a bought option's max loss is the
  // premium (one card, not two), and reward : risk says nothing here (a call's
  // upside is unlimited; a put's "max" needs the stock at $0). In its place,
  // what the trade loses if the stock goes nowhere: the time value.
  const stayPut = expiryPnl(legs, premium, S);
  const stats = [
    { label: "PREMIUM PAID", val: contractUsd(-premium), sub: `${perShareNote(-premium)}; your max loss`, perContract: true, color: C.redText, bg: LOSS_BG },
    {
      label: "MAX PROFIT", val: fmtCap(payoff.maxProfit), perContract: true,
      sub: Number.isFinite(payoff.maxProfit) ? `${perShareNote(payoff.maxProfit)}, if the stock hits $0` : "if the stock keeps rising",
      color: C.greenText, bg: PROFIT_BG,
    },
    {
      label: "BREAKEVEN",
      val: be != null ? usd(be) : "None",
      // How far the stock has to move: the number a single-option buyer is betting on.
      sub: be != null ? `${be >= S ? "+" : "-"}${Math.abs((be / S - 1) * 100).toFixed(1)}% from today, at expiration` : "never profitable at this price",
      color: C.accent, bg: C.accentGlow,
    },
    {
      label: "IF THE STOCK DOESN'T MOVE",
      val: contractUsd(stayPut, true),
      sub: `${perShareNote(stayPut)} at expiration`,
      perContract: true,
      color: stayPut < 0 ? C.redText : C.greenText, bg: C.cardAlt,
    },
  ];

  return (
    <PayoffPanel
      stats={stats}
      S={S} sd={sd} lo={lo} hi={hi}
      strikes={[K]}
      breakevens={payoff.breakevens}
      pnlExpAt={st => expiryPnl(legs, premium, st)}
      pnlNowAt={st => bsPrice(st, K, T, r, sig, tp, q) - premium}
      clipId="payoff"
    />
  );
}

// ─── IV Solver Page ───
// How expensive or cheap an option is compared with how much the stock has
// actually moved: solve the volatility the market price implies, then set it
// against the 30-day realized volatility the ticker lookup fetched.
const IV_RICH = 1.1, IV_CHEAP = 0.9; // IV ÷ realized beyond these reads as expensive / cheap

function IVSolverPage({ params }) {
  const S = +params.S, K = +params.K, T = +params.days/365, r = +params.r/100, tp = params.type, q = +params.q/100 || 0;
  const rv = params.realizedVol; // %, or null when no realized volatility was fetched

  // No pre-fill. Seeding it with the model's own price solved straight back to
  // the volatility input (52.5% in, 52.5% out), which read as a result. A price
  // belongs to one contract, so a new company or option type clears it.
  const [mktPrice, setMktPrice] = useState("");
  const priceFor = useRef(`${params.ticker}|${tp}`);
  useEffect(() => {
    const key = `${params.ticker}|${tp}`;
    if (key === priceFor.current) return;
    priceFor.current = key;
    setMktPrice("");
  }, [params.ticker, tp]);

  const entered = mktPrice.trim() !== "";
  const mp = +mktPrice;
  // The prices the model can produce run from ~zero volatility to the solver's 500% cap.
  const floorPrice = T > 0 ? bsPrice(S, K, T, r, 0.001, tp, q) : 0;
  const capPrice = T > 0 ? bsPrice(S, K, T, r, 5, tp, q) : 0;
  const problem = !entered ? null
    : !(mp > 0) ? "Enter the price as a positive number."
    : !(T > 0) ? "Days to expiry must be at least 1."
    : mp < floorPrice - 0.005 ? `No volatility gives a price this low: with no volatility at all this option is worth ${usd(floorPrice)}. Check the price and the inputs above.`
    : mp > capPrice + 0.005 ? "No volatility gives a price this high. Check the price and the inputs above."
    : null;
  const iv = entered && !problem ? impliedVol(S, K, T, r, mp, tp, q) : null;
  const ivPct = iv != null ? iv * 100 : null;

  const move = iv != null ? S * iv * Math.sqrt(T) : null;
  const who = params.ticker || "the stock";
  const priceAtRv = rv != null && T > 0 ? bsPrice(S, K, T, r, rv / 100, tp, q) : null;
  const verdict = ivPct == null || rv == null ? null
    : ivPct / rv >= IV_RICH ? "expensive"
    : ivPct / rv <= IV_CHEAP ? "cheap"
    : "about in line";

  // Price at each volatility, 1–150%.
  const points = [];
  if (T > 0) {
    for (let v = 1; v <= 150; v += 1) points.push({ vol: v, price: bsPrice(S, K, T, r, v / 100, tp, q) });
  }
  // Same proportions as the payoff charts, with the numbers beside it.
  const W = 640, H = 250, mx = 50, my = 30;
  const maxP = Math.max(...points.map(p => p.price), iv != null ? mp * 1.1 : 0) || 1;
  const toX = (v) => mx + (v - 1) / 149 * (W - 2 * mx);
  const toY = (v) => my + (1 - v / maxP) * (H - 2 * my);
  const path = points.map((p, i) => `${i===0?"M":"L"}${toX(p.vol).toFixed(1)},${toY(p.price).toFixed(1)}`).join("");
  const { ticks: yTicks, step: yStep } = niceTicks(0, maxP);
  const yDecimals = yStep >= 1 ? 0 : yStep >= 0.1 ? 1 : 2;
  const rvOnChart = rv != null && rv >= 1 && rv <= 150;

  const ratio = ivPct != null && rv ? ivPct / rv : null;
  const sideCard = { padding: "10px 12px", borderRadius: 8, background: C.cardAlt };
  const cardLabel = { fontSize: 12, fontWeight: 600, color: C.textSec, letterSpacing: "0.04em" };

  return (
    <ChartWithSide side={<>
      {/* The input first: everything else in the column follows from it */}
      <div className="flex-[1_1_240px] xl:flex-none" style={{ ...sideCard, ...inputGroup }}>
        <span style={{ ...cardLabel, color: C.accent, fontWeight: 700 }}>MARKET OPTION PRICE ($)</span>
        <input
          style={{ ...inputStyle(), borderColor: C.accent }}
          type="number"
          step="0.01"
          min="0"
          value={mktPrice}
          placeholder="Bid/ask midpoint from your broker"
          onChange={(e) => setMktPrice(e.target.value)}
        />
        {problem
          ? <FieldHint warn>{problem}</FieldHint>
          : <FieldHint>The midpoint of the bid and ask in your broker's options chain, for this strike and expiry.</FieldHint>}
      </div>
      <StatCard
        label="IMPLIED VOLATILITY"
        big
        val={ivPct != null ? `${ivPct.toFixed(1)}%` : "—"}
        sub={ivPct == null && !problem ? "Enter a market price to solve it" : null}
        color={ivPct != null ? C.accent : C.textMuted}
        bg={C.accentGlow}
      />
      <StatCard
        label="EXPECTED MOVE"
        val={move != null ? `±${usd(move)}` : "—"}
        sub={move != null ? `1 standard deviation: about a 68% chance ${who} finishes between ${usd(Math.max(S - move, 0))} and ${usd(S + move)} by expiry` : null}
        color={C.text}
        bg={C.cardAlt}
      />
      {/* The point of the tab: is the market charging more or less than the stock's own movement justifies? */}
      <div className="flex-[1_1_100%] xl:flex-none" style={{ ...sideCard, fontSize: 13, color: C.textSec, lineHeight: 1.5 }}>
        <div style={{ ...cardLabel, marginBottom: 4 }}>VS. REALIZED VOLATILITY</div>
        {ivPct == null ? (
          rv != null
            ? <>Enter the market price to compare its implied volatility with {who}'s 30-day realized volatility ({rv.toFixed(1)}%).</>
            : <>Fetch a ticker above to compare the implied volatility with the stock's 30-day realized volatility: whether options are priced above or below how much it has actually moved.</>
        ) : rv == null ? (
          <>No realized volatility to compare with. Fetch a ticker above to see whether this price is expensive or cheap next to how much the stock has actually moved.</>
        ) : (
          <>
            <span style={{ color: C.text, fontWeight: 700 }}>
              IV {ivPct.toFixed(1)}% vs. 30-day realized {rv.toFixed(1)}%: options priced {Math.abs(ivPct - rv).toFixed(1)} points {ivPct >= rv ? "above" : "below"} the stock's recent movement ({verdict}).
            </span>{" "}
            {priceAtRv != null && Math.abs(mp - priceAtRv) >= 0.005 && (
              <>At the realized volatility this option would be worth {usd(priceAtRv)}; the market is charging {usd(Math.abs(mp - priceAtRv))} {mp > priceAtRv ? "more" : "less"} ({usd(Math.abs(mp - priceAtRv) * 100, 0)} per contract).</>
            )}
            {/* Half or double the realized figure is rare for a listed stock; a
                price copied from another strike or expiry is the usual cause. */}
            {(ratio < 0.5 || ratio > 2) && (
              <div style={{ fontSize: 12, color: C.yellow, marginTop: 6 }}>
                A gap this large usually means the price is for a different contract. Check that the strike, days to expiry and option type above match the one you priced.
              </div>
            )}
            <div style={{ fontSize: 12, color: C.textDim, marginTop: 6 }}>
              Implied volatility usually runs a little above realized, and an earnings report or other event before expiry raises it. Realized volatility looks back; implied looks ahead.
            </div>
          </>
        )}
      </div>
    </>}>
      <div style={{ fontSize: 12, color: C.textDim, marginBottom: 8, textAlign: "center" }}>Option Price at Each Volatility</div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto" }}>
        {yTicks.map(v => (
          <g key={v}>
            <line x1={mx} x2={W-mx} y1={toY(v)} y2={toY(v)} stroke={C.border} strokeWidth={0.5} />
            <text x={mx-6} y={toY(v)+4} fill={C.textMuted} fontSize={10} textAnchor="end">{usd(v, yDecimals)}</text>
          </g>
        ))}
        {[25, 50, 75, 100, 125, 150].map(v => (
          <text key={v} x={toX(v)} y={H-my+14} fill={C.textMuted} fontSize={10} textAnchor="middle">{v}%</text>
        ))}
        <path d={path} fill="none" stroke={C.accent} strokeWidth={2.5} />
        {rvOnChart && priceAtRv != null && (
          <>
            <line x1={toX(rv)} x2={toX(rv)} y1={my} y2={H-my} stroke={C.textDim} strokeWidth={1} strokeDasharray="2,3" />
            <circle cx={toX(rv)} cy={toY(priceAtRv)} r={4.5} fill={C.card} stroke={C.textSec} strokeWidth={1.5} />
            {/* Inside the plot, on the side away from the IV marker, so the two labels never collide */}
            <text
              x={toX(rv) + (ivPct != null && ivPct < rv ? 5 : -5)}
              y={my + 12}
              fill={C.textSec}
              fontSize={10}
              textAnchor={ivPct != null && ivPct < rv ? "start" : "end"}
            >
              Realized {rv.toFixed(1)}%: {usd(priceAtRv)}
            </text>
          </>
        )}
        {ivPct != null && ivPct <= 150 && (
          <>
            <line x1={toX(ivPct)} x2={toX(ivPct)} y1={my} y2={H-my} stroke={C.greenText} strokeWidth={1} strokeDasharray="4,3" />
            <line x1={mx} x2={W-mx} y1={toY(mp)} y2={toY(mp)} stroke={C.greenText} strokeWidth={1} strokeDasharray="4,3" />
            <circle cx={toX(ivPct)} cy={toY(mp)} r={5} fill={C.greenText} />
            <text x={toX(ivPct)} y={my-6} fill={C.greenText} fontSize={10} textAnchor="middle">Implied {ivPct.toFixed(1)}%: {usd(mp)}</text>
          </>
        )}
        <text x={(mx + W - mx)/2} y={H - 2} fill={C.textMuted} fontSize={10} textAnchor="middle">Volatility</text>
      </svg>
    </ChartWithSide>
  );
}

// ─── Spread Strategy Definitions ───
// Default strikes sit on the listed-strike grid (utils/strikes.ts) at the
// usual distances from the price, so the starting spread is one that exists.
const toStrikeFields = (ks) => (ks ? Object.fromEntries(ks.map((k, i) => [`K${i + 1}`, String(k)])) : {});

const STRATEGIES = {
  bullCall: {
    label: "Bull Call Spread",
    kind: "debit", // what opening it costs: a net debit paid or a net credit received
    desc: "Buy lower-strike call, sell higher-strike call. Bullish, limited risk & reward.",
    legs: (S, K1, K2, _K3, _K4, T, r, sig) => [
      { type: "call", K: K1, dir: 1, label: "Buy Call" },
      { type: "call", K: K2, dir: -1, label: "Sell Call" },
    ],
    strikes: ["K1", "K2"],
    strikeLabels: { K1: "Lower Strike ($)", K2: "Upper Strike ($)" },
    defaults: (S) => toStrikeFields(defaultVerticalStrikes(S)),
  },
  bearPut: {
    label: "Bear Put Spread",
    kind: "debit",
    desc: "Buy higher-strike put, sell lower-strike put. Bearish, limited risk & reward.",
    legs: (S, K1, K2) => [
      { type: "put", K: K2, dir: 1, label: "Buy Put" },
      { type: "put", K: K1, dir: -1, label: "Sell Put" },
    ],
    strikes: ["K1", "K2"],
    strikeLabels: { K1: "Lower Strike ($)", K2: "Upper Strike ($)" },
    defaults: (S) => toStrikeFields(defaultVerticalStrikes(S)),
  },
  ironCondor: {
    label: "Iron Condor",
    kind: "credit",
    desc: "Sell OTM put & call spreads. Profits from low volatility within a price range.",
    legs: (S, K1, K2, K3, K4) => [
      { type: "put", K: K1, dir: 1, label: "Buy Put (wing)" },
      { type: "put", K: K2, dir: -1, label: "Sell Put" },
      { type: "call", K: K3, dir: -1, label: "Sell Call" },
      { type: "call", K: K4, dir: 1, label: "Buy Call (wing)" },
    ],
    strikes: ["K1", "K2", "K3", "K4"],
    strikeLabels: { K1: "Put Wing ($)", K2: "Put Short ($)", K3: "Call Short ($)", K4: "Call Wing ($)" },
    defaults: (S) => toStrikeFields(defaultCondorStrikes(S)),
  },
  straddle: {
    label: "Straddle",
    kind: "debit",
    desc: "Buy call & put at the same strike. Profits from large moves in either direction.",
    legs: (S, K1) => [
      { type: "call", K: K1, dir: 1, label: "Buy Call" },
      { type: "put", K: K1, dir: 1, label: "Buy Put" },
    ],
    strikes: ["K1"],
    strikeLabels: { K1: "Strike Price ($)" },
    defaults: (S) => toStrikeFields(S > 0 ? [nearestStrike(S)] : null),
  },
};

// ─── Money formatting, axis ticks and the payoff panel (P&L Payoff and Spreads tabs) ───
const usd = (v, decimals = 2) => formatUsd(v, { compact: false, decimals });
const signedUsd = (v) => (v > 0 ? "+" : "") + usd(v);
const fmtStrike = (k) => (Number.isInteger(k) ? `$${k}` : `$${k.toFixed(2)}`);

// "Nice" axis ticks (1, 2 or 5 × a power of ten), snapped so float drift never prints "-$0".
function niceTicks(min, max) {
  const range = max - min;
  if (!(range > 0)) return { ticks: [min], step: 1 };
  const raw = range / 5;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 5, 10].map(m => m * mag).find(s => s >= raw) || 10 * mag;
  const ticks = [];
  for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-9; v += step) {
    const snapped = Math.round(v / step) * step;
    ticks.push(Math.abs(snapped) < step * 1e-9 ? 0 : snapped);
  }
  return { ticks, step };
}

// Money stat cards lead with one contract (100 shares), the per-share amount
// underneath. Inputs and the leg breakdown stay per share, as brokers quote.
const contractUsd = (v, signed = false) => (signed && v > 0 ? "+" : "") + usd(v * 100, 0);
const perShareNote = (v) => `${usd(v)} per share`;
const fmtCap = (v) => (v === Infinity || v === -Infinity ? "Unlimited" : contractUsd(v));
const fmtRatio = (rr) => (rr != null ? `${rr.toFixed(rr >= 10 ? 0 : 1)} : 1` : "—");
const PROFIT_BG = "rgba(34,197,94,0.08)", LOSS_BG = "rgba(239,68,68,0.08)";

// Stock-price range for a payoff chart, fitted to the prices that matter
// (strikes, today's price, breakevens) so the payoff's shape fills it, padded
// by a share of the 1σ expected move. A fixed ±30% of the price squeezed a $5
// spread into a vertical line and left a single option's kink in a corner.
function fitPriceRange(S, sd, core, sdShare) {
  const cLo = Math.min(...core), cHi = Math.max(...core);
  const pad = Math.max((cHi - cLo) * 0.5, sd * sdShare, S * 0.01);
  return [Math.max(cLo - pad, 0), cHi + pad];
}

// A chart with its numbers beside it: a column on the right at xl and up.
// Below xl there's no room for both side by side, so the numbers go first, as
// a wrapping row, and stay right under the inputs that move them.
function ChartWithSide({ side, children }) {
  return (
    <div className="flex flex-col xl:flex-row gap-2.5">
      <div
        className="order-first xl:order-last flex flex-wrap gap-2 xl:flex-col xl:flex-nowrap xl:w-72 xl:shrink-0"
        style={{ ...cardBox(), padding: 10 }}
      >
        {side}
      </div>
      <div className="xl:flex-1 min-w-0 flex flex-col justify-center" style={{ ...cardBox(), padding: 12 }}>
        {children}
      </div>
    </div>
  );
}

// One number in that column: a label, the value, and a line of context.
function StatCard({ label, val, sub, color, bg, perContract = false, big = false, className = "flex-[1_1_160px] xl:flex-1" }) {
  return (
    <div
      className={className}
      style={{ display: "flex", flexDirection: "column", justifyContent: "center", textAlign: "center", padding: "8px 12px", borderRadius: 8, background: bg }}
    >
      <div style={{ fontSize: 12, fontWeight: 600, color: C.textSec, letterSpacing: "0.04em", marginBottom: 4 }}>
        {label}{perContract && <span style={{ fontWeight: 400 }}> / CONTRACT</span>}
      </div>
      <div style={{ fontSize: big ? 28 : 20, fontWeight: 700, color, fontFamily: "monospace", lineHeight: 1.25 }}>{val}</div>
      {sub && <div style={{ fontSize: 12, color: C.textSec, marginTop: 2, lineHeight: 1.4 }}>{sub}</div>}
    </div>
  );
}

// The expiration P&L chart with the numbers the trade is decided on beside it.
// Money stats are per contract, with per share below.
function PayoffPanel({ stats, S, sd, lo, hi, strikes, breakevens, pnlExpAt, pnlNowAt, expLabel = "At expiration", clipId }) {
  const steps = 200;
  const pts = [];
  let minPnl = Infinity, maxPnl = -Infinity;
  for (let i = 0; i <= steps; i++) {
    const st = lo + (hi - lo) * i / steps;
    const pnlExp = pnlExpAt(st), pnlNow = pnlNowAt(st);
    pts.push({ st, pnlExp, pnlNow });
    minPnl = Math.min(minPnl, pnlExp, pnlNow);
    maxPnl = Math.max(maxPnl, pnlExp, pnlNow);
  }
  const yPad = (maxPnl - minPnl) * 0.1 || 1;
  const yMin = Math.min(minPnl - yPad, -yPad), yMax = Math.max(maxPnl + yPad, yPad);

  // The dollar axis is on the left; the right margin only has to fit half a strike label.
  const W = 640, H = 250, mLeft = 58, mRight = 20, mTop = 26, mBottom = 40;
  const plotBottom = H - mBottom;
  const toX = (v) => mLeft + (v - lo) / (hi - lo) * (W - mLeft - mRight);
  const toY = (v) => mTop + (1 - (v - yMin) / (yMax - yMin)) * (plotBottom - mTop);
  const pathExp = pts.map((p, i) => `${i === 0 ? "M" : "L"}${toX(p.st).toFixed(1)},${toY(p.pnlExp).toFixed(1)}`).join("");
  const pathNow = pts.map((p, i) => `${i === 0 ? "M" : "L"}${toX(p.st).toFixed(1)},${toY(p.pnlNow).toFixed(1)}`).join("");
  const zeroY = toY(0);
  const { ticks: yTicks, step: yStep } = niceTicks(yMin, yMax);
  const tickDecimals = yStep >= 1 ? 0 : yStep >= 0.1 ? 1 : 2;
  const sdLo = Math.max(S - sd, lo), sdHi = Math.min(S + sd, hi);

  // Strike labels: one per distinct strike, dropped to a second row when two
  // would overlap.
  const strikeLabels = [];
  for (const k of Array.from(new Set(strikes)).sort((a, b) => a - b)) {
    const x = toX(k);
    const prev = strikeLabels[strikeLabels.length - 1];
    strikeLabels.push({ k, x, row: prev && x - prev.x < 36 && prev.row === 0 ? 1 : 0 });
  }

  return (
    <ChartWithSide side={stats.map(st => <StatCard key={st.label} {...st} />)}>
      <div style={{ display: "flex", gap: 16, marginBottom: 6, justifyContent: "center", flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
          <div style={{ width: 16, height: 3, background: C.accent, borderRadius: 2 }} />
          <span style={{ color: C.textDim }}>{expLabel}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
          <div style={{ width: 16, height: 3, background: C.greenText, borderRadius: 2, opacity: 0.6 }} />
          <span style={{ color: C.textDim }}>Today (theoretical)</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
          <div style={{ width: 16, height: 10, background: C.accent, opacity: 0.12, borderRadius: 2 }} />
          <span style={{ color: C.textDim }}>Expected move by expiration: ±{usd(sd)} (1σ)</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
          <span style={{ color: C.text, fontSize: 10 }}>▲</span>
          <span style={{ color: C.textDim }}>Stock now {usd(S)}</span>
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto" }}>
        <defs>
          <clipPath id={`${clipId}ProfitZone`}><rect x={0} y={0} width={W} height={Math.max(zeroY, 0)} /></clipPath>
          <clipPath id={`${clipId}LossZone`}><rect x={0} y={zeroY} width={W} height={Math.max(H - zeroY, 0)} /></clipPath>
        </defs>
        {/* 1σ expected-move band */}
        {sdHi > sdLo && (
          <rect x={toX(sdLo)} y={mTop} width={toX(sdHi) - toX(sdLo)} height={plotBottom - mTop} fill={C.accent} opacity={0.07} />
        )}
        {yTicks.map(v => (
          <g key={v}>
            <line x1={mLeft} x2={W - mRight} y1={toY(v)} y2={toY(v)} stroke={C.border} strokeWidth={0.5} />
            <text x={mLeft - 6} y={toY(v) + 4} fill={C.textMuted} fontSize={10} textAnchor="end">{usd(v, tickDecimals)}</text>
          </g>
        ))}
        <line x1={mLeft} x2={W - mRight} y1={zeroY} y2={zeroY} stroke={C.textDim} strokeWidth={1} strokeDasharray="4,3" />
        {/* Strike markers */}
        {strikeLabels.map(s => (
          <g key={s.k}>
            <line x1={s.x} x2={s.x} y1={mTop} y2={plotBottom} stroke={C.textMuted} strokeWidth={0.7} strokeDasharray="3,4" opacity={0.5} />
            <text x={s.x} y={plotBottom + 13 + s.row * 11} fill={C.textMuted} fontSize={9} textAnchor="middle">{fmtStrike(s.k)}</text>
          </g>
        ))}
        {/* Breakeven markers */}
        {breakevens.filter(be => be >= lo && be <= hi).map((be, i) => (
          <g key={`be${i}`}>
            <line x1={toX(be)} x2={toX(be)} y1={mTop} y2={plotBottom} stroke={C.accent} strokeWidth={1} strokeDasharray="2,3" opacity={0.6} />
            <text x={toX(be)} y={mTop - 8} fill={C.accent} fontSize={9} textAnchor="middle">BE {usd(be)}</text>
          </g>
        ))}
        {/* Profit (green) and loss (red) areas between the expiration line and $0 */}
        {(() => {
          const area = pathExp + `L${toX(hi).toFixed(1)},${zeroY.toFixed(1)}L${toX(lo).toFixed(1)},${zeroY.toFixed(1)}Z`;
          return (
            <>
              <path d={area} fill={C.green} opacity={0.15} clipPath={`url(#${clipId}ProfitZone)`} />
              <path d={area} fill={C.red} opacity={0.15} clipPath={`url(#${clipId}LossZone)`} />
            </>
          );
        })()}
        <path d={pathNow} fill="none" stroke={C.greenText} strokeWidth={2} opacity={0.55} />
        <path d={pathExp} fill="none" stroke={C.accent} strokeWidth={2.5} />
        {/* Today's stock price */}
        <polygon points={`${toX(S) - 5},${plotBottom} ${toX(S) + 5},${plotBottom} ${toX(S)},${plotBottom - 8}`} fill={C.text} />
        <text x={mLeft} y={H - 3} fill={C.textMuted} fontSize={10}>Stock {usd(lo, 0)}</text>
        <text x={W - mRight} y={H - 3} fill={C.textMuted} fontSize={10} textAnchor="end">{usd(hi, 0)}</text>
      </svg>
    </ChartWithSide>
  );
}

// ─── Spreads Page ───
function SpreadsPage({ params, initialStrategy, initialStrikes }) {
  const S = +params.S, T = +params.days / 365, r = +params.r / 100, sig = +params.sigma / 100, q = +params.q / 100 || 0;
  const initStrat = initialStrategy && STRATEGIES[initialStrategy] ? initialStrategy : "bullCall";
  const [strategy, setStrategy] = useState(initStrat);
  const strat = STRATEGIES[strategy];
  const [strikes, setStrikes] = useState(() => {
    const defaults = STRATEGIES[initStrat].defaults(+params.S);
    return initialStrikes ? { ...defaults, ...initialStrikes } : defaults;
  });
  // What the user actually paid (debit) or received (credit) per share. Blank
  // means the model's fair value. It belongs to one trade, so a new strategy
  // or a new company clears it; editing a strike (a correction) keeps it.
  const [fill, setFill] = useState("");

  const handleStrategyChange = (key) => {
    setStrategy(key);
    setStrikes(STRATEGIES[key].defaults(S));
    setFill("");
  };

  // A new company fetched while on this tab gets strikes around its price; the
  // previous company's strikes would sit far off the chart. Typing a different
  // stock price is a what-if on the same contracts, so it leaves them alone.
  const strikesTicker = useRef(params.ticker);
  useEffect(() => {
    if (params.ticker === strikesTicker.current) return;
    strikesTicker.current = params.ticker;
    setStrikes(STRATEGIES[strategy].defaults(+params.S));
    setFill("");
  }, [params.ticker]); // eslint-disable-line react-hooks/exhaustive-deps

  const setStrike = (k) => (e) => setStrikes(prev => ({ ...prev, [k]: e.target.value }));

  const K1 = +strikes.K1 || S, K2 = +strikes.K2 || S * 1.03, K3 = +strikes.K3 || S * 1.05, K4 = +strikes.K4 || S * 1.10;
  const legs = strat.legs(S, K1, K2, K3, K4, T, r, sig);

  // Model (fair-value) price and Greeks per leg
  const legDetails = legs.map(leg => ({
    ...leg,
    price: bsPrice(S, leg.K, T, r, sig, leg.type, q),
    greeks: bsGreeks(S, leg.K, T, r, sig, leg.type, q),
  }));
  const modelCost = legDetails.reduce((sum, l) => sum + l.dir * l.price, 0); // + debit, − credit
  const netGreeks = ["delta", "gamma", "theta", "vega", "rho"].reduce((acc, g) => {
    acc[g] = legDetails.reduce((s, l) => s + l.dir * l.greeks[g], 0);
    return acc;
  }, {});

  // Cost basis: the user's fill when they entered one, else the model's.
  const isCredit = strat.kind === "credit";
  const fillNum = fill.trim() === "" ? null : Number(fill);
  const fillValid = fillNum != null && Number.isFinite(fillNum) && fillNum >= 0;
  const netCost = fillValid ? (isCredit ? -fillNum : fillNum) : modelCost;
  const modelAmount = Math.abs(modelCost);
  // Better = paid less for a debit, or received more for a credit.
  const fillEdge = fillValid ? (isCredit ? fillNum - modelAmount : modelAmount - fillNum) : 0;

  const payoff = summarizePayoff(legDetails, netCost);
  const pnlNowAt = (st) => legDetails.reduce((s, l) => s + l.dir * bsPrice(st, l.K, T, r, sig, l.type, q), 0) - netCost;

  // Chart range: past the outer strikes a spread is flat, so a quarter of the
  // expected move beyond the strikes and breakevens is enough.
  const sd = S * sig * Math.sqrt(T); // 1σ move by expiration, $
  const [lo, hi] = fitPriceRange(S, sd, [...legDetails.map(l => l.K), S, ...payoff.breakevens], 0.25);

  const summaryStats = [
    {
      label: fillValid ? "YOUR NET PREMIUM" : "NET PREMIUM",
      val: contractUsd(-netCost, true),
      sub: perShareNote(-netCost),
      perContract: true,
      color: netCost > 0 ? C.redText : C.greenText,
      bg: netCost > 0 ? LOSS_BG : PROFIT_BG,
    },
    { label: "MAX PROFIT", val: fmtCap(payoff.maxProfit), perContract: true, sub: Number.isFinite(payoff.maxProfit) ? perShareNote(payoff.maxProfit) : "if the stock keeps rising", color: C.greenText, bg: PROFIT_BG },
    { label: "MAX LOSS", val: fmtCap(payoff.maxLoss), perContract: true, sub: Number.isFinite(payoff.maxLoss) ? perShareNote(payoff.maxLoss) : "if the stock keeps rising", color: C.redText, bg: LOSS_BG },
    {
      label: payoff.breakevens.length > 1 ? "BREAKEVENS" : "BREAKEVEN",
      val: payoff.breakevens.length ? payoff.breakevens.map(b => usd(b)).join(" / ") : "None",
      sub: payoff.breakevens.length ? "at expiration"
        : payoff.maxProfit <= 0 ? "never profitable at this price"
        : payoff.maxLoss >= 0 ? "can't lose at this price" : "",
      color: C.accent, bg: C.accentGlow,
    },
    {
      label: "REWARD : RISK",
      val: fmtRatio(payoff.rewardToRisk),
      sub: payoff.rewardToRisk != null ? "max profit ÷ max loss" : "one side is unlimited or empty",
      color: C.text, bg: C.cardAlt,
    },
  ];

  // Greeks per share and per contract (×100). Per share alone reads as
  // nothing: theta 0.0029 is $0.29 a day on one contract.
  const greekRows = [
    { name: "Delta", sym: "Δ", val: netGreeks.delta, color: C.accent, contract: `${signedUsd(netGreeks.delta * 100)} per $1 move` },
    { name: "Gamma", sym: "Γ", val: netGreeks.gamma, color: C.purple, contract: `delta ${signedUsd(netGreeks.gamma * 100)} per $1 move` },
    { name: "Theta", sym: "Θ", val: netGreeks.theta, color: C.redText, contract: `${signedUsd(netGreeks.theta * 100)} per day` },
    { name: "Vega", sym: "ν", val: netGreeks.vega, color: C.yellow, contract: `${signedUsd(netGreeks.vega * 100)} per vol point` },
    { name: "Rho", sym: "ρ", val: netGreeks.rho, color: C.accentHover, contract: `${signedUsd(netGreeks.rho * 100)} per rate point` },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {/* Three-up: Strategy selector (left) + Strike and fill inputs (middle) + Leg breakdown (right),
          then the chart with its stats, and the net Greeks */}
      <div style={{ display: "flex", gap: 10, alignItems: "stretch", flexWrap: "wrap" }}>
        {/* Strategy selector — pills stacked vertically */}
        <div style={{ ...cardBox(), padding: 12, flex: "1 1 0", minWidth: 200, display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 11, color: C.textDim, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 2 }}>Strategy</span>
          {Object.entries(STRATEGIES).map(([key, s]) => (
            <button key={key} style={{ ...pillBtn(strategy === key), textAlign: "left", width: "100%" }} onClick={() => handleStrategyChange(key)}>
              {s.label}
            </button>
          ))}
          <span style={{ fontSize: 10, color: C.textMuted, marginTop: 4, lineHeight: 1.4 }}>{strat.desc}</span>
        </div>

        {/* Strike inputs, then the price the user actually got */}
        <div style={{ ...cardBox(), padding: 12, flex: "1 1 0", minWidth: 200, display: "flex", flexDirection: "column", gap: 10 }}>
          {strat.strikes.map(k => (
            <div key={k} style={inputGroup}>
              <span style={labelStyle()}>{strat.strikeLabels[k]}</span>
              <input style={inputStyle()} type="number" step="0.50" value={strikes[k] || ""} onChange={setStrike(k)} />
            </div>
          ))}
          <StrikeHint strikes={strat.strikes.map(k => +strikes[k])} />
          <div style={{ ...inputGroup, borderTop: `1px solid ${C.border}`, paddingTop: 10 }}>
            <span style={{ ...labelStyle(), color: C.accent, fontWeight: 700 }}>
              Your fill: net {isCredit ? "credit received" : "debit paid"} ($/share)
            </span>
            <input
              style={inputStyle()}
              type="number"
              step="0.01"
              min="0"
              value={fill}
              placeholder={modelAmount.toFixed(2)}
              onChange={e => setFill(e.target.value)}
            />
            {fill.trim() !== "" && !fillValid ? (
              <FieldHint warn>Enter the amount as a positive number.</FieldHint>
            ) : fillValid ? (
              <FieldHint>
                {Math.abs(fillEdge) < 0.005 ? "You got fair value." : (
                  <span style={{ color: fillEdge > 0 ? C.greenText : C.redText }}>
                    {usd(Math.abs(fillEdge))} {fillEdge > 0 ? "better" : "worse"} than fair value
                    ({usd(Math.abs(fillEdge) * 100, 0)} per contract).
                  </span>
                )}
              </FieldHint>
            ) : (
              <FieldHint>Blank uses fair value. Enter what you actually {isCredit ? "received" : "paid"} to see your real risk and reward.</FieldHint>
            )}
            {/* Fair value is a reference to check the broker's price against, not
                a limit price: there are no option quotes behind it, and it is only
                as good as the volatility field (realized unless the user typed IV). */}
            <FieldHint>
              <strong style={{ color: C.textSec }}>Model fair value {usd(modelAmount)}</strong> at {+params.sigma}% volatility:{" "}
              {isCredit
                ? "collecting less than this means taking less than the model's odds justify."
                : "paying more than this means paying more than the model's odds justify."}{" "}
              Compare it with your broker's mid price. If they're far apart, the market is pricing a different
              volatility: enter the chain's implied volatility for your strikes (their average, if they differ)
              in the Volatility field and the model should land near the mid.
            </FieldHint>
          </div>
        </div>

        {/* Leg breakdown at model prices — fills remaining width */}
        <div style={{ ...cardBox(), padding: 12, flex: "1 1 0", minWidth: 200 }}>
          <div style={{ fontSize: 11, color: C.textDim, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>Leg Breakdown (model prices)</div>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", gap: 6, fontSize: 12 }}>
            <div style={{ color: C.textMuted, fontWeight: 600, borderBottom: `1px solid ${C.border}`, paddingBottom: 4 }}>LEG</div>
            <div style={{ color: C.textMuted, fontWeight: 600, borderBottom: `1px solid ${C.border}`, paddingBottom: 4, textAlign: "right" }}>STRIKE</div>
            <div style={{ color: C.textMuted, fontWeight: 600, borderBottom: `1px solid ${C.border}`, paddingBottom: 4, textAlign: "right" }}>PRICE</div>
            <div style={{ color: C.textMuted, fontWeight: 600, borderBottom: `1px solid ${C.border}`, paddingBottom: 4, textAlign: "right" }}>DELTA</div>
            {legDetails.map((l, i) => (
              <div key={i} style={{ display: "contents" }}>
                <div style={{ color: l.dir > 0 ? C.greenText : C.redText, padding: "4px 0" }}>
                  {l.dir > 0 ? "+" : "−"} {l.label} ({l.type})
                </div>
                <div style={{ color: C.textSec, textAlign: "right", padding: "4px 0" }}>{usd(l.K)}</div>
                <div style={{ color: l.dir > 0 ? C.redText : C.greenText, textAlign: "right", padding: "4px 0" }}>
                  {signedUsd(-l.dir * l.price)}
                </div>
                <div style={{ color: C.textSec, textAlign: "right", padding: "4px 0" }}>{(l.dir * l.greeks.delta).toFixed(4)}</div>
              </div>
            ))}
            <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 6, fontWeight: 700, color: C.text }}>Net</div>
            <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 6 }} />
            <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 6, textAlign: "right", fontWeight: 700, color: modelCost < 0 ? C.greenText : C.redText, fontFamily: "monospace" }}>
              {signedUsd(-modelCost)}
            </div>
            <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 6, textAlign: "right", fontWeight: 700, color: C.text, fontFamily: "monospace" }}>
              {netGreeks.delta.toFixed(4)}
            </div>
          </div>
          <div style={{ marginTop: 8, fontSize: 11, color: C.textMuted }}>
            {modelCost > 0 ? `Model net debit: ${usd(modelCost)} paid` : `Model net credit: ${usd(-modelCost)} received`}
          </div>
        </div>
      </div>

      <PayoffPanel
        stats={summaryStats}
        S={S} sd={sd} lo={lo} hi={hi}
        strikes={legDetails.map(l => l.K)}
        breakevens={payoff.breakevens}
        pnlExpAt={st => expiryPnl(legDetails, netCost, st)}
        pnlNowAt={pnlNowAt}
        expLabel={fillValid ? "At expiration (your fill)" : "At expiration"}
        clipId="spread"
      />

      {/* Net Greeks: per share, and per contract below */}
      <div style={{ ...cardBox(), padding: 10, display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: C.textSec, letterSpacing: "0.04em", padding: "0 2px" }}>NET GREEKS: PER SHARE, AND PER CONTRACT (×100 SHARES)</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {greekRows.map(g => (
            <div key={g.name} style={{ flex: "1 1 160px", padding: "8px 10px", borderRadius: 8, background: C.cardAlt }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 16, fontWeight: 700, color: g.color, fontFamily: "serif" }}>{g.sym}</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: C.textSec }}>{g.name}</span>
                <span style={{ fontSize: 15, fontWeight: 700, color: C.text, fontFamily: "monospace", marginLeft: "auto" }}>{g.val.toFixed(4)}</span>
              </div>
              <div style={{ fontSize: 12, color: C.textSec, textAlign: "right", marginTop: 2 }}>{g.contract}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Main App ───
const pages = [
  { id: "pricing", label: "Option Pricing" },
  { id: "greeks", label: "Greeks" },
  { id: "payoff", label: "P&L Payoff" },
  { id: "iv", label: "IV Solver" },
  { id: "spreads", label: "Spreads" },
];

export default function OptionsCalculator() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { theme } = useTheme();
  const [user, setUser] = useState<any>(null);
  const [userLoading, setUserLoading] = useState(true);

  // Set the mutable color reference based on current theme
  C = theme === "dark" ? CDark : CLight;
  const [page, setPage] = useState(searchParams.get("page") || "pricing");
  const [params, setParams] = useState({
    S: searchParams.get("S") || "150.00",
    K: searchParams.get("K") || "150.00",
    days: searchParams.get("days") || "30",
    r: searchParams.get("r") || "5.0",
    sigma: searchParams.get("sigma") || "25.0",
    // No default: the user picks Call or Put. A link (e.g. "Trade This") may preset it.
    type: ["call", "put"].includes(searchParams.get("type")) ? searchParams.get("type") : "",
    ticker: searchParams.get("ticker") || "",
    q: searchParams.get("q") || "0.0", // dividend yield, %
    volSource: null, // "realized" | "default" once fetched; null when typed or passed in
    realizedVol: null, // the fetched 30-day realized volatility, %; survives edits to sigma
    divSource: null, // what the dividend lookup found; null when typed
  });

  // Live risk-free rate: pulled from the Treasury-rates endpoint and matched to
  // the option's tenor. We stop auto-managing it once the user edits the field
  // (or if a rate was passed explicitly via the URL).
  const treasuryRates = useRef(null);
  const autoRate = useRef(null);
  const userSetRate = useRef(searchParams.get("r") != null);

  // Pre-fill spread strikes from URL (used by "Trade This" → "Open in Options Calculator")
  const urlStrategy = searchParams.get("strategy") || undefined;
  const urlStrikes = (() => {
    const k1 = searchParams.get("K1"), k2 = searchParams.get("K2");
    if (k1 || k2) {
      const s = {};
      if (k1) s.K1 = k1;
      if (k2) s.K2 = k2;
      return s;
    }
    return undefined;
  })();

  useEffect(() => {
    const loadUser = async () => {
      try {
        const response = await authAPI.getCurrentUser();
        setUser(response.data);
      } catch (error: any) {
        if (error.response?.status === 401) {
          localStorage.removeItem('access_token');
          navigate('/login');
        }
      } finally {
        setUserLoading(false);
      }
    };
    loadUser();
  }, [navigate]);

  // Apply the tenor-matched live Treasury yield to the risk-free rate field,
  // unless the user has taken control of it.
  const applyTreasuryRate = useCallback(() => {
    if (userSetRate.current || !treasuryRates.current) return;
    const rate = nearestTreasuryRate(treasuryRates.current, params.days);
    if (rate == null) return;
    const str = rate.toFixed(1);
    autoRate.current = str;
    setParams(p => (p.r === str ? p : { ...p, r: str }));
  }, [params.days]);

  // Fetch live Treasury rates once on mount.
  useEffect(() => {
    let cancelled = false;
    stocksAPI.getTreasuryRates()
      .then(res => {
        if (cancelled) return;
        const rates = res.data?.rates || [];
        if (rates.length) {
          treasuryRates.current = rates;
          applyTreasuryRate();
        }
      })
      .catch(() => { /* keep the manual default if the lookup fails */ });
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-match the rate to tenor whenever days-to-expiry changes.
  useEffect(() => { applyTreasuryRate(); }, [applyTreasuryRate]);

  // Once the user edits the rate away from what we set, stop auto-managing it.
  useEffect(() => {
    if (autoRate.current != null && params.r !== autoRate.current) {
      userSetRate.current = true;
    }
  }, [params.r]);

  // Loading state
  if (userLoading) {
    return (
      <div style={{ display: "flex", minHeight: "100vh", background: C.bg, alignItems: "center", justifyContent: "center" }}>
        <div style={{ color: C.textDim }}>Loading...</div>
      </div>
    );
  }

  const handleLogout = () => {
    localStorage.removeItem('access_token');
    navigate('/login');
  };

  // Tier gate: limits.optionsCalculator in data/pricingTiers.ts. Frontend-only by
  // design: the calculator is client-side math, and the IV lookup it uses is
  // shared with the DCF page, so there is nothing to gate on the server.
  if (!user || !planIncludes(user.subscription_tier, "optionsCalculator")) {
    return (
      <div className="min-h-screen bg-gray-100 dark:bg-gray-800 transition-colors duration-200">
        <NavBar currentPage="options-calculator" user={user} onLogout={handleLogout} />
        <UpgradeRequired
          feature="Options Calculator"
          currentTier={user?.subscription_tier || "beginner"}
          limitReached={false}
          minimumTier={lowestTierWith("optionsCalculator")}
        />
      </div>
    );
  }

  // Layout mirrors Stocks.tsx (the app's multi-tab page): same container,
  // gutters, heading and tab bar, so the two pages read as one system.
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white transition-colors">
      {/* SEO — React 19 hoists to <head> */}
      <title>Options Calculator — NWC-Analytics</title>
      <meta name="description" content="Price options strategies with Black-Scholes — greeks, payoff diagrams, and multi-leg strategy analysis." />
      <link rel="canonical" href="https://nwc-analytics.com/options-calculator" />
      <NavBar currentPage="options-calculator" user={user} onLogout={handleLogout} />

      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-6">Options Calculator</h1>

        {/* Tab Bar — same classes as the Stocks page */}
        <div className="flex flex-wrap gap-1 border-b border-gray-200 dark:border-gray-700 mb-6">
          {pages.map(p => (
            <button
              key={p.id}
              onClick={() => setPage(p.id)}
              className={`px-4 sm:px-8 py-3.5 text-base font-semibold whitespace-nowrap transition-colors ${
                page === p.id
                  ? 'border-b-2 border-teal-600 text-teal-600 dark:text-teal-400 -mb-px'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <InputPanel
            params={params}
            setParams={setParams}
            page={page}
            // A ticker with no price means the nav brought it; "Trade This"
            // sends its own price and volatility, which must not be replaced.
            autoLookup={!!searchParams.get("ticker") && !searchParams.get("S")}
          />
          {/* Spreads defines its own legs; every other tab needs a Call or Put */}
          {page !== "spreads" && !params.type ? (
            <div style={{ ...cardBox(), textAlign: "center", padding: 32, color: C.textDim, fontSize: 14 }}>
              Choose an <span style={{ color: C.accent, fontWeight: 600 }}>Option Type</span> above to see results.
            </div>
          ) : (
            <>
              {page === "pricing" && <PricingPage params={params} onOpenIV={() => setPage("iv")} />}
              {page === "greeks" && <GreeksPage params={params} />}
              {page === "payoff" && <PayoffPage params={params} />}
              {page === "iv" && <IVSolverPage params={params} />}
              {page === "spreads" && <SpreadsPage params={params} initialStrategy={urlStrategy} initialStrikes={urlStrikes} />}
            </>
          )}
        </div>

        <p className="mt-6 text-xs text-gray-500 dark:text-gray-400">
          Black-Scholes &amp; Binomial models. For educational purposes. Not financial advice.
        </p>
      </div>
    </div>
  );
}
