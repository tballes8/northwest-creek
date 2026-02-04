import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { User } from '../types';
import ThemeToggle from '../components/ThemeToggle';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler } from 'chart.js';
import { Line } from 'react-chartjs-2';
import { authAPI, stocksAPI } from '../services/api'; 

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

const Stocks: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialTicker = searchParams.get('ticker') || '';
  const showTopGainers = searchParams.get('showTopGainers') === 'true';
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
  const [dailySnapshots, setDailySnapshots] = useState<any[]>([]);
  const [isWarrant, setIsWarrant] = useState(false);
  const [relatedCommonStock, setRelatedCommonStock] = useState<string | null>(null);

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
    if (initialTicker) {
      loadStockData(initialTicker);
      loadNews(initialTicker);
      loadTopGainers();
      loadDailySnapshots();
    }
    // Load top gainers when component mounts or when showTopGainers is true
    if (showTopGainers || initialTicker) {
      loadTopGainers();
    }
  }, [initialTicker, showTopGainers]);

  // Add function to load daily snapshots
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
      // Fetch quote, company info, and historical data
      const [quoteRes, companyRes, historicalRes] = await Promise.all([
        stocksAPI.getQuote(symbol.toUpperCase()),
        stocksAPI.getCompany(symbol.toUpperCase()),
        stocksAPI.getHistorical(symbol.toUpperCase(), historyDays),
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

  const loadNews = async (symbol: string) => {
    if (!symbol.trim()) return;

    setNewsLoading(true);
    try {
      const response = await stocksAPI.getNews(symbol.toUpperCase(), 3); // Get only 3 articles
      setNews(response.data.data || []);
    } catch (err: any) {
      console.error('Failed to fetch news:', err);
      setNews([]);
    } finally {
      setNewsLoading(false);
    }
  };

  const loadTopGainers = async () => {
    setGainersLoading(true);
    try {
      const response = await stocksAPI.getTopGainers();

      const data = await response.data;
      setTopGainers(data.top_gainers || []);
    } catch (error) {
      console.error('Failed to load top gainers:', error);
      // Fallback to default tickers if fetch fails
      setTopGainers([
        { ticker: 'AAPL', open: 0, close: 0, change_percent: 0 },
        { ticker: 'TSLA', open: 0, close: 0, change_percent: 0 },
        { ticker: 'MSFT', open: 0, close: 0, change_percent: 0 },
      ]);
    } finally {
      setGainersLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchInput.trim()) {
      loadStockData(searchInput);
      loadNews(searchInput);
      navigate(`/stocks?ticker=${searchInput.trim().toUpperCase()}`);
    }
  };

  const handleTickerClick = (symbol: string) => {
    setSearchInput(symbol);
    loadStockData(symbol);
    loadNews(symbol);
    navigate(`/stocks?ticker=${symbol}`);
  };

  const handleLogout = () => {
    localStorage.removeItem('access_token');
    navigate('/login');
  };

  const formatMarketCap = (value: number) => {
    if (value >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
    if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
    if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
    return `$${value.toFixed(2)}`;
  };

  // Chart configuration
  const chartData = {
    labels: historical.map(d => new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })),
    datasets: [
      {
        label: 'Close Price',
        data: historical.map(d => d.close),
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
          label: function(context: any) {
            return `$${context.parsed.y.toFixed(2)}`;
          }
        }
      },
    },
    scales: {
      x: {
        grid: {
          display: false,
        },
      },
      y: {
        beginAtZero: false,
        ticks: {
          callback: function(value: any) {
            return '$' + value.toFixed(2);
          }
        }
      },
    },
    interaction: {
      mode: 'nearest' as const,
      axis: 'x' as const,
      intersect: false
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-800 transition-colors duration-200">
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
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-6">Stock Research</h1>

        {/* Search Bar */}
        <form onSubmit={handleSearch} className="mb-8">
          <div className="flex gap-4">
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value.toUpperCase())}
              placeholder="Enter ticker symbol (e.g., AAPL)"
              className="flex-1 px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent dark:bg-gray-700 dark:text-white"
            />
            <button
              type="submit"
              className="px-6 py-3 bg-primary-600 hover:bg-primary-700 dark:bg-primary-500 dark:hover:bg-primary-600 text-white rounded-lg font-medium transition-colors"
            >
              Search
            </button>
          </div>
        </form>

        {/* Error State */}
        {error && (
          <div className="bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-600 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg mb-6">
            {error}
          </div>
        )}

        {/* Warrant Information Box */}
        {isWarrant && quote && (
          <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-400 dark:border-blue-600 rounded-lg p-6 mb-6">
            <div className="flex items-start gap-3">
              <div className="text-3xl">ℹ️</div>
              <div>
                <h3 className="text-lg font-bold text-blue-900 dark:text-blue-200 mb-2">
                  This is a Warrant Security
                </h3>
                <div className="text-blue-800 dark:text-blue-300 space-y-2">
                  <p className="font-medium">
                    <strong>What's the difference between Common Stock and Warrants?</strong>
                  </p>
                  <div className="space-y-1.5 text-sm">
                    <p>
                      <strong>Common Stock:</strong> Represents actual ownership in the company. When you buy common stock, you own a share of the company and may receive dividends and voting rights.
                    </p>
                    <p>
                      <strong>Warrants:</strong> Give you the <em>right</em> (but not the obligation) to buy common stock at a specific price (the "strike price") before a certain date. Warrants are similar to stock options but issued by the company.
                    </p>
                    <p>
                      <strong>Key Points:</strong>
                    </p>
                    <ul className="list-disc list-inside ml-4 space-y-1">
                      <li>Warrants are typically more volatile than the underlying common stock</li>
                      <li>Warrants have an expiration date - they become worthless if not exercised before then</li>
                      <li>When exercised, warrants can dilute existing shareholders' ownership</li>
                      <li>Warrants don't pay dividends or provide voting rights</li>
                    </ul>
                    
                    {relatedCommonStock && (
                      <div className="mt-4 p-4 bg-blue-100 dark:bg-blue-900/50 rounded border border-blue-300 dark:border-blue-700">
                        <p className="font-semibold text-blue-900 dark:text-blue-200 mb-2">
                          💡 Want to understand the underlying company better?
                        </p>
                        <p className="text-sm text-blue-800 dark:text-blue-300 mb-3">
                          Since warrants derive their value from the common stock, it's recommended to analyze the common stock first.
                        </p>
                        <button
                          onClick={() => handleTickerClick(relatedCommonStock)}
                          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors inline-flex items-center gap-2"
                        >
                          <span>📊</span>
                          <span>View {relatedCommonStock} (Common Stock)</span>
                          <span>→</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Stock Data Display */}
        {quote && company && (
          <div className="space-y-6">
            {/* Price Card */}
            <div className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 p-6 border dark:border-gray-500">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-3xl font-bold text-gray-900 dark:text-white">
                    {company.name}{isWarrant && <span className="text-blue-600 dark:text-blue-400">*</span>}
                  </h2>
                  <p className="text-lg text-gray-600 dark:text-gray-400 mt-1">
                    {ticker} {isWarrant && <span className="text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-2 py-1 rounded">WARRANT</span>}
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-4xl font-bold text-gray-900 dark:text-white">
                    ${quote.price.toFixed(2)}
                  </div>
                  <div className={`text-xl font-semibold mt-1 ${quote.change >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                    {quote.change >= 0 ? '+' : ''}{quote.change.toFixed(2)} ({quote.change_percent >= 0 ? '+' : ''}{quote.change_percent.toFixed(2)}%)
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
                <div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">Open</div>
                  <div className="text-lg font-semibold text-gray-900 dark:text-white">${quote.open.toFixed(2)}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">High</div>
                  <div className="text-lg font-semibold text-gray-900 dark:text-white">${quote.high.toFixed(2)}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">Low</div>
                  <div className="text-lg font-semibold text-gray-900 dark:text-white">${quote.low.toFixed(2)}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">Volume</div>
                  <div className="text-lg font-semibold text-gray-900 dark:text-white">{quote.volume.toLocaleString()}</div>
                </div>
              </div>
            </div>

            {/* Chart */}
            <div className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 p-6 border dark:border-gray-500">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-bold text-gray-900 dark:text-white">Price History</h3>
                <select
                  value={historyDays}
                  onChange={(e) => {
                    setHistoryDays(Number(e.target.value));
                    loadStockData(ticker);
                  }}
                  className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-600 text-gray-900 dark:text-white"
                >
                  <option value={30}>30 Days</option>
                  <option value={90}>90 Days</option>
                  <option value={180}>180 Days</option>
                  <option value={365}>1 Year</option>
                </select>
              </div>
              <div style={{ height: '300px' }}>
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
                  {company.exchange && (
                    <div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">Exchange</div>
                      <div className="text-gray-900 dark:text-white font-medium">{company.exchange}</div>
                    </div>
                  )}
                  {company.market_cap && (
                    <div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">Market Cap</div>
                      <div className="text-gray-900 dark:text-white font-medium">{formatMarketCap(company.market_cap)}</div>
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

        {/* Empty State with Dynamic Top Gainers */}
        {!quote && !loading && !error && (
          <div className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 p-12 border dark:border-gray-500 text-center">
            <div className="text-6xl mb-4">📊</div>
            <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Search for a Stock</h3>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              Enter a ticker symbol above to view detailed stock information, charts, and analysis tools. Or, select from the list below.
            </p>
              {/* Dynamic Top Gainers Buttons */}
              {gainersLoading ? (
                <div className="text-center py-4">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto mb-2"></div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Loading top gainers...</p>
                </div>
              ) : (
                <>
                  {topGainers.length > 0 && (
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
                      {topGainers[0].change_percent > 0 ? "📈 Today's Top Gainers:" : "Quick Start:"}
                    </p>
                  )}
                  <div className="flex flex-wrap justify-center gap-3">
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
                  {/* Today's Market Movers */}
                  {!ticker && dailySnapshots.length > 0 && (
                    <div className="mt-6">
                      <h3 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">Today's Market Movers</h3>
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                        {dailySnapshots.map((snap) => (
                          <button
                            key={snap.ticker}
                            onClick={() => handleTickerClick(snap.ticker)}
                            className="p-4 bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 rounded-lg transition-colors text-left"
                          >
                            <div className="font-semibold text-lg text-gray-900 dark:text-white">{snap.ticker}</div>
                            <div className={`text-sm ${snap.change_percent >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                              {snap.change_percent >= 0 ? '+' : ''}{snap.change_percent.toFixed(2)}%
                            </div>
                          </button>
                        ))}
                      </div>
                      <button
                        onClick={loadDailySnapshots}
                        className="mt-4 px-4 py-2 bg-primary-600 hover:bg-primary-700 dark:bg-primary-500 dark:hover:bg-primary-600 text-white rounded-lg text-sm transition-colors"
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