import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { User } from '../types';
import ThemeToggle from '../components/ThemeToggle';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler } from 'chart.js';
import { Line } from 'react-chartjs-2';
import { authAPI, stocksAPI, watchlistAPI } from '../services/api';
import { getTickersForSector, SECTOR_COLORS } from '../utils/sectorMap';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';
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

interface NewsArticle {
  title: string;
  publisher: string;
  published_utc: string;
  article_url: string;
  summary?: string;
  insights?: Array<{
    ticker: string;
    sentiment: string;
    sentiment_reasoning: string;
  }>;
}

interface TopGainer {
  ticker: string;
  open: number;
  close: number;
  change_percent: number;
}

// Add interface for daily snapshot
interface DailySnapshot {
  ticker: string;
  open_price: number;
  close_price: number;
  change_percent: number;
  snapshot_date: string;
}

const Stocks: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialTicker = searchParams.get('ticker') || '';
  const showTopGainers = searchParams.get('showTopGainers') === 'true';
  const sectorParam = searchParams.get('sector') || '';
  const [user, setUser] = useState<User | null>(null);
  const [ticker, setTicker] = useState(initialTicker);
  const [searchInput, setSearchInput] = useState(initialTicker);
  const [quote, setQuote] = useState<StockQuote | null>(null);
  const [company, setCompany] = useState<CompanyInfo | null>(null);
  const [historical, setHistorical] = useState<HistoricalPrice[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [historyDays, setHistoryDays] = useState(90);
  const [news, setNews] = useState<NewsArticle[]>([]);
  const [newsLoading, setNewsLoading] = useState(false);
  const [topGainers, setTopGainers] = useState<TopGainer[]>([]);
  const [gainersLoading, setGainersLoading] = useState(false);
  const [dailySnapshots, setDailySnapshots] = useState<DailySnapshot[]>([]);
  const [sectorSnapshots, setSectorSnapshots] = useState<DailySnapshot[]>([]);
  const [sectorLoading, setSectorLoading] = useState(false);
  const [isWarrant, setIsWarrant] = useState(false);
  const [relatedCommonStock, setRelatedCommonStock] = useState<string | null>(null);
  const [watchlistMsg, setWatchlistMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [addingToWatchlist, setAddingToWatchlist] = useState(false);

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

  useEffect(() => {
    loadUser();
    loadDailySnapshots(); // Load daily snapshots on mount
    if (initialTicker) {
      loadStockData(initialTicker);
      loadNews(initialTicker);
    }
    // Load top gainers when component mounts or when showTopGainers is true
    if (showTopGainers || initialTicker || !initialTicker) {
      loadTopGainers();
    }
    // Load sector-specific stocks when sector param is present
    if (sectorParam) {
      loadSectorSnapshots(sectorParam);
    }
  }, [initialTicker, showTopGainers, sectorParam]);

  // Function to load stocks for a specific sector
  const loadSectorSnapshots = async (sector: string) => {
    setSectorLoading(true);
    try {
      const sectorTickers = getTickersForSector(sector);
      if (sectorTickers.length === 0) {
        setSectorSnapshots([]);
        return;
      }
      // Randomly pick up to 100 tickers to send to backend (avoids giant query strings)
      const shuffled = [...sectorTickers].sort(() => Math.random() - 0.5);
      const subset = shuffled.slice(0, 100);
      const response = await stocksAPI.getDailySnapshot(10, subset);
      setSectorSnapshots(response.data.snapshots || []);
    } catch (error) {
      console.error('Failed to load sector snapshots:', error);
      setSectorSnapshots([]);
    } finally {
      setSectorLoading(false);
    }
  };

  // Function to load daily snapshots
  const loadDailySnapshots = async () => {
    try {
      const response = await stocksAPI.getDailySnapshot(10);
      setDailySnapshots(response.data.snapshots || []);
    } catch (error) {
      console.error('Failed to load daily snapshots:', error);
    }
  };

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

  const loadStockData = async (symbol: string) => {
    if (!symbol.trim()) return;

    setLoading(true);
    setError('');
    setTicker(symbol.toUpperCase());
    
    // Detect if this is a warrant
    const isWarrantStock = detectWarrant(symbol);
    setIsWarrant(isWarrantStock);
    if (isWarrantStock) {
      setRelatedCommonStock(getRelatedCommonStock(symbol));
    } else {
      setRelatedCommonStock(null);
    }

    try {
      // Fetch quote and company info concurrently
      const [quoteRes, companyRes, historicalRes] = await Promise.all([
        stocksAPI.getQuote(symbol),
        stocksAPI.getCompany(symbol),
        stocksAPI.getHistorical(symbol, historyDays),
      ]);

      setQuote(quoteRes.data);
      setCompany(companyRes.data);
      setHistorical(historicalRes.data.data);
    } catch (err: any) {
      console.error('Stock API Error:', err);
      setError(err.response?.data?.detail || 'Failed to load stock data. Please check the ticker symbol and try again.');
      setQuote(null);
      setCompany(null);
      setHistorical([]);
    } finally {
      setLoading(false);
    }
  };

  const loadNews = async (symbol: string) => {
    setNewsLoading(true);
    try {
      const response = await stocksAPI.getNews(symbol, 3);
      setNews(response.data.data || []);
    } catch (err) {
      console.error('Failed to load news:', err);
      setNews([]);
    } finally {
      setNewsLoading(false);
    }
  };

  const loadTopGainers = async () => {
    setGainersLoading(true);
    try {
      const response = await stocksAPI.getTopGainers(10);
      setTopGainers(response.data.top_gainers || []);
    } catch (err) {
      console.error('Failed to load top gainers:', err);
      setTopGainers([]);
    } finally {
      setGainersLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchInput.trim()) {
      loadStockData(searchInput);
      loadNews(searchInput);
      navigate(`/stocks?ticker=${searchInput.toUpperCase()}`);
    }
  };

  const handleTickerClick = (tickerSymbol: string) => {
    setSearchInput(tickerSymbol);
    loadStockData(tickerSymbol);
    loadNews(tickerSymbol);
    navigate(`/stocks?ticker=${tickerSymbol.toUpperCase()}`);
  };

  const handleRelatedStockClick = () => {
    if (relatedCommonStock) {
      handleTickerClick(relatedCommonStock);
    }
  };

  const handleHistoryDaysChange = async (days: number) => {
    setHistoryDays(days);
    if (ticker) {
      try {
        const response = await stocksAPI.getHistorical(ticker, days);
        setHistorical(response.data.data);
      } catch (err) {
        console.error('Failed to load historical data:', err);
      }
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('access_token');
    navigate('/login');
  };

  const handleAddToWatchlist = async () => {
    if (!ticker.trim()) return;
    setAddingToWatchlist(true);
    setWatchlistMsg(null);
    try {
      const payload: any = { ticker: ticker.toUpperCase().trim() };
      // Auto-fill Started At price with current price
      if (quote?.price) {
        payload.target_price = quote.price;
      }
      // Auto-fill Notes with company name + sector
      const parts = [];
      if (company?.name) parts.push(company.name);
      if (company?.sector) parts.push(company.sector);
      if (parts.length > 0) {
        payload.notes = parts.join(' – ');
      }
      await watchlistAPI.add(payload);
      setWatchlistMsg({ type: 'success', text: `${ticker.toUpperCase()} added to watchlist!` });
      setTimeout(() => setWatchlistMsg(null), 3000);
    } catch (err: any) {
      const msg = err.response?.data?.detail || 'Failed to add to watchlist';
      setWatchlistMsg({ type: 'error', text: typeof msg === 'string' ? msg : 'Failed to add to watchlist' });
      setTimeout(() => setWatchlistMsg(null), 4000);
    } finally {
      setAddingToWatchlist(false);
    }
  };

  // Chart configuration
  const chartData = {
    labels: historical.map((h) => new Date(h.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })),
    datasets: [
      {
        label: `${ticker} Price`,
        data: historical.map((h) => h.close),
        borderColor: 'rgb(59, 130, 246)',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        fill: true,
        tension: 0.4,
      },
    ],
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
        callbacks: {
          label: (context: any) => `$${context.parsed.y.toFixed(2)}`,
        },
      },
    },
    scales: {
      y: {
        ticks: {
          callback: (value: any) => `$${Number(value).toFixed(2)}`,
        },
        grid: {
          color: 'rgba(156, 163, 175, 0.1)',
        },
      },
      x: {
        grid: {
          display: false,
        },
      },
    },
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white transition-colors">
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
              <Link to="/stocks" className="text-primary-400 dark:text-primary-400 font-medium border-b-2 border-primary-600 dark:border-primary-400 pb-1">Stocks</Link>
              <Link to={`/technical-analysis${ticker ? `?ticker=${ticker}` : ''}`} className="text-gray-400 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">Technical Analysis</Link>
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
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-6">Stock Research</h1>

        {/* Search Bar */}
        <div className="mb-8">
          <form onSubmit={handleSearch} className="flex gap-4">
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value.toUpperCase())}
              placeholder="Enter ticker symbol (e.g., AAPL, TSLA, MSFT)"
              className="flex-1 px-4 py-3 border border-gray-300 dark:border-gray-500 rounded-lg focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400 focus:border-transparent dark:bg-gray-600 dark:text-white"
            />
            <button
              type="submit"
              className="px-8 py-3 bg-primary-600 hover:bg-primary-700 dark:bg-primary-500 dark:hover:bg-primary-600 text-white rounded-lg font-medium transition-colors"
            >
              Search
            </button>
          </form>
        </div>

        {/* Error State */}
        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-6">
            <p className="text-red-800 dark:text-red-200">{error}</p>
          </div>
        )}

        {/* Warrant Alert */}
        {isWarrant && relatedCommonStock && (
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 mb-6">
            <div className="flex items-start">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                  Warrant Detected
                </h3>
                <div className="mt-2 text-sm text-yellow-700 dark:text-yellow-300">
                  <p>
                    You're viewing a warrant. Warrants are derivative securities that give the holder the right to purchase shares at a specified price.
                    {relatedCommonStock && (
                      <>
                        {' '}Would you like to view the{' '}
                        <button
                          onClick={handleRelatedStockClick}
                          className="font-medium underline hover:text-yellow-900 dark:hover:text-yellow-100"
                        >
                          related common stock ({relatedCommonStock})
                        </button>
                        ?
                      </>
                    )}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 dark:border-primary-400 mx-auto"></div>
            <p className="mt-4 text-gray-600 dark:text-gray-400">Loading stock data...</p>
          </div>
        )}

        {/* Stock Data */}
        {quote && company && !loading && (
          <div className="space-y-6">
            {/* Stock Header */}
            <div className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 p-6 border dark:border-gray-500">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-3xl font-bold text-gray-900 dark:text-white">{company.name}</h2>
                  <p className="text-gray-600 dark:text-gray-400 mt-1">{ticker} • {company.exchange}</p>
                </div>
                <div className="mt-4 md:mt-0 text-right">
                  <div className="text-4xl font-bold text-gray-900 dark:text-white">${quote.price.toFixed(2)}</div>
                  <div className={`text-lg font-semibold ${quote.change >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                    {quote.change >= 0 ? '+' : ''}{quote.change.toFixed(2)} ({quote.change_percent >= 0 ? '+' : ''}{quote.change_percent.toFixed(2)}%)
                  </div>
                </div>
              </div>
              {/* Add to Watchlist */}
              <div className="mt-4 flex items-center gap-3">
                <button
                  onClick={handleAddToWatchlist}
                  disabled={addingToWatchlist}
                  className="px-4 py-2 bg-yellow-500 hover:bg-yellow-600 dark:bg-yellow-600 dark:hover:bg-yellow-700 text-white rounded-lg font-medium text-sm transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  {addingToWatchlist ? '⏳ Adding...' : '⭐ Add to Watchlist'}
                </button>
                {watchlistMsg && (
                  <span className={`text-sm font-medium ${watchlistMsg.type === 'success' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                    {watchlistMsg.text}
                  </span>
                )}
              </div>
            </div>

            {/* Quote Details */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 p-4 border dark:border-gray-500">
                <div className="text-sm text-gray-600 dark:text-gray-400">Open</div>
                <div className="text-xl font-semibold text-gray-900 dark:text-white">${quote.open.toFixed(2)}</div>
              </div>
              <div className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 p-4 border dark:border-gray-500">
                <div className="text-sm text-gray-600 dark:text-gray-400">High</div>
                <div className="text-xl font-semibold text-gray-900 dark:text-white">${quote.high.toFixed(2)}</div>
              </div>
              <div className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 p-4 border dark:border-gray-500">
                <div className="text-sm text-gray-600 dark:text-gray-400">Low</div>
                <div className="text-xl font-semibold text-gray-900 dark:text-white">${quote.low.toFixed(2)}</div>
              </div>
              <div className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 p-4 border dark:border-gray-500">
                <div className="text-sm text-gray-600 dark:text-gray-400">Volume</div>
                <div className="text-xl font-semibold text-gray-900 dark:text-white">{quote.volume.toLocaleString()}</div>
              </div>
            </div>

            {/* Price Chart */}
            <div className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 p-6 border dark:border-gray-500">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold text-gray-900 dark:text-white">Price History</h3>
                <div className="flex gap-2">
                  {[30, 90, 180, 365].map((days) => (
                    <button
                      key={days}
                      onClick={() => handleHistoryDaysChange(days)}
                      className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                        historyDays === days
                          ? 'bg-primary-600 dark:bg-primary-500 text-white'
                          : 'bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-500'
                      }`}
                    >
                      {days}D
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ height: '400px' }}>
                <Line data={chartData} options={chartOptions} />
              </div>
            </div>

            {/* Company Info */}
            <div className="grid md:grid-cols-2 gap-6">
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
                      <div className="text-gray-900 dark:text-white font-medium">${(company.market_cap / 1e9).toFixed(2)}B</div>
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

            {/* News Section */}
            <div className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 p-6 border dark:border-gray-500">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Latest News</h3>
              {newsLoading ? (
                <div className="text-center py-8 text-gray-600 dark:text-gray-400">
                  Loading news...
                </div>
              ) : news.length > 0 ? (
                <div className="space-y-4">
                  {news.map((article, index) => (
                    <div key={index} className="border-b border-gray-200 dark:border-gray-600 last:border-b-0 pb-4 last:pb-0">
                      <a 
                        href={article.article_url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-lg font-semibold text-gray-900 dark:text-white hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
                      >
                        {article.title}
                      </a>
                      <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                        {article.publisher} • {new Date(article.published_utc).toLocaleDateString('en-US', { 
                          month: 'short', 
                          day: 'numeric', 
                          year: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit'
                        })}
                      </div>
                      {article.summary && (
                        <p className="text-gray-600 dark:text-gray-400 mt-2 text-sm leading-relaxed">
                          {article.summary}
                        </p>
                      )}
                      {article.insights && article.insights.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {article.insights.slice(0, 3).map((insight, idx) => (
                            <span 
                              key={idx}
                              className={`text-xs px-2 py-1 rounded-full font-medium ${
                                insight.sentiment === 'positive' 
                                  ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                                  : insight.sentiment === 'negative'
                                  ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                                  : 'bg-gray-100 dark:bg-gray-600 text-gray-700 dark:text-gray-300'
                              }`}
                            >
                              {insight.sentiment === 'positive' ? '📈' : insight.sentiment === 'negative' ? '📉' : '➖'} {insight.ticker}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-600 dark:text-gray-400">
                  No recent news available for {ticker}
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex gap-4">
              <button
                onClick={handleAddToWatchlist}
                disabled={addingToWatchlist}
                className="flex-1 px-6 py-3 bg-yellow-500 hover:bg-yellow-600 dark:bg-yellow-600 dark:hover:bg-yellow-700 text-white text-center rounded-lg font-medium transition-colors disabled:opacity-50"
              >
                {addingToWatchlist ? '⏳ Adding...' : '⭐ Add to Watchlist'}
              </button>
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

        {/* Empty State with Top Gainers, Daily Snapshots, and Sector Explorer */}
        {!quote && !loading && !error && (
          <div className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 p-12 border dark:border-gray-500 text-center">
            
            {/* Sector Explorer Banner — shown when navigating from Dashboard pie chart */}
            {sectorParam && (
              <div className="mb-8 pb-8 border-b border-gray-200 dark:border-gray-600">
                <div className="flex items-center justify-center gap-3 mb-3">
                  <span
                    className="inline-block w-4 h-4 rounded-full"
                    style={{ backgroundColor: SECTOR_COLORS[sectorParam] || SECTOR_COLORS['Other'] }}
                  />
                  <h3 className="text-2xl font-bold text-gray-900 dark:text-white">
                    {sectorParam} Sector
                  </h3>
                </div>
                <p className="text-gray-600 dark:text-gray-400 mb-1">
                  Explore companies in the {sectorParam} sector to diversify your portfolio
                </p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mb-6">
                  Showing random stocks from today's market snapshot
                </p>
                
                {sectorLoading ? (
                  <div className="text-center py-6">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto mb-2"></div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Loading {sectorParam} stocks...</p>
                  </div>
                ) : sectorSnapshots.length > 0 ? (
                  <>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                      {sectorSnapshots.map((snap) => (
                        <button
                          key={snap.ticker}
                          onClick={() => handleTickerClick(snap.ticker)}
                          className="p-4 rounded-lg transition-all text-left group hover:scale-[1.03]"
                          style={{
                            backgroundColor: `${SECTOR_COLORS[sectorParam] || SECTOR_COLORS['Other']}15`,
                            borderWidth: '1px',
                            borderColor: `${SECTOR_COLORS[sectorParam] || SECTOR_COLORS['Other']}30`,
                          }}
                        >
                          <div
                            className="font-semibold text-lg transition-colors"
                            style={{ color: SECTOR_COLORS[sectorParam] || SECTOR_COLORS['Other'] }}
                          >
                            {snap.ticker}
                          </div>
                          <div className={`text-sm font-medium ${snap.change_percent >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                            {snap.change_percent >= 0 ? '+' : ''}{snap.change_percent.toFixed(2)}%
                          </div>
                        </button>
                      ))}
                    </div>
                    <button
                      onClick={() => loadSectorSnapshots(sectorParam)}
                      className="mt-4 px-4 py-2 text-white rounded-lg text-sm transition-colors font-medium hover:opacity-90"
                      style={{ backgroundColor: SECTOR_COLORS[sectorParam] || SECTOR_COLORS['Other'] }}
                    >
                      🔄 Load Different {sectorParam} Stocks
                    </button>
                  </>
                ) : (
                  <div className="text-center py-6">
                    <p className="text-gray-500 dark:text-gray-400">
                      No {sectorParam} stocks found in today's snapshot. Try running the daily snapshot fetch first.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Default empty state content */}
            {!sectorParam && (
              <>
                <div className="text-6xl mb-4">📊</div>
                <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Search for a Stock</h3>
                <p className="text-gray-600 dark:text-gray-400 mb-6">
                  Enter a ticker symbol above to view detailed stock information, charts, and analysis tools. Or, select from the list below.
                </p>
              </>
            )}
            
            {/* Top Gainers */}
            {gainersLoading ? (
              <div className="text-center py-4">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto mb-2"></div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Loading top gainers...</p>
              </div>
            ) : (
              <>
                {topGainers.length > 0 && (
                  <>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
                      {topGainers[0].change_percent > 0 ? "📈 Today's Top Gainers:" : "Quick Start:"}
                    </p>
                    <div className="flex flex-wrap justify-center gap-3 mb-8">
                      {topGainers.map((gainer, index) => (
                        <button
                          key={index}
                          onClick={() => handleTickerClick(gainer.ticker)}
                          className="group px-4 py-2.5 bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-primary-600 hover:text-white dark:hover:bg-primary-500 transition-all duration-200 transform hover:scale-105"
                          title={gainer.change_percent > 0 ? `${gainer.change_percent.toFixed(2)}% gain` : gainer.ticker}
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-semibold">{gainer.ticker}</span>
                            {gainer.change_percent > 0 && (
                              <span className="text-xs font-medium text-green-600 dark:text-green-400 group-hover:text-green-200">
                                +{gainer.change_percent.toFixed(2)}%
                              </span>
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  </>
                )}
                
                {/* Daily Market Movers */}
                {dailySnapshots.length > 0 && (
                  <div className="mt-8 border-t border-gray-200 dark:border-gray-600 pt-8">
                    <h3 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">Today's Market Movers</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                      Randomly selected stocks from today's market
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                      {dailySnapshots.map((snap) => (
                        <button
                          key={snap.ticker}
                          onClick={() => handleTickerClick(snap.ticker)}
                          className="p-4 bg-gray-100 dark:bg-gray-600 hover:bg-gray-200 dark:hover:bg-gray-500 rounded-lg transition-colors text-left group"
                        >
                          <div className="font-semibold text-lg text-gray-900 dark:text-white group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">
                            {snap.ticker}
                          </div>
                          <div className={`text-sm font-medium ${snap.change_percent >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                            {snap.change_percent >= 0 ? '+' : ''}{snap.change_percent.toFixed(2)}%
                          </div>
                        </button>
                      ))}
                    </div>
                    <button
                      onClick={loadDailySnapshots}
                      className="mt-4 px-4 py-2 bg-primary-600 hover:bg-primary-700 dark:bg-primary-500 dark:hover:bg-primary-600 text-white rounded-lg text-sm transition-colors font-medium"
                    >
                      🔄 Load Different Stocks
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default Stocks;