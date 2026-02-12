import React, { useState, useRef } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { authAPI, technicalAPI, watchlistAPI } from '../services/api';
import { User } from '../types';
import ThemeToggle from '../components/ThemeToggle';
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
  };
}

const TechnicalAnalysis: React.FC = () => {
  const navigate = useNavigate();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const [searchParams] = useSearchParams();
  const urlTicker = searchParams.get('ticker') || '';
  const [user, setUser] = useState<User | null>(null);
  const [ticker, setTicker] = useState(urlTicker);
  const [loading, setLoading] = useState(false);
  const [analysisData, setAnalysisData] = useState<TechnicalAnalysisData | null>(null);
  const [error, setError] = useState('');
  const [isWarrant, setIsWarrant] = useState(false);
  const [relatedCommonStock, setRelatedCommonStock] = useState<string | null>(null);
  
  // Advanced indicator panel toggles
  const [showVolume, setShowVolume] = useState(false);
  const [showMomentum, setShowMomentum] = useState(false);
  const [showVolatility, setShowVolatility] = useState(false);
  const [showTrend, setShowTrend] = useState(false);
  const [watchlistMsg, setWatchlistMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [addingToWatchlist, setAddingToWatchlist] = useState(false);
  const [usageCount, setUsageCount] = useState(0);

  // Helper function to detect if a ticker is a warrant
  const detectWarrant = (tickerSymbol: string): boolean => {
    const upper = tickerSymbol.toUpperCase();
    return (
      upper.endsWith('WW') || 
      upper.endsWith('.W') || 
      (upper.endsWith('W') && upper.length > 2 && /[A-Z]/.test(upper[upper.length - 2]))
    );
  };

  // Helper function to get related common stock ticker
  const getRelatedCommonStock = (warrantTicker: string): string | null => {
    const upper = warrantTicker.toUpperCase();
    if (upper.endsWith('WW')) {
      return upper.slice(0, -2);
    } else if (upper.endsWith('.W')) {
      return upper.slice(0, -2);
    } else if (upper.endsWith('W') && upper.length > 2 && /[A-Z]/.test(upper[upper.length - 2])) {
      return upper.slice(0, -1);
    }
    return null;
  };

  React.useEffect(() => {
    loadUser();
    // Auto-analyze if ticker is provided via URL
    if (urlTicker) {
      setTicker(urlTicker);
      
      // Check if warrant
      const isWarrantStock = detectWarrant(urlTicker);
      setIsWarrant(isWarrantStock);
      if (isWarrantStock) {
        setRelatedCommonStock(getRelatedCommonStock(urlTicker));
      }
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

    try {
      const response = await technicalAPI.analyze(symbol.toUpperCase());
      setAnalysisData(response.data);
      setUsageCount(prev => prev + 1);
    } catch (err: any) {
      console.error('Analysis error:', err);
      setError(err.response?.data?.detail || 'Failed to analyze stock. Please check the ticker symbol.');
    } finally {
      setLoading(false);
    }
  };

  const getTierBadge = (tier: string) => {
    const badges = {
      free: { bg: 'bg-gray-100 dark:bg-gray-600', text: 'text-gray-800 dark:text-gray-200', label: 'Free' },
      casual: { bg: 'bg-primary-100 dark:bg-primary-900/50', text: 'text-primary-800 dark:text-primary-200', label: 'Casual' },
      active: { bg: 'bg-purple-100 dark:bg-purple-900/50', text: 'text-purple-800 dark:text-purple-200', label: 'Active' },
      professional: { bg: 'bg-yellow-100 dark:bg-yellow-900/50', text: 'text-yellow-800 dark:text-yellow-200', label: 'Professional' },
    };
    const badge = badges[tier as keyof typeof badges] || badges.free;
    return (
      <span className={`px-3 py-1 rounded-full text-sm font-semibold ${badge.bg} ${badge.text}`}>
        {badge.label}
      </span>
    );
  };

  const TIER_LIMITS: Record<string, number> = {
      free: 5, casual: 5, active: 5, professional: 20
    };

  const tierLimit = TIER_LIMITS[user?.subscription_tier || 'free'] || 5;  

  const handleAnalyze = async (e: React.FormEvent) => {
      e.preventDefault();
      if (user && usageCount >= tierLimit) {
        // Don't call API — the render below will show UpgradeRequired
        return;
      }
      await performAnalysis(ticker);
  };

  const handleTickerChange = (value: string) => {
    setTicker(value);
    
    // Check if warrant when ticker changes
    const isWarrantStock = detectWarrant(value);
    setIsWarrant(isWarrantStock);
    if (isWarrantStock) {
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

  // Chart configurations
  const getPriceChartData = () => {
    if (!analysisData) return null;

    const dates = analysisData.chart_data.map(d => d.date);
    const prices = analysisData.chart_data.map(d => d.close);
    const volumes = analysisData.chart_data.map(d => d.volume);
    const sma20 = analysisData.chart_data.map(d => d.sma_20);
    const sma50 = analysisData.chart_data.map(d => d.sma_50);
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
            label: '20-day SMA',
            data: sma20,
            borderColor: 'rgb(234, 179, 8)',
            borderWidth: 2,
            fill: false,
            tension: 0.1,
            pointRadius: 0,
            borderDash: [5, 5],
            yAxisID: 'y',
        },
        {
            label: '50-day SMA',
            data: sma50,
            borderColor: 'rgb(168, 85, 247)',
            borderWidth: 2,
            fill: false,
            tension: 0.1,
            pointRadius: 0,
            borderDash: [5, 5],
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

  // Show upgrade page if user has hit their limit
  if (user && usageCount >= tierLimit) {
    return (
      <div className="min-h-screen bg-gray-100 dark:bg-gray-800 transition-colors duration-200">
        {/* Navigation */}
        <nav className="bg-gray-900 dark:bg-gray-900 shadow-sm border-b border-gray-700 dark:border-gray-700">
          <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between h-16">
              <div className="flex items-center">
                <img src="/images/logo.png" alt="Northwest Creek" className="h-10 w-10 mr-3" />
                <span className="text-xl font-bold text-primary-400 dark:text-primary-400" style={{ fontFamily: "'Viner Hand ITC', 'Caveat', cursive", fontSize: '1.8rem', fontStyle: 'italic' }}>Northwest Creek</span>
              </div>
              
              <div className="hidden md:flex items-center space-x-8">
                <Link to="/dashboard" className="text-gray-400 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">Dashboard</Link>
                <Link to="/watchlist" className="text-gray-400 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">Watchlist</Link>
                <Link to="/portfolio" className="text-gray-400 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">Portfolio</Link>
                <Link to="/alerts" className="text-gray-400 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">Alerts</Link>
                <Link to="/stocks" className="text-gray-400 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">Stocks</Link>
                <Link to="/technical-analysis" className="text-primary-400 dark:text-primary-400 font-medium border-b-2 border-primary-600 dark:border-primary-400 pb-1">Technical Analysis</Link>
                <Link to="/dcf-valuation" className="text-gray-400 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">DCF Valuation</Link>
              </div>

              <div className="flex items-center space-x-4">
                <div className="relative" ref={userMenuRef}>
                  <button
                    onClick={() => setUserMenuOpen(!userMenuOpen)}
                    className="flex items-center gap-2 text-sm text-gray-300 hover:text-teal-400 transition-colors focus:outline-none"
                  >
                    <span className="hidden lg:inline">{user?.email}</span>
                    <span className="lg:hidden">{user?.email?.split('@')[0]}</span>
                    {user && getTierBadge(user.subscription_tier)}
                    <svg className={`w-4 h-4 transition-transform ${userMenuOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {userMenuOpen && (
                    <div className="absolute right-0 mt-2 w-56 bg-gray-800 border border-gray-600 rounded-lg shadow-xl z-50 py-1 animate-in fade-in duration-150">
                      <div className="px-4 py-2 border-b border-gray-700">
                        <p className="text-sm font-medium text-white truncate">{user?.full_name || user?.email}</p>
                        <p className="text-xs text-gray-400 truncate">{user?.email}</p>
                      </div>

                      <Link
                        to="/account"
                        onClick={() => setUserMenuOpen(false)}
                        className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                        Account Settings
                      </Link>
                      <Link
                        to="/tutorials"
                        onClick={() => setUserMenuOpen(false)}
                        className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        Tutorials
                      </Link>
                      <Link
                        to="/blogs"
                        onClick={() => setUserMenuOpen(false)}
                        className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" /></svg>
                        Blog
                      </Link>

                      {user?.is_admin && (
                        <>
                          <div className="border-t border-gray-700 my-1"></div>
                          <Link
                            to="/admin"
                            onClick={() => setUserMenuOpen(false)}
                            className="flex items-center gap-3 px-4 py-2.5 text-sm text-amber-400 hover:bg-gray-700 hover:text-amber-300 transition-colors"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                            Admin Panel
                          </Link>
                        </>
                      )}

                      <div className="border-t border-gray-700 my-1"></div>
                      <button
                        onClick={() => { setUserMenuOpen(false); handleLogout(); }}
                        className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-red-400 hover:bg-gray-700 hover:text-red-300 transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                        Logout
                      </button>
                    </div>
                  )}
                </div>
              </div>
              <ThemeToggle />
            </div>
          </div>
        </nav>
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
      {/* Navigation - Same as before */}
      <nav className="bg-gray-900 dark:bg-gray-900 shadow-sm border-b border-gray-700 dark:border-gray-700">
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <img src="/images/logo.png" alt="Northwest Creek" className="h-10 w-10 mr-3" />
              <span className="text-xl font-bold text-primary-400 dark:text-primary-400" style={{ fontFamily: "'Viner Hand ITC', 'Caveat', cursive", fontSize: '1.8rem', fontStyle: 'italic' }}>Northwest Creek</span>
            </div>
            <div className="hidden md:flex items-center space-x-8">
              <Link to="/dashboard" className="text-gray-400 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">Dashboard</Link>
              <Link to="/watchlist" className="text-gray-400 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">Watchlist</Link>
              <Link to="/portfolio" className="text-gray-400 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">Portfolio</Link>
              <Link to="/alerts" className="text-gray-400 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">Alerts</Link>
              <Link to={`/stocks${ticker ? `?ticker=${ticker}` : '?showTopGainers=true'}`} className="text-gray-400 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">Stocks</Link>
              <Link to="/technical-analysis" className="text-primary-400 dark:text-primary-400 font-medium border-b-2 border-primary-600 dark:border-primary-400 pb-1">Technical Analysis</Link>
              <Link to={`/dcf-valuation${ticker ? `?ticker=${ticker}` : ''}`} className="text-gray-400 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">DCF Valuation</Link>
            </div>
            <div className="flex items-center space-x-4">
              <Link to="/account" className="text-sm text-gray-600 dark:text-gray-300 hover:text-teal-400 transition-colors">{user?.email}</Link>
              {user && getTierBadge(user.subscription_tier)}
              <button onClick={handleLogout} className="text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white text-sm font-medium">
                Logout
              </button>
              <ThemeToggle />
            </div>
          </div>
        </div>
      </nav>

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
              <input
                type="text"
                value={ticker}
                onChange={(e) => handleTickerChange(e.target.value.toUpperCase())}
                placeholder="e.g., AAPL, TSLA, MSFT"
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-600 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div className="flex items-end">
              <button
                type="submit"
                disabled={loading}
                className="px-6 py-2 bg-primary-600 hover:bg-primary-700 dark:bg-primary-500 dark:hover:bg-primary-600 text-white rounded-lg font-semibold transition-colors disabled:opacity-50"
              >
                {loading ? 'Analyzing...' : '📈 Analyze'}
              </button>
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
                    ${analysisData.current_price.toFixed(2)}
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
                {watchlistMsg && (
                  <span className={`text-sm font-medium ${watchlistMsg.type === 'success' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                    {watchlistMsg.text}
                  </span>
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
              </div>
            </div>

            {/* Trading Signals */}
            {analysisData.signals && analysisData.signals.length > 0 && (
              <div className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 p-6 border dark:border-gray-500">
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Trading Signals</h3>
                <div className="space-y-3">
                  {analysisData.signals.map((signal, index) => (
                    <div key={index} className="flex items-start gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
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

            {/* Price Chart with Bollinger Bands, Moving Averages, and Volume */}
            <div className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 p-6 border dark:border-gray-500">
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Price Chart with Indicators</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                    📊 <strong>How to read:</strong> Green dashed line = Lower Bollinger Band (potential buy zone), 
                    Red dashed line = Upper Bollinger Band (potential sell zone), 
                    Yellow line = 20-day MA (short-term trend), Purple line = 50-day MA (medium-term trend). 
                    Volume bars on right axis show trading activity.
                </p>
                {isWarrant && (
                  <p className="text-sm text-orange-600 dark:text-orange-400 mb-4 font-medium">
                    ⚠️ <strong>Warrant Note:</strong> Expect higher volatility and more frequent Bollinger Band touches than common stocks.
                  </p>
                )}
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                    <strong>Situations to Look For:</strong> Breakout likely: BB squeeze + expanding volume
                </p>
                <div style={{ height: '500px' }}>
                    {getPriceChartData() && (
                    <Chart type="line" data={getPriceChartData()!} options={priceChartOptions} />
                    )}
                </div>
            </div>        

            {/* RSI Chart */}
            <div className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 p-6 border dark:border-gray-500">
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
            <div className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 p-6 border dark:border-gray-500">
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
                      ${analysisData.indicators.bollinger_bands.upper_band.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600 dark:text-gray-400">Middle Band:</span>
                    <span className="font-semibold text-gray-900 dark:text-white">
                      ${analysisData.indicators.bollinger_bands.middle_band.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600 dark:text-gray-400">Lower Band:</span>
                    <span className="font-semibold text-green-500">
                      ${analysisData.indicators.bollinger_bands.lower_band.toFixed(2)}
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
            <div className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 p-6 border dark:border-gray-500">
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
                <div className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 p-6 border dark:border-gray-500">
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
                <div className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 p-6 border dark:border-gray-500">
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
                <div className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 p-6 border dark:border-gray-500">
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
                <div className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 p-6 border dark:border-gray-500">
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
                  <div className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 p-6 border dark:border-gray-500">
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
                  <div className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 p-6 border dark:border-gray-500">
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
                <div className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 p-6 border dark:border-gray-500">
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
                <div className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 p-6 border dark:border-gray-500">
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
                <div className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 p-6 border dark:border-gray-500">
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
                <div className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 p-6 border dark:border-gray-500">
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
                <div className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 p-6 border dark:border-gray-500">
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
                  Average price over time. Price above MA = uptrend, Price below MA = downtrend. 20-day shows short-term trend, 50-day shows medium-term trend.
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
    </div>
  );
};

export default TechnicalAnalysis;