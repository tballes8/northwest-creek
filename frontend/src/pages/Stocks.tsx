import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { authAPI } from '../services/api';
import { User } from '../types';
import ThemeToggle from '../components/ThemeToggle';
import axios from 'axios';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler } from 'chart.js';
import { Line } from 'react-chartjs-2';

// Register Chart.js components
ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

interface StockQuote {
  ticker: string;
  price: number;
  change: number;
  change_percent: number;
  volume: number;
  high: number;
  low: number;
  open: number;
  previous_close: number;
  timestamp: string;
}

interface CompanyInfo {
  ticker: string;
  name: string;
  description?: string;
  sector?: string;
  industry?: string;
  website?: string;
  exchange?: string;
  market_cap?: number;
  phone?: string;
  employees?: number;
  country?: string;
}

interface HistoricalPrice {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

const Stocks: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialTicker = searchParams.get('ticker') || '';
  
  const [user, setUser] = useState<User | null>(null);
  const [ticker, setTicker] = useState(initialTicker);
  const [searchInput, setSearchInput] = useState(initialTicker);
  const [quote, setQuote] = useState<StockQuote | null>(null);
  const [company, setCompany] = useState<CompanyInfo | null>(null);
  const [historical, setHistorical] = useState<HistoricalPrice[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [historyDays, setHistoryDays] = useState(30);

  useEffect(() => {
    loadUser();
    if (initialTicker) {
      loadStockData(initialTicker);
    }
  }, [initialTicker]);

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

  const loadStockData = async (symbol: string) => {
    if (!symbol.trim()) return;

    setLoading(true);
    setError('');
    setTicker(symbol.toUpperCase());

    try {
      const token = localStorage.getItem('access_token');
      const headers = { Authorization: `Bearer ${token}` };

      // Fetch quote, company info, and historical data
      const [quoteRes, companyRes, historicalRes] = await Promise.all([
        axios.get(`http://localhost:8000/api/v1/stocks/${symbol.toUpperCase()}/quote`, { headers }),
        axios.get(`http://localhost:8000/api/v1/stocks/${symbol.toUpperCase()}/company`, { headers }),
        axios.get(`http://localhost:8000/api/v1/stocks/${symbol.toUpperCase()}/historical?days=${historyDays}`, { headers }),
      ]);

      setQuote(quoteRes.data);
      setCompany(companyRes.data);
      setHistorical(historicalRes.data.data);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to fetch stock data. Please check the ticker symbol and try again.');
      setQuote(null);
      setCompany(null);
      setHistorical([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchInput.trim()) {
      navigate(`/stocks?ticker=${searchInput.toUpperCase()}`);
      loadStockData(searchInput);
    }
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
      unlimited: { bg: 'bg-yellow-100 dark:bg-yellow-900/50', text: 'text-yellow-800 dark:text-yellow-200', label: 'Unlimited' },
    };
    const badge = badges[tier as keyof typeof badges] || badges.free;
    return (
      <span className={`px-3 py-1 rounded-full text-sm font-semibold ${badge.bg} ${badge.text}`}>
        {badge.label}
      </span>
    );
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
  };

  const formatLargeNumber = (value: number) => {
    if (value >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
    if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
    if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
    if (value >= 1e3) return `$${(value / 1e3).toFixed(2)}K`;
    return formatCurrency(value);
  };

  const getChartData = () => {
    if (!historical.length) return null;

    const dates = historical.map(h => h.date);
    const prices = historical.map(h => h.close);

    return {
      labels: dates,
      datasets: [
        {
          label: 'Close Price',
          data: prices,
          borderColor: 'rgb(13, 148, 136)',
          backgroundColor: 'rgba(13, 148, 136, 0.1)',
          fill: true,
          tension: 0.4,
          pointRadius: 0,
          borderWidth: 2,
        },
      ],
    };
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        mode: 'index' as const,
        intersect: false,
      },
    },
    scales: {
      x: {
        grid: {
          color: 'rgba(156, 163, 175, 0.1)',
        },
        ticks: {
          color: '#9CA3AF',
        },
      },
      y: {
        grid: {
          color: 'rgba(156, 163, 175, 0.1)',
        },
        ticks: {
          color: '#9CA3AF',
          callback: function(value: any) {
            return '$' + value.toFixed(2);
          },
        },
      },
    },
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Navigation */}
      <nav className="bg-gray-800 dark:bg-gray-900 shadow-sm border-b border-gray-700 dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <img src="/images/logo.png" alt="Northwest Creek" className="h-10 w-10 mr-3" />
              <span className="text-xl font-bold text-primary-400">Northwest Creek</span>
            </div>
            
            <div className="hidden md:flex items-center space-x-8">
              <Link to="/dashboard" className="text-gray-300 hover:text-white">Dashboard</Link>
              <Link to="/watchlist" className="text-gray-300 hover:text-white">Watchlist</Link>
              <Link to="/portfolio" className="text-gray-300 hover:text-white">Portfolio</Link>
              <Link to="/alerts" className="text-gray-300 hover:text-white">Alerts</Link>
              <Link to="/stocks" className="text-primary-400 font-medium border-b-2 border-primary-400 pb-1">Stocks</Link>
              <Link to="/technical-analysis" className="text-gray-300 hover:text-white">Technical Analysis</Link>
              {/* <Link to="/dcf-valuation" className="text-gray-300 hover:text-white">DCF Valuation</Link> */}
              <Link to={`/dcf-valuation?ticker=${ticker}`} className="text-gray-300 hover:text-white">DCF Valuation</Link>
            </div>

            <div className="flex items-center space-x-4">
              <ThemeToggle />
              <span className="text-sm text-gray-300">{user?.email}</span>
              {user && getTierBadge(user.subscription_tier)}
              <button onClick={handleLogout} className="text-gray-300 hover:text-white text-sm font-medium">
                Logout
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header & Search */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-6">Stock Research</h1>
          
          <form onSubmit={handleSearch} className="flex gap-4">
            <div className="flex-1 max-w-md">
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value.toUpperCase())}
                placeholder="Enter ticker symbol (e.g., AAPL)"
                className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="px-8 py-3 bg-primary-600 hover:bg-primary-700 dark:bg-primary-500 dark:hover:bg-primary-600 text-white rounded-lg font-medium transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {loading ? 'Searching...' : 'Search'}
            </button>
          </form>

          {error && (
            <div className="mt-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 text-red-600 dark:text-red-400 px-4 py-3 rounded-lg">
              {error}
            </div>
          )}
        </div>

        {/* Stock Data */}
        {quote && company && (
          <div className="space-y-6">
            {/* Quote Card */}
            <div className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 p-6 border dark:border-gray-500">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h2 className="text-3xl font-bold text-gray-900 dark:text-white">{company.name}</h2>
                  <p className="text-gray-600 dark:text-gray-400 mt-1">
                    {quote.ticker} • {company.exchange || 'N/A'}
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-4xl font-bold text-gray-900 dark:text-white">
                    {formatCurrency(quote.price)}
                  </div>
                  <div className={`text-lg font-semibold mt-1 ${quote.change >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {quote.change >= 0 ? '+' : ''}{formatCurrency(quote.change)} ({quote.change_percent.toFixed(2)}%)
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">Open</div>
                  <div className="text-lg font-semibold text-gray-900 dark:text-white">{formatCurrency(quote.open)}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">High</div>
                  <div className="text-lg font-semibold text-gray-900 dark:text-white">{formatCurrency(quote.high)}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">Low</div>
                  <div className="text-lg font-semibold text-gray-900 dark:text-white">{formatCurrency(quote.low)}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">Volume</div>
                  <div className="text-lg font-semibold text-gray-900 dark:text-white">
                    {quote.volume.toLocaleString()}
                  </div>
                </div>
              </div>
            </div>

            {/* Price Chart */}
            <div className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 p-6 border dark:border-gray-500">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-gray-900 dark:text-white">Price History</h3>
                <div className="flex gap-2">
                  {[30, 90, 180, 365].map((days) => (
                    <button
                      key={days}
                      onClick={() => {
                        setHistoryDays(days);
                        if (ticker) loadStockData(ticker);
                      }}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                        historyDays === days
                          ? 'bg-primary-600 text-white'
                          : 'bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-500'
                      }`}
                    >
                      {days}D
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ height: '400px' }}>
                {getChartData() && <Line data={getChartData()!} options={chartOptions} />}
              </div>
            </div>

            {/* Company Info */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 p-6 border dark:border-gray-500">
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Company Details</h3>
                <div className="space-y-3">
                  {company.sector && (
                    <div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">Sector</div>
                      <div className="text-gray-900 dark:text-white font-medium">{company.sector}</div>
                    </div>
                  )}
                  {company.industry && (
                    <div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">Industry</div>
                      <div className="text-gray-900 dark:text-white font-medium">{company.industry}</div>
                    </div>
                  )}
                  {company.market_cap && (
                    <div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">Market Cap</div>
                      <div className="text-gray-900 dark:text-white font-medium">{formatLargeNumber(company.market_cap)}</div>
                    </div>
                  )}
                  {company.employees && (
                    <div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">Employees</div>
                      <div className="text-gray-900 dark:text-white font-medium">{company.employees.toLocaleString()}</div>
                    </div>
                  )}
                  {company.country && (
                    <div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">Country</div>
                      <div className="text-gray-900 dark:text-white font-medium">{company.country}</div>
                    </div>
                  )}
                  {company.website && (
                    <div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">Website</div>
                      <a href={company.website} target="_blank" rel="noopener noreferrer" className="text-primary-600 dark:text-primary-400 hover:underline font-medium">
                        {company.website}
                      </a>
                    </div>
                  )}
                </div>
              </div>

              <div className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 p-6 border dark:border-gray-500">
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">About</h3>
                <p className="text-gray-600 dark:text-gray-400 leading-relaxed">
                  {company.description || 'No description available.'}
                </p>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-4">
              <Link
                to={`/technical-analysis?ticker=${ticker}`}
                className="flex-1 px-6 py-3 bg-primary-600 hover:bg-primary-700 dark:bg-primary-500 dark:hover:bg-primary-600 text-white text-center rounded-lg font-medium transition-colors"
              >
                Technical Analysis
              </Link>
              <Link
                to={`/dcf-valuation?ticker=${ticker}`}
                className="flex-1 px-6 py-3 bg-purple-600 hover:bg-purple-700 dark:bg-purple-500 dark:hover:bg-purple-600 text-white text-center rounded-lg font-medium transition-colors"
              >
                DCF Valuation
              </Link>
            </div>
          </div>
        )}

        {/* Empty State */}
        {!quote && !loading && !error && (
          <div className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 p-12 border dark:border-gray-500 text-center">
            <div className="text-6xl mb-4">📊</div>
            <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Search for a Stock</h3>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              Enter a ticker symbol above to view detailed stock information, charts, and analysis tools.
            </p>
            <div className="flex justify-center gap-4">
              <button
                onClick={() => { setSearchInput('AAPL'); loadStockData('AAPL'); }}
                className="px-4 py-2 bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-500"
              >
                Try AAPL
              </button>
              <button
                onClick={() => { setSearchInput('TSLA'); loadStockData('TSLA'); }}
                className="px-4 py-2 bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-500"
              >
                Try TSLA
              </button>
              <button
                onClick={() => { setSearchInput('MSFT'); loadStockData('MSFT'); }}
                className="px-4 py-2 bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-500"
              >
                Try MSFT
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Stocks;