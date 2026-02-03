import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { authAPI, technicalAPI } from '../services/api';
import { User } from '../types';
import ThemeToggle from '../components/ThemeToggle';
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
  }>;
  summary: {
    outlook: string;
    strength: number;
    message: string;
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

  React.useEffect(() => {
    loadUser();
    // Auto-analyze if ticker is provided via URL
    if (urlTicker) {
      setTicker(urlTicker);
      // Optional: Automatically trigger analysis when ticker is provided
      // Uncomment the line below to enable auto-analysis:
      // performAnalysis(urlTicker);
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
    } catch (err: any) {
      console.error('Analysis error:', err);
      setError(err.response?.data?.detail || 'Failed to analyze stock. Please check the ticker symbol.');
    } finally {
      setLoading(false);
    }
  };

  const handleAnalyze = async (e: React.FormEvent) => {
    e.preventDefault();
    await performAnalysis(ticker);
  };

  const handleLogout = () => {
    localStorage.removeItem('access_token');
    navigate('/');
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

  const getTierLimit = () => {
    const limits = {
      free: 5,
      casual: 20,
      active: 45,
      professional: 75
    };
    return limits[user?.subscription_tier as keyof typeof limits] || 5;
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
          borderColor: histogram.map((val: number | null) => 
            val && val >= 0 ? 'rgb(34, 197, 94)' : 'rgb(239, 68, 68)'
          ),
          borderWidth: 1,
          type: 'bar' as const,
        },
      ],
    };
  };

  const chartOptions = {
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
          font: {
            size: 12,
          },
        },
      },
      tooltip: {
        backgroundColor: 'rgba(17, 24, 39, 0.9)',
        titleColor: '#F3F4F6',
        bodyColor: '#F3F4F6',
        borderColor: '#374151',
        borderWidth: 1,
      },
    },
    scales: {
      x: {
        ticks: {
          color: '#9CA3AF',
          maxRotation: 45,
          minRotation: 45,
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
    ...chartOptions,
    scales: {
      x: {
        ticks: {
          color: '#9CA3AF',
          maxRotation: 45,
          minRotation: 45,
        },
        grid: {
          color: 'rgba(156, 163, 175, 0.1)',
        },
      },
      y: {
        type: 'linear' as const,
        display: true,
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
        display: true,
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

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Navigation - Same as before */}
      <nav className="bg-gray-900 dark:bg-gray-900 shadow-sm border-b border-gray-700 dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <img src="/images/logo.png" alt="Northwest Creek" className="h-10 w-10 mr-3" />
              <span className="text-xl font-bold text-primary-400 dark:text-primary-400">Northwest Creek</span>
            </div>
            <div className="hidden md:flex items-center space-x-8">
              <Link to="/dashboard" className="text-gray-400 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">Dashboard</Link>
              <Link to="/watchlist" className="text-primary-400 dark:text-primary-400 font-medium border-b-2 border-primary-600 dark:border-primary-400 pb-1">Watchlist</Link>
              <Link to="/portfolio" className="text-gray-400 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">Portfolio</Link>
              <Link to="/alerts" className="text-gray-400 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">Alerts</Link>
              <Link to="/stocks?showTopGainers=true" className="text-gray-400 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">Stocks</Link>
              <Link to="/technical-analysis" className="text-gray-400 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">Technical Analysis</Link>
              <Link to="/dcf-valuation" className="text-gray-400 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">DCF Valuation</Link>
            </div>
            <div className="flex items-center space-x-4">
              <ThemeToggle />
              <span className="text-sm text-gray-600 dark:text-gray-300">{user?.email}</span>
              {user && getTierBadge(user.subscription_tier)}
              <button onClick={handleLogout} className="text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white text-sm font-medium">
                Logout
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">Technical Analysis</h1>
          <p className="text-gray-600 dark:text-gray-400">
            🔍 Analyze stock trends with RSI, MACD, Moving Averages, and Bollinger Bands
          </p>
          {user && (
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
              Daily Limit: {getTierLimit()} analyses • Upgrade for more!
            </p>
          )}
        </div>

        {/* Search Form */}
        <form onSubmit={handleAnalyze} className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 p-6 mb-6 border dark:border-gray-500">
          <div className="flex gap-4">
            <input
              type="text"
              value={ticker}
              onChange={(e) => setTicker(e.target.value.toUpperCase())}
              placeholder="Enter ticker (e.g., AAPL, TSLA, MSFT)"
              className="flex-1 px-4 py-3 bg-white dark:bg-gray-600 text-gray-900 dark:text-white border border-gray-300 dark:border-gray-500 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
            <button
              type="submit"
              disabled={loading}
              className="px-8 py-3 bg-primary-600 hover:bg-primary-700 dark:bg-primary-500 dark:hover:bg-primary-600 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Analyzing...' : 'Analyze'}
            </button>
          </div>
        </form>

        {/* Error Message */}
        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg mb-6">
            {error}
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 p-12 border dark:border-gray-500 text-center">
            <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-primary-600 mx-auto mb-4"></div>
            <p className="text-gray-600 dark:text-gray-400">Analyzing {ticker}...</p>
          </div>
        )}

        {/* Analysis Results */}
        {analysisData && !loading && (
          <div className="space-y-6">
            {/* Summary Card */}
            <div className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 p-6 border dark:border-gray-500">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">
                    {analysisData.company_name} ({analysisData.ticker})
                  </h2>
                  <p className="text-gray-600 dark:text-gray-400 text-sm mb-4">
                    Analysis Date: {new Date(analysisData.analysis_date).toLocaleDateString()}
                  </p>
                  <div className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
                    ${analysisData.current_price.toFixed(2)}
                  </div>
                </div>
                <div className={`px-4 py-2 rounded-lg text-center ${
                  analysisData.summary.outlook === 'bullish' 
                    ? 'bg-green-100 dark:bg-green-900/30' 
                    : analysisData.summary.outlook === 'bearish'
                    ? 'bg-red-100 dark:bg-red-900/30'
                    : 'bg-gray-100 dark:bg-gray-600'
                }`}>
                  <div className={`text-2xl font-bold ${
                    analysisData.summary.outlook === 'bullish' 
                      ? 'text-green-700 dark:text-green-300' 
                      : analysisData.summary.outlook === 'bearish'
                      ? 'text-red-700 dark:text-red-300'
                      : 'text-gray-700 dark:text-gray-300'
                  }`}>
                    {analysisData.summary.outlook.toUpperCase()}
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    Strength: {analysisData.summary.strength}/10
                  </div>
                </div>
              </div>
              <p className="text-gray-600 dark:text-gray-400 mt-4">
                {analysisData.summary.message}
              </p>
            </div>

            {/* Trading Signals */}
            {analysisData.signals && analysisData.signals.length > 0 && (
              <div className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 p-6 border dark:border-gray-500">
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Trading Signals</h3>
                <div className="space-y-3">
                  {analysisData.signals.map((signal, index) => (
                    <div key={index} className="flex items-start space-x-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                      <div className="flex items-center space-x-2">
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
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TechnicalAnalysis;