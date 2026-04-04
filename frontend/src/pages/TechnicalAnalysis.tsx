import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { authAPI, technicalAPI, watchlistAPI, financialsAPI } from '../services/api';
import { User } from '../types';
import NavBar from '../components/NavBar';
import BackToTop from '../components/BackToTop';
import UpgradeRequired from '../components/UpgradeRequired';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  BarController,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import { Line, Chart } from 'react-chartjs-2';


// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  BarController,
  Title,
  Tooltip,
  Legend,
  Filler
);

interface TechnicalAnalysisData {
  ticker: string;
  company_name: string;
  security_type?: string;  // CS, WARRANT, ETF, etc. from Polygon
  current_price: number;
  analysis_date: string;
  indicators: {
    rsi: {
      value: number;
      signal: string;
      description: string;
    };
    macd: {
      macd_line: number;
      signal_line: number;
      histogram: number;
      trend: string;
      description: string;
    };
    moving_averages: {
      sma_20: number;
      sma_50: number;
      sma_200: number;
      above_sma_20: boolean;
      above_sma_50: boolean;
      description: string;
    };
    bollinger_bands: {
      upper_band: number;
      middle_band: number;
      lower_band: number;
      position: string;
      description: string;
    };
    // ── Advanced Indicators ────────────────────────────
    vwap?: { value: number; signal: string; description: string } | null;
    obv?: { value: number; signal: string; description: string } | null;
    ad_line?: { value: number; signal: string; description: string } | null;
    stochastic?: { k: number; d: number; signal: string; description: string } | null;
    adx?: { adx: number; plus_di: number; minus_di: number; strength: string; direction: string; description: string } | null;
    cci?: { value: number; signal: string; description: string } | null;
    roc?: { value: number; signal: string; description: string } | null;
    atr?: { value: number; percent: number; volatility: string; description: string } | null;
    keltner?: { upper: number; middle: number; lower: number; position: string; description: string } | null;
    std_dev?: { value: number; percent: number; description: string } | null;
    parabolic_sar?: { value: number; trend: string; description: string } | null;
    ichimoku?: { tenkan: number; kijun: number; senkou_a: number; senkou_b: number; signal: string; description: string } | null;
    donchian?: { upper: number; lower: number; middle: number; description: string } | null;
  };
  signals: Array<{
    type: string;
    indicator: string;
    message: string;
  }>;
  chart_data: Array<{
    date: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    sma_20: number | null;
    sma_50: number | null;
    sma_200: number | null;
    bb_upper: number | null;
    bb_middle: number | null;
    bb_lower: number | null;
    rsi: number | null;
    macd_line: number | null;
    macd_signal: number | null;
    macd_histogram: number | null;
    // Advanced
    vwap?: number | null;
    obv?: number | null;
    ad_line?: number | null;
    stoch_k?: number | null;
    stoch_d?: number | null;
    adx?: number | null;
    plus_di?: number | null;
    minus_di?: number | null;
    cci?: number | null;
    roc?: number | null;
    atr?: number | null;
    keltner_upper?: number | null;
    keltner_middle?: number | null;
    keltner_lower?: number | null;
    std_dev?: number | null;
    sar?: number | null;
    sar_trend?: number | null;
    ichimoku_tenkan?: number | null;
    ichimoku_kijun?: number | null;
    ichimoku_senkou_a?: number | null;
    ichimoku_senkou_b?: number | null;
    donchian_upper?: number | null;
    donchian_lower?: number | null;
    donchian_middle?: number | null;
  }>;
  summary: {
    outlook: string;
    strength: number;
    message: string;
    price_range?: {
      support: number;
      resistance: number;
      support_levels_count: number;
      resistance_levels_count: number;
    } | null;
  };
}

const TechnicalAnalysis: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const urlTicker = searchParams.get('ticker') || '';
  const [user, setUser] = useState<User | null>(null);
  const [ticker, setTicker] = useState(urlTicker);
  const [loading, setLoading] = useState(false);
  const [analysisData, setAnalysisData] = useState<TechnicalAnalysisData | null>(null);
  const [error, setError] = useState('');
  const [isWarrant, setIsWarrant] = useState(false);
  const [relatedCommonStock, setRelatedCommonStock] = useState<string | null>(null);
  
  // AI stock analysis
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [aiGeneratedAt, setAiGeneratedAt] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  // Advanced indicator panel toggles
  const [showVolume, setShowVolume] = useState(false);
  const [showMomentum, setShowMomentum] = useState(false);
  const [showVolatility, setShowVolatility] = useState(false);
  const [showTrend, setShowTrend] = useState(false);

  // Map signal indicator names to chart section IDs and their category toggle
  const scrollToChart = (indicator: string) => {
    const name = indicator.toLowerCase();
    let chartId = '';
    let expandCategory: (() => void) | null = null;

    // Basic charts (always visible)
    if (name.includes('bollinger')) { chartId = 'chart-bollinger'; }
    else if (name.includes('moving average') || name.includes('golden cross') || name.includes('death cross') || name === 'sma' || name === 'ema') { chartId = 'chart-moving-averages'; }
    else if (name.includes('rsi') || name === 'relative strength index') { chartId = 'chart-rsi'; }
    else if (name.includes('macd')) { chartId = 'chart-macd'; }
    // Volume indicators
    else if (name.includes('vwap')) { chartId = 'chart-vwap'; expandCategory = () => setShowVolume(true); }
    else if (name.includes('obv') || name.includes('on-balance') || name.includes('a/d')) { chartId = 'chart-obv'; expandCategory = () => setShowVolume(true); }
    // Momentum indicators
    else if (name.includes('stochastic') || name.includes('stoch')) { chartId = 'chart-stochastic'; expandCategory = () => setShowMomentum(true); }
    else if (name.includes('adx') || name.includes('directional')) { chartId = 'chart-adx'; expandCategory = () => setShowMomentum(true); }
    else if (name.includes('cci')) { chartId = 'chart-cci'; expandCategory = () => setShowMomentum(true); }
    else if (name.includes('roc') || name.includes('rate of change')) { chartId = 'chart-roc'; expandCategory = () => setShowMomentum(true); }
    // Volatility indicators
    else if (name.includes('atr') || name.includes('average true range')) { chartId = 'chart-atr'; expandCategory = () => setShowVolatility(true); }
    else if (name.includes('keltner')) { chartId = 'chart-keltner'; expandCategory = () => setShowVolatility(true); }
    else if (name.includes('std') || name.includes('standard dev')) { chartId = 'chart-volatility-summary'; expandCategory = () => setShowVolatility(true); }
    // Trend indicators
    else if (name.includes('parabolic') || name.includes('sar')) { chartId = 'chart-parabolic-sar'; expandCategory = () => setShowTrend(true); }
    else if (name.includes('ichimoku')) { chartId = 'chart-ichimoku'; expandCategory = () => setShowTrend(true); }
    else if (name.includes('donchian')) { chartId = 'chart-donchian'; expandCategory = () => setShowTrend(true); }

    if (!chartId) return;

    // Expand the category if needed, then scroll after React re-renders
    if (expandCategory) {
      expandCategory();
      setTimeout(() => {
        document.getElementById(chartId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    } else {
      document.getElementById(chartId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const [watchlistMsg, setWatchlistMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [addingToWatchlist, setAddingToWatchlist] = useState(false);
  const [usageCount, setUsageCount] = useState(0);

  // Financials panel state
  const [showFinancials, setShowFinancials] = useState(false);
  const [financialsData, setFinancialsData] = useState<any>(null);
  const [financialsLoading, setFinancialsLoading] = useState(false);
  const [financialsError, setFinancialsError] = useState<string | null>(null);

  // Warrant detection is now API-driven using Polygon's `type` field (CS, WARRANT, ETF, etc.)
  // These helpers are only used as a pre-fetch hint for explicit separator patterns
  const detectWarrantHint = (tickerSymbol: string): boolean => {
    const upper = tickerSymbol.toUpperCase();
    return (
      upper.includes('.W') ||
      upper.includes('+W') ||
      upper.endsWith('/WS') ||
      upper.endsWith('/WT')
    );
  };

  const getRelatedCommonStock = (warrantTicker: string): string | null => {
    const upper = warrantTicker.toUpperCase();
    const patterns = ['.WS', '.WT', '.W', '+WS', '+WT', '+W', '/WS', '/WT', '/W'];
    for (const pat of patterns) {
      if (upper.endsWith(pat)) {
        return upper.slice(0, -pat.length);
      }
    }
    return null;
  };

  React.useEffect(() => {
    loadUser();
    // Auto-analyze if ticker is provided via URL
    if (urlTicker) {
      setTicker(urlTicker);

      // Pre-fetch hint only — real warrant detection happens after API response
      const isWarrantHint = detectWarrantHint(urlTicker);
      setIsWarrant(isWarrantHint);
      if (isWarrantHint) {
        setRelatedCommonStock(getRelatedCommonStock(urlTicker));
      }
      performAnalysis(urlTicker);
    }
  }, [urlTicker]);

  const loadUser = async () => {
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
  };

  const performAnalysis = async (symbol: string) => {
    if (!symbol.trim()) {
      setError('Please enter a ticker symbol');
      return;
    }

    setLoading(true);
    setError('');
    setAnalysisData(null);
    setFinancialsData(null);
    setShowFinancials(false);
    setFinancialsError(null);
    setAiSummary(null);
    setAiGeneratedAt(null);

    try {
      const response = await technicalAPI.analyze(symbol.toUpperCase());
      setAnalysisData(response.data);
      setUsageCount(prev => prev + 1);
      
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
        setIsWarrant(false);
        setRelatedCommonStock(null);
      }
    } catch (err: any) {
      console.error('Analysis error:', err);
      setError(err.response?.data?.detail || 'Failed to analyze stock. Please check the ticker symbol.');
    } finally {
      setLoading(false);
    }
  };

  const TIER_LIMITS: Record<string, number> = {
      beginner: 5, casual: 15, active: 10, professional: 20
    };

  const tierLimit = TIER_LIMITS[user?.subscription_tier || 'beginner'] || 5;  

  const handleAnalyze = async (e: React.FormEvent) => {
      e.preventDefault();
      if (user && usageCount >= tierLimit) {
        // Don't call API — the render below will show UpgradeRequired
        return;
      }
      await performAnalysis(ticker);
  };

  const handleAiAnalysis = async () => {
    if (!analysisData) return;
    setAiLoading(true);
    try {
      const response = await technicalAPI.aiAnalysis(analysisData.ticker);
      setAiSummary(response.data.summary);
      setAiGeneratedAt(response.data.generated_at);
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      if (err?.response?.status === 403) {
        const msg = typeof detail === 'object' ? detail.message : detail;
        setAiSummary(msg || 'AI Analysis is not available on your current plan.');
      } else {
        setAiSummary('Unable to generate analysis at this time. Please try again.');
      }
      setAiGeneratedAt(null);
    } finally {
      setAiLoading(false);
    }
  };

  const handleTickerChange = (value: string) => {
    setTicker(value);
    
    // Pre-fetch hint only — real warrant detection happens after API response
    const isWarrantHint = detectWarrantHint(value);
    setIsWarrant(isWarrantHint);
    if (isWarrantHint) {
      setRelatedCommonStock(getRelatedCommonStock(value));
    } else {
      setRelatedCommonStock(null);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('access_token');
    navigate('/');
  };

  const handleAddToWatchlist = async () => {
    const t = ticker.trim().toUpperCase() || analysisData?.ticker;
    if (!t) return;
    setAddingToWatchlist(true);
    setWatchlistMsg(null);
    try {
      const payload: any = { ticker: t };
      if (analysisData?.current_price) {
        payload.target_price = analysisData.current_price;
      }
      if (analysisData?.company_name) {
        payload.notes = analysisData.company_name;
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

  // ── Financials helpers ───────────────────────────────────────────
  const fmtB = (val: number | null | undefined): string => {
    if (val == null) return '—';
    const abs = Math.abs(val);
    if (abs >= 1e12) return `${(val / 1e12).toFixed(2)}T`;
    if (abs >= 1e9) return `${(val / 1e9).toFixed(2)}B`;
    if (abs >= 1e6) return `${(val / 1e6).toFixed(1)}M`;
    if (abs >= 1e3) return `${(val / 1e3).toFixed(1)}K`;
    return val.toFixed(2);
  };

  const fmtPct = (val: number | null | undefined): string => {
    if (val == null) return '—';
    return `${val.toFixed(1)}%`;
  };

  const fmtNum = (val: number | null | undefined, decimals = 2): string => {
    if (val == null) return '—';
    return val.toFixed(decimals);
  };

  const handleFetchFinancials = async () => {
    const t = analysisData?.ticker || ticker.trim().toUpperCase();
    if (!t) return;

    // Toggle off if already showing
    if (showFinancials && financialsData) {
      setShowFinancials(false);
      return;
    }

    setFinancialsLoading(true);
    setFinancialsError(null);
    setShowFinancials(true);

    try {
      const response = await financialsAPI.get(t);
      setFinancialsData(response.data);
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      if (err.response?.status === 403) {
        setFinancialsError('Financial summaries require a paid subscription.');
      } else if (err.response?.status === 404) {
        setFinancialsError(typeof detail === 'string' ? detail : `No financial data available for ${t}.`);
      } else {
        setFinancialsError(typeof detail === 'string' ? detail : 'Failed to load financial data.');
      }
    } finally {
      setFinancialsLoading(false);
    }
  };

  // Reset financials when ticker changes
  React.useEffect(() => {
    setFinancialsData(null);
    setShowFinancials(false);
    setFinancialsError(null);
  }, [ticker]);

  // Chart configurations
  const getBBChartData = () => {
    if (!analysisData) return null;

    const dates = analysisData.chart_data.map(d => d.date);
    const prices = analysisData.chart_data.map(d => d.close);
    const volumes = analysisData.chart_data.map(d => d.volume);
    const bbUpper = analysisData.chart_data.map(d => d.bb_upper);
    const bbLower = analysisData.chart_data.map(d => d.bb_lower);

    return {
        labels: dates,
        datasets: [
        {
            label: 'Price',
            data: prices,
            borderColor: 'rgb(59, 130, 246)',
            backgroundColor: 'rgba(59, 130, 246, 0.1)',
            borderWidth: 2,
            fill: false,
            tension: 0.1,
            pointRadius: 0,
            yAxisID: 'y',
        },
        {
            label: 'Upper BB',
            data: bbUpper,
            borderColor: 'rgb(239, 68, 68)',
            borderWidth: 1.5,
            fill: false,
            tension: 0.1,
            pointRadius: 0,
            borderDash: [3, 3],
            yAxisID: 'y',
        },
        {
            label: 'Lower BB',
            data: bbLower,
            borderColor: 'rgb(34, 197, 94)',
            borderWidth: 1.5,
            fill: false,
            tension: 0.1,
            pointRadius: 0,
            borderDash: [3, 3],
            yAxisID: 'y',
        },
        {
            label: 'Volume',
            data: volumes,
            backgroundColor: 'rgba(156, 163, 175, 0.3)',
            borderColor: 'rgba(156, 163, 175, 0.5)',
            borderWidth: 1,
            type: 'bar' as const,
            yAxisID: 'y1',
        },
        ],
    };
  };

  const getMAChartData = () => {
    if (!analysisData) return null;

    const dates = analysisData.chart_data.map(d => d.date);
    const prices = analysisData.chart_data.map(d => d.close);
    const sma20 = analysisData.chart_data.map(d => d.sma_20);
    const sma50 = analysisData.chart_data.map(d => d.sma_50);

    return {
        labels: dates,
        datasets: [
        {
            label: 'Price',
            data: prices,
            borderColor: 'rgb(59, 130, 246)',
            backgroundColor: 'rgba(59, 130, 246, 0.1)',
            borderWidth: 2,
            fill: false,
            tension: 0.1,
            pointRadius: 0,
        },
        {
            label: '20-day SMA',
            data: sma20,
            borderColor: 'rgb(234, 179, 8)',
            borderWidth: 2,
            fill: false,
            tension: 0.1,
            pointRadius: 0,
        },
        {
            label: '50-day SMA',
            data: sma50,
            borderColor: 'rgb(168, 85, 247)',
            borderWidth: 2,
            fill: false,
            tension: 0.1,
            pointRadius: 0,
        },
        ],
    };
  };

  const getRSIChartData = () => {
    if (!analysisData) return null;

    const dates = analysisData.chart_data.map(d => d.date);
    const rsiValues = analysisData.chart_data.map(d => d.rsi);

    return {
      labels: dates,
      datasets: [
        {
          label: 'RSI',
          data: rsiValues,
          borderColor: 'rgb(99, 102, 241)',
          backgroundColor: 'rgba(99, 102, 241, 0.1)',
          borderWidth: 2,
          fill: true,
          tension: 0.1,
          pointRadius: 0,
        },
        {
          label: 'Oversold (30)',
          data: Array(dates.length).fill(30),
          borderColor: 'rgb(34, 197, 94)',
          borderWidth: 1,
          borderDash: [5, 5],
          pointRadius: 0,
          fill: false,
        },
        {
          label: 'Overbought (70)',
          data: Array(dates.length).fill(70),
          borderColor: 'rgb(239, 68, 68)',
          borderWidth: 1,
          borderDash: [5, 5],
          pointRadius: 0,
          fill: false,
        },
      ],
    };
  };

  const getMACDChartData = () => {
    if (!analysisData) return null;

    const dates = analysisData.chart_data.map(d => d.date);
    const macdLine = analysisData.chart_data.map(d => d.macd_line);
    const signalLine = analysisData.chart_data.map(d => d.macd_signal);
    const histogram = analysisData.chart_data.map(d => d.macd_histogram);

    return {
      labels: dates,
      datasets: [
        {
          label: 'MACD Line',
          data: macdLine,
          borderColor: 'rgb(59, 130, 246)',
          borderWidth: 2,
          fill: false,
          tension: 0.1,
          pointRadius: 0,
          type: 'line' as const,
        },
        {
          label: 'Signal Line',
          data: signalLine,
          borderColor: 'rgb(239, 68, 68)',
          borderWidth: 2,
          fill: false,
          tension: 0.1,
          pointRadius: 0,
          type: 'line' as const,
        },
        {
          label: 'Histogram',
          data: histogram,
          backgroundColor: histogram.map((val: number | null) => 
            val && val >= 0 ? 'rgba(34, 197, 94, 0.5)' : 'rgba(239, 68, 68, 0.5)'
          ),
          borderColor: 'transparent',
          borderWidth: 0,
          type: 'bar' as const,
        },
      ],
    };
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const,
        labels: {
          color: '#9CA3AF',
        },
      },
      tooltip: {
        mode: 'index' as const,
        intersect: false,
      },
    },
    scales: {
      x: {
        ticks: {
          color: '#9CA3AF',
        },
        grid: {
          color: 'rgba(156, 163, 175, 0.1)',
        },
      },
      y: {
        ticks: {
          color: '#9CA3AF',
        },
        grid: {
          color: 'rgba(156, 163, 175, 0.1)',
        },
      },
    },
  };

  const priceChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
        mode: 'index' as const,
        intersect: false,
    },
    plugins: {
        legend: {
        position: 'top' as const,
        labels: {
            color: '#9CA3AF',
            usePointStyle: true,
        },
        },
        tooltip: {
        mode: 'index' as const,
        intersect: false,
        },
    },
    scales: {
        x: {
        ticks: {
            color: '#9CA3AF',
        },
        grid: {
            color: 'rgba(156, 163, 175, 0.1)',
        },
        },
        y: {
        type: 'linear' as const,
        position: 'left' as const,
        ticks: {
            color: '#9CA3AF',
        },
        grid: {
            color: 'rgba(156, 163, 175, 0.1)',
        },
        },
        y1: {
        type: 'linear' as const,
        position: 'right' as const,
        ticks: {
            color: '#9CA3AF',
        },
        grid: {
            drawOnChartArea: false,
        },
        },
    },
  };

  const maChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
        mode: 'index' as const,
        intersect: false,
    },
    plugins: {
        legend: {
        position: 'top' as const,
        labels: {
            color: '#9CA3AF',
            usePointStyle: true,
        },
        },
        tooltip: {
        mode: 'index' as const,
        intersect: false,
        },
    },
    scales: {
        x: {
        ticks: {
            color: '#9CA3AF',
        },
        grid: {
            color: 'rgba(156, 163, 175, 0.1)',
        },
        },
        y: {
        type: 'linear' as const,
        position: 'left' as const,
        ticks: {
            color: '#9CA3AF',
        },
        grid: {
            color: 'rgba(156, 163, 175, 0.1)',
        },
        },
    },
  };

  // Show upgrade page if user has hit their limit
  if (user && usageCount >= tierLimit) {
    return (
      <div className="min-h-screen bg-gray-100 dark:bg-gray-800 transition-colors duration-200">
        <NavBar currentPage="technical-analysis" user={user} onLogout={handleLogout} />
        <UpgradeRequired
          feature="Technical Analysis"
          currentTier={user.subscription_tier}
          limitReached={true}
          currentUsage={usageCount}
          maxUsage={tierLimit}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-800 transition-colors duration-200">
      <NavBar currentPage="technical-analysis" user={user} onLogout={handleLogout} />

      {/* Main Content */}
      <div className="container mx-auto px-4 py-8">
        {/* Warrant Warning Box */}
        {isWarrant && (
          <div className="bg-orange-50 dark:bg-orange-900/30 border-2 border-orange-500 dark:border-orange-600 rounded-lg p-6 mb-6">
            <div className="flex items-start gap-3">
              <div className="text-3xl">⚠️</div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-orange-900 dark:text-orange-200 mb-2">
                  Caution: Technical Analysis on Warrant Securities
                </h3>
                <div className="text-orange-800 dark:text-orange-300 space-y-2">
                  <p className="font-medium">
                    You're analyzing a <strong>warrant</strong>, not common stock. Technical indicators may behave differently.
                  </p>
                  <div className="space-y-1.5 text-sm">
                    <p><strong>Important considerations for warrant technical analysis:</strong></p>
                    <ul className="list-disc list-inside ml-4 space-y-1">
                      <li><strong>Higher Volatility:</strong> Warrants are typically much more volatile than the underlying stock</li>
                      <li><strong>Time Decay:</strong> Warrants lose value as they approach expiration (theta decay)</li>
                      <li><strong>Lower Liquidity:</strong> Often have wider bid-ask spreads and lower trading volume</li>
                      <li><strong>Leverage Effect:</strong> Price movements are amplified relative to the underlying stock</li>
                      <li><strong>Expiration Risk:</strong> Becomes worthless if not exercised before expiration date</li>
                    </ul>
                    
                    <div className="mt-3 p-3 bg-orange-100 dark:bg-orange-900/50 rounded border border-orange-300 dark:border-orange-700">
                      <p className="font-semibold mb-1">Recommended Actions:</p>
                      <ul className="list-disc list-inside ml-4 space-y-1">
                        <li>Always check the <strong>expiration date</strong> before trading</li>
                        <li>Compare warrant price movement to the <strong>underlying common stock</strong></li>
                        <li>Calculate <strong>intrinsic value</strong> (Stock Price - Strike Price)</li>
                        <li>Monitor <strong>time value</strong> remaining (Warrant Price - Intrinsic Value)</li>
                      </ul>
                      {relatedCommonStock && (
                        <div className="mt-3">
                          <p className="font-semibold mb-1">Analyze the underlying stock:</p>
                          <Link
                            to={`/technical-analysis?ticker=${relatedCommonStock}`}
                            className="inline-block px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg font-medium transition-colors"
                          >
                            View {relatedCommonStock} Technical Analysis →
                          </Link>
                        </div>
                      )}
                    </div>
                    
                    <div className="mt-3 p-3 bg-blue-100 dark:bg-blue-900/30 rounded border border-blue-300 dark:border-blue-700">
                      <p className="font-semibold text-blue-900 dark:text-blue-200 mb-1">Warrant-Specific Indicators to Watch:</p>
                      <ul className="list-disc list-inside ml-4 space-y-1 text-blue-800 dark:text-blue-300">
                        <li><strong>RSI:</strong> May hit extreme levels more frequently due to high volatility</li>
                        <li><strong>Bollinger Bands:</strong> Expect wider bands and more frequent band touches</li>
                        <li><strong>Volume:</strong> Critical to watch - low volume = higher risk</li>
                        <li><strong>Moving Averages:</strong> Consider shorter-term MAs (5-day, 10-day) due to volatility</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Analysis Form */}
        <div className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 p-6 mb-6 border dark:border-gray-500">
          <form onSubmit={handleAnalyze} className="flex gap-4">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Stock Ticker {isWarrant && <span className="text-orange-600 dark:text-orange-400 text-xs ml-2">(WARRANT - Use caution)</span>}
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={ticker}
                  onChange={(e) => handleTickerChange(e.target.value.toUpperCase())}
                  placeholder="e.g., AAPL, TSLA, MSFT"
                  className="w-full px-4 py-2 pr-10 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-600 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500"
                />
                {/* Clear X inside input */}
                {ticker && (
                  <button
                    type="button"
                    onClick={() => {
                      setTicker('');
                      setAnalysisData(null);
                      setError('');
                      setIsWarrant(false);
                      setRelatedCommonStock(null);
                      setFinancialsData(null);
                      setShowFinancials(false);
                      setFinancialsError(null);
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
            </div>
            <div className="flex items-end gap-2">
              <button
                type="submit"
                disabled={loading}
                className="px-6 py-2 bg-primary-600 hover:bg-primary-700 dark:bg-primary-500 dark:hover:bg-primary-600 text-white rounded-lg font-semibold transition-colors disabled:opacity-50"
              >
                {loading ? 'Analyzing...' : '📈 Analyze'}
              </button>
              {analysisData && (
                <button
                  type="button"
                  onClick={() => {
                    setTicker('');
                    setAnalysisData(null);
                    setError('');
                    setIsWarrant(false);
                    setRelatedCommonStock(null);
                    setFinancialsData(null);
                    setShowFinancials(false);
                    setFinancialsError(null);
                  }}
                  className="px-4 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-600 dark:hover:bg-gray-500 text-gray-700 dark:text-gray-200 rounded-lg font-medium transition-colors text-sm"
                  title="Clear results and search a new ticker"
                >
                  🔄 New Search
                </button>
              )}
            </div>
          </form>
        </div>

        {/* Error Display */}
        {error && (
          <div className="bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-600 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg mb-6">
            {error}
          </div>
        )}

        {/* Analysis Results */}
        {analysisData && (
          <div className="space-y-6">
            {/* Summary Card */}
            <div className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 p-6 border dark:border-gray-500">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                    {analysisData.company_name} ({analysisData.ticker})
                  </h2>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    Analysis as of {new Date(analysisData.analysis_date).toLocaleDateString()}
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold text-gray-900 dark:text-white">
                    ${analysisData.current_price?.toFixed(2) ?? '—'}
                  </div>
                </div>
              </div>

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
                  to={`/stocks?ticker=${analysisData.ticker}`}
                  className="px-4 py-2 bg-primary-600 hover:bg-primary-700 dark:bg-primary-500 dark:hover:bg-primary-600 text-white rounded-lg font-medium text-sm transition-colors"
                >
                  📊 Stock Details
                </Link>
                <Link
                  to={`/dcf-valuation?ticker=${analysisData.ticker}`}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-700 dark:bg-purple-500 dark:hover:bg-purple-600 text-white rounded-lg font-medium text-sm transition-colors"
                >
                  💰 DCF Valuation
                </Link>
                <button
                  onClick={handleFetchFinancials}
                  disabled={financialsLoading}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 text-white rounded-lg font-medium text-sm transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  {financialsLoading ? '⏳ Loading...' : showFinancials && financialsData ? '📄 Hide Financials' : '📄 Financial Summary'}
                </button>
                <button
                  onClick={() => document.getElementById('advanced-indicators')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                  className="px-4 py-2 bg-teal-600 hover:bg-teal-700 dark:bg-teal-500 dark:hover:bg-teal-600 text-white rounded-lg font-medium text-sm transition-colors"
                >
                  📈 Advanced Indicators
                </button>
                {watchlistMsg && (
                  <span className={`text-sm font-medium ${watchlistMsg.type === 'success' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                    {watchlistMsg.text}
                  </span>
                )}
              </div>

              {/* AI Analysis */}
              <div className="mb-4">
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleAiAnalysis}
                    disabled={aiLoading}
                    className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 text-white rounded-lg font-medium text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {aiLoading ? (
                      <>
                        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        Analyzing indicators...
                      </>
                    ) : (
                      <>
                        <span className="text-base leading-none">✦</span>
                        AI Analysis
                      </>
                    )}
                  </button>
                </div>

                {aiSummary && (
                  <div className="mt-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-indigo-600 dark:text-indigo-400 text-base">✦</span>
                          <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 uppercase tracking-wide">AI-generated summary</span>
                          {aiGeneratedAt && (
                            <span className="text-xs text-gray-400 dark:text-gray-500">
                              · {new Date(aiGeneratedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{aiSummary}</p>
                      </div>
                      <button
                        onClick={handleAiAnalysis}
                        disabled={aiLoading}
                        className="flex-shrink-0 text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 font-medium disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                      >
                        Refresh
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Outlook Summary */}
              <div className={`p-4 rounded-lg ${
                analysisData.summary.outlook === 'bullish'
                  ? 'bg-green-50 dark:bg-green-900/30 border border-green-500 dark:border-green-600'
                  : analysisData.summary.outlook === 'bearish'
                  ? 'bg-red-50 dark:bg-red-900/30 border border-red-500 dark:border-red-600'
                  : 'bg-gray-50 dark:bg-gray-600 border border-gray-400 dark:border-gray-500'
              }`}>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">
                      {analysisData.summary.outlook === 'bullish' ? '🟢' :
                       analysisData.summary.outlook === 'bearish' ? '🔴' : '🟡'}
                    </span>
                    <div>
                      <div className="font-bold text-lg capitalize text-gray-900 dark:text-white">
                        {analysisData.summary.outlook} Outlook
                      </div>
                      <p className="text-sm text-gray-700 dark:text-gray-300 mt-1">
                        {analysisData.summary.message}
                      </p>
                    </div>
                  </div>
                  {analysisData.summary.price_range && (
                    <div className="text-right flex-shrink-0">
                      <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                        Technical Range
                      </div>
                      <div className="text-lg font-bold text-gray-900 dark:text-white mt-0.5">
                        ${analysisData.summary.price_range.support.toFixed(2)} – ${analysisData.summary.price_range.resistance.toFixed(2)}
                      </div>
                      <div className="text-xs italic text-gray-500 dark:text-gray-400 mt-0.5">
                        Indicator-derived range, not a price target
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* ── Financial Summary Panel ────────────────────────── */}
            {showFinancials && (
              <div className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 p-6 border dark:border-gray-500">
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-1">
                  📄 Financial Summary — {analysisData.ticker}
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
                  SEC filings via Massive API • Data updates daily
                </p>

                {financialsLoading && (
                  <div className="flex items-center justify-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div>
                    <span className="ml-3 text-gray-600 dark:text-gray-300">Loading financial data...</span>
                  </div>
                )}

                {financialsError && (
                  <div className="bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-600 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg">
                    {financialsError}
                  </div>
                )}

                {financialsData && !financialsLoading && (
                  <div className="space-y-6">

                    {/* ── Valuation & Ratios Row ── */}
                    <div>
                      <h4 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Valuation & Ratios</h4>
                      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
                        {[
                          { label: 'P/E', value: fmtNum(financialsData.ratios?.pe_ratio) },
                          { label: 'EV/EBITDA', value: fmtNum(financialsData.ratios?.ev_to_ebitda) },
                          { label: 'P/S', value: fmtNum(financialsData.ratios?.ps_ratio) },
                          { label: 'P/B', value: fmtNum(financialsData.ratios?.pb_ratio) },
                          { label: 'P/FCF', value: fmtNum(financialsData.ratios?.price_to_fcf) },
                          { label: 'EV/Sales', value: fmtNum(financialsData.ratios?.ev_to_sales) },
                        ].map((item) => (
                          <div key={item.label} className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 text-center">
                            <div className="text-xs text-gray-500 dark:text-gray-400">{item.label}</div>
                            <div className="text-lg font-bold text-gray-900 dark:text-white">{item.value}</div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* ── Profitability Row ── */}
                    <div>
                      <h4 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Profitability (TTM)</h4>
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                        {[
                          { label: 'Revenue', value: fmtB(financialsData.income_statement?.revenue) },
                          { label: 'Gross Margin', value: fmtPct(financialsData.income_statement?.gross_margin_pct) },
                          { label: 'Op. Margin', value: fmtPct(financialsData.income_statement?.operating_margin_pct) },
                          { label: 'Net Margin', value: fmtPct(financialsData.income_statement?.net_margin_pct) },
                          { label: 'ROE', value: financialsData.ratios?.roe != null ? `${(financialsData.ratios.roe * 100).toFixed(1)}%` : '—' },
                          { label: 'ROA', value: financialsData.ratios?.roa != null ? `${(financialsData.ratios.roa * 100).toFixed(1)}%` : '—' },
                        ].map((item) => (
                          <div key={item.label} className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 text-center">
                            <div className="text-xs text-gray-500 dark:text-gray-400">{item.label}</div>
                            <div className="text-lg font-bold text-gray-900 dark:text-white">{item.value}</div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* ── Financial Health Row ── */}
                    <div>
                      <h4 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Financial Health</h4>
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                        {[
                          { label: 'Cash', value: fmtB(financialsData.balance_sheet?.cash_and_equivalents) },
                          { label: 'Total Debt', value: fmtB(financialsData.balance_sheet?.long_term_debt) },
                          { label: 'Total Equity', value: fmtB(financialsData.balance_sheet?.total_equity) },
                          { label: 'D/E Ratio', value: fmtNum(financialsData.ratios?.debt_to_equity) },
                          { label: 'Current Ratio', value: fmtNum(financialsData.ratios?.current_ratio) },
                          { label: 'Quick Ratio', value: fmtNum(financialsData.ratios?.quick_ratio) },
                        ].map((item) => (
                          <div key={item.label} className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 text-center">
                            <div className="text-xs text-gray-500 dark:text-gray-400">{item.label}</div>
                            <div className="text-lg font-bold text-gray-900 dark:text-white">{item.value}</div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* ── Cash Flow Row ── */}
                    <div>
                      <h4 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Cash Flow (TTM)</h4>
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                        {[
                          { label: 'Operating CF', value: fmtB(financialsData.cash_flow?.operating_cash_flow) },
                          { label: 'CapEx', value: fmtB(financialsData.cash_flow?.capex) },
                          { label: 'Free Cash Flow', value: fmtB(financialsData.cash_flow?.free_cash_flow) },
                          { label: 'Dividends', value: fmtB(financialsData.cash_flow?.dividends) },
                          { label: 'D&A', value: fmtB(financialsData.cash_flow?.depreciation_amortization) },
                        ].map((item) => (
                          <div key={item.label} className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 text-center">
                            <div className="text-xs text-gray-500 dark:text-gray-400">{item.label}</div>
                            <div className="text-lg font-bold text-gray-900 dark:text-white">{item.value}</div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* ── Quarterly Revenue Trend ── */}
                    {financialsData.quarterly_trend && financialsData.quarterly_trend.length > 0 && (
                      <div>
                        <h4 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Quarterly Trend</h4>
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="text-left text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-600">
                                <th className="pb-2 pr-4">Quarter</th>
                                <th className="pb-2 pr-4 text-right">Revenue</th>
                                <th className="pb-2 pr-4 text-right">Net Income</th>
                                <th className="pb-2 pr-4 text-right">Gross Margin</th>
                                <th className="pb-2 pr-4 text-right">Op. Margin</th>
                                <th className="pb-2 text-right">EPS</th>
                              </tr>
                            </thead>
                            <tbody>
                              {[...financialsData.quarterly_trend].map((q: any, i: number) => (
                                <tr key={i} className="border-b border-gray-100 dark:border-gray-700 text-gray-900 dark:text-gray-200">
                                  <td className="py-2 pr-4 font-medium">
                                    {q.fiscal_year ? `FY${q.fiscal_year} Q${q.fiscal_quarter}` : q.period_end}
                                  </td>
                                  <td className="py-2 pr-4 text-right">{fmtB(q.revenue)}</td>
                                  <td className="py-2 pr-4 text-right">{fmtB(q.net_income)}</td>
                                  <td className="py-2 pr-4 text-right">{fmtPct(q.gross_margin_pct)}</td>
                                  <td className="py-2 pr-4 text-right">{fmtPct(q.operating_margin_pct)}</td>
                                  <td className="py-2 text-right">{fmtNum(q.eps_diluted)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* ── DCF-Ready Suggestions ── */}
                    {financialsData.dcf_suggestions && (
                      <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-lg p-4 border border-indigo-200 dark:border-indigo-800">
                        <h4 className="text-sm font-semibold text-indigo-700 dark:text-indigo-300 uppercase tracking-wider mb-3">
                          💡 Derived DCF Inputs (from Actuals)
                        </h4>
                        <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">
                          These values replace sector-default assumptions with company-specific data. Use them to pre-populate your DCF model.
                        </p>
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                          {[
                            { label: 'YoY Rev. Growth', value: fmtPct(financialsData.dcf_suggestions.revenue_growth_yoy_pct) },
                            { label: 'Suggested Growth', value: fmtPct(financialsData.dcf_suggestions.suggested_growth_rate) },
                            { label: 'Op. Margin', value: fmtPct(financialsData.dcf_suggestions.operating_margin_pct) },
                            { label: 'Est. WACC', value: fmtPct(financialsData.dcf_suggestions.estimated_wacc) },
                            { label: 'TTM FCF', value: fmtB(financialsData.dcf_suggestions.fcf_ttm) },
                          ].map((item) => (
                            <div key={item.label} className="bg-white dark:bg-gray-800 rounded-lg p-3 text-center">
                              <div className="text-xs text-gray-500 dark:text-gray-400">{item.label}</div>
                              <div className="text-lg font-bold text-indigo-700 dark:text-indigo-300">{item.value}</div>
                            </div>
                          ))}
                        </div>
                        <div className="mt-3 text-right">
                          <Link
                            to={`/dcf-valuation?ticker=${analysisData.ticker}&from=ta${
                              financialsData.dcf_suggestions.suggested_growth_rate != null ? `&growth=${financialsData.dcf_suggestions.suggested_growth_rate}` : ''
                            }${
                              financialsData.dcf_suggestions.estimated_wacc != null ? `&wacc=${financialsData.dcf_suggestions.estimated_wacc}` : ''
                            }${
                              financialsData.dcf_suggestions.fcf_ttm != null ? `&fcf=${financialsData.dcf_suggestions.fcf_ttm}` : ''
                            }${
                              financialsData.dcf_suggestions.revenue_growth_yoy_pct != null ? `&revgrowth=${financialsData.dcf_suggestions.revenue_growth_yoy_pct}` : ''
                            }${
                              financialsData.dcf_suggestions.operating_margin_pct != null ? `&opmarg=${financialsData.dcf_suggestions.operating_margin_pct}` : ''
                            }${
                              financialsData.dcf_suggestions.debt_to_equity != null ? `&de=${financialsData.dcf_suggestions.debt_to_equity}` : ''
                            }`}
                            className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline font-medium"
                          >
                            Open DCF Valuation with these inputs →
                          </Link>
                        </div>
                      </div>
                    )}

                    {/* Market cap & EV footer */}
                    <div className="flex flex-wrap gap-4 text-xs text-gray-500 dark:text-gray-400 pt-2 border-t border-gray-200 dark:border-gray-600">
                      {financialsData.ratios?.market_cap && (
                        <span>Market Cap: <strong className="text-gray-700 dark:text-gray-300">{fmtB(financialsData.ratios.market_cap)}</strong></span>
                      )}
                      {financialsData.ratios?.enterprise_value && (
                        <span>Enterprise Value: <strong className="text-gray-700 dark:text-gray-300">{fmtB(financialsData.ratios.enterprise_value)}</strong></span>
                      )}
                      {financialsData.ratios?.dividend_yield != null && financialsData.ratios.dividend_yield > 0 && (
                        <span>Dividend Yield: <strong className="text-gray-700 dark:text-gray-300">{(financialsData.ratios.dividend_yield * 100).toFixed(2)}%</strong></span>
                      )}
                      {financialsData.ratios?.eps && (
                        <span>EPS (TTM): <strong className="text-gray-700 dark:text-gray-300">${fmtNum(financialsData.ratios.eps)}</strong></span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Trading Signals */}
            {analysisData.signals && analysisData.signals.length > 0 && (
              <div className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 p-6 border dark:border-gray-500">
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Trading Signals</h3>
                <div className="space-y-3">
                  {analysisData.signals.map((signal, index) => (
                    <div key={index} className="flex items-start gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors" onClick={() => scrollToChart(signal.indicator)}>

                      <div className="flex-shrink-0 flex items-center gap-3">
                        <span className={`px-2 py-1 rounded text-xs font-bold ${
                          signal.type === 'buy' 
                            ? 'bg-green-500 text-white'
                            : signal.type === 'sell'
                            ? 'bg-red-500 text-white'
                            : 'bg-gray-500 text-white'
                        }`}>
                          {signal.type.toUpperCase()}
                        </span>
                        <div>
                          <div className="font-semibold text-gray-900 dark:text-white">{signal.indicator}</div>
                          <div className="text-sm text-gray-600 dark:text-gray-400">{signal.message}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Bollinger Bands + Volume Chart */}
            <div id="chart-bollinger" className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 p-6 border dark:border-gray-500">
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Bollinger Bands &amp; Volume</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                    📊 <strong>How to read:</strong> Green dashed line = Lower Bollinger Band (potential buy zone), 
                    Red dashed line = Upper Bollinger Band (potential sell zone). 
                    The middle band (not shown) is the 20-day SMA — price tends to revert toward it. 
                    Volume bars on the right axis show trading activity.
                </p>
                {isWarrant && (
                  <p className="text-sm text-orange-600 dark:text-orange-400 mb-4 font-medium">
                    ⚠️ <strong>Warrant Note:</strong> Expect higher volatility and more frequent Bollinger Band touches than common stocks.
                  </p>
                )}
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                    <strong>Situations to Look For:</strong> When the bands squeeze tight, volatility is contracting — a breakout 
                    (in either direction) often follows. Watch for expanding volume to confirm the direction of the move.
                </p>
                <div style={{ height: '300px' }}>
                    {getBBChartData() && (
                    <Chart type="line" data={getBBChartData()!} options={priceChartOptions} />
                    )}
                </div>
            </div>

            {/* Moving Averages Chart with Golden/Death Cross */}
            <div id="chart-moving-averages" className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 p-6 border dark:border-gray-500">
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Moving Averages — Trend &amp; Crossovers</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                    📊 <strong>How to read:</strong> Yellow line = 20-day SMA (short-term trend), 
                    Purple line = 50-day SMA (medium-term trend). 
                    When the price stays above both lines, the trend is bullish. Below both = bearish. 
                    Between them = indecision or transition.
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                    <strong>Golden Cross &amp; Death Cross:</strong> When the 20-day SMA crosses <em>above</em> the 50-day SMA, 
                    it forms a <strong className="text-green-500">Golden Cross</strong> — a bullish signal indicating short-term momentum 
                    is outpacing the medium-term trend. When the 20-day crosses <em>below</em> the 50-day, 
                    it forms a <strong className="text-red-500">Death Cross</strong> — a bearish signal. 
                    Look for the cross, then confirm with volume and RSI before acting.
                </p>
                {isWarrant && (
                  <p className="text-sm text-orange-600 dark:text-orange-400 mb-4 font-medium">
                    ⚠️ <strong>Warrant Note:</strong> MA crossovers on warrants can produce more false signals due to higher volatility. Confirm with volume and broader market context.
                  </p>
                )}
                <div style={{ height: '300px' }}>
                    {getMAChartData() && (
                    <Chart type="line" data={getMAChartData()!} options={maChartOptions} />
                    )}
                </div>
            </div>        

            {/* RSI Chart */}
            <div id="chart-rsi" className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 p-6 border dark:border-gray-500">
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">RSI (Relative Strength Index)</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                    Current RSI: <strong className={analysisData.indicators.rsi.value && analysisData.indicators.rsi.value < 30 ? 'text-green-500' : analysisData.indicators.rsi.value && analysisData.indicators.rsi.value > 70 ? 'text-red-500' : 'text-gray-900 dark:text-white'}>
                    {analysisData.indicators.rsi.value?.toFixed(2) || 'N/A'}
                    </strong> - {analysisData.indicators.rsi.description}
                </p>
                {isWarrant && (
                  <p className="text-sm text-orange-600 dark:text-orange-400 mb-4 font-medium">
                    ⚠️ <strong>Warrant Note:</strong> Warrants often hit extreme RSI levels (below 30 or above 70) more frequently than common stocks.
                  </p>
                )}
                <div style={{ height: '300px' }}>
                    {getRSIChartData() && (
                    <Line 
                        data={getRSIChartData()!} 
                        options={{
                        ...chartOptions, 
                        scales: {
                            ...chartOptions.scales, 
                            y: {
                            min: 0, 
                            max: 100, 
                            ticks: {color: '#9CA3AF'}, 
                            grid: {color: 'rgba(156, 163, 175, 0.1)'}
                            }
                        }
                        }} 
                    />
                    )}
                </div>
            </div>

            {/* MACD Chart */}
            <div id="chart-macd" className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 p-6 border dark:border-gray-500">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">MACD (Moving Average Convergence Divergence)</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                Current Trend: <strong className={analysisData.indicators.macd.trend === 'bullish' ? 'text-green-500' : 'text-red-500'}>
                  {analysisData.indicators.macd.trend}
                </strong> - {analysisData.indicators.macd.description}
              </p>
              <div style={{ height: '300px' }}>
                {getMACDChartData() && (
                    <Chart type="bar" data={getMACDChartData()!} options={chartOptions} />
                )}
              </div>
            </div>

            {/* Indicator Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Moving Averages */}
              <div className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 p-6 border dark:border-gray-500">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Moving Averages</h3>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600 dark:text-gray-400">20-day SMA:</span>
                    <span className="font-semibold text-gray-900 dark:text-white">
                      ${analysisData.indicators.moving_averages.sma_20?.toFixed(2) || 'N/A'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600 dark:text-gray-400">50-day SMA:</span>
                    <span className="font-semibold text-gray-900 dark:text-white">
                      ${analysisData.indicators.moving_averages.sma_50?.toFixed(2) || 'N/A'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600 dark:text-gray-400">200-day SMA:</span>
                    <span className="font-semibold text-gray-900 dark:text-white">
                      ${analysisData.indicators.moving_averages.sma_200?.toFixed(2) || 'N/A'}
                    </span>
                  </div>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-4">
                  {analysisData.indicators.moving_averages.description}
                </p>
              </div>

              {/* Bollinger Bands */}
              <div className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 p-6 border dark:border-gray-500">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Bollinger Bands</h3>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600 dark:text-gray-400">Upper Band:</span>
                    <span className="font-semibold text-red-500">
                      ${analysisData.indicators.bollinger_bands.upper_band?.toFixed(2) ?? 'N/A'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600 dark:text-gray-400">Middle Band:</span>
                    <span className="font-semibold text-gray-900 dark:text-white">
                      ${analysisData.indicators.bollinger_bands.middle_band?.toFixed(2) ?? 'N/A'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600 dark:text-gray-400">Lower Band:</span>
                    <span className="font-semibold text-green-500">
                      ${analysisData.indicators.bollinger_bands.lower_band?.toFixed(2) ?? 'N/A'}
                    </span>
                  </div>
                  <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                    <div className="text-sm">
                      <span className="text-gray-600 dark:text-gray-400">Position: </span>
                      <span className="font-semibold text-gray-900 dark:text-white capitalize">
                        {analysisData.indicators.bollinger_bands.position.replace('_', ' ')}
                      </span>
                    </div>
                  </div>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-4">
                  {analysisData.indicators.bollinger_bands.description}
                </p>
              </div>
            </div>

            {/* ═══════════════════════════════════════════════════════════ */}
            {/* ADVANCED INDICATORS — Toggleable Panels                    */}
            {/* ═══════════════════════════════════════════════════════════ */}
            <div id="advanced-indicators" className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 p-6 border dark:border-gray-500">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">📊 Advanced Indicators</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Click a category to expand charts and details</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { key: 'volume', label: '📊 Volume', state: showVolume, toggle: setShowVolume, color: 'blue' },
                  { key: 'momentum', label: '⚡ Momentum', state: showMomentum, toggle: setShowMomentum, color: 'purple' },
                  { key: 'volatility', label: '🌊 Volatility', state: showVolatility, toggle: setShowVolatility, color: 'orange' },
                  { key: 'trend', label: '📈 Trend', state: showTrend, toggle: setShowTrend, color: 'green' },
                ].map(cat => (
                  <button
                    key={cat.key}
                    onClick={() => cat.toggle(!cat.state)}
                    className={`p-3 rounded-lg font-semibold text-sm transition-all border-2 ${
                      cat.state 
                        ? 'bg-primary-600 text-white border-primary-600 dark:bg-primary-500 dark:border-primary-500'
                        : 'bg-gray-100 dark:bg-gray-600 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-500 hover:border-primary-400 dark:hover:border-primary-400'
                    }`}
                  >
                    {cat.label} {cat.state ? '▼' : '▶'}
                  </button>
                ))}
              </div>
            </div>

            {/* ── VOLUME INDICATORS ──────────────────────────────────── */}
            {showVolume && (
              <div className="space-y-4">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">📊 Volume Indicators</h3>
                {/* VWAP Chart */}
                <div id="chart-vwap" className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 p-6 border dark:border-gray-500">
                  <h4 className="text-lg font-bold text-gray-900 dark:text-white mb-2">VWAP (Volume Weighted Average Price)</h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                    VWAP calculates the average price weighted by volume throughout the day. Institutional traders use it as a benchmark — price above VWAP suggests buyers are in control and the stock has bullish momentum, while price below VWAP indicates selling pressure. It helps identify fair value and is one of the most widely used indicators by professional traders.
                  </p>
                  <div style={{ height: '300px' }}>
                    <Line data={{
                      labels: analysisData.chart_data.map(d => d.date),
                      datasets: [
                        { label: 'Price', data: analysisData.chart_data.map(d => d.close), borderColor: 'rgb(59, 130, 246)', borderWidth: 2, pointRadius: 0, tension: 0.1, fill: false },
                        { label: 'VWAP', data: analysisData.chart_data.map(d => d.vwap), borderColor: 'rgb(245, 158, 11)', borderWidth: 2, pointRadius: 0, tension: 0.1, borderDash: [5,5], fill: false },
                      ]
                    }} options={chartOptions} />
                  </div>
                </div>
                {/* OBV + A/D Line summary cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {[
                    { label: 'VWAP', data: analysisData.indicators.vwap },
                    { label: 'OBV', data: analysisData.indicators.obv },
                    { label: 'A/D Line', data: analysisData.indicators.ad_line },
                  ].map(item => (
                    <div key={item.label} className="bg-white dark:bg-gray-700 rounded-lg shadow dark:shadow-gray-200/20 p-4 border dark:border-gray-500">
                      <h4 className="font-bold text-gray-900 dark:text-white mb-2">{item.label}</h4>
                      {item.data ? (
                        <>
                          <p className={`text-sm font-semibold ${item.data.signal === 'bullish' ? 'text-green-500' : item.data.signal === 'bearish' ? 'text-red-500' : 'text-gray-500'}`}>
                            {item.data.signal?.toUpperCase()}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{item.data.description}</p>
                        </>
                      ) : <p className="text-xs text-gray-400">N/A</p>}
                    </div>
                  ))}
                </div>
                {/* OBV Chart */}
                <div id="chart-obv" className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 p-6 border dark:border-gray-500">
                  <h4 className="text-lg font-bold text-gray-900 dark:text-white mb-2">On-Balance Volume (OBV)</h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">OBV tracks cumulative buying and selling pressure by adding volume on up days and subtracting on down days. A rising OBV confirms an uptrend is supported by strong volume. When OBV diverges from price — such as price rising while OBV falls — it often signals an impending trend reversal.</p>
                  <div style={{ height: '250px' }}>
                    <Line data={{
                      labels: analysisData.chart_data.map(d => d.date),
                      datasets: [
                        { label: 'OBV', data: analysisData.chart_data.map(d => d.obv), borderColor: 'rgb(16, 185, 129)', borderWidth: 2, pointRadius: 0, tension: 0.1, fill: true, backgroundColor: 'rgba(16, 185, 129, 0.1)' },
                      ]
                    }} options={chartOptions} />
                  </div>
                </div>
              </div>
            )}

            {/* ── MOMENTUM INDICATORS ────────────────────────────────── */}
            {showMomentum && (
              <div className="space-y-4">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">⚡ Momentum Indicators</h3>
                {/* Stochastic Oscillator */}
                <div id="chart-stochastic" className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 p-6 border dark:border-gray-500">
                  <h4 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Stochastic Oscillator</h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                    The Stochastic Oscillator compares a stock's closing price to its price range over a set period. Readings above 80 indicate overbought conditions where a pullback may occur, while readings below 20 suggest oversold conditions where a bounce is likely. Crossovers between the %K and %D lines generate buy and sell signals.
                  </p>
                  <div style={{ height: '250px' }}>
                    <Line data={{
                      labels: analysisData.chart_data.map(d => d.date),
                      datasets: [
                        { label: '%K', data: analysisData.chart_data.map(d => d.stoch_k), borderColor: 'rgb(59, 130, 246)', borderWidth: 2, pointRadius: 0, tension: 0.1, fill: false },
                        { label: '%D', data: analysisData.chart_data.map(d => d.stoch_d), borderColor: 'rgb(239, 68, 68)', borderWidth: 2, pointRadius: 0, tension: 0.1, borderDash: [5,5], fill: false },
                        { label: 'Overbought', data: Array(analysisData.chart_data.length).fill(80), borderColor: 'rgba(239,68,68,0.4)', borderWidth: 1, borderDash: [3,3], pointRadius: 0, fill: false },
                        { label: 'Oversold', data: Array(analysisData.chart_data.length).fill(20), borderColor: 'rgba(34,197,94,0.4)', borderWidth: 1, borderDash: [3,3], pointRadius: 0, fill: false },
                      ]
                    }} options={{...chartOptions, scales: {...chartOptions.scales, y: {...chartOptions.scales.y, min: 0, max: 100}}}} />
                  </div>
                </div>
                {/* ADX */}
                <div id="chart-adx" className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 p-6 border dark:border-gray-500">
                  <h4 className="text-lg font-bold text-gray-900 dark:text-white mb-2">ADX (Average Directional Index)</h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                    ADX measures trend strength regardless of direction — values above 25 indicate a strong trend worth trading, while values below 20 suggest a weak or sideways market. The +DI and -DI lines show direction: when +DI is above -DI the trend is bullish, and vice versa. Together they help determine whether to use trend-following or range-bound strategies.
                  </p>
                  <div style={{ height: '250px' }}>
                    <Line data={{
                      labels: analysisData.chart_data.map(d => d.date),
                      datasets: [
                        { label: 'ADX', data: analysisData.chart_data.map(d => d.adx), borderColor: 'rgb(139, 92, 246)', borderWidth: 2.5, pointRadius: 0, tension: 0.1, fill: false },
                        { label: '+DI', data: analysisData.chart_data.map(d => d.plus_di), borderColor: 'rgb(34, 197, 94)', borderWidth: 1.5, pointRadius: 0, tension: 0.1, fill: false },
                        { label: '-DI', data: analysisData.chart_data.map(d => d.minus_di), borderColor: 'rgb(239, 68, 68)', borderWidth: 1.5, pointRadius: 0, tension: 0.1, fill: false },
                        { label: 'Trending (25)', data: Array(analysisData.chart_data.length).fill(25), borderColor: 'rgba(156,163,175,0.4)', borderWidth: 1, borderDash: [3,3], pointRadius: 0, fill: false },
                      ]
                    }} options={chartOptions} />
                  </div>
                </div>
                {/* CCI + ROC */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div id="chart-cci" className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 p-6 border dark:border-gray-500">
                    <h4 className="text-lg font-bold text-gray-900 dark:text-white mb-2">CCI (Commodity Channel Index)</h4>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">CCI measures how far the current price deviates from its statistical average. Readings above +100 indicate overbought conditions and potential for a pullback, while readings below -100 signal oversold conditions and a possible bounce. It is useful for identifying cyclical trends and price extremes across any asset class.</p>
                    <div style={{ height: '200px' }}>
                      <Line data={{
                        labels: analysisData.chart_data.map(d => d.date),
                        datasets: [
                          { label: 'CCI', data: analysisData.chart_data.map(d => d.cci), borderColor: 'rgb(245, 158, 11)', borderWidth: 2, pointRadius: 0, tension: 0.1, fill: true, backgroundColor: 'rgba(245,158,11,0.1)' },
                          { label: '+100', data: Array(analysisData.chart_data.length).fill(100), borderColor: 'rgba(239,68,68,0.3)', borderWidth: 1, borderDash: [3,3], pointRadius: 0, fill: false },
                          { label: '-100', data: Array(analysisData.chart_data.length).fill(-100), borderColor: 'rgba(34,197,94,0.3)', borderWidth: 1, borderDash: [3,3], pointRadius: 0, fill: false },
                        ]
                      }} options={chartOptions} />
                    </div>
                  </div>
                  <div id="chart-roc" className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 p-6 border dark:border-gray-500">
                    <h4 className="text-lg font-bold text-gray-900 dark:text-white mb-2">ROC (Rate of Change)</h4>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">ROC measures the percentage change in price over a specific period, making it useful for identifying overbought or oversold conditions as well as trend reversals. A rising ROC above zero confirms bullish momentum, while a falling ROC below zero signals bearish pressure. Extreme readings often precede price corrections.</p>
                    <div style={{ height: '200px' }}>
                      <Line data={{
                        labels: analysisData.chart_data.map(d => d.date),
                        datasets: [
                          { label: 'ROC %', data: analysisData.chart_data.map(d => d.roc), borderColor: 'rgb(99, 102, 241)', borderWidth: 2, pointRadius: 0, tension: 0.1, fill: true, backgroundColor: 'rgba(99,102,241,0.1)' },
                          { label: 'Zero', data: Array(analysisData.chart_data.length).fill(0), borderColor: 'rgba(156,163,175,0.4)', borderWidth: 1, borderDash: [3,3], pointRadius: 0, fill: false },
                        ]
                      }} options={chartOptions} />
                    </div>
                  </div>
                </div>
                {/* Momentum summary cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    { label: 'Stochastic', data: analysisData.indicators.stochastic, val: analysisData.indicators.stochastic ? `%K: ${analysisData.indicators.stochastic.k}` : 'N/A' },
                    { label: 'ADX', data: analysisData.indicators.adx, val: analysisData.indicators.adx ? `${analysisData.indicators.adx.adx}` : 'N/A' },
                    { label: 'CCI', data: analysisData.indicators.cci, val: analysisData.indicators.cci?.value?.toFixed(0) || 'N/A' },
                    { label: 'ROC', data: analysisData.indicators.roc, val: analysisData.indicators.roc?.value ? `${analysisData.indicators.roc.value > 0 ? '+' : ''}${analysisData.indicators.roc.value.toFixed(1)}%` : 'N/A' },
                  ].map(item => (
                    <div key={item.label} className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 text-center">
                      <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{item.label}</p>
                      <p className="text-lg font-bold text-gray-900 dark:text-white">{item.val}</p>
                      <p className={`text-xs font-semibold ${
                        (item.data as any)?.signal === 'bullish' || (item.data as any)?.signal === 'oversold' || (item.data as any)?.direction === 'bullish' ? 'text-green-500' 
                        : (item.data as any)?.signal === 'bearish' || (item.data as any)?.signal === 'overbought' || (item.data as any)?.direction === 'bearish' ? 'text-red-500' 
                        : 'text-gray-400'
                      }`}>
                        {(item.data as any)?.signal || (item.data as any)?.strength || ''}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── VOLATILITY INDICATORS ──────────────────────────────── */}
            {showVolatility && (
              <div className="space-y-4">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">🌊 Volatility Indicators</h3>
                {/* ATR Chart */}
                <div id="chart-atr" className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 p-6 border dark:border-gray-500">
                  <h4 className="text-lg font-bold text-gray-900 dark:text-white mb-2">ATR (Average True Range)</h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">ATR measures market volatility by calculating the average range between high and low prices over a given period. Higher ATR means greater volatility and wider price swings, which is important for setting stop-loss levels and position sizing. Traders use ATR to avoid placing stops too tight in volatile markets or too wide in calm ones.</p>
                  <div style={{ height: '250px' }}>
                    <Line data={{
                      labels: analysisData.chart_data.map(d => d.date),
                      datasets: [
                        { label: 'ATR', data: analysisData.chart_data.map(d => d.atr), borderColor: 'rgb(249, 115, 22)', borderWidth: 2, pointRadius: 0, tension: 0.1, fill: true, backgroundColor: 'rgba(249,115,22,0.1)' },
                      ]
                    }} options={chartOptions} />
                  </div>
                </div>
                {/* Keltner Channels (overlay on price) */}
                <div id="chart-keltner" className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 p-6 border dark:border-gray-500">
                  <h4 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Keltner Channels</h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">Keltner Channels plot an EMA with upper and lower bands based on ATR. Price breaking above the upper channel suggests strong bullish momentum and a potential breakout, while a break below the lower channel signals bearish pressure. Price staying within the channels indicates normal trading. They are commonly used with Bollinger Bands to identify squeeze setups.</p>
                  <div style={{ height: '350px' }}>
                    <Line data={{
                      labels: analysisData.chart_data.map(d => d.date),
                      datasets: [
                        { label: 'Price', data: analysisData.chart_data.map(d => d.close), borderColor: 'rgb(59, 130, 246)', borderWidth: 2, pointRadius: 0, tension: 0.1, fill: false },
                        { label: 'KC Upper', data: analysisData.chart_data.map(d => d.keltner_upper), borderColor: 'rgb(239, 68, 68)', borderWidth: 1.5, pointRadius: 0, tension: 0.1, borderDash: [4,4], fill: false },
                        { label: 'KC Middle', data: analysisData.chart_data.map(d => d.keltner_middle), borderColor: 'rgb(156, 163, 175)', borderWidth: 1, pointRadius: 0, tension: 0.1, borderDash: [2,2], fill: false },
                        { label: 'KC Lower', data: analysisData.chart_data.map(d => d.keltner_lower), borderColor: 'rgb(34, 197, 94)', borderWidth: 1.5, pointRadius: 0, tension: 0.1, borderDash: [4,4], fill: false },
                      ]
                    }} options={chartOptions} />
                  </div>
                </div>
                {/* Volatility summary */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {[
                    { label: 'ATR', desc: analysisData.indicators.atr?.description, badge: analysisData.indicators.atr?.volatility },
                    { label: 'Keltner', desc: analysisData.indicators.keltner?.description, badge: analysisData.indicators.keltner?.position?.replace('_', ' ') },
                    { label: 'Std Dev', desc: analysisData.indicators.std_dev?.description, badge: analysisData.indicators.std_dev?.percent ? `${analysisData.indicators.std_dev.percent}%` : 'N/A' },
                  ].map(item => (
                    <div key={item.label} className="bg-white dark:bg-gray-700 rounded-lg shadow dark:shadow-gray-200/20 p-4 border dark:border-gray-500">
                      <h4 className="font-bold text-gray-900 dark:text-white mb-1">{item.label}</h4>
                      <span className="inline-block px-2 py-0.5 rounded text-xs font-semibold bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 mb-2">{item.badge || 'N/A'}</span>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{item.desc || 'N/A'}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── TREND INDICATORS ───────────────────────────────────── */}
            {showTrend && (
              <div className="space-y-4">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">📈 Trend Indicators</h3>
                {/* Parabolic SAR (dots on price chart) */}
                <div id="chart-parabolic-sar" className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 p-6 border dark:border-gray-500">
                  <h4 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Parabolic SAR</h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">Parabolic SAR (Stop and Reverse) places dots above or below the price to indicate trend direction. Dots below the price confirm an uptrend, while dots above signal a downtrend. When the dots flip sides it generates a reversal signal, making it particularly useful for setting trailing stop-losses and identifying entry and exit points during trending markets.</p>
                  <div style={{ height: '350px' }}>
                    <Chart type="line" data={{
                      labels: analysisData.chart_data.map(d => d.date),
                      datasets: [
                        { label: 'Price', data: analysisData.chart_data.map(d => d.close), borderColor: 'rgb(59, 130, 246)', borderWidth: 2, pointRadius: 0, tension: 0.1, fill: false, type: 'line' as const },
                        { label: 'SAR', data: analysisData.chart_data.map(d => d.sar), borderColor: 'transparent', borderWidth: 0, pointRadius: 2.5,
                          pointBackgroundColor: analysisData.chart_data.map(d => d.sar_trend === 1 ? 'rgb(34, 197, 94)' : 'rgb(239, 68, 68)'),
                          fill: false, type: 'line' as const, showLine: false },
                      ]
                    }} options={chartOptions} />
                  </div>
                </div>
                {/* Ichimoku Cloud */}
                <div id="chart-ichimoku" className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 p-6 border dark:border-gray-500">
                  <h4 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Ichimoku Cloud</h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">The Ichimoku Cloud is a comprehensive indicator that shows support/resistance levels, trend direction, and momentum all at once. Price above the cloud is bullish, below is bearish, and within the cloud is neutral. The Tenkan-Sen and Kijun-Sen lines act like short-term and medium-term moving averages — their crossovers generate trade signals similar to moving average crossovers.</p>
                  <div style={{ height: '400px' }}>
                    <Line data={{
                      labels: analysisData.chart_data.map(d => d.date),
                      datasets: [
                        { label: 'Price', data: analysisData.chart_data.map(d => d.close), borderColor: 'rgb(59, 130, 246)', borderWidth: 2, pointRadius: 0, tension: 0.1, fill: false },
                        { label: 'Tenkan-sen', data: analysisData.chart_data.map(d => d.ichimoku_tenkan), borderColor: 'rgb(239, 68, 68)', borderWidth: 1.5, pointRadius: 0, tension: 0.1, fill: false },
                        { label: 'Kijun-sen', data: analysisData.chart_data.map(d => d.ichimoku_kijun), borderColor: 'rgb(59, 130, 246)', borderWidth: 1.5, pointRadius: 0, tension: 0.1, borderDash: [5,5], fill: false },
                        { label: 'Senkou A', data: analysisData.chart_data.map(d => d.ichimoku_senkou_a), borderColor: 'rgba(34, 197, 94, 0.6)', borderWidth: 1, pointRadius: 0, tension: 0.1, fill: '+1', backgroundColor: 'rgba(34, 197, 94, 0.08)' },
                        { label: 'Senkou B', data: analysisData.chart_data.map(d => d.ichimoku_senkou_b), borderColor: 'rgba(239, 68, 68, 0.6)', borderWidth: 1, pointRadius: 0, tension: 0.1, fill: false },
                      ]
                    }} options={chartOptions} />
                  </div>
                </div>
                {/* Donchian Channels */}
                <div id="chart-donchian" className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 p-6 border dark:border-gray-500">
                  <h4 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Donchian Channels</h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">Donchian Channels plot the highest high and lowest low over a set period, creating a breakout trading system. A price break above the upper channel signals a potential new uptrend, while a break below the lower channel signals a new downtrend. Made famous by the "Turtle Traders," this indicator is a foundational tool for trend-following and breakout strategies.</p>
                  <div style={{ height: '350px' }}>
                    <Line data={{
                      labels: analysisData.chart_data.map(d => d.date),
                      datasets: [
                        { label: 'Price', data: analysisData.chart_data.map(d => d.close), borderColor: 'rgb(59, 130, 246)', borderWidth: 2, pointRadius: 0, tension: 0.1, fill: false },
                        { label: 'DC Upper', data: analysisData.chart_data.map(d => d.donchian_upper), borderColor: 'rgb(34, 197, 94)', borderWidth: 1.5, pointRadius: 0, tension: 0, fill: false },
                        { label: 'DC Middle', data: analysisData.chart_data.map(d => d.donchian_middle), borderColor: 'rgb(156, 163, 175)', borderWidth: 1, pointRadius: 0, tension: 0, borderDash: [3,3], fill: false },
                        { label: 'DC Lower', data: analysisData.chart_data.map(d => d.donchian_lower), borderColor: 'rgb(239, 68, 68)', borderWidth: 1.5, pointRadius: 0, tension: 0, fill: false },
                      ]
                    }} options={chartOptions} />
                  </div>
                </div>
                {/* Trend summary cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {[
                    { label: 'Parabolic SAR', data: analysisData.indicators.parabolic_sar, badge: analysisData.indicators.parabolic_sar?.trend, color: analysisData.indicators.parabolic_sar?.trend === 'uptrend' ? 'green' : 'red' },
                    { label: 'Ichimoku Cloud', data: analysisData.indicators.ichimoku, badge: analysisData.indicators.ichimoku?.signal, color: analysisData.indicators.ichimoku?.signal === 'bullish' ? 'green' : analysisData.indicators.ichimoku?.signal === 'bearish' ? 'red' : 'gray' },
                    { label: 'Donchian', data: analysisData.indicators.donchian, badge: analysisData.indicators.donchian ? `$${analysisData.indicators.donchian.upper} / $${analysisData.indicators.donchian.lower}` : 'N/A', color: 'gray' },
                  ].map(item => (
                    <div key={item.label} className="bg-white dark:bg-gray-700 rounded-lg shadow dark:shadow-gray-200/20 p-4 border dark:border-gray-500">
                      <h4 className="font-bold text-gray-900 dark:text-white mb-1">{item.label}</h4>
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold mb-2 ${
                        item.color === 'green' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                        : item.color === 'red' ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                        : 'bg-gray-100 dark:bg-gray-600 text-gray-700 dark:text-gray-300'
                      }`}>{item.badge || 'N/A'}</span>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{item.data?.description || 'N/A'}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>
        )}

        {/* Educational Content (shown when no analysis) */}
        {!analysisData && !loading && (
          <div className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 p-8 border dark:border-gray-500">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">How to Use Technical Analysis</h2>
            
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">📊 RSI (Relative Strength Index)</h3>
                <p className="text-gray-600 dark:text-gray-400">
                  Measures momentum on a scale of 0-100. Below 30 = oversold (potential buy), Above 70 = overbought (potential sell).
                </p>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">📈 MACD (Moving Average Convergence Divergence)</h3>
                <p className="text-gray-600 dark:text-gray-400">
                  Shows trend direction and momentum. Bullish = upward momentum, Bearish = downward momentum. When MACD line crosses above signal line = buy signal.
                </p>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">📉 Moving Averages</h3>
                <p className="text-gray-600 dark:text-gray-400">
                  Average price over time. Price above MA = uptrend, Price below MA = downtrend. When the 20-day SMA crosses above the 50-day = Golden Cross (bullish). When it crosses below = Death Cross (bearish).
                </p>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">🎯 Bollinger Bands</h3>
                <p className="text-gray-600 dark:text-gray-400">
                  Show volatility. When price touches lower band = potential bounce opportunity. When price touches upper band = potential reversal down.
                </p>
              </div>

              <div className="bg-primary-50 dark:bg-primary-900/20 p-4 rounded-lg border border-primary-200 dark:border-primary-800">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">📊 Advanced Indicators (15 additional)</h3>
                <p className="text-gray-600 dark:text-gray-400 text-sm mb-2">
                  After running an analysis, toggle these category panels for deeper insights:
                </p>
                <div className="grid grid-cols-2 gap-2 text-xs text-gray-600 dark:text-gray-400">
                  <div><strong>Volume:</strong> VWAP, OBV, A/D Line</div>
                  <div><strong>Momentum:</strong> Stochastic, ADX, CCI, ROC</div>
                  <div><strong>Volatility:</strong> ATR, Keltner Channels, Std Dev</div>
                  <div><strong>Trend:</strong> Parabolic SAR, Ichimoku Cloud, Donchian</div>
                </div>
              </div>

              <div className="bg-indigo-50 dark:bg-indigo-900/20 p-4 rounded-lg border border-indigo-200 dark:border-indigo-800">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">📄 Financial Summary (Paid Tiers)</h3>
                <p className="text-gray-600 dark:text-gray-400 text-sm mb-2">
                  After running an analysis, click the <strong>Financial Summary</strong> button to view SEC-sourced company financials — updated daily from 10-K and 10-Q filings:
                </p>
                <div className="grid grid-cols-2 gap-2 text-xs text-gray-600 dark:text-gray-400">
                  <div><strong>Income Statement:</strong> Revenue, margins, net income, EBITDA, EPS</div>
                  <div><strong>Balance Sheet:</strong> Cash, debt, equity, current/quick ratios</div>
                  <div><strong>Cash Flow:</strong> Operating CF, CapEx, free cash flow, dividends</div>
                  <div><strong>Ratios:</strong> P/E, EV/EBITDA, P/S, P/B, ROE, ROA, D/E</div>
                </div>
                <p className="text-gray-500 dark:text-gray-400 text-xs mt-2">
                  Also includes derived DCF inputs (growth rate, estimated WACC, TTM FCF) based on actual financials — use them to pre-populate the DCF Valuation model.
                </p>
              </div>
              
              <div className="bg-orange-50 dark:bg-orange-900/20 p-4 rounded-lg border border-orange-200 dark:border-orange-800">
                <p className="text-sm text-gray-700 dark:text-gray-300">
                  <strong>⚠️ Note on Warrants:</strong> Technical analysis on warrants requires special consideration due to their derivative nature, 
                  higher volatility, time decay, and expiration risk. Always compare warrant movements to the underlying common stock and be aware 
                  of the time value component that decreases as expiration approaches.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
      <BackToTop />
    </div>
  );
};

export default TechnicalAnalysis;