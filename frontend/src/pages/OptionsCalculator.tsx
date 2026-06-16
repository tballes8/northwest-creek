// @ts-nocheck
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { authAPI, stocksAPI } from "../services/api";
import NavBar from "../components/NavBar";
import { useTheme } from "../contexts/ThemeContext";
import UpgradeRequiredPage from "../pages/UpgradeRequired";

// ─── Math Utilities ───
const norm = {
  pdf: (x) => Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI),
  cdf: (x) => {
    const a1=0.254829592, a2=-0.284496736, a3=1.421413741, a4=-1.453152027, a5=1.061405429, p=0.3275911;
    const sign = x < 0 ? -1 : 1;
    const t = 1 / (1 + p * Math.abs(x));
    const y = 1 - (((((a5*t+a4)*t)+a3)*t+a2)*t+a1)*t * Math.exp(-x*x/2);
    return 0.5 * (1 + sign * y);
  }
};

function bsPrice(S, K, T, r, sigma, type) {
  if (T <= 0 || sigma <= 0) return Math.max(type === "call" ? S - K : K - S, 0);
  const d1 = (Math.log(S/K) + (r + sigma*sigma/2)*T) / (sigma*Math.sqrt(T));
  const d2 = d1 - sigma*Math.sqrt(T);
  if (type === "call") return S*norm.cdf(d1) - K*Math.exp(-r*T)*norm.cdf(d2);
  return K*Math.exp(-r*T)*norm.cdf(-d2) - S*norm.cdf(-d1);
}

function bsGreeks(S, K, T, r, sigma, type) {
  if (T <= 0 || sigma <= 0) return { delta:0, gamma:0, theta:0, vega:0, rho:0 };
  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(S/K) + (r + sigma*sigma/2)*T) / (sigma*sqrtT);
  const d2 = d1 - sigma*sqrtT;
  const nd1 = norm.pdf(d1);
  const delta = type === "call" ? norm.cdf(d1) : norm.cdf(d1) - 1;
  const gamma = nd1 / (S * sigma * sqrtT);
  const thetaCommon = -(S * nd1 * sigma) / (2 * sqrtT);
  const theta = type === "call"
    ? (thetaCommon - r*K*Math.exp(-r*T)*norm.cdf(d2)) / 365
    : (thetaCommon + r*K*Math.exp(-r*T)*norm.cdf(-d2)) / 365;
  const vega = S * nd1 * sqrtT / 100;
  const rho = type === "call"
    ? K*T*Math.exp(-r*T)*norm.cdf(d2) / 100
    : -K*T*Math.exp(-r*T)*norm.cdf(-d2) / 100;
  return { delta, gamma, theta, vega, rho };
}

function binomialPrice(S, K, T, r, sigma, type, steps = 100) {
  if (T <= 0) return Math.max(type === "call" ? S - K : K - S, 0);
  const dt = T / steps;
  const u = Math.exp(sigma * Math.sqrt(dt));
  const d = 1 / u;
  const p = (Math.exp(r * dt) - d) / (u - d);
  const disc = Math.exp(-r * dt);
  let prices = Array(steps + 1);
  for (let i = 0; i <= steps; i++) {
    const st = S * Math.pow(u, steps - i) * Math.pow(d, i);
    prices[i] = Math.max(type === "call" ? st - K : K - st, 0);
  }
  for (let j = steps - 1; j >= 0; j--) {
    for (let i = 0; i <= j; i++) {
      const european = disc * (p * prices[i] + (1 - p) * prices[i + 1]);
      const st = S * Math.pow(u, j - i) * Math.pow(d, i);
      const exercise = Math.max(type === "call" ? st - K : K - st, 0);
      prices[i] = Math.max(european, exercise);
    }
  }
  return prices[0];
}

function impliedVol(S, K, T, r, marketPrice, type) {
  let lo = 0.001, hi = 5, mid;
  for (let i = 0; i < 100; i++) {
    mid = (lo + hi) / 2;
    const p = bsPrice(S, K, T, r, mid, type);
    if (Math.abs(p - marketPrice) < 0.0001) return mid;
    if (p > marketPrice) hi = mid; else lo = mid;
  }
  return mid;
}

// ─── Color System ───
const CDark = {
  bg: "#1f2937",          // gray-800 — main page bg
  card: "#374151",        // gray-700 — card bg
  cardAlt: "#1f2937",     // gray-800 — nested/alt bg
  sidebar: "#111827",     // gray-900 — nav bg
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
  sidebar: "#ffffff",     // white
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

const sidebarStyle = () => ({
  width: 220, minHeight: "100%", background: C.sidebar, borderRight: `1px solid ${C.border}`,
  display: "flex", flexDirection: "column", padding: "20px 0", flexShrink: 0,
});

const navBtn = (active) => ({
  padding: "10px 20px", cursor: "pointer", fontSize: 13, fontWeight: active ? 600 : 400,
  color: active ? C.accent : C.textDim, background: active ? C.accentGlow : "transparent",
  border: "none", borderLeft: `3px solid ${active ? C.accent : "transparent"}`,
  textAlign: "left", transition: "all 0.15s",
});

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
// Nearest realistic option strike for a given underlying price — mimics real
// option-chain increments ($1 under $25, $5 to $500, $10 above) so the default
// strike sits near-the-money instead of a fixed value.
function nearestStrike(price) {
  const p = Number(price);
  if (!isFinite(p) || p <= 0) return null;
  const inc = p < 25 ? 1 : p < 500 ? 5 : 10;
  return Math.round(p / inc) * inc;
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

function InputPanel({ params, setParams, page }) {
  const set = (k) => (e) => setParams(p => ({ ...p, [k]: e.target.value }));
  const [tickerInput, setTickerInput] = useState(params.ticker || "");
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupStatus, setLookupStatus] = useState<{ ok: boolean; msg: string; source?: string } | null>(null);

  // Sync ticker prefill when URL params populate it post-mount
  useEffect(() => {
    if (params.ticker && params.ticker !== tickerInput) {
      setTickerInput(params.ticker);
    }
  }, [params.ticker]); // eslint-disable-line react-hooks/exhaustive-deps

  const runLookup = async () => {
    const sym = tickerInput.trim().toUpperCase();
    if (!sym) return;
    setLookupLoading(true);
    setLookupStatus(null);
    try {
      const [quoteRes, ivRes] = await Promise.all([
        stocksAPI.getQuote(sym).catch(() => null),
        stocksAPI.getImpliedVolatility(sym, 30).catch(() => null),
      ]);
      const newPrice = quoteRes?.data?.price;
      const ivVal = ivRes?.data?.value;
      const ivSource = ivRes?.data?.source;
      if (newPrice == null && ivVal == null) {
        setLookupStatus({ ok: false, msg: `No data for ${sym}` });
        return;
      }
      setParams(p => {
        const next = { ...p, ticker: sym };
        if (newPrice != null) {
          next.S = Number(newPrice).toFixed(2);
          const k = nearestStrike(newPrice);
          if (k != null) next.K = k.toFixed(2);
        }
        if (ivVal != null) next.sigma = (Number(ivVal) * 100).toFixed(1);
        return next;
      });
      const priceMsg = newPrice != null ? `$${Number(newPrice).toFixed(2)}` : "price n/a";
      const ivMsg = ivVal != null ? `${(Number(ivVal) * 100).toFixed(1)}% vol (${ivSource === "realized" ? "30D realized" : "default"})` : "vol n/a";
      setLookupStatus({ ok: true, msg: `${sym} · ${priceMsg} · ${ivMsg}`, source: ivSource });
    } catch {
      setLookupStatus({ ok: false, msg: `Lookup failed for ${sym}` });
    } finally {
      setLookupLoading(false);
    }
  };

  return (
    <div style={{ ...cardBox(), display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Ticker lookup — fetches current price + 30-day realized volatility */}
      <div style={{ display: "flex", alignItems: "flex-end", gap: 10, flexWrap: "wrap" }}>
        <div style={{ ...inputGroup, flex: "0 0 160px" }}>
          <span style={labelStyle()}>Ticker (optional)</span>
          <input
            style={inputStyle()}
            type="text"
            value={tickerInput}
            placeholder="e.g. CRCL"
            onChange={e => setTickerInput(e.target.value.toUpperCase())}
            onBlur={runLookup}
            onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); runLookup(); } }}
          />
        </div>
        <button
          onClick={runLookup}
          disabled={lookupLoading || !tickerInput.trim()}
          style={{
            ...pillBtn(false),
            padding: "8px 16px",
            cursor: lookupLoading || !tickerInput.trim() ? "not-allowed" : "pointer",
            opacity: lookupLoading || !tickerInput.trim() ? 0.5 : 1,
          }}
        >
          {lookupLoading ? "Loading…" : "Fetch price + vol"}
        </button>
        {lookupStatus && (
          <span style={{ fontSize: 12, color: lookupStatus.ok ? C.greenText : C.redText, alignSelf: "center" }}>
            {lookupStatus.msg}
            {lookupStatus.ok && lookupStatus.source === "default" && (
              <span style={{ color: C.textMuted, marginLeft: 6, fontStyle: "italic" }}>
                — couldn't compute realized vol, using 30% default
              </span>
            )}
          </span>
        )}
      </div>

      <div style={{
        display: "grid",
        gridTemplateColumns: page === "spreads" ? "1fr 1fr 1fr 1fr" : "1fr 1fr 1fr",
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
        </div>
        {page !== "spreads" && (
          <div style={inputGroup}>
            <span style={labelStyle()}>Option Type</span>
            <select style={selectStyle()} value={params.type} onChange={set("type")}>
              <option value="call">Call</option>
              <option value="put">Put</option>
            </select>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Pricing Page ───
function PricingPage({ params }) {
  const S = +params.S, K = +params.K, T = +params.days/365, r = +params.r/100, sig = +params.sigma/100, tp = params.type;
  const bs = bsPrice(S, K, T, r, sig, tp);
  const bn = binomialPrice(S, K, T, r, sig, tp, 200);
  const intrinsic = Math.max(tp === "call" ? S - K : K - S, 0);
  const timeVal = bs - intrinsic;
  const moneyness = tp === "call" ? (S > K ? "ITM" : S < K ? "OTM" : "ATM") : (S < K ? "ITM" : S > K ? "OTM" : "ATM");
  const mColor = moneyness === "ITM" ? C.greenText : moneyness === "OTM" ? C.redText : C.accent;

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
        <Stat label="Binomial (200 steps)" value={`$${bn.toFixed(4)}`} sub="American-style" />
        <Stat label="Difference" value={`$${Math.abs(bs - bn).toFixed(4)}`} sub="Early exercise premium" />
      </div>
      <div style={{ display: "flex", gap: 12 }}>
        <Stat label="Intrinsic Value" value={`$${intrinsic.toFixed(2)}`} />
        <Stat label="Time Value" value={`$${timeVal.toFixed(4)}`} />
        <Stat label="Moneyness" value={moneyness} color={mColor} />
      </div>
    </div>
  );
}

// ─── Greeks Page ───
function GreeksPage({ params }) {
  const S = +params.S, K = +params.K, T = +params.days/365, r = +params.r/100, sig = +params.sigma/100, tp = params.type;
  const g = bsGreeks(S, K, T, r, sig, tp);
  const [openInfo, setOpenInfo] = useState(null);

  const greekData = [
    { name: "Delta", val: g.delta, fmt: g.delta.toFixed(4), desc: `Option price moves $${Math.abs(g.delta).toFixed(2)} per $1 stock move`,
      info: {
        means: "How much the option's price moves for a $1 move in the underlying stock.",
        how: "Calls range from 0 to 1, puts from −1 to 0. A delta of 0.69 means the option gains roughly $0.69 when the stock rises $1 (and loses the same when it falls). It also doubles as a rough probability of finishing in-the-money. Deep in-the-money options approach ±1 and move nearly dollar-for-dollar with the stock; far out-of-the-money options approach 0.",
      } },
    { name: "Gamma", val: g.gamma, fmt: g.gamma.toFixed(4), desc: `Delta changes by ${g.gamma.toFixed(4)} per $1 stock move`,
      info: {
        means: "How much Delta itself changes for a $1 move in the stock.",
        how: "Think of it as the acceleration of the option's price. It is highest for at-the-money options near expiry. High gamma means your directional exposure (delta) shifts quickly — which cuts both ways: gains compound faster, but so do losses.",
      } },
    { name: "Theta", val: g.theta, fmt: g.theta.toFixed(4), desc: `Option loses $${Math.abs(g.theta).toFixed(4)}/day to time decay`,
      info: {
        means: "How much value the option loses each day simply from time passing (time decay).",
        how: "It is negative for buyers — you are fighting the clock — and positive for sellers, who collect the decay. Theta accelerates as expiration approaches, especially for at-the-money options.",
      } },
    { name: "Vega", val: g.vega, fmt: g.vega.toFixed(4), desc: `Option moves $${Math.abs(g.vega).toFixed(4)} per 1% vol change`,
      info: {
        means: "How much the option's price moves for a 1-point change in implied volatility.",
        how: "Both calls and puts gain value when volatility rises and lose value when it falls. Vega is largest for longer-dated, at-the-money options. Note this is sensitivity to implied volatility, not to the stock actually moving.",
      } },
    { name: "Rho", val: g.rho, fmt: g.rho.toFixed(4), desc: `Option moves $${Math.abs(g.rho).toFixed(4)} per 1% rate change`,
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
  const S = +params.S, K = +params.K, T = +params.days/365, r = +params.r/100, sig = +params.sigma/100, tp = params.type;
  const premium = bsPrice(S, K, T, r, sig, tp);
  const lo = S * 0.7, hi = S * 1.3, steps = 120;
  const pts = [];
  let minPnl = Infinity, maxPnl = -Infinity;
  for (let i = 0; i <= steps; i++) {
    const st = lo + (hi - lo) * i / steps;
    const intrinsic = Math.max(tp === "call" ? st - K : K - st, 0);
    const pnlExp = intrinsic - premium;
    const pnlNow = bsPrice(st, K, T, r, sig, tp) - premium;
    pts.push({ st, pnlExp, pnlNow });
    minPnl = Math.min(minPnl, pnlExp, pnlNow);
    maxPnl = Math.max(maxPnl, pnlExp, pnlNow);
  }
  const pad = (maxPnl - minPnl) * 0.1 || 5;
  const yMin = minPnl - pad, yMax = maxPnl + pad;
  const W = 600, H = 300, mx = 50, my = 30;
  const toX = (v) => mx + (v - lo) / (hi - lo) * (W - 2 * mx);
  const toY = (v) => my + (1 - (v - yMin) / (yMax - yMin)) * (H - 2 * my);
  const pathExp = pts.map((p, i) => `${i===0?"M":"L"}${toX(p.st).toFixed(1)},${toY(p.pnlExp).toFixed(1)}`).join("");
  const pathNow = pts.map((p, i) => `${i===0?"M":"L"}${toX(p.st).toFixed(1)},${toY(p.pnlNow).toFixed(1)}`).join("");
  const zeroY = toY(0);
  const breakeven = tp === "call" ? K + premium : K - premium;

  const yTicks = [];
  const yRange = yMax - yMin;
  const yStep = Math.pow(10, Math.floor(Math.log10(yRange))) || 1;
  const niceStep = yRange / yStep > 8 ? yStep * 2 : yRange / yStep < 3 ? yStep / 2 : yStep;
  for (let v = Math.ceil(yMin / niceStep) * niceStep; v <= yMax; v += niceStep) yTicks.push(v);

  // Gradient fill for profit/loss zones on expiration line
  const zeroX = toX(breakeven);

  return (
    <div style={cardBox()}>
      <div style={{ display: "flex", gap: 16, marginBottom: 12, justifyContent: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
          <div style={{ width: 16, height: 3, background: C.accent, borderRadius: 2 }} />
          <span style={{ color: C.textDim }}>At Expiration</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
          <div style={{ width: 16, height: 3, background: C.greenText, borderRadius: 2, opacity: 0.6 }} />
          <span style={{ color: C.textDim }}>Current (theoretical)</span>
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto" }}>
        {yTicks.map(v => (
          <g key={v}>
            <line x1={mx} x2={W-mx} y1={toY(v)} y2={toY(v)} stroke={C.border} strokeWidth={0.5} />
            <text x={mx-6} y={toY(v)+4} fill={C.textMuted} fontSize={10} textAnchor="end">${v.toFixed(0)}</text>
          </g>
        ))}
        <line x1={mx} x2={W-mx} y1={zeroY} y2={zeroY} stroke={C.textDim} strokeWidth={1} strokeDasharray="4,3" />
        <text x={W-mx+4} y={zeroY+4} fill={C.textDim} fontSize={9}>$0</text>
        <line x1={toX(K)} x2={toX(K)} y1={my} y2={H-my} stroke={C.textMuted} strokeWidth={1} strokeDasharray="4,3" />
        <text x={toX(K)} y={H-my+14} fill={C.textMuted} fontSize={10} textAnchor="middle">K=${K}</text>
        {breakeven >= lo && breakeven <= hi && (
          <>
            <line x1={toX(breakeven)} x2={toX(breakeven)} y1={my} y2={H-my} stroke={C.accent} strokeWidth={1} strokeDasharray="2,3" opacity={0.5} />
            <text x={toX(breakeven)} y={my-6} fill={C.accent} fontSize={9} textAnchor="middle">BE=${breakeven.toFixed(2)}</text>
          </>
        )}
        <path d={pathNow} fill="none" stroke={C.greenText} strokeWidth={2} opacity={0.55} />
        <path d={pathExp} fill="none" stroke={C.accent} strokeWidth={2.5} />
        <text x={mx} y={H-4} fill={C.textMuted} fontSize={10}>Stock: ${lo.toFixed(0)}</text>
        <text x={W-mx} y={H-4} fill={C.textMuted} fontSize={10} textAnchor="end">${hi.toFixed(0)}</text>
      </svg>
      <div style={{ display: "flex", gap: 12, marginTop: 12 }}>
        {[
          { label: "PREMIUM PAID", val: `$${premium.toFixed(2)}`, color: C.text, bg: C.accentGlow },
          { label: "BREAKEVEN", val: `$${breakeven.toFixed(2)}`, color: C.accent, bg: C.accentGlow },
          { label: "MAX LOSS", val: `$${premium.toFixed(2)}`, color: C.redText, bg: `rgba(239,68,68,0.08)` },
          { label: "MAX PROFIT", val: tp === "call" ? "Unlimited" : `$${(K - premium).toFixed(2)}`, color: C.greenText, bg: `rgba(34,197,94,0.08)` },
        ].map(s => (
          <div key={s.label} style={{ flex: 1, textAlign: "center", padding: 10, borderRadius: 8, background: s.bg }}>
            <div style={{ fontSize: 10, color: C.textMuted, marginBottom: 2 }}>{s.label}</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: s.color }}>{s.val}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── IV Solver Page ───
function IVSolverPage({ params }) {
  const S = +params.S, K = +params.K, T = +params.days/365, r = +params.r/100, sig = +params.sigma/100, tp = params.type;

  // Seed the market price with the Black-Scholes theoretical value for the
  // current inputs, so the solved IV round-trips to ~the volatility input on
  // load instead of showing a meaningless number from an arbitrary default.
  // We keep it in sync with the inputs until the user enters a real premium.
  const theoPrice = (T > 0 && sig > 0) ? bsPrice(S, K, T, r, sig, tp) : 0;
  const [mktPrice, setMktPrice] = useState(theoPrice > 0 ? theoPrice.toFixed(2) : "5.00");
  const userSetPrice = useRef(false);

  useEffect(() => {
    if (userSetPrice.current || theoPrice <= 0) return;
    setMktPrice(theoPrice.toFixed(2));
  }, [theoPrice]);

  const onPriceChange = (e) => { userSetPrice.current = true; setMktPrice(e.target.value); };

  const mp = +mktPrice;
  const iv = mp > 0 && T > 0 ? impliedVol(S, K, T, r, mp, tp) : null;
  const ivPct = iv ? (iv * 100).toFixed(2) : "—";

  const points = [];
  if (T > 0) {
    for (let v = 1; v <= 150; v += 1) {
      const sig = v / 100;
      points.push({ vol: v, price: bsPrice(S, K, T, r, sig, tp) });
    }
  }
  const W = 600, H = 250, mx = 55, my = 30;
  const maxP = Math.max(...points.map(p => p.price), mp * 1.2 || 20);
  const toX = (v) => mx + (v - 1) / 149 * (W - 2 * mx);
  const toY = (v) => my + (1 - v / maxP) * (H - 2 * my);
  const path = points.map((p, i) => `${i===0?"M":"L"}${toX(p.vol).toFixed(1)},${toY(p.price).toFixed(1)}`).join("");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ ...cardBox(), display: "flex", gap: 16, alignItems: "flex-end", flexWrap: "wrap" }}>
        <div style={{ ...inputGroup, flex: "1 1 140px" }}>
          <span style={labelStyle()}>Market Option Price ($)</span>
          <input style={inputStyle()} type="number" step="0.01" value={mktPrice} onChange={onPriceChange} />
        </div>
        <div style={{ flex: "1 1 140px", textAlign: "center", padding: "8px 0" }}>
          <div style={{ fontSize: 11, color: C.textDim, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>Implied Volatility</div>
          <div style={{ fontSize: 32, fontWeight: 700, color: C.accent, fontFamily: "monospace" }}>{ivPct}%</div>
        </div>
        <div style={{ flex: "1 1 180px", textAlign: "center", padding: "8px 0" }}>
          <div style={{ fontSize: 11, color: C.textDim, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>Expected Move</div>
          <div style={{ fontSize: 18, fontWeight: 600, color: C.textSec, fontFamily: "monospace" }}>
            {iv ? `±$${(S * iv * Math.sqrt(T)).toFixed(2)}` : "—"}
          </div>
        </div>
        <div style={{ flexBasis: "100%", fontSize: 11, color: C.textMuted, lineHeight: 1.5 }}>
          Defaults to the Black-Scholes theoretical price computed from your inputs above (stock price, strike, days, rate, volatility) — so the solved IV starts out matching your volatility input. For an accurate read, replace it with the option's actual market price (the bid/ask mid) from your trading platform.
        </div>
      </div>
      <div style={cardBox()}>
        <div style={{ fontSize: 12, color: C.textDim, marginBottom: 8, textAlign: "center" }}>Option Price vs. Implied Volatility</div>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto" }}>
          {[0, 0.25, 0.5, 0.75, 1].map(f => {
            const y = my + f * (H - 2 * my);
            const val = maxP * (1 - f);
            return <g key={f}><line x1={mx} x2={W-mx} y1={y} y2={y} stroke={C.border} strokeWidth={0.5} /><text x={mx-6} y={y+4} fill={C.textMuted} fontSize={10} textAnchor="end">${val.toFixed(1)}</text></g>;
          })}
          <path d={path} fill="none" stroke={C.accent} strokeWidth={2.5} />
          {iv && (
            <>
              <line x1={toX(iv*100)} x2={toX(iv*100)} y1={my} y2={H-my} stroke={C.greenText} strokeWidth={1} strokeDasharray="4,3" />
              <line x1={mx} x2={W-mx} y1={toY(mp)} y2={toY(mp)} stroke={C.greenText} strokeWidth={1} strokeDasharray="4,3" />
              <circle cx={toX(iv*100)} cy={toY(mp)} r={5} fill={C.greenText} />
              <text x={toX(iv*100)} y={my-6} fill={C.greenText} fontSize={10} textAnchor="middle">{ivPct}%</text>
            </>
          )}
          <text x={(mx + W - mx)/2} y={H - 2} fill={C.textMuted} fontSize={10} textAnchor="middle">Volatility (%)</text>
        </svg>
      </div>
    </div>
  );
}

// ─── Spread Strategy Definitions ───
const STRATEGIES = {
  bullCall: {
    label: "Bull Call Spread",
    desc: "Buy lower-strike call, sell higher-strike call. Bullish, limited risk & reward.",
    legs: (S, K1, K2, _K3, _K4, T, r, sig) => [
      { type: "call", K: K1, dir: 1, label: "Buy Call" },
      { type: "call", K: K2, dir: -1, label: "Sell Call" },
    ],
    strikes: ["K1", "K2"],
    strikeLabels: { K1: "Lower Strike ($)", K2: "Upper Strike ($)" },
    defaults: (S) => ({ K1: (S * 0.97).toFixed(2), K2: (S * 1.03).toFixed(2) }),
  },
  bearPut: {
    label: "Bear Put Spread",
    desc: "Buy higher-strike put, sell lower-strike put. Bearish, limited risk & reward.",
    legs: (S, K1, K2) => [
      { type: "put", K: K2, dir: 1, label: "Buy Put" },
      { type: "put", K: K1, dir: -1, label: "Sell Put" },
    ],
    strikes: ["K1", "K2"],
    strikeLabels: { K1: "Lower Strike ($)", K2: "Upper Strike ($)" },
    defaults: (S) => ({ K1: (S * 0.97).toFixed(2), K2: (S * 1.03).toFixed(2) }),
  },
  ironCondor: {
    label: "Iron Condor",
    desc: "Sell OTM put & call spreads. Profits from low volatility within a price range.",
    legs: (S, K1, K2, K3, K4) => [
      { type: "put", K: K1, dir: 1, label: "Buy Put (wing)" },
      { type: "put", K: K2, dir: -1, label: "Sell Put" },
      { type: "call", K: K3, dir: -1, label: "Sell Call" },
      { type: "call", K: K4, dir: 1, label: "Buy Call (wing)" },
    ],
    strikes: ["K1", "K2", "K3", "K4"],
    strikeLabels: { K1: "Put Wing ($)", K2: "Put Short ($)", K3: "Call Short ($)", K4: "Call Wing ($)" },
    defaults: (S) => ({ K1: (S * 0.90).toFixed(2), K2: (S * 0.95).toFixed(2), K3: (S * 1.05).toFixed(2), K4: (S * 1.10).toFixed(2) }),
  },
  straddle: {
    label: "Straddle",
    desc: "Buy call & put at the same strike. Profits from large moves in either direction.",
    legs: (S, K1) => [
      { type: "call", K: K1, dir: 1, label: "Buy Call" },
      { type: "put", K: K1, dir: 1, label: "Buy Put" },
    ],
    strikes: ["K1"],
    strikeLabels: { K1: "Strike Price ($)" },
    defaults: (S) => ({ K1: S.toFixed(2) }),
  },
};

// ─── Spreads Page ───
function SpreadsPage({ params, initialStrategy, initialStrikes }) {
  const S = +params.S, T = +params.days / 365, r = +params.r / 100, sig = +params.sigma / 100;
  const initStrat = initialStrategy && STRATEGIES[initialStrategy] ? initialStrategy : "bullCall";
  const [strategy, setStrategy] = useState(initStrat);
  const strat = STRATEGIES[strategy];
  const [strikes, setStrikes] = useState(() => {
    const defaults = STRATEGIES[initStrat].defaults(+params.S);
    return initialStrikes ? { ...defaults, ...initialStrikes } : defaults;
  });

  const handleStrategyChange = (key) => {
    setStrategy(key);
    setStrikes(STRATEGIES[key].defaults(S));
  };

  const setStrike = (k) => (e) => setStrikes(prev => ({ ...prev, [k]: e.target.value }));

  const K1 = +strikes.K1 || S, K2 = +strikes.K2 || S * 1.03, K3 = +strikes.K3 || S * 1.05, K4 = +strikes.K4 || S * 1.10;
  const legs = strat.legs(S, K1, K2, K3, K4, T, r, sig);

  // Calculate prices and Greeks per leg
  const legDetails = legs.map(leg => {
    const price = bsPrice(S, leg.K, T, r, sig, leg.type);
    const greeks = bsGreeks(S, leg.K, T, r, sig, leg.type);
    return { ...leg, price, greeks };
  });

  const netPremium = legDetails.reduce((sum, l) => sum + l.dir * l.price, 0);
  const netGreeks = {
    delta: legDetails.reduce((s, l) => s + l.dir * l.greeks.delta, 0),
    gamma: legDetails.reduce((s, l) => s + l.dir * l.greeks.gamma, 0),
    theta: legDetails.reduce((s, l) => s + l.dir * l.greeks.theta, 0),
    vega: legDetails.reduce((s, l) => s + l.dir * l.greeks.vega, 0),
    rho: legDetails.reduce((s, l) => s + l.dir * l.greeks.rho, 0),
  };

  // P&L at expiration across price range
  const lo = S * 0.7, hi = S * 1.3, steps = 150;
  const pts = [];
  let minPnl = Infinity, maxPnl = -Infinity;
  for (let i = 0; i <= steps; i++) {
    const st = lo + (hi - lo) * i / steps;
    let pnlExp = 0, pnlNow = 0;
    for (const leg of legDetails) {
      const intrinsic = Math.max(leg.type === "call" ? st - leg.K : leg.K - st, 0);
      pnlExp += leg.dir * (intrinsic - leg.price);
      pnlNow += leg.dir * (bsPrice(st, leg.K, T, r, sig, leg.type) - leg.price);
    }
    pts.push({ st, pnlExp, pnlNow });
    minPnl = Math.min(minPnl, pnlExp, pnlNow);
    maxPnl = Math.max(maxPnl, pnlExp, pnlNow);
  }
  const pad = (maxPnl - minPnl) * 0.1 || 5;
  const yMin = minPnl - pad, yMax = maxPnl + pad;

  // SVG chart
  const W = 640, H = 220, mx = 55, my = 24;
  const toX = (v) => mx + (v - lo) / (hi - lo) * (W - 2 * mx);
  const toY = (v) => my + (1 - (v - yMin) / (yMax - yMin)) * (H - 2 * my);
  const pathExp = pts.map((p, i) => `${i === 0 ? "M" : "L"}${toX(p.st).toFixed(1)},${toY(p.pnlExp).toFixed(1)}`).join("");
  const pathNow = pts.map((p, i) => `${i === 0 ? "M" : "L"}${toX(p.st).toFixed(1)},${toY(p.pnlNow).toFixed(1)}`).join("");
  const zeroY = toY(0);

  // Y-axis ticks
  const yTicks = [];
  const yRange = yMax - yMin;
  const yStep = Math.pow(10, Math.floor(Math.log10(yRange))) || 1;
  const niceStep = yRange / yStep > 8 ? yStep * 2 : yRange / yStep < 3 ? yStep / 2 : yStep;
  for (let v = Math.ceil(yMin / niceStep) * niceStep; v <= yMax; v += niceStep) yTicks.push(v);

  // Max profit / loss / breakevens from the expiration P&L curve
  const expPnls = pts.map(p => p.pnlExp);
  const maxProfit = Math.max(...expPnls);
  const maxLoss = Math.min(...expPnls);
  // Find breakevens (zero crossings)
  const breakevens = [];
  for (let i = 1; i < pts.length; i++) {
    if ((pts[i - 1].pnlExp <= 0 && pts[i].pnlExp >= 0) || (pts[i - 1].pnlExp >= 0 && pts[i].pnlExp <= 0)) {
      const ratio = Math.abs(pts[i - 1].pnlExp) / (Math.abs(pts[i - 1].pnlExp) + Math.abs(pts[i].pnlExp));
      breakevens.push(pts[i - 1].st + ratio * (pts[i].st - pts[i - 1].st));
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {/* Three-up: Strategy selector (left) + Strike inputs (middle) + Leg breakdown (right) */}
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

        {/* Strike inputs — stacked vertically */}
        <div style={{ ...cardBox(), padding: 12, flex: "1 1 0", minWidth: 200, display: "flex", flexDirection: "column", gap: 10 }}>
          {strat.strikes.map(k => (
            <div key={k} style={inputGroup}>
              <span style={labelStyle()}>{strat.strikeLabels[k]}</span>
              <input style={inputStyle()} type="number" step="0.50" value={strikes[k] || ""} onChange={setStrike(k)} />
            </div>
          ))}
        </div>

        {/* Leg breakdown — fills remaining width */}
        <div style={{ ...cardBox(), padding: 12, flex: "1 1 0", minWidth: 200 }}>
          <div style={{ fontSize: 11, color: C.textDim, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>Leg Breakdown</div>
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
                <div style={{ color: C.textSec, textAlign: "right", padding: "4px 0" }}>${l.K.toFixed(2)}</div>
                <div style={{ color: l.dir > 0 ? C.redText : C.greenText, textAlign: "right", padding: "4px 0" }}>
                  {l.dir > 0 ? "−" : "+"}${l.price.toFixed(2)}
                </div>
                <div style={{ color: C.textSec, textAlign: "right", padding: "4px 0" }}>{(l.dir * l.greeks.delta).toFixed(4)}</div>
              </div>
            ))}
            <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 6, fontWeight: 700, color: C.text }}>Net</div>
            <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 6 }} />
            <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 6, textAlign: "right", fontWeight: 700, color: netPremium < 0 ? C.greenText : C.redText, fontFamily: "monospace" }}>
              {netPremium < 0 ? "+" : "−"}${Math.abs(netPremium).toFixed(2)}
            </div>
            <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 6, textAlign: "right", fontWeight: 700, color: C.text, fontFamily: "monospace" }}>
              {netGreeks.delta.toFixed(4)}
            </div>
          </div>
          <div style={{ marginTop: 8, fontSize: 11, color: C.textMuted }}>
            {netPremium > 0 ? `Net debit: $${netPremium.toFixed(2)} paid` : `Net credit: $${Math.abs(netPremium).toFixed(2)} received`}
          </div>
        </div>
      </div>

      {/* P&L Chart */}
      <div style={{ ...cardBox(), padding: 12 }}>
        <div style={{ display: "flex", gap: 16, marginBottom: 6, justifyContent: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
            <div style={{ width: 16, height: 3, background: C.accent, borderRadius: 2 }} />
            <span style={{ color: C.textDim }}>At Expiration</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
            <div style={{ width: 16, height: 3, background: C.greenText, borderRadius: 2, opacity: 0.6 }} />
            <span style={{ color: C.textDim }}>Current (theoretical)</span>
          </div>
        </div>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto" }}>
          {yTicks.map(v => (
            <g key={v}>
              <line x1={mx} x2={W - mx} y1={toY(v)} y2={toY(v)} stroke={C.border} strokeWidth={0.5} />
              <text x={mx - 6} y={toY(v) + 4} fill={C.textMuted} fontSize={10} textAnchor="end">${v.toFixed(0)}</text>
            </g>
          ))}
          <line x1={mx} x2={W - mx} y1={zeroY} y2={zeroY} stroke={C.textDim} strokeWidth={1} strokeDasharray="4,3" />
          <text x={W - mx + 4} y={zeroY + 4} fill={C.textDim} fontSize={9}>$0</text>
          {/* Strike markers */}
          {legDetails.map((l, i) => (
            <g key={i}>
              <line x1={toX(l.K)} x2={toX(l.K)} y1={my} y2={H - my} stroke={C.textMuted} strokeWidth={0.7} strokeDasharray="3,4" opacity={0.5} />
              <text x={toX(l.K)} y={H - my + 12} fill={C.textMuted} fontSize={8} textAnchor="middle">${l.K.toFixed(0)}</text>
            </g>
          ))}
          {/* Breakeven markers */}
          {breakevens.map((be, i) => (
            <g key={`be${i}`}>
              <line x1={toX(be)} x2={toX(be)} y1={my} y2={H - my} stroke={C.accent} strokeWidth={1} strokeDasharray="2,3" opacity={0.6} />
              <text x={toX(be)} y={my - 6} fill={C.accent} fontSize={9} textAnchor="middle">BE=${be.toFixed(2)}</text>
            </g>
          ))}
          {/* Profit zone fill */}
          <path d={pathExp + `L${toX(hi).toFixed(1)},${zeroY.toFixed(1)}L${toX(lo).toFixed(1)},${zeroY.toFixed(1)}Z`} fill="url(#profitGrad)" opacity={0.15} />
          <defs>
            <linearGradient id="profitGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={C.green} />
              <stop offset="50%" stopColor="transparent" />
              <stop offset="100%" stopColor={C.red} />
            </linearGradient>
          </defs>
          <path d={pathNow} fill="none" stroke={C.greenText} strokeWidth={2} opacity={0.55} />
          <path d={pathExp} fill="none" stroke={C.accent} strokeWidth={2.5} />
          <text x={mx} y={H - 4} fill={C.textMuted} fontSize={10}>Stock: ${lo.toFixed(0)}</text>
          <text x={W - mx} y={H - 4} fill={C.textMuted} fontSize={10} textAnchor="end">${hi.toFixed(0)}</text>
        </svg>
      </div>

      {/* Combined: summary stats (top row) + net greeks (bottom row) in one card */}
      <div style={{ ...cardBox(), padding: 10, display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", gap: 8 }}>
          {[
            { label: "NET PREMIUM", val: `${netPremium > 0 ? "−" : "+"}$${Math.abs(netPremium).toFixed(2)}`, color: netPremium > 0 ? C.redText : C.greenText, bg: netPremium > 0 ? "rgba(239,68,68,0.08)" : "rgba(34,197,94,0.08)" },
            { label: "MAX PROFIT", val: maxProfit > 50000 ? "Unlimited" : `$${maxProfit.toFixed(2)}`, color: C.greenText, bg: "rgba(34,197,94,0.08)" },
            { label: "MAX LOSS", val: maxLoss < -50000 ? "Unlimited" : `$${maxLoss.toFixed(2)}`, color: C.redText, bg: "rgba(239,68,68,0.08)" },
            { label: breakevens.length > 1 ? "BREAKEVENS" : "BREAKEVEN", val: breakevens.length ? breakevens.map(b => `$${b.toFixed(2)}`).join(" / ") : "N/A", color: C.accent, bg: C.accentGlow },
          ].map(s => (
            <div key={s.label} style={{ flex: 1, textAlign: "center", padding: "6px 8px", borderRadius: 6, background: s.bg }}>
              <div style={{ fontSize: 9, color: C.textMuted, marginBottom: 2, letterSpacing: "0.04em" }}>{s.label}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: s.color, fontFamily: "monospace" }}>{s.val}</div>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {[
            { name: "Delta", sym: "Δ", val: netGreeks.delta, color: C.accent },
            { name: "Gamma", sym: "Γ", val: netGreeks.gamma, color: C.purple },
            { name: "Theta", sym: "Θ", val: netGreeks.theta, color: C.redText },
            { name: "Vega", sym: "ν", val: netGreeks.vega, color: C.yellow },
            { name: "Rho", sym: "ρ", val: netGreeks.rho, color: C.accentHover },
          ].map(g => (
            <div key={g.name} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "6px 8px", borderRadius: 6, background: C.cardAlt }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: g.color, fontFamily: "serif" }}>{g.sym}</span>
              <span style={{ fontSize: 9, color: C.textMuted }}>{g.name}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: C.text, fontFamily: "monospace", marginLeft: "auto" }}>{g.val.toFixed(4)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Main App ───
const pages = [
  { id: "pricing", label: "Option Pricing", icon: "⚡" },
  { id: "greeks", label: "Greeks", icon: "Δ" },
  { id: "payoff", label: "P&L Payoff", icon: "📈" },
  { id: "iv", label: "IV Solver", icon: "σ" },
  { id: "spreads", label: "Spreads", icon: "🔀" },
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
    type: searchParams.get("type") || "call",
    ticker: searchParams.get("ticker") || "",
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

  // Tier gate: only Active and Professional can access
  const allowedTiers = ['active', 'professional'];
  if (!user || !allowedTiers.includes(user.subscription_tier)) {
    return (
      <UpgradeRequiredPage
        user={user}
        feature="Options Calculator"
        featureDescription="Advanced options pricing with Black-Scholes, Greeks, and spread strategies."
        minimumTier="active"
        onLogout={() => {
          localStorage.removeItem('access_token');
          navigate('/login');
        }}
      />
    );
  }

  const handleLogout = () => {
    localStorage.removeItem('access_token');
    navigate('/login');
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: C.bg, color: C.text, fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
      <NavBar currentPage="options-calculator" user={user} onLogout={handleLogout} />
      <div style={{ display: "flex", flex: 1 }}>
      {/* Sidebar — matches nav bg-gray-900 with border-gray-700 */}
      <div style={sidebarStyle()}>
        <div style={{ padding: "0 20px 24px", borderBottom: `1px solid ${C.border}`, marginBottom: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.text, letterSpacing: "-0.01em" }}>Options Calculator</div>
          <div style={{ fontSize: 10, color: C.textMuted, marginTop: 2 }}>Institutional-grade tools</div>
        </div>
        {pages.map(p => (
          <button key={p.id} style={navBtn(page === p.id)} onClick={() => setPage(p.id)}>
            <span style={{ marginRight: 8 }}>{p.icon}</span>{p.label}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <div style={{ padding: "16px 20px", borderTop: `1px solid ${C.border}`, fontSize: 10, color: C.textMuted, lineHeight: 1.5 }}>
          Black-Scholes &amp; Binomial models. For educational purposes. Not financial advice.
        </div>
      </div>

      {/* Main content — matches bg-gray-800 page area */}
      <div style={{ flex: 1, padding: 24, overflowY: "auto", display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>
            {pages.find(p => p.id === page)?.icon}{" "}
            {pages.find(p => p.id === page)?.label}
          </h2>
          {page !== "spreads" && (
            <div style={{ display: "flex", gap: 6 }}>
              <button style={pillBtn(params.type === "call")} onClick={() => setParams(p => ({...p, type: "call"}))}>Call</button>
              <button style={pillBtn(params.type === "put")} onClick={() => setParams(p => ({...p, type: "put"}))}>Put</button>
            </div>
          )}
        </div>
        <InputPanel params={params} setParams={setParams} page={page} />
        {page === "pricing" && <PricingPage params={params} />}
        {page === "greeks" && <GreeksPage params={params} />}
        {page === "payoff" && <PayoffPage params={params} />}
        {page === "iv" && <IVSolverPage params={params} />}
        {page === "spreads" && <SpreadsPage params={params} initialStrategy={urlStrategy} initialStrikes={urlStrikes} />}
      </div>
      </div>
    </div>
  );
}
