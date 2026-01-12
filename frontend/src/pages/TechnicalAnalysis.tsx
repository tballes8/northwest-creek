import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { authAPI } from '../services/api';
import { User } from '../types';
import ThemeToggle from '../components/ThemeToggle';
import axios from 'axios';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
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
  const [user, setUser] = useState<User | null>(null);
  const [ticker, setTicker] = useState('');
  const [loading, setLoading] = useState(false);
  const [analysisData, setAnalysisData] = useState<TechnicalAnalysisData | null>(null);
  const [error, setError] = useState('');

  React.useEffect(() => {
    loadUser();
  }, []);

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

  const handleAnalyze = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!ticker.trim()) {
      setError('Please enter a ticker symbol');
      return;
    }

    setLoading(true);
    setError('');
    setAnalysisData(null);

    try {
      const token = localStorage.getItem('access_token');
      const response = await axios.get(
        `http://localhost:8000/api/v1/technical-analysis/analyze/${ticker.toUpperCase()}`,
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );
      
      setAnalysisData(response.data);
    } catch (err: any) {
      console.error('Analysis error:', err);
      setError(err.response?.data?.detail || 'Failed to analyze stock. Please check the ticker symbol.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('access_token');
    navigate('/');
  };

  const getTierBadge = (tier: string) => {
    const badges = {
      free: { bg: 'bg-gray-100 dark:bg-gray-600', text: 'text-gray-800 dark:text-gray-200', label: 'Free' },
      pro: { bg: 'bg-primary-100 dark:bg-primary-900/50', text: 'text-primary-800 dark:text-primary-200', label: 'Pro' },
      enterprise: { bg: 'bg-purple-100 dark:bg-purple-900/50', text: 'text-purple-800 dark:text-purple-200', label: 'Enterprise' },
    };
    const badge = badges[tier as keyof typeof badges] || badges.free;
    return (
      <span className={`px-3 py-1 rounded-full text-sm font-semibold ${badge.bg} ${badge.text}`}>
        {badge.label}
      </span>
    );
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
            label: 'Close Price',
            data: prices,
            borderColor: 'rgb(59, 130, 246)',
            backgroundColor: 'rgba(59, 130, 246, 0.1)',
            fill: false,
            tension: 0.1,
            pointRadius: 0,
            borderWidth: 2,
            yAxisID: 'y',
        },
        {
            label: 'SMA 20',
            data: sma20,
            borderColor: 'rgba(234, 179, 8, 0.8)',
            fill: false,
            pointRadius: 0,
            borderWidth: 2,
            yAxisID: 'y',
            spanGaps: true,
        },
        {
            label: 'SMA 50',
            data: sma50,
            borderColor: 'rgba(168, 85, 247, 0.8)',
            fill: false,
            pointRadius: 0,
            borderWidth: 2,
            yAxisID: 'y',
            spanGaps: true,
        },
        {
            label: 'BB Upper',
            data: bbUpper,
            borderColor: 'rgba(239, 68, 68, 0.87)',
            borderDash: [5, 5],
            fill: false,
            pointRadius: 0,
            borderWidth: 1,
            yAxisID: 'y',
            spanGaps: true,
        },
        {
            label: 'BB Lower',
            data: bbLower,
            borderColor: 'rgba(24, 228, 58, 0.78)',
            borderDash: [5, 5],
            fill: '+1',
            backgroundColor: 'rgba(156, 163, 175, 0.1)',
            pointRadius: 0,
            borderWidth: 1,
            yAxisID: 'y',
            spanGaps: true,
        },
        {
            type: 'bar' as const,
            label: 'Volume',
            data: volumes,
            backgroundColor: 'rgba(156, 163, 175, 0.3)',
            borderColor: 'rgba(156, 163, 175, 0.5)',
            borderWidth: 1,
            yAxisID: 'y1',
        }
        ]
    };
  };

  const getVolumeChartData = () => {
    if (!analysisData) return null;

    const dates = analysisData.chart_data.map(d => d.date);
    const volumes = analysisData.chart_data.map(d => d.volume);

    return {
        labels: dates,
        datasets: [
        {
            label: 'Volume',
            data: volumes,
            backgroundColor: 'rgba(99, 102, 241, 0.5)',
            borderColor: 'rgba(99, 102, 241, 0.8)',
            borderWidth: 1,
        }
        ]
    };
  };

  const getRSIChartData = () => {
    if (!analysisData?.indicators.rsi) return null;

    const dates = analysisData.chart_data.map(d => d.date);
    const rsiValues = analysisData.chart_data.map(d => d.rsi);

    // Debug logging
    console.log('RSI values:', rsiValues.filter(v => v !== null).length, 'non-null values');

    return {
        labels: dates,
        datasets: [
        {
            label: 'RSI',
            data: rsiValues,
            borderColor: 'rgb(99, 102, 241)',
            backgroundColor: 'rgba(99, 102, 241, 0.1)',
            fill: true,
            pointRadius: 0,
            borderWidth: 2,
            spanGaps: true,
        },
        {
            label: 'Overbought (70)',
            data: Array(dates.length).fill(70),
            borderColor: 'rgba(239, 108, 68, 0.99)',
            borderDash: [5, 5],
            fill: false,
            pointRadius: 0,
            borderWidth: 1,
        },
        {
            label: 'Oversold (30)',
            data: Array(dates.length).fill(30),
            borderColor: 'rgb(171, 236, 18)',
            borderDash: [5, 5],
            fill: false,
            pointRadius: 0,
            borderWidth: 1,
        }
        ]
    };
  };

  const getMACDChartData = () => {
    if (!analysisData?.indicators.macd) return null;

    const dates = analysisData.chart_data.map(d => d.date);
    const macdLine = analysisData.chart_data.map(d => d.macd_line);
    const signalLine = analysisData.chart_data.map(d => d.macd_signal);
    const histogram = analysisData.chart_data.map(d => d.macd_histogram);

    // Debug logging
    console.log('MACD Line values:', macdLine.filter(v => v !== null).length, 'non-null values');
    console.log('Signal Line values:', signalLine.filter(v => v !== null).length, 'non-null values');
    console.log('Histogram values:', histogram.filter(v => v !== null).length, 'non-null values');

    // Color histogram bars based on positive/negative
    const histogramColors = histogram.map(val => 
        val && val > 0 ? 'rgba(34, 197, 94, 0.5)' : 'rgba(239, 68, 68, 0.5)'
    );

    return {
        labels: dates,
        datasets: [
        {
            type: 'line' as const,
            label: 'MACD Line',
            data: macdLine,
            borderColor: 'rgb(59, 130, 246)',
            backgroundColor: 'transparent',
            fill: false,
            pointRadius: 0,
            borderWidth: 2,
            spanGaps: true,
        },
        {
            type: 'line' as const,
            label: 'Signal Line',
            data: signalLine,
            borderColor: 'rgb(239, 68, 68)',
            backgroundColor: 'transparent',
            fill: false,
            pointRadius: 0,
            borderWidth: 2,
            spanGaps: true,
        },
        {
            type: 'bar' as const,
            label: 'Histogram',
            data: histogram,
            backgroundColor: histogramColors,
            borderWidth: 0,
        }
        ]
    };
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
            boxWidth: 6,
        }
        },
        tooltip: {
        mode: 'index' as const,
        intersect: false,
        }
    },
    scales: {
        x: {
        ticks: {
            color: '#9CA3AF',
            maxTicksLimit: 10,
        },
        grid: {
            color: 'rgba(156, 163, 175, 0.1)',
        }
        },
        y: {
        type: 'linear' as const,
        display: true,
        position: 'left' as const,
        title: {
            display: true,
            text: 'Price ($)',
            color: '#9CA3AF',
        },
        ticks: {
            color: '#9CA3AF',
        },
        grid: {
            color: 'rgba(156, 163, 175, 0.1)',
        }
        },
        y1: {
        type: 'linear' as const,
        display: true,
        position: 'right' as const,
        title: {
            display: true,
            text: 'Volume',
            color: '#9CA3AF',
        },
        ticks: {
            color: '#9CA3AF',
        },
        grid: {
            drawOnChartArea: false,
        }
        }
    }
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
        legend: {
        position: 'top' as const,
        labels: {
            color: '#9CA3AF',
        }
        },
    },
    scales: {
        x: {
        ticks: {
            color: '#9CA3AF',
            maxTicksLimit: 10,
        },
        grid: {
            color: 'rgba(156, 163, 175, 0.1)',
        }
        },
        y: {
        ticks: {
            color: '#9CA3AF',
        },
        grid: {
            color: 'rgba(156, 163, 175, 0.1)',
        }
        }
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-800">
      {/* Navigation */}
      <nav className="bg-gray-900 dark:bg-gray-900 shadow-sm border-b border-gray-700 dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <img src="/images/logo.png" alt="Northwest Creek" className="h-10 w-10 mr-3" />
              <span className="text-xl font-bold text-primary-400 dark:text-primary-400">Northwest Creek</span>
            </div>
            
            <div className="hidden md:flex items-center space-x-8">
              <Link to="/dashboard" className="text-gray-400 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">Dashboard</Link>
              <Link to="/watchlist" className="text-gray-400 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">Watchlist</Link>
              <Link to="/portfolio" className="text-gray-400 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">Portfolio</Link>
              <Link to="/alerts" className="text-gray-400 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">Alerts</Link>
              {user?.subscription_tier === 'enterprise' && (
                <Link to="/technical-analysis" className="text-primary-400 dark:text-primary-400 font-medium border-b-2 border-primary-600 dark:border-primary-400 pb-1">Technical Analysis</Link>
              )}
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
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Technical Analysis</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Analyze stocks with RSI, MACD, Moving Averages, and Bollinger Bands
          </p>
        </div>

        {/* Search Form */}
        <div className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 p-6 border dark:border-gray-500 mb-8">
          <form onSubmit={handleAnalyze} className="flex gap-4">
            <div className="flex-1">
              <input
                type="text"
                value={ticker}
                onChange={(e) => setTicker(e.target.value.toUpperCase())}
                placeholder="Enter ticker symbol (e.g., AAPL)"
                className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                maxLength={10}
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="px-8 py-3 bg-primary-600 hover:bg-primary-700 dark:bg-primary-500 dark:hover:bg-primary-600 text-white rounded-lg font-medium transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {loading ? 'Analyzing...' : 'Analyze'}
            </button>
          </form>

          {error && (
            <div className="mt-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 text-red-600 dark:text-red-400 px-4 py-3 rounded-lg">
              {error}
            </div>
          )}
        </div>

        {/* Analysis Results */}
        {analysisData && (
          <div className="space-y-8">
            {/* Company Header */}
            <div className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 p-6 border dark:border-gray-500">
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-white">{analysisData.ticker}</h2>
                  <p className="text-gray-600 dark:text-gray-400 mt-1">{analysisData.company_name}</p>
                </div>
                <div className="text-right">
                  <div className="text-3xl font-bold text-gray-900 dark:text-white">
                    ${analysisData.current_price.toFixed(2)}
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    As of {analysisData.analysis_date}
                  </div>
                </div>
              </div>

              {/* Overall Summary */}
              <div className={`mt-6 p-4 rounded-lg border-2 ${
                analysisData.summary.outlook === 'bullish' 
                  ? 'bg-green-50 dark:bg-green-900/20 border-green-500' 
                  : analysisData.summary.outlook === 'bearish'
                  ? 'bg-red-50 dark:bg-red-900/20 border-red-500'
                  : 'bg-gray-50 dark:bg-gray-800 border-gray-500'
              }`}>
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                      Overall Outlook: <span className="capitalize">{analysisData.summary.outlook}</span>
                    </h3>
                    <p className="text-gray-600 dark:text-gray-400 mt-1">{analysisData.summary.message}</p>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold text-gray-900 dark:text-white">
                      {analysisData.summary.strength}/4
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">Signal Strength</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Trading Signals */}
            {analysisData.signals.length > 0 && (
              <div className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 p-6 border dark:border-gray-500">
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Trading Signals</h3>
                <div className="space-y-3">
                  {analysisData.signals.map((signal, index) => (
                    <div
                      key={index}
                      className={`p-4 rounded-lg border ${
                        signal.type === 'buy'
                          ? 'bg-green-50 dark:bg-green-900/20 border-green-500'
                          : 'bg-red-50 dark:bg-red-900/20 border-red-500'
                      }`}
                    >
                      <div className="flex items-center">
                        <span className={`px-3 py-1 rounded-full text-sm font-semibold mr-3 ${
                          signal.type === 'buy'
                            ? 'bg-green-500 text-white'
                            : 'bg-red-500 text-white'
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