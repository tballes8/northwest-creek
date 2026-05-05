import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { authAPI, dcfAPI, watchlistAPI } from '../services/api';
import { User } from '../types';
import NavBar from '../components/NavBar';
import BackToTop from '../components/BackToTop';
import UpgradeRequired from '../components/UpgradeRequired';
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area,
  XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine, Cell
} from 'recharts';

// ─── Black-Scholes utilities (for Trade This strategy suggestions) ───
const _norm = {
  cdf: (x: number): number => {
    const a1=0.254829592, a2=-0.284496736, a3=1.421413741, a4=-1.453152027, a5=1.061405429, p=0.3275911;
    const sign = x < 0 ? -1 : 1;
    const t = 1 / (1 + p * Math.abs(x));
    const y = 1 - (((((a5*t+a4)*t)+a3)*t+a2)*t+a1)*t * Math.exp(-x*x/2);
    return 0.5 * (1 + sign * y);
  }
};

function _bsPrice(S: number, K: number, T: number, r: number, sigma: number, type: "call" | "put"): number {
  if (T <= 0 || sigma <= 0) return Math.max(type === "call" ? S - K : K - S, 0);
  const d1 = (Math.log(S/K) + (r + sigma*sigma/2)*T) / (sigma*Math.sqrt(T));
  const d2 = d1 - sigma*Math.sqrt(T);
  if (type === "call") return S*_norm.cdf(d1) - K*Math.exp(-r*T)*_norm.cdf(d2);
  return K*Math.exp(-r*T)*_norm.cdf(-d2) - S*_norm.cdf(-d1);
}

function _roundStrike(price: number): number {
  if (price >= 50) return Math.round(price / 5) * 5;
  if (price >= 25) return Math.round(price / 2.5) * 2.5;
  return Math.round(price);
}

interface TradeSuggestion {
  strategyType: string;
  strategyName: string;
  direction: "bullish" | "bearish";
  K1: number;
  K2: number;
  spreadCost: number;
  maxProfit: number;
  maxLoss: number;
  breakeven: number;
  probProfit: number;
  contracts: number;
  days: number;
  expectedMove: number;
}

function suggestStrategy(
  currentPrice: number,
  targetPrice: number,
  confidence: "low" | "medium" | "high",
  days: number,
  maxCapital: number,
): TradeSuggestion | null {
  const isBullish = targetPrice > currentPrice * 1.02;
  const isBearish = targetPrice < currentPrice * 0.98;
  if (!isBullish && !isBearish) return null;

  const T = days / 365;
  const sigma = 0.30;
  const r = 0.05;
  // 1σ expected move of the underlying by expiration. This is what bounds where the
  // short strike can realistically end up — DCF intrinsic value is a multi-year
  // estimate and is not a near-term price target.
  const expectedMove = currentPrice * sigma * Math.sqrt(T);
  let K1: number, K2: number, strategyType: string, strategyName: string;

  if (isBullish) {
    strategyType = "bullCall";
    strategyName = "Bull Call Spread";
    if (confidence === "high") {
      K1 = _roundStrike(currentPrice);
      K2 = _roundStrike(Math.min(targetPrice, currentPrice + 2.0 * expectedMove));
    } else if (confidence === "medium") {
      K1 = _roundStrike(currentPrice);
      K2 = _roundStrike(Math.min(targetPrice, currentPrice + 1.0 * expectedMove));
    } else {
      K1 = _roundStrike(currentPrice + 0.25 * expectedMove);
      K2 = _roundStrike(currentPrice + 0.75 * expectedMove);
    }
    const minGap = currentPrice >= 50 ? 5 : currentPrice >= 25 ? 2.5 : 1;
    if (K2 <= K1) K2 = K1 + minGap;
  } else {
    strategyType = "bearPut";
    strategyName = "Bear Put Spread";
    if (confidence === "high") {
      K1 = _roundStrike(Math.max(targetPrice, currentPrice - 2.0 * expectedMove));
      K2 = _roundStrike(currentPrice);
    } else if (confidence === "medium") {
      K1 = _roundStrike(Math.max(targetPrice, currentPrice - 1.0 * expectedMove));
      K2 = _roundStrike(currentPrice);
    } else {
      K1 = _roundStrike(currentPrice - 0.75 * expectedMove);
      K2 = _roundStrike(currentPrice - 0.25 * expectedMove);
    }
    const minGap = currentPrice >= 50 ? 5 : currentPrice >= 25 ? 2.5 : 1;
    if (K1 >= K2) K1 = K2 - minGap;
  }

  let spreadCost: number, maxProfit: number, breakeven: number;
  if (isBullish) {
    spreadCost = _bsPrice(currentPrice, K1, T, r, sigma, "call") - _bsPrice(currentPrice, K2, T, r, sigma, "call");
    maxProfit = (K2 - K1) - spreadCost;
    breakeven = K1 + spreadCost;
  } else {
    spreadCost = _bsPrice(currentPrice, K2, T, r, sigma, "put") - _bsPrice(currentPrice, K1, T, r, sigma, "put");
    maxProfit = (K2 - K1) - spreadCost;
    breakeven = K2 - spreadCost;
  }
  const maxLoss = spreadCost;

  const d = (Math.log(currentPrice / breakeven) + (r - 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
  const probProfit = Math.min(100, Math.max(0,
    (isBullish ? _norm.cdf(d) : 1 - _norm.cdf(d)) * 100
  ));

  const contracts = maxCapital > 0 && spreadCost > 0 ? Math.floor(maxCapital / (spreadCost * 100)) : 0;

  return {
    strategyType, strategyName, direction: isBullish ? "bullish" : "bearish",
    K1, K2, spreadCost, maxProfit, maxLoss, breakeven, probProfit, contracts, days,
    expectedMove,
  };
}

interface DCFSuggestions {
  ticker: string;
  company_name: string;
  sector: string;
  industry: string;
  current_price: number;
  market_cap: number;
  size_category: string;
  security_type?: string;  // CS, WARRANT, ETF
  shares_outstanding?: number | null;
  suggestions: {
    growth_rate: number;
    terminal_growth: number;
    discount_rate: number;
    projection_years: number;
  };
  reasoning: {
    growth_rate: string;
    terminal_growth: string;
    discount_rate: string;
    projection_years: string;
  };
  sources?: {
    growth_rate: string;
    discount_rate: string;
    terminal_growth: string;
    projection_years: string;
  };
  actuals?: {
    revenue_ttm: number | null;
    revenue_ttm_fmt: string | null;
    net_income_ttm: number | null;
    net_income_ttm_fmt: string | null;
    fcf_ttm: number | null;
    fcf_ttm_fmt: string | null;
    operating_cf_ttm: number | null;
    operating_cf_ttm_fmt: string | null;
    gross_margin_pct: number | null;
    operating_margin_pct: number | null;
    net_margin_pct: number | null;
    revenue_growth_yoy_pct: number | null;
    pe_ratio: number | null;
    ev_to_ebitda: number | null;
    debt_to_equity: number | null;
    current_ratio: number | null;
    roe: number | null;
    diluted_eps: number | null;
  } | null;
  growth_profile?: {
    revenue_trend: Array<{ period: string; period_end: string | null; value: number | null }>;
    gross_margin_trend: Array<{ period: string; period_end: string | null; value: number | null }>;
    eps_trend: Array<{ period: string; period_end: string | null; value: number | null }>;
    fcf_trend: Array<{ period: string; period_end: string | null; value: number | null }>;
    revenue_growth_trend: Array<{ period: string; period_end: string | null; value: number | null }>;
    rule_of_40: number | null;
    rule_of_40_trend: Array<{
      period: string;
      period_end: string | null;
      value: number | null;
      revenue_growth: number | null;
      fcf_margin: number | null;
    }>;
    rule_of_40_trend_direction: 'improving' | 'declining' | 'stable' | null;
    rule_of_40_components: {
      revenue_growth_yoy: number | null;
      fcf_margin: number | null;
    };
    quarters_available: number;
    fcf_quarters_available: number;
    is_stale: boolean;
    stale_reason: string | null;
    newest_period_end: string | null;
    financials_cik: string | null;
    current_cik: string | null;
  } | null;
}

interface DCFData {
  ticker: string;
  company_name: string;
  security_type?: string;  // CS, WARRANT, ETF, etc. from Polygon
  current_price: number;
  assumptions: {
    growth_rate: number;
    terminal_growth: number;
    discount_rate: number;
    projection_years: number;
    current_fcf: number;
    shares_outstanding: number;
    fcf_source?: string;
    shares_source?: string;
  };
  projections: Array<{
    year: number;
    cash_flow: number;
    present_value: number;
    discount_factor: number;
  }>;
  terminal_value: {
    value: number;
    present_value: number;
    growth_rate: number;
  };
  valuation: {
    sum_pv_cash_flows: number;
    terminal_pv: number;
    enterprise_value: number;
    equity_bridge?: {
      cash: number | null;
      debt: number | null;
      net_debt_adjustment: number;
      has_equity_bridge: boolean;
    };
    equity_value?: number;
    intrinsic_value_per_share: number;
    current_price: number;
    margin_of_safety: number;
  };
  recommendation: {
    rating: string;
    color: string;
    message: string;
  };
  fmp_benchmark?: {
    dcf_value: number | null;
    levered_dcf_value: number | null;
    equity_value_per_share: number | null;
    wacc: number | null;
    terminal_value: number | null;
    enterprise_value: number | null;
    source: string;
  };
}

const DCFValuation: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const urlTicker = searchParams.get('ticker') || '';
  const [user, setUser] = useState<User | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [ticker, setTicker] = useState(urlTicker);
  const [growthRate, setGrowthRate] = useState(5);
  const [terminalGrowth, setTerminalGrowth] = useState(2.5);
  const [discountRate, setDiscountRate] = useState(10);
  const [projectionYears, setProjectionYears] = useState(5);
  const [loading, setLoading] = useState(false);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [dcfData, setDcfData] = useState<DCFData | null>(null);
  const [suggestions, setSuggestions] = useState<DCFSuggestions | null>(null);
  const [error, setError] = useState('');
  const [hasLoadedInitialSuggestions, setHasLoadedInitialSuggestions] = useState(false);
  const [isWarrant, setIsWarrant] = useState(false);
  const [relatedCommonStock, setRelatedCommonStock] = useState<string | null>(null);
  const [watchlistMsg, setWatchlistMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [addingToWatchlist, setAddingToWatchlist] = useState(false);
  const [prefilledFromTA, setPrefilledFromTA] = useState<{
    growth: number | null;
    wacc: number | null;
    fcf: number | null;
    revGrowth: number | null;
    opMargin: number | null;
    deRatio: number | null;
  } | null>(null);

  // Trade This modal state
  const [showTradeModal, setShowTradeModal] = useState(false);
  const [tradeTimeframe, setTradeTimeframe] = useState<"14" | "30" | "90">("30");
  const [tradeConfidence, setTradeConfidence] = useState<"low" | "medium" | "high">("medium");
  const [tradeMaxCapital, setTradeMaxCapital] = useState("1000");

  // Warrant detection is now API-driven using Polygon's `type` field (CS, WARRANT, ETF, etc.)
  // These helpers are only used as a pre-fetch hint for explicit separator patterns
  const detectWarrantHint = (tickerSymbol: string): boolean => {
    const upper = tickerSymbol.toUpperCase();
    // Only match unambiguous separator-based warrant patterns
    return (
      upper.includes('.W') ||   // e.g. ACAH.W, ACAH.WS
      upper.includes('+W') ||   // e.g. ACAH+W
      upper.endsWith('/WS') ||  // e.g. ACAH/WS
      upper.endsWith('/WT')     // e.g. ACAH/WT
    );
  };

  const getRelatedCommonStock = (warrantTicker: string): string | null => {
    const upper = warrantTicker.toUpperCase();
    // Strip explicit warrant suffixes with separators
    const patterns = ['.WS', '.WT', '.W', '+WS', '+WT', '+W', '/WS', '/WT', '/W'];
    for (const pat of patterns) {
      if (upper.endsWith(pat)) {
        return upper.slice(0, -pat.length);
      }
    }
    return null;
  };

  const loadUser = useCallback(async () => {
    try {
      const response = await authAPI.getCurrentUser();
      setUser(response.data);
    } catch (error) {
      console.error('Failed to load user:', error);
      if ((error as any).response?.status === 401) {
        localStorage.removeItem('access_token');
        navigate('/login');
      }
    }
  }, [navigate]);
  
  const loadSuggestions = useCallback(async (symbol: string, skipParamOverride: boolean = false) => {
    if (!symbol.trim()) return;

    setLoadingSuggestions(true);
    setError('');
    
    try {
      const response = await dcfAPI.getSuggestions(symbol.toUpperCase());
      setSuggestions(response.data);
      
      // API-driven warrant detection — overrides any pre-fetch hint
      const apiType = response.data.security_type || '';
      if (apiType === 'WARRANT') {
        setIsWarrant(true);
        const related = getRelatedCommonStock(symbol);
        if (related) {
          setRelatedCommonStock(related);
        } else {
          const stripped = symbol.toUpperCase().replace(/W+$/, '');
          setRelatedCommonStock(stripped.length >= 2 && stripped !== symbol.toUpperCase() ? stripped : null);
        }
      } else if (apiType === 'CS' || apiType === 'ADRC' || apiType === 'PFD') {
        // Confirmed common stock / ADR / preferred — clear any false positive
        setIsWarrant(false);
        setRelatedCommonStock(null);
      }
      // If apiType is empty/unknown, keep the hint-based detection as-is
      
      // Only set parameters if NOT pre-filled from Technical Analysis
      if (!skipParamOverride) {
        setGrowthRate(response.data.suggestions.growth_rate * 100);
        setTerminalGrowth(response.data.suggestions.terminal_growth * 100);
        setDiscountRate(response.data.suggestions.discount_rate * 100);
        setProjectionYears(response.data.suggestions.projection_years);
      }
      setShowSuggestions(true);
    } catch (err: any) {
      console.error('Failed to load suggestions:', err);
      // Don't show error to user, just use default values
      setShowSuggestions(false);
    } finally {
      setLoadingSuggestions(false);
    }
  }, []);

  useEffect(() => {
    loadUser();
  }, [loadUser]);

  // Separate useEffect for handling URL ticker parameter
  useEffect(() => {
    if (urlTicker && !hasLoadedInitialSuggestions) {
      setTicker(urlTicker);
      setHasLoadedInitialSuggestions(true);
      
      // Pre-fetch hint only — real warrant detection happens after API response
      const isWarrantHint = detectWarrantHint(urlTicker);
      setIsWarrant(isWarrantHint);
      if (isWarrantHint) {
        setRelatedCommonStock(getRelatedCommonStock(urlTicker));
      }
      
      // Check if we have pre-populated inputs from Technical Analysis
      const fromTA = searchParams.get('from') === 'ta';
      const urlGrowth = searchParams.get('growth');
      const urlWacc = searchParams.get('wacc');
      
      if (fromTA && (urlGrowth || urlWacc)) {
        // Apply actual financials directly — skip the suggestions API call
        if (urlGrowth) setGrowthRate(parseFloat(urlGrowth));
        if (urlWacc) setDiscountRate(parseFloat(urlWacc));
        
        // Build a lightweight "suggestions" object from URL params for display
        const urlRevGrowth = searchParams.get('revgrowth');
        const urlFcf = searchParams.get('fcf');
        const urlOpMarg = searchParams.get('opmarg');
        const urlDe = searchParams.get('de');
        
        setPrefilledFromTA({
          growth: urlGrowth ? parseFloat(urlGrowth) : null,
          wacc: urlWacc ? parseFloat(urlWacc) : null,
          fcf: urlFcf ? parseFloat(urlFcf) : null,
          revGrowth: urlRevGrowth ? parseFloat(urlRevGrowth) : null,
          opMargin: urlOpMarg ? parseFloat(urlOpMarg) : null,
          deRatio: urlDe ? parseFloat(urlDe) : null,
        });
        
        // Still load full suggestions in background to get company name, sector, actuals grid
        loadSuggestions(urlTicker, true);
      } else {
        loadSuggestions(urlTicker);
      }
    }
  }, [urlTicker, hasLoadedInitialSuggestions, searchParams, loadSuggestions]);

  const [limitData, setLimitData] = useState<{ currentUsage: number; maxUsage: number; period: string } | null>(null);

  const handleCalculate = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!ticker.trim()) {
      setError('Please enter a ticker symbol');
      return;
    }

    setLoading(true);
    setError('');
    setDcfData(null);

    try {
      const response = await dcfAPI.calculate(ticker.toUpperCase(), {
        growth_rate: growthRate / 100,
        terminal_growth: terminalGrowth / 100,
        discount_rate: discountRate / 100,
        projection_years: projectionYears
      });

      setDcfData(response.data);
      setShowSuggestions(false);
    } catch (err: any) {
      console.error('DCF calculation error:', err);
      if (err.response?.status === 403 && err.response?.data?.detail?.current_usage !== undefined) {
        setLimitData({
          currentUsage: err.response.data.detail.current_usage,
          maxUsage: err.response.data.detail.max_usage,
          period: err.response.data.detail.period,
        });
      } else {
        setError(err.response?.data?.detail || 'Failed to calculate DCF. Please check the ticker symbol and try again.');
      }
    } finally {
      setLoading(false);
    }
  };
	
  const handleTickerChange = (value: string) => {
    setTicker(value);
    setPrefilledFromTA(null);
    
    // Pre-fetch hint only — real warrant detection happens after API response
    const isWarrantHint = detectWarrantHint(value);
    setIsWarrant(isWarrantHint);
    if (isWarrantHint) {
      setRelatedCommonStock(getRelatedCommonStock(value));
    } else {
      setRelatedCommonStock(null);
    }
  };

  const handleGetSuggestions = () => {
    if (ticker.trim()) {
      loadSuggestions(ticker);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('access_token');
    navigate('/');
  };

  const handleAddToWatchlist = async () => {
    const t = ticker.trim().toUpperCase() || dcfData?.ticker;
    if (!t) return;
    setAddingToWatchlist(true);
    setWatchlistMsg(null);
    try {
      const payload: any = { ticker: t };
      if (dcfData?.current_price) {
        payload.target_price = dcfData.current_price;
      }
      const parts = [];
      if (dcfData?.company_name) parts.push(dcfData.company_name);
      if (suggestions?.sector) parts.push(suggestions.sector);
      if (parts.length > 0) {
        payload.notes = parts.join(' – ');
      }
      await watchlistAPI.add(payload);
      setWatchlistMsg({ type: 'success', text: `${t} added to watchlist!` });
      setTimeout(() => setWatchlistMsg(null), 3000);
    } catch (err: any) {
      const msg = err.response?.data?.detail || 'Failed to add to watchlist';
      setWatchlistMsg({ type: 'error', text: typeof msg === 'string' ? msg : 'Failed to add to watchlist' });
      setTimeout(() => setWatchlistMsg(null), 4000);
    } finally {
      setAddingToWatchlist(false);
    }
  };

  const formatCurrency = (value: number) => {
    if (Math.abs(value) >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
    if (Math.abs(value) >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
    if (Math.abs(value) >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
    if (Math.abs(value) >= 1e3) return `$${(value / 1e3).toFixed(2)}K`;
    return `$${value.toFixed(2)}`;
  };

  // Chart helpers for Growth Profile
  const formatChartValue = (value: number | null) => {
    if (value == null) return '—';
    const abs = Math.abs(value);
    if (abs >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
    if (abs >= 1e6) return `$${(value / 1e6).toFixed(0)}M`;
    if (abs >= 1e3) return `$${(value / 1e3).toFixed(0)}K`;
    return `$${value.toFixed(2)}`;
  };

  const GrowthChartTooltip = ({ active, payload, label, isCurrency, isPercent }: any) => {
    if (!active || !payload?.length) return null;
    const val = payload[0].value;
    let formatted = val?.toFixed(2) ?? '—';
    if (isCurrency && val != null) formatted = formatChartValue(val);
    if (isPercent && val != null) formatted = `${val.toFixed(1)}%`;
    return (
      <div className="bg-gray-800 text-white text-xs px-3 py-2 rounded shadow-lg border border-gray-600">
        <p className="font-medium">{label}</p>
        <p className="text-primary-300">{formatted}</p>
      </div>
    );
  };
  if (limitData) {
    return (
      <div className="min-h-screen bg-gray-100 dark:bg-gray-800 transition-colors duration-200">
        <NavBar currentPage="dcf-valuation" user={user} onLogout={handleLogout} />
        <UpgradeRequired
          feature="DCF Valuation"
          currentTier={user?.subscription_tier || "beginner"}
          limitReached={true}
          currentUsage={limitData.currentUsage}
          maxUsage={limitData.maxUsage}
          onBack={() => setLimitData(null)}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-800 transition-colors duration-200">
      <NavBar currentPage="dcf-valuation" user={user} onLogout={handleLogout} />

      {/* Main Content */}
      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Warrant Warning Box */}
        {isWarrant && (
          <div className="bg-yellow-50 dark:bg-yellow-900/30 border-2 border-yellow-500 dark:border-yellow-600 rounded-lg p-6 mb-6">
            <div className="flex items-start gap-3">
              <div className="text-3xl">⚠️</div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-yellow-900 dark:text-yellow-200 mb-2">
                  Warning: DCF Valuation Not Recommended for Warrants
                </h3>
                <div className="text-yellow-800 dark:text-yellow-300 space-y-2">
                  <p className="font-medium">
                    <strong>Important:</strong> Traditional DCF (Discounted Cash Flow) analysis is designed for common stocks and is <strong>not appropriate</strong> for warrant valuation.
                  </p>
                  <div className="space-y-1.5 text-sm">
                    <p><strong>Why DCF doesn't work for warrants:</strong></p>
                    <ul className="list-disc list-inside ml-4 space-y-1">
                      <li>Warrants don't generate cash flows - they're derivative securities</li>
                      <li>Warrant value depends on the underlying stock's volatility and time to expiration</li>
                      <li>DCF assumes stable, predictable cash flows - warrants have none</li>
                      <li>The appropriate model for warrants is Black-Scholes or similar option pricing models</li>
                    </ul>
                    
                    <div className="mt-3 p-3 bg-yellow-100 dark:bg-yellow-900/50 rounded border border-yellow-300 dark:border-yellow-700">
                      <p className="font-semibold mb-1">Recommended Action:</p>
                      <p>Analyze the <strong>underlying common stock</strong> instead:</p>
                      {relatedCommonStock && (
                        <div className="mt-2">
                          <Link
                            to={`/dcf-valuation?ticker=${relatedCommonStock}`}
                            className="inline-block px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg font-medium transition-colors"
                          >
                            Analyze {relatedCommonStock} (Common Stock) →
                          </Link>
                        </div>
                      )}
                    </div>
                    
                    <div className="mt-3 p-3 bg-blue-100 dark:bg-blue-900/30 rounded border border-blue-300 dark:border-blue-700">
                      <p className="font-semibold text-blue-900 dark:text-blue-200 mb-1">For Warrant Valuation:</p>
                      <ul className="list-disc list-inside ml-4 space-y-1 text-blue-800 dark:text-blue-300">
                        <li>Use Black-Scholes option pricing model</li>
                        <li>Consider: Strike price, time to expiration, volatility</li>
                        <li>Compare warrant price to intrinsic value (Stock Price - Strike Price)</li>
                        <li>Assess time value remaining before expiration</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Input Form */}
        <div className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 p-6 mb-6 border dark:border-gray-500">
          <form onSubmit={handleCalculate} className="space-y-6">
            {/* Ticker Input */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Stock Ticker {isWarrant && <span className="text-yellow-600 dark:text-yellow-400 text-xs ml-2">(WARRANT - Not recommended for DCF)</span>}
              </label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    type="text"
                    value={ticker}
                    onChange={(e) => handleTickerChange(e.target.value.toUpperCase())}
                    placeholder="e.g., AAPL, MSFT"
                    className="w-full px-4 py-2 pr-10 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-600 text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500"
                  />
                  {ticker && (
                    <button
                      type="button"
                      onClick={() => {
                        setTicker('');
                        setSuggestions(null);
                        setShowSuggestions(false);
                        setDcfData(null);
                        setError('');
                        setIsWarrant(false);
                        setRelatedCommonStock(null);
                        setPrefilledFromTA(null);
                      }}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
                      title="Clear search"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  onClick={handleGetSuggestions}
                  disabled={loadingSuggestions || !ticker.trim()}
                  className="px-6 py-2 bg-gray-600 hover:bg-gray-700 dark:bg-gray-500 dark:hover:bg-gray-600 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
                >
                  {loadingSuggestions ? 'Loading...' : 'Get AI Suggestions'}
                </button>
                {(dcfData || suggestions) && (
                  <button
                    type="button"
                    onClick={() => {
                      setTicker('');
                      setSuggestions(null);
                      setShowSuggestions(false);
                      setDcfData(null);
                      setError('');
                      setIsWarrant(false);
                      setRelatedCommonStock(null);
                      setPrefilledFromTA(null);
                    }}
                    className="px-4 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-600 dark:hover:bg-gray-500 text-gray-700 dark:text-gray-200 rounded-lg font-medium transition-colors text-sm whitespace-nowrap"
                  >
                    🔄 New Search
                  </button>
                )}
              </div>
            </div>

            {/* Show Suggestions */}
            {showSuggestions && suggestions && (
              <div className="bg-blue-50 dark:bg-blue-900/30 p-4 rounded-lg border border-blue-200 dark:border-blue-800">
                <h3 className="text-lg font-bold text-blue-900 dark:text-blue-200 mb-2">
                  AI-Suggested Parameters for {suggestions.company_name}
                </h3>
                <div className="text-sm text-blue-800 dark:text-blue-300 space-y-1">
                  <p><strong>Sector:</strong> {suggestions.sector} | <strong>Size:</strong> {suggestions.size_category.replace('_', ' ').toUpperCase()}</p>
                </div>

                {/* Pre-filled from Technical Analysis banner */}
                {prefilledFromTA && (
                  <div className="mt-3 bg-green-50 dark:bg-green-900/30 rounded-lg p-3 border border-green-200 dark:border-green-700">
                    <div className="flex items-start gap-2">
                      <span className="text-green-600 dark:text-green-400 text-lg leading-none">✓</span>
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-green-800 dark:text-green-200">
                          Inputs pre-filled from actual financial data
                        </p>
                        <p className="text-xs text-green-700 dark:text-green-300 mt-0.5">
                          Growth rate and discount rate were derived from SEC filings via Technical Analysis.
                          You can adjust them below before calculating.
                        </p>
                        <div className="flex flex-wrap gap-3 mt-2 text-xs">
                          {prefilledFromTA.revGrowth != null && (
                            <span className="text-green-700 dark:text-green-300">
                              <strong>Trailing Rev. Growth:</strong> {prefilledFromTA.revGrowth.toFixed(1)}%
                            </span>
                          )}
                          {prefilledFromTA.growth != null && (
                            <span className="text-green-700 dark:text-green-300">
                              <strong>→ Suggested Growth:</strong> {prefilledFromTA.growth.toFixed(1)}%
                            </span>
                          )}
                          {prefilledFromTA.wacc != null && (
                            <span className="text-green-700 dark:text-green-300">
                              <strong>Est. WACC:</strong> {prefilledFromTA.wacc.toFixed(1)}%
                            </span>
                          )}
                          {prefilledFromTA.deRatio != null && (
                            <span className="text-green-700 dark:text-green-300">
                              <strong>D/E:</strong> {prefilledFromTA.deRatio.toFixed(2)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                
                {/* Actual Financials Grid */}
                {suggestions.actuals && (
                  <div className="mt-3 pt-3 border-t border-blue-200 dark:border-blue-700">
                    <p className="text-xs font-semibold text-blue-700 dark:text-blue-300 uppercase tracking-wider mb-2">
                      📊 From SEC Filings (TTM)
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2">
                      {[
                        { label: 'Revenue', value: suggestions.actuals.revenue_ttm_fmt },
                        { label: 'Net Income', value: suggestions.actuals.net_income_ttm_fmt },
                        { label: 'Free Cash Flow', value: suggestions.actuals.fcf_ttm_fmt },
                        { label: 'Gross Margin', value: suggestions.actuals.gross_margin_pct != null ? `${suggestions.actuals.gross_margin_pct.toFixed(1)}%` : null },
                        { label: 'Op. Margin', value: suggestions.actuals.operating_margin_pct != null ? `${suggestions.actuals.operating_margin_pct.toFixed(1)}%` : null },
                        { label: 'Net Margin', value: suggestions.actuals.net_margin_pct != null ? `${suggestions.actuals.net_margin_pct.toFixed(1)}%` : null },
                        { label: 'Rev. Growth (YoY)', value: suggestions.actuals.revenue_growth_yoy_pct != null ? `${suggestions.actuals.revenue_growth_yoy_pct.toFixed(1)}%` : null },
                        { label: 'P/E Ratio', value: suggestions.actuals.pe_ratio != null ? suggestions.actuals.pe_ratio.toFixed(1) : null },
                        { label: 'EV/EBITDA', value: suggestions.actuals.ev_to_ebitda != null ? suggestions.actuals.ev_to_ebitda.toFixed(1) : null },
                        { label: 'D/E Ratio', value: suggestions.actuals.debt_to_equity != null ? suggestions.actuals.debt_to_equity.toFixed(2) : null },
                        { label: 'ROE', value: suggestions.actuals.roe != null ? `${(suggestions.actuals.roe * 100).toFixed(1)}%` : null },
                        { label: 'EPS', value: suggestions.actuals.diluted_eps != null ? `$${suggestions.actuals.diluted_eps.toFixed(2)}` : null },
                      ].filter(item => item.value != null).map((item) => (
                        <div key={item.label} className="bg-white/60 dark:bg-gray-800/60 rounded px-2 py-1.5 text-center">
                          <div className="text-[10px] text-blue-600 dark:text-blue-400 leading-tight">{item.label}</div>
                          <div className="text-sm font-bold text-blue-900 dark:text-blue-100">{item.value}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                {!suggestions.actuals && (
                  <p className="text-xs text-blue-600 dark:text-blue-400 mt-2 italic">
                    Financial data unavailable — using sector-based defaults. Company may not have SEC filings (foreign-listed, OTC, or pre-revenue).
                  </p>
                )}
                
                <p className="mt-3 italic text-sm text-blue-700 dark:text-blue-300">
                  {suggestions.actuals ? 'Parameters are based on actual company financials. ' : ''}Click "Calculate DCF" below to use these parameters!
                </p>
              </div>
            )}

            {/* Growth Profile — retrospective trend charts */}
            {showSuggestions && suggestions?.growth_profile && (
              <div className="bg-white dark:bg-gray-700 rounded-lg shadow dark:shadow-gray-200/20 p-5 border dark:border-gray-500">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white">Growth Profile</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      {suggestions.growth_profile.quarters_available} quarters of historical data — what has this company actually demonstrated?
                    </p>
                  </div>

                  {/* Stale data warning */}
                  {suggestions.growth_profile.is_stale && (
                    <div className="col-span-full mb-4 bg-orange-50 dark:bg-orange-900/20 border border-orange-300 dark:border-orange-700 rounded-lg p-3">
                      <div className="flex items-start gap-2">
                        <span className="text-orange-500 text-lg leading-none">⚠️</span>
                        <div>
                          <p className="text-sm font-semibold text-orange-800 dark:text-orange-200">
                            {suggestions.growth_profile.stale_reason === 'cik_mismatch'
                              ? 'Wrong Entity — Ticker Reuse Detected'
                              : 'Stale Financial Data'}
                          </p>
                          <p className="text-xs text-orange-700 dark:text-orange-300 mt-0.5">
                            {suggestions.growth_profile.stale_reason === 'cik_mismatch'
                              ? `This financial data belongs to a different company (CIK: ${suggestions.growth_profile.financials_cik}) that previously used this ticker. The current entity (CIK: ${suggestions.growth_profile.current_cik}) has different or no SEC filings available.`
                              : `The most recent quarterly filing is from ${suggestions.growth_profile.newest_period_end || 'unknown date'}. This data may belong to a previous company that used this ticker symbol.`
                            }
                          </p>
                          <p className="text-xs text-orange-600 dark:text-orange-400 mt-1 font-medium">
                            Charts are shown for reference but should not be used for investment decisions.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                  {suggestions.growth_profile.rule_of_40 != null && (() => {
                    const r40 = suggestions.growth_profile.rule_of_40!;
                    const dir = suggestions.growth_profile.rule_of_40_trend_direction;
                    const trendData = (suggestions.growth_profile.rule_of_40_trend || []).filter(d => d.value != null);
                    const strokeColor = r40 >= 40 ? '#22c55e' : r40 >= 20 ? '#eab308' : '#ef4444';
                    const dirColor = dir === 'improving'
                      ? 'text-green-600 dark:text-green-400'
                      : dir === 'declining'
                      ? 'text-red-600 dark:text-red-400'
                      : 'text-gray-500 dark:text-gray-400';
                    const dirLabel = dir === 'improving' ? 'Improving ↑' : dir === 'declining' ? 'Declining ↓' : dir === 'stable' ? 'Stable →' : null;

                    return (
                      <div className={`px-5 py-4 rounded-lg border ${
                        r40 >= 40
                          ? 'bg-green-50 dark:bg-green-900/30 border-green-300 dark:border-green-700'
                          : r40 >= 20
                          ? 'bg-yellow-50 dark:bg-yellow-900/30 border-yellow-300 dark:border-yellow-700'
                          : 'bg-red-50 dark:bg-red-900/30 border-red-300 dark:border-red-700'
                        }`}>
                        <div className="text-center">
                          <div className="flex items-center justify-center gap-2">
                            <span className={`text-xl font-bold ${
                              r40 >= 40
                                ? 'text-green-700 dark:text-green-300'
                                : r40 >= 20
                                ? 'text-yellow-700 dark:text-yellow-300'
                                : 'text-red-700 dark:text-red-300'
                              }`}>
                              {r40}
                            </span>
                            {dirLabel && (
                              <span className={`text-xs font-semibold ${dirColor}`}>{dirLabel}</span>
                            )}
                          </div>
                          <div className="text-[14px] font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">Rule of 40</div>
                          <div className="text-[13px] text-gray-500 dark:text-gray-400 mt-0.5">
                            {suggestions.growth_profile.rule_of_40_components.revenue_growth_yoy != null && (
                              <span>Growth {suggestions.growth_profile.rule_of_40_components.revenue_growth_yoy > 0 ? '+' : ''}{suggestions.growth_profile.rule_of_40_components.revenue_growth_yoy}%</span>
                            )}
                            {suggestions.growth_profile.rule_of_40_components.fcf_margin != null && (
                              <span> + FCF {suggestions.growth_profile.rule_of_40_components.fcf_margin > 0 ? '+' : ''}{suggestions.growth_profile.rule_of_40_components.fcf_margin}%</span>
                            )}
                          </div>
                        </div>

                        {trendData.length >= 2 && (
                          <div className="mt-3">
                            <ResponsiveContainer width="100%" height={80}>
                              <AreaChart data={trendData} margin={{ top: 5, right: 5, left: 5, bottom: 0 }}>
                                <defs>
                                  <linearGradient id="r40Gradient" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor={strokeColor} stopOpacity={0.3} />
                                    <stop offset="95%" stopColor={strokeColor} stopOpacity={0.05} />
                                  </linearGradient>
                                </defs>
                                <XAxis dataKey="period" tick={{ fontSize: 8, fill: '#9CA3AF' }} interval="preserveStartEnd" axisLine={false} tickLine={false} />
                                <ReferenceLine y={40} stroke="#6B7280" strokeDasharray="3 3" strokeWidth={1} />
                                <Tooltip content={({ active, payload, label }: any) => {
                                  if (!active || !payload?.length) return null;
                                  const d = payload[0].payload;
                                  return (
                                    <div className="bg-gray-800 text-white text-xs px-3 py-2 rounded shadow-lg border border-gray-600">
                                      <p className="font-medium">{label}</p>
                                      <p className="text-primary-300 font-bold">Rule of 40: {d.value}</p>
                                      {d.revenue_growth != null && <p className="text-gray-300">Growth: {d.revenue_growth > 0 ? '+' : ''}{d.revenue_growth}%</p>}
                                      {d.fcf_margin != null && <p className="text-gray-300">FCF Margin: {d.fcf_margin > 0 ? '+' : ''}{d.fcf_margin}%</p>}
                                    </div>
                                  );
                                }} />
                                <Area type="monotone" dataKey="value" stroke={strokeColor} fill="url(#r40Gradient)" strokeWidth={2} dot={{ fill: strokeColor, r: 2.5, strokeWidth: 0 }} activeDot={{ r: 4, strokeWidth: 0 }} />
                              </AreaChart>
                            </ResponsiveContainer>
                          </div>
                        )}

                        <div className="text-[12px] text-gray-400 dark:text-gray-500 mt-1 leading-snug max-w-[280px] mx-auto text-center">
                          Revenue growth&nbsp;% plus free cash flow margin&nbsp;%. Above 40 signals strong growth-profitability balance.
                        </div>
                      </div>
                    );
                  })()}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Revenue Trend */}
                  {suggestions.growth_profile.revenue_trend.some(d => d.value != null) && (
                    <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3">
                      <h4 className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-2">Quarterly Revenue</h4>
                      <ResponsiveContainer width="100%" height={160}>
                        <BarChart data={suggestions.growth_profile.revenue_trend.filter(d => d.value != null)} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.3} />
                          <XAxis dataKey="period" tick={{ fontSize: 9, fill: '#9CA3AF' }} interval="preserveStartEnd" />
                          <YAxis tick={{ fontSize: 9, fill: '#9CA3AF' }} tickFormatter={(v: number) => { if (Math.abs(v) >= 1e9) return `${(v/1e9).toFixed(0)}B`; if (Math.abs(v) >= 1e6) return `${(v/1e6).toFixed(0)}M`; return `${v}`; }} width={45} />
                          <Tooltip content={<GrowthChartTooltip isCurrency />} />
                          <Bar dataKey="value" radius={[2, 2, 0, 0]}>
                            {suggestions.growth_profile.revenue_trend.filter(d => d.value != null).map((entry, i) => (
                              <Cell key={i} fill={entry.value != null && entry.value >= 0 ? '#14b8a6' : '#ef4444'} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}

                  {/* Gross Margin Trend */}
                  {suggestions.growth_profile.gross_margin_trend.some(d => d.value != null) && (
                    <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3">
                      <h4 className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-2">Gross Margin %</h4>
                      <ResponsiveContainer width="100%" height={160}>
                        <LineChart data={suggestions.growth_profile.gross_margin_trend.filter(d => d.value != null)} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.3} />
                          <XAxis dataKey="period" tick={{ fontSize: 9, fill: '#9CA3AF' }} interval="preserveStartEnd" />
                          <YAxis tick={{ fontSize: 9, fill: '#9CA3AF' }} tickFormatter={(v: number) => `${v.toFixed(0)}%`} width={40} domain={['auto', 'auto']} />
                          <Tooltip content={<GrowthChartTooltip isPercent />} />
                          <Line type="monotone" dataKey="value" stroke="#14b8a6" strokeWidth={2} dot={{ fill: '#14b8a6', r: 3 }} activeDot={{ r: 5 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  )}

                  {/* EPS Trend */}
                  {suggestions.growth_profile.eps_trend.some(d => d.value != null) && (
                    <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3">
                      <h4 className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-2">Diluted EPS</h4>
                      <ResponsiveContainer width="100%" height={160}>
                        <BarChart data={suggestions.growth_profile.eps_trend.filter(d => d.value != null)} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.3} />
                          <XAxis dataKey="period" tick={{ fontSize: 9, fill: '#9CA3AF' }} interval="preserveStartEnd" />
                          <YAxis tick={{ fontSize: 9, fill: '#9CA3AF' }} tickFormatter={(v: number) => `$${v.toFixed(2)}`} width={45} />
                          <Tooltip content={<GrowthChartTooltip isCurrency />} />
                          <ReferenceLine y={0} stroke="#6B7280" strokeDasharray="3 3" />
                          <Bar dataKey="value" radius={[2, 2, 0, 0]}>
                            {suggestions.growth_profile.eps_trend.filter(d => d.value != null).map((entry, i) => (
                              <Cell key={i} fill={entry.value != null && entry.value >= 0 ? '#14b8a6' : '#ef4444'} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}

                  {/* FCF Trend */}
                  {suggestions.growth_profile.fcf_trend.some(d => d.value != null) && (
                    <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3">
                      <h4 className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-2">Free Cash Flow</h4>
                      <ResponsiveContainer width="100%" height={160}>
                        <BarChart data={suggestions.growth_profile.fcf_trend.filter(d => d.value != null)} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.3} />
                          <XAxis dataKey="period" tick={{ fontSize: 9, fill: '#9CA3AF' }} interval="preserveStartEnd" />
                          <YAxis tick={{ fontSize: 9, fill: '#9CA3AF' }} tickFormatter={(v: number) => { if (Math.abs(v) >= 1e9) return `${(v/1e9).toFixed(0)}B`; if (Math.abs(v) >= 1e6) return `${(v/1e6).toFixed(0)}M`; return `${v}`; }} width={45} />
                          <Tooltip content={<GrowthChartTooltip isCurrency />} />
                          <ReferenceLine y={0} stroke="#6B7280" strokeDasharray="3 3" />
                          <Bar dataKey="value" radius={[2, 2, 0, 0]}>
                            {suggestions.growth_profile.fcf_trend.filter(d => d.value != null).map((entry, i) => (
                              <Cell key={i} fill={entry.value != null && entry.value >= 0 ? '#14b8a6' : '#ef4444'} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>

                {/* Revenue Growth Trend (YoY per quarter) — only if we have enough data */}
                {suggestions.growth_profile.revenue_growth_trend.filter(d => d.value != null).length >= 2 && (
                  <div className="mt-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3">
                    <h4 className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-2">YoY Revenue Growth % (per quarter)</h4>
                    <ResponsiveContainer width="100%" height={140}>
                      <BarChart data={suggestions.growth_profile.revenue_growth_trend.filter(d => d.value != null)} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.3} />
                        <XAxis dataKey="period" tick={{ fontSize: 9, fill: '#9CA3AF' }} interval="preserveStartEnd" />
                        <YAxis tick={{ fontSize: 9, fill: '#9CA3AF' }} tickFormatter={(v: number) => `${v.toFixed(0)}%`} width={40} />
                        <Tooltip content={<GrowthChartTooltip isPercent />} />
                        <ReferenceLine y={0} stroke="#6B7280" strokeDasharray="3 3" />
                        <Bar dataKey="value" radius={[2, 2, 0, 0]}>
                          {suggestions.growth_profile.revenue_growth_trend.filter(d => d.value != null).map((entry, i) => (
                            <Cell key={i} fill={entry.value != null && entry.value >= 0 ? '#14b8a6' : '#ef4444'} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            )}

            {/* Parameter Inputs */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Growth Rate (%)
                  {(prefilledFromTA?.growth != null || suggestions?.sources?.growth_rate === 'sec_filings') && (
                    <span className="ml-2 text-[10px] font-medium text-green-600 dark:text-green-400">✓ From SEC filings</span>
                  )}
                </label>
                <input
                  type="number"
                  value={growthRate}
                  onChange={(e) => setGrowthRate(parseFloat(e.target.value) || 0)}
                  step="0.1"
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-600 text-gray-900 dark:text-white"
                />
                {suggestions && (
                  <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                    💡 {suggestions.reasoning.growth_rate}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Terminal Growth (%)
                  <span className="ml-2 text-[10px] font-medium text-gray-500 dark:text-gray-400">Sector default</span>
                </label>
                <input
                  type="number"
                  value={terminalGrowth}
                  onChange={(e) => setTerminalGrowth(parseFloat(e.target.value) || 0)}
                  step="0.1"
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-600 text-gray-900 dark:text-white"
                />
                {suggestions && (
                  <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                    💡 {suggestions.reasoning.terminal_growth}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Current FCF
                  {suggestions?.actuals?.fcf_ttm != null && (
                    <span className="ml-2 text-[10px] font-medium text-green-600 dark:text-green-400">✓ Actual TTM</span>
                  )}
                  {suggestions && !suggestions.actuals?.fcf_ttm && (
                    <span className="ml-2 text-[10px] font-medium text-orange-600 dark:text-orange-400">⚠ Estimated</span>
                  )}
                </label>
                <div className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white cursor-not-allowed">
                  {suggestions?.actuals?.fcf_ttm_fmt || (suggestions ? `~${formatCurrency(suggestions.market_cap * 0.05)}` : '—')}
                </div>
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                  💡 Operating Cash Flow minus CapEx (read-only)
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Discount Rate (%)
                  {(prefilledFromTA?.wacc != null || suggestions?.sources?.discount_rate === 'sec_filings') && (
                    <span className="ml-2 text-[10px] font-medium text-green-600 dark:text-green-400">✓ Est. WACC</span>
                  )}
                </label>
                <input
                  type="number"
                  value={discountRate}
                  onChange={(e) => setDiscountRate(parseFloat(e.target.value) || 0)}
                  step="0.1"
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-600 text-gray-900 dark:text-white"
                />
                {suggestions && (
                  <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                    💡 {suggestions.reasoning.discount_rate}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Projection Years
                </label>
                <input
                  type="number"
                  value={projectionYears}
                  onChange={(e) => setProjectionYears(parseInt(e.target.value) || 5)}
                  min="3"
                  max="15"
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-600 text-gray-900 dark:text-white"
                />
                {suggestions && (
                  <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                    💡 {suggestions.reasoning.projection_years}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Shares Outstanding
                  {suggestions?.shares_outstanding != null && (
                    <span className="ml-2 text-[10px] font-medium text-green-600 dark:text-green-400">✓ From SEC filings</span>
                  )}
                  {suggestions && !suggestions.shares_outstanding && (
                    <span className="ml-2 text-[10px] font-medium text-orange-600 dark:text-orange-400">⚠ Estimated</span>
                  )}
                </label>
                <div className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white cursor-not-allowed">
                  {suggestions ? (() => {
                    const shares = suggestions.shares_outstanding || (suggestions.current_price > 0 ? suggestions.market_cap / suggestions.current_price : 0);
                    if (shares >= 1e9) return `${(shares / 1e9).toFixed(2)}B`;
                    if (shares >= 1e6) return `${(shares / 1e6).toFixed(1)}M`;
                    if (shares >= 1e3) return `${(shares / 1e3).toFixed(0)}K`;
                    return shares.toFixed(0);
                  })() : '—'}
                </div>                
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                  💡 From SEC filings or market cap estimate (read-only)
                </p>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full px-6 py-3 bg-purple-600 hover:bg-purple-700 dark:bg-purple-500 dark:hover:bg-purple-600 text-white rounded-lg font-semibold transition-colors disabled:opacity-50"
            >
              {loading ? 'Calculating...' : '📊 Calculate DCF Valuation'}
            </button>
          </form>
        </div>

        {/* Error Display */}
        {error && (
          <div className="bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-600 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg mb-6">
            {error}
          </div>
        )}

        {/* Results Display */}
        {dcfData && (
          <div className="space-y-6">
            {/* Summary Card */}
            <div className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 p-6 border dark:border-gray-500">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
                {dcfData.company_name} ({dcfData.ticker})
              </h2>

              {/* Quick Actions: Watchlist + Cross-page links */}
              <div className="flex flex-wrap items-center gap-3 mb-4">
                <button
                  onClick={handleAddToWatchlist}
                  disabled={addingToWatchlist}
                  className="px-4 py-2 bg-yellow-500 hover:bg-yellow-600 dark:bg-yellow-600 dark:hover:bg-yellow-700 text-white rounded-lg font-medium text-sm transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  {addingToWatchlist ? '⏳ Adding...' : '⭐ Add to Watchlist'}
                </button>
                <Link
                  to={`/stocks?ticker=${dcfData.ticker}`}
                  className="px-4 py-2 bg-primary-600 hover:bg-primary-700 dark:bg-primary-500 dark:hover:bg-primary-600 text-white rounded-lg font-medium text-sm transition-colors"
                >
                  📊 Stock Details
                </Link>
                <Link
                  to={`/technical-analysis?ticker=${dcfData.ticker}`}
                  className="px-4 py-2 bg-primary-600 hover:bg-primary-700 dark:bg-primary-500 dark:hover:bg-primary-600 text-white rounded-lg font-medium text-sm transition-colors"
                >
                  📈 Technical Analysis
                </Link>
                {watchlistMsg && (
                  <span className={`text-sm font-medium ${watchlistMsg.type === 'success' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                    {watchlistMsg.text}
                  </span>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">Current Price</div>
                  <div className="text-2xl font-bold text-gray-900 dark:text-white">
                    ${dcfData.current_price.toFixed(2)}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">DCF Intrinsic Value</div>
                  <div className={`text-2xl font-bold ${
                    dcfData.valuation.intrinsic_value_per_share <= 0
                      ? 'text-red-600 dark:text-red-400'
                      : dcfData.valuation.intrinsic_value_per_share >= dcfData.current_price
                      ? 'text-green-600 dark:text-green-400'
                      : 'text-red-600 dark:text-red-400'
                  }`}>
                    ${dcfData.valuation.intrinsic_value_per_share.toFixed(2)}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">Margin of Safety</div>
                  <div className={`text-2xl font-bold ${
                    dcfData.valuation.margin_of_safety > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                  }`}>
                    {dcfData.valuation.margin_of_safety > 0 ? '+' : ''}{dcfData.valuation.margin_of_safety.toFixed(1)}%
                  </div>
                </div>
              </div>
            </div>

            {/* Recommendation */}
            <div className={`rounded-lg shadow-lg dark:shadow-gray-200/20 p-6 border ${
              dcfData.recommendation.color === 'green' 
                ? 'bg-green-50 dark:bg-green-900/30 border-green-500 dark:border-green-600'
                : dcfData.recommendation.color === 'yellow'
                ? 'bg-yellow-50 dark:bg-yellow-900/30 border-yellow-500 dark:border-yellow-600'
                : 'bg-red-50 dark:bg-red-900/30 border-red-500 dark:border-red-600'
            }`}>
              <div className="flex items-center gap-3 mb-2">
                <div className="text-3xl">
                  {dcfData.recommendation.color === 'green' ? '✅' : 
                   dcfData.recommendation.color === 'yellow' ? '⚠️' : '❌'}
                </div>
                <h3 className={`text-xl font-bold ${
                  dcfData.recommendation.color === 'green' 
                    ? 'text-green-900 dark:text-green-200'
                    : dcfData.recommendation.color === 'yellow'
                    ? 'text-yellow-900 dark:text-yellow-200'
                    : 'text-red-900 dark:text-red-200'
                }`}>
                  {dcfData.recommendation.rating}
                </h3>
              </div>
              <div>
                <p className="text-gray-700 dark:text-gray-300">{dcfData.recommendation.message}</p>
              </div>

              {/* Trade This button — Active/Professional only */}
              {dcfData.recommendation.rating !== 'Hold' && (() => {
                const isTradeEligible = ['active', 'professional'].includes(user?.subscription_tier || '');
                return (
                  <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-600">
                    {isTradeEligible ? (
                      <button
                        onClick={() => setShowTradeModal(true)}
                        className="w-full py-2.5 px-4 rounded-lg font-semibold text-sm transition-colors bg-indigo-600 hover:bg-indigo-700 text-white"
                      >
                        Trade This — Suggest Options Strategy
                      </button>
                    ) : (
                      <div className="text-center">
                        <button
                          disabled
                          className="w-full py-2.5 px-4 rounded-lg font-semibold text-sm bg-gray-200 dark:bg-gray-600 text-gray-400 dark:text-gray-500 cursor-not-allowed"
                        >
                          Trade This — Suggest Options Strategy
                        </button>
                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                          Available on Active and Professional plans — <Link to="/account" className="text-indigo-500 hover:underline">Upgrade</Link>
                        </p>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>

            {/* FMP Benchmark Comparison */}
            {dcfData.fmp_benchmark && (dcfData.fmp_benchmark.dcf_value || dcfData.fmp_benchmark.levered_dcf_value) && (
              <div className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 p-6 border dark:border-gray-500">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-1">FMP Benchmark Comparison</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
                  Independent DCF estimates from Financial Modeling Prep using their standardized 5-year model.
                  Differences reflect varying growth, WACC, and methodology assumptions.
                </p>
                <div className="overflow-x-auto">
                  <table className="min-w-full">
                    <thead>
                      <tr className="border-b border-gray-200 dark:border-gray-600">
                        <th className="py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Model</th>
                        <th className="py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Intrinsic Value</th>
                        <th className="py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">vs Price (${dcfData.current_price.toFixed(2)})</th>
                        <th className="py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Signal</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-600">
                      <tr>
                        <td className="py-3 text-sm font-semibold text-primary-600 dark:text-primary-400">Your Model</td>
                        <td className={`py-3 text-sm text-right font-bold ${dcfData.valuation.intrinsic_value_per_share >= dcfData.current_price ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                          ${dcfData.valuation.intrinsic_value_per_share.toFixed(2)}
                        </td>
                        <td className={`py-3 text-sm text-right font-semibold ${dcfData.valuation.margin_of_safety >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                          {dcfData.valuation.margin_of_safety >= 0 ? '+' : ''}{dcfData.valuation.margin_of_safety.toFixed(1)}%
                        </td>
                        <td className="py-3 text-sm text-right">
                          {dcfData.valuation.margin_of_safety > 10 ? '🟢 Undervalued' : dcfData.valuation.margin_of_safety > -10 ? '🟡 Fair Value' : '🔴 Overvalued'}
                        </td>
                      </tr>
                      {dcfData.fmp_benchmark.dcf_value && (
                        <tr>
                          <td className="py-3 text-sm font-medium text-gray-700 dark:text-gray-300">FMP Simple DCF</td>
                          <td className={`py-3 text-sm text-right font-bold ${dcfData.fmp_benchmark.dcf_value >= dcfData.current_price ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                            ${dcfData.fmp_benchmark.dcf_value.toFixed(2)}
                          </td>
                          <td className={`py-3 text-sm text-right font-semibold ${((dcfData.fmp_benchmark.dcf_value - dcfData.current_price) / dcfData.current_price * 100) >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                            {((dcfData.fmp_benchmark.dcf_value - dcfData.current_price) / dcfData.current_price * 100) >= 0 ? '+' : ''}
                            {((dcfData.fmp_benchmark.dcf_value - dcfData.current_price) / dcfData.current_price * 100).toFixed(1)}%
                          </td>
                          <td className="py-3 text-sm text-right">
                            {((dcfData.fmp_benchmark.dcf_value - dcfData.current_price) / dcfData.current_price * 100) > 10 ? '🟢 Undervalued' : ((dcfData.fmp_benchmark.dcf_value - dcfData.current_price) / dcfData.current_price * 100) > -10 ? '🟡 Fair Value' : '🔴 Overvalued'}
                          </td>
                        </tr>
                      )}
                      {dcfData.fmp_benchmark.levered_dcf_value && (
                        <tr>
                          <td className="py-3 text-sm font-medium text-gray-700 dark:text-gray-300">FMP Levered DCF</td>
                          <td className={`py-3 text-sm text-right font-bold ${dcfData.fmp_benchmark.levered_dcf_value >= dcfData.current_price ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                            ${dcfData.fmp_benchmark.levered_dcf_value.toFixed(2)}
                          </td>
                          <td className={`py-3 text-sm text-right font-semibold ${((dcfData.fmp_benchmark.levered_dcf_value - dcfData.current_price) / dcfData.current_price * 100) >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                            {((dcfData.fmp_benchmark.levered_dcf_value - dcfData.current_price) / dcfData.current_price * 100) >= 0 ? '+' : ''}
                            {((dcfData.fmp_benchmark.levered_dcf_value - dcfData.current_price) / dcfData.current_price * 100).toFixed(1)}%
                          </td>
                          <td className="py-3 text-sm text-right">
                            {((dcfData.fmp_benchmark.levered_dcf_value - dcfData.current_price) / dcfData.current_price * 100) > 10 ? '🟢 Undervalued' : ((dcfData.fmp_benchmark.levered_dcf_value - dcfData.current_price) / dcfData.current_price * 100) > -10 ? '🟡 Fair Value' : '🔴 Overvalued'}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                {dcfData.fmp_benchmark.wacc && (
                  <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
                    FMP WACC: {(dcfData.fmp_benchmark.wacc > 1 ? dcfData.fmp_benchmark.wacc : dcfData.fmp_benchmark.wacc * 100).toFixed(2)}% · Your Discount Rate: {(dcfData.assumptions.discount_rate * 100).toFixed(2)}%
                  </p>
                )}
              </div>
            )}

            {/* Estimated Data Confidence Disclaimer — only shown when NOT using actual financials */}
            {dcfData.assumptions.fcf_source?.startsWith('estimated') && (
              <div className="bg-orange-50 dark:bg-orange-900/20 rounded-lg p-5 border-2 border-orange-400 dark:border-orange-600">
                <div className="flex items-start gap-3">
                  <div className="text-2xl leading-none mt-0.5">⚠️</div>
                  <div className="flex-1">
                    <h4 className="text-base font-bold text-orange-900 dark:text-orange-200 mb-1">
                      Low Confidence — Estimated Data
                    </h4>
                    <p className="text-sm text-orange-800 dark:text-orange-300 mb-2">
                      This valuation is based on <strong>estimated</strong> free cash flow and shares outstanding, not actual SEC filings.
                      The company may not file with the SEC (foreign-domiciled, OTC, or pre-revenue), so the model is using a rough
                      approximation of FCF derived from market capitalization.
                    </p>
                    <div className="text-xs text-orange-700 dark:text-orange-400 space-y-1">
                      <p><strong>What this means:</strong> The intrinsic value, margin of safety, and recommendation above may be significantly
                      inaccurate. Use this output as a rough directional indicator only — not as a basis for investment decisions.</p>
                      <p><strong>For higher-confidence results:</strong> Look for stocks that display the <span className="inline-flex items-center text-green-700 dark:text-green-400 font-semibold">✓ Actual TTM</span> badge
                      next to Current FCF in the input fields above, which indicates the model is using real financial data from quarterly and annual filings.</p>
                    </div>
                  </div>
                </div>
              </div>
            )}


            {/* Cash Flow Projections Table */}
            <div className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 p-6 border dark:border-gray-500">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Projected Cash Flows</h3>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-600">
                  <thead className="bg-gray-800 dark:bg-gray-900">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Year</th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-300 uppercase tracking-wider">Free Cash Flow</th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-300 uppercase tracking-wider">Discount Factor</th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-300 uppercase tracking-wider">Present Value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-600">
                    {dcfData.projections.map((projection) => (
                      <tr key={projection.year}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                          Year {projection.year}
                        </td>
                        <td className={`px-6 py-4 whitespace-nowrap text-sm text-right ${
                          projection.cash_flow >= 0 ? 'text-gray-900 dark:text-white' : 'text-red-600 dark:text-red-400'
                        }`}>
                          {formatCurrency(projection.cash_flow)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-600 dark:text-gray-400">
                          {projection.discount_factor.toFixed(4)}
                        </td>
                        <td className={`px-6 py-4 whitespace-nowrap text-sm text-right font-semibold ${
                          projection.present_value >= 0 ? 'text-primary-600 dark:text-primary-400' : 'text-red-600 dark:text-red-400'
                        }`}>
                          {formatCurrency(projection.present_value)}
                        </td>
                      </tr>
                    ))}
                    <tr className="bg-gray-50 dark:bg-gray-800">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900 dark:text-white">
                        Sum of PV
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-right"></td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-right"></td>
                      <td className={`px-6 py-4 whitespace-nowrap text-sm text-right font-bold ${
                        dcfData.valuation.sum_pv_cash_flows >= 0 ? 'text-primary-600 dark:text-primary-400' : 'text-red-600 dark:text-red-400'
                      }`}>
                        {formatCurrency(dcfData.valuation.sum_pv_cash_flows)}
                      </td>
                    </tr>
                    <tr className="bg-gray-100 dark:bg-gray-700">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900 dark:text-white">
                        Terminal Value
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-600 dark:text-gray-400">
                        {formatCurrency(dcfData.terminal_value.value)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-right"></td>
                      <td className={`px-6 py-4 whitespace-nowrap text-sm text-right font-bold ${
                        dcfData.terminal_value.present_value >= 0 ? 'text-primary-600 dark:text-primary-400' : 'text-red-600 dark:text-red-400'
                      }`}>
                        {formatCurrency(dcfData.terminal_value.present_value)}
                      </td>
                    </tr>
                    <tr className="bg-primary-100 dark:bg-primary-900/30">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900 dark:text-white">
                        Enterprise Value
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-right"></td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-right"></td>
                      <td className={`px-6 py-4 whitespace-nowrap text-sm text-right font-bold ${
                        dcfData.valuation.enterprise_value >= 0 ? 'text-primary-600 dark:text-primary-400' : 'text-red-600 dark:text-red-400'
                      }`}>
                        {formatCurrency(dcfData.valuation.enterprise_value)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Educational Content (shown when no analysis) */}
        {!dcfData && !loading && (
          <div className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 p-8 border dark:border-gray-500">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">What is DCF Valuation?</h2>
            
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">💡 Overview</h3>
                <p className="text-gray-600 dark:text-gray-400">
                  Discounted Cash Flow (DCF) valuation estimates the intrinsic value of an investment by projecting its future cash flows 
                  and discounting them back to present value. It answers: "What is this company worth based on the cash it will generate?"
                </p>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">🧩 How It Works</h3>
                <ol className="list-decimal list-inside space-y-2 text-gray-600 dark:text-gray-400">
                  <li><strong>Forecast Future Cash Flows:</strong> Estimate how much cash the business will generate each year</li>
                  <li><strong>Choose a Discount Rate:</strong> Usually WACC (Weighted Average Cost of Capital) that reflects risk</li>
                  <li><strong>Calculate Present Value:</strong> Discount each future cash flow using: PV = CF / (1 + r)^t</li>
                  <li><strong>Add Terminal Value:</strong> Estimate value beyond the projection period</li>
                </ol>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">📊 What DCF Tells You</h3>
                <ul className="space-y-2 text-gray-600 dark:text-gray-400">
                  <li>✅ If DCF value {'>'} current price → Stock may be <strong className="text-green-600">undervalued</strong></li>
                  <li>❌ If DCF value {'<'} current price → Stock may be <strong className="text-red-600">overvalued</strong></li>
                  <li>📈 Margin of Safety shows how much cushion you have</li>
                </ul>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">🧠 Why DCF Matters</h3>
                <ul className="space-y-2 text-gray-600 dark:text-gray-400">
                  <li>• Forces you to think about future performance, not just current metrics</li>
                  <li>• Incorporates risk directly through the discount rate</li>
                  <li>• Widely used by professional investors and analysts</li>
                  <li>• Helps identify undervalued investment opportunities</li>
                </ul>
              </div>

              <div className="bg-primary-50 dark:bg-primary-900/20 p-4 rounded-lg border border-primary-200 dark:border-primary-800">
                <p className="text-sm text-gray-700 dark:text-gray-300">
                  <strong>💡 Tip:</strong> DCF is most reliable for mature, stable companies with predictable cash flows. 
                  For growth companies or cyclical businesses, adjust your assumptions carefully and consider multiple scenarios.
                </p>
              </div>
              
              <div className="bg-yellow-50 dark:bg-yellow-900/20 p-4 rounded-lg border border-yellow-200 dark:border-yellow-800">
                <p className="text-sm text-gray-700 dark:text-gray-300">
                  <strong>⚠️ Important:</strong> DCF analysis is <strong>NOT suitable for warrants</strong>. Warrants are derivative securities 
                  that require option pricing models (Black-Scholes) instead. Always analyze the underlying common stock when evaluating warrants.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
      <BackToTop />

      {/* Trade This Modal */}
      {showTradeModal && dcfData && (() => {
        const suggestion = suggestStrategy(
          dcfData.current_price,
          dcfData.valuation.intrinsic_value_per_share,
          tradeConfidence,
          parseInt(tradeTimeframe),
          parseFloat(tradeMaxCapital) || 0,
        );

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowTradeModal(false)}>
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl border dark:border-gray-600 w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b dark:border-gray-600">
                <div>
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white">Trade This: {dcfData.ticker}</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    ${dcfData.current_price.toFixed(2)} current — ${dcfData.valuation.intrinsic_value_per_share.toFixed(2)} DCF target ({dcfData.recommendation.rating})
                  </p>
                </div>
                <button onClick={() => setShowTradeModal(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xl leading-none">&times;</button>
              </div>

              {/* Inputs */}
              <div className="px-6 py-4 space-y-3">
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Timeframe</label>
                    <select
                      value={tradeTimeframe}
                      onChange={e => setTradeTimeframe(e.target.value as "14" | "30" | "90")}
                      className="w-full px-2 py-1.5 text-sm border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                    >
                      <option value="14">2 Weeks</option>
                      <option value="30">1 Month</option>
                      <option value="90">3 Months</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Confidence</label>
                    <select
                      value={tradeConfidence}
                      onChange={e => setTradeConfidence(e.target.value as "low" | "medium" | "high")}
                      className="w-full px-2 py-1.5 text-sm border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Max Capital ($)</label>
                    <input
                      type="number"
                      value={tradeMaxCapital}
                      onChange={e => setTradeMaxCapital(e.target.value)}
                      className="w-full px-2 py-1.5 text-sm border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                      min="0"
                      step="100"
                    />
                  </div>
                </div>
              </div>

              {/* Strategy Result */}
              <div className="px-6 pb-4">
                {suggestion ? (
                  <div className="space-y-3">
                    <div className={`rounded-lg p-4 border ${
                      suggestion.direction === 'bullish'
                        ? 'bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-700'
                        : 'bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-700'
                    }`}>
                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-lg">{suggestion.direction === 'bullish' ? '📈' : '📉'}</span>
                        <span className="font-bold text-gray-900 dark:text-white">{suggestion.strategyName}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div className="bg-white/60 dark:bg-gray-800/60 rounded px-3 py-2">
                          <div className="text-[10px] text-gray-500 dark:text-gray-400 uppercase">Long Strike</div>
                          <div className="font-bold text-gray-900 dark:text-white">${suggestion.K1.toFixed(2)}</div>
                        </div>
                        <div className="bg-white/60 dark:bg-gray-800/60 rounded px-3 py-2">
                          <div className="text-[10px] text-gray-500 dark:text-gray-400 uppercase">Short Strike</div>
                          <div className="font-bold text-gray-900 dark:text-white">${suggestion.K2.toFixed(2)}</div>
                        </div>
                        <div className="bg-white/60 dark:bg-gray-800/60 rounded px-3 py-2">
                          <div className="text-[10px] text-gray-500 dark:text-gray-400 uppercase">Est. Cost / Contract</div>
                          <div className="font-bold text-red-600 dark:text-red-400">${(suggestion.spreadCost * 100).toFixed(0)}</div>
                        </div>
                        <div className="bg-white/60 dark:bg-gray-800/60 rounded px-3 py-2">
                          <div className="text-[10px] text-gray-500 dark:text-gray-400 uppercase">Max Profit / Contract</div>
                          <div className="font-bold text-green-600 dark:text-green-400">${(suggestion.maxProfit * 100).toFixed(0)}</div>
                        </div>
                        <div className="bg-white/60 dark:bg-gray-800/60 rounded px-3 py-2">
                          <div className="text-[10px] text-gray-500 dark:text-gray-400 uppercase">Max Loss / Contract</div>
                          <div className="font-bold text-red-600 dark:text-red-400">${(suggestion.maxLoss * 100).toFixed(0)}</div>
                        </div>
                        <div className="bg-white/60 dark:bg-gray-800/60 rounded px-3 py-2">
                          <div className="text-[10px] text-gray-500 dark:text-gray-400 uppercase">Breakeven</div>
                          <div className="font-bold text-gray-900 dark:text-white">${suggestion.breakeven.toFixed(2)}</div>
                        </div>
                        <div className="bg-white/60 dark:bg-gray-800/60 rounded px-3 py-2">
                          <div className="text-[10px] text-gray-500 dark:text-gray-400 uppercase">Prob. of Profit</div>
                          <div className="font-bold text-gray-900 dark:text-white">{suggestion.probProfit.toFixed(0)}%</div>
                        </div>
                        <div className="bg-white/60 dark:bg-gray-800/60 rounded px-3 py-2">
                          <div className="text-[10px] text-gray-500 dark:text-gray-400 uppercase">Contracts Affordable</div>
                          <div className="font-bold text-gray-900 dark:text-white">{suggestion.contracts}</div>
                        </div>
                      </div>
                      <p className="text-[11px] text-gray-600 dark:text-gray-400 mt-3 leading-snug">
                        Strikes are sized to the expected move at expiration (~±${suggestion.expectedMove.toFixed(2)} for {suggestion.days} days at 30% IV), not the multi-year DCF target. A long-horizon DCF estimate is rarely reachable in a single options expiration cycle.
                      </p>
                    </div>

                    <button
                      onClick={() => {
                        const params = new URLSearchParams({
                          page: 'spreads',
                          S: dcfData.current_price.toFixed(2),
                          days: suggestion.days.toString(),
                          sigma: '30.0',
                          r: '5.0',
                          strategy: suggestion.strategyType,
                          K1: suggestion.K1.toFixed(2),
                          K2: suggestion.K2.toFixed(2),
                        });
                        navigate(`/options-calculator?${params.toString()}`);
                      }}
                      className="w-full py-2.5 px-4 rounded-lg font-semibold text-sm transition-colors bg-indigo-600 hover:bg-indigo-700 text-white"
                    >
                      Open in Options Calculator
                    </button>
                  </div>
                ) : (
                  <div className="text-center py-6 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Your DCF analysis suggests the stock is fairly valued (within 2% of current price).
                    </p>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                      Consider waiting for a clearer thesis before entering an options position.
                    </p>
                  </div>
                )}

                <p className="text-[10px] text-gray-400 dark:text-gray-500 text-center leading-tight mt-2">
                  Educational only — estimates use 30% implied volatility and 5% risk-free rate. Verify strikes, pricing, and liquidity with your broker before trading.
                </p>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};

export default DCFValuation;