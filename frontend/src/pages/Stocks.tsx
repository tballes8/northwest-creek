import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { User } from '../types';
import ThemeToggle from '../components/ThemeToggle';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler } from 'chart.js';
import { Line } from 'react-chartjs-2';
import { authAPI, stocksAPI, watchlistAPI } from '../services/api';
import { getTickersForSector, SECTOR_COLORS } from '../utils/sectorMap';
import axios from 'axios';

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
  type?: string;  // CS = Common Stock, ETF = ETF, ADRC = ADR
  // Fund-specific fields (populated by yfinance for ETFs)
  fund_description?: string | null;
  fund_category?: string | null;
  fund_family?: string | null;
  fund_expense_ratio?: number | null;
  fund_inception_date?: string | null;
  fund_total_assets?: number | null;
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

interface DividendRecord {
  cash_amount: number | null;
  currency: string;
  declaration_date: string | null;
  ex_dividend_date: string | null;
  pay_date: string | null;
  record_date: string | null;
  frequency: number | null;
  distribution_type: string;
}

interface DividendInfo {
  ticker: string;
  has_dividends: boolean;
  dividends: DividendRecord[];
  annual_dividend: number | null;
  annual_yield: number | null;
  frequency_label: string | null;
}

// Add interface for daily snapshot
interface DailySnapshot {
  ticker: string;
  open_price: number;
  close_price: number;
  change_percent: number;
  snapshot_date: string;
}

interface SearchSuggestion {
  ticker: string;
  name: string;
  type?: string;
  primary_exchange?: string;
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
  const [topLosers, setTopLosers] = useState<TopGainer[]>([]);
  const [losersLoading, setLosersLoading] = useState(false);
  const [dailySnapshots, setDailySnapshots] = useState<DailySnapshot[]>([]);
  const [sectorSnapshots, setSectorSnapshots] = useState<DailySnapshot[]>([]);
  const [sectorLoading, setSectorLoading] = useState(false);
  const [isWarrant, setIsWarrant] = useState(false);
  const [relatedCommonStock, setRelatedCommonStock] = useState<string | null>(null);
  const [watchlistMsg, setWatchlistMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [addingToWatchlist, setAddingToWatchlist] = useState(false);
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const [dividendInfo, setDividendInfo] = useState<DividendInfo | null>(null);
  const [dividendLoading, setDividendLoading] = useState(false);

  // User dropdown menu
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  // Helper function to detect if a ticker is a warrant
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

  // Helper function to get related common stock ticker
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
      loadTopLosers();
    }
    // Load sector-specific stocks when sector param is present
    if (sectorParam) {
      loadSectorSnapshots(sectorParam);
    }
  }, [initialTicker, showTopGainers, sectorParam]);

  // Close suggestions dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Debounced ticker/company search
  const searchTickers = useCallback(async (query: string) => {
    if (query.length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    
    setSuggestionsLoading(true);
    try {
      const token = localStorage.getItem('access_token');
      const response = await axios.get(
        `${API_URL}/api/v1/stocks/search?q=${encodeURIComponent(query)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const results = response.data.results || [];
      setSuggestions(results);
      setShowSuggestions(results.length > 0);
    } catch (err) {
      console.error('Search error:', err);
      setSuggestions([]);
    } finally {
      setSuggestionsLoading(false);
    }
  }, []);

  const handleSearchInputChange = (value: string) => {
    setSearchInput(value);
    
    // If cleared, reset to empty state
    if (!value.trim()) {
      resetToEmptyState();
      return;
    }

    // Clear previous debounce
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    
    // Debounce API call by 300ms
    debounceRef.current = setTimeout(() => {
      searchTickers(value);
    }, 300);
  };

  const resetToEmptyState = () => {
    setTicker('');
    setSearchInput('');
    setQuote(null);
    setCompany(null);
    setHistorical([]);
    setNews([]);
    setDividendInfo(null);
    setError('');
    setIsWarrant(false);
    setRelatedCommonStock(null);
    setSuggestions([]);
    setShowSuggestions(false);
    setWatchlistMsg(null);
    navigate('/stocks', { replace: true });
  };

  const handleSuggestionClick = (suggestion: SearchSuggestion) => {
    setSearchInput(suggestion.ticker);
    setShowSuggestions(false);
    setSuggestions([]);
    handleTickerClick(suggestion.ticker);
  };

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
    
    // Pre-fetch hint only — real warrant detection happens after API response
    const isWarrantHint = detectWarrantHint(symbol);
    setIsWarrant(isWarrantHint);
    if (isWarrantHint) {
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
      
      // API-driven warrant detection — overrides any pre-fetch hint
      const apiType = companyRes.data?.type || '';
      if (apiType === 'WARRANT') {
        setIsWarrant(true);
        setRelatedCommonStock(getRelatedCommonStock(symbol) || symbol.replace(/W+$/i, ''));
      } else if (apiType === 'CS' || apiType === 'ADRC' || apiType === 'PFD' || apiType === 'ETF') {
        // Confirmed non-warrant — clear any false positive from hint
        setIsWarrant(false);
        setRelatedCommonStock(null);
      }
      loadDividends(symbol);
    } catch (err: any) {
      console.error('Stock API Error:', err);
      setError(err.response?.data?.detail || 'Failed to load stock data. Please check the ticker symbol and try again.');
      setQuote(null);
      setCompany(null);
      setHistorical([]);
      setDividendInfo(null);
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

  const loadDividends = async (symbol: string) => {
    setDividendLoading(true);
    try {
      const token = localStorage.getItem('access_token');
      const response = await axios.get(
        `${API_URL}/api/v1/stocks/dividends/${encodeURIComponent(symbol.toUpperCase())}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setDividendInfo(response.data);
    } catch (err) {
      console.error('Failed to load dividends:', err);
      setDividendInfo(null);
    } finally {
      setDividendLoading(false);
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

  const loadTopLosers = async () => {
    setLosersLoading(true);
    try {
      const token = localStorage.getItem('access_token');
      const response = await axios.get(
        `${API_URL}/api/v1/stocks/top-losers?limit=10`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setTopLosers(response.data.top_losers || []);
    } catch (err) {
      console.error('Failed to load top losers:', err);
      setTopLosers([]);
    } finally {
      setLosersLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setShowSuggestions(false);
    setSuggestions([]);
    if (searchInput.trim()) {
      // If input looks like a ticker (all caps, short), search directly
      // Otherwise if we have suggestions, use the first match's ticker
      const input = searchInput.trim();
      const looksLikeTicker = /^[A-Z]{1,5}(\.[A-Z])?$/.test(input.toUpperCase()) && input.length <= 6;
      
      if (looksLikeTicker) {
        loadStockData(input);
        loadNews(input);
        navigate(`/stocks?ticker=${input.toUpperCase()}`);
      } else if (suggestions.length > 0) {
        // Use first suggestion's ticker
        const firstTicker = suggestions[0].ticker;
        setSearchInput(firstTicker);
        loadStockData(firstTicker);
        loadNews(firstTicker);
        navigate(`/stocks?ticker=${firstTicker}`);
      } else {
        // Try it as a ticker anyway
        loadStockData(input);
        loadNews(input);
        navigate(`/stocks?ticker=${input.toUpperCase()}`);
      }
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

  // Dividend helpers
  // Fund-type codes from Polygon/Massive: ETF, ETS (Exchange Traded Share), ETN (Exchange Traded Note)
  const FUND_TYPES = new Set(['ETF', 'ETS', 'ETN', 'ETV', 'ETD']);
  const isFundType = (type?: string): boolean => !!type && FUND_TYPES.has(type);

  const formatFrequency = (freq: number | null, label: string | null): string => {
    if (label && label !== 'Unknown') return label;
    if (freq === null) return '—';
    const map: Record<number, string> = { 0: 'One-time', 1: 'Annual', 2: 'Semi-Annual', 4: 'Quarterly', 12: 'Monthly' };
    return map[freq] ?? `${freq}x/yr`;
  };

  const formatDividendDate = (dateStr: string | null): string => {
    if (!dateStr) return '—';
    try {
      return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
      return dateStr;
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
              <Link to="/stocks" className="text-primary-400 dark:text-primary-400 font-medium border-b-2 border-primary-600 dark:border-primary-400 pb-1">Stocks</Link>
              <Link to={`/technical-analysis${ticker ? `?ticker=${ticker}` : ''}`} className="text-gray-400 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">Technical Analysis</Link>
              <Link to={`/dcf-valuation${ticker ? `?ticker=${ticker}` : ''}`} className="text-gray-400 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">DCF Valuation</Link>
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
              <ThemeToggle />
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-6">Stock Research</h1>

        {/* Search Bar */}
        <div className="mb-8" ref={searchContainerRef}>
          <form onSubmit={handleSearch} className="flex gap-4">
            <div className="flex-1 relative">
              <input
                type="text"
                value={searchInput}
                onChange={(e) => handleSearchInputChange(e.target.value)}
                onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true); }}
                placeholder="Search by ticker symbol or company name (e.g., AAPL or Apple)"
                className="w-full px-4 py-3 pr-10 border border-gray-300 dark:border-gray-500 rounded-lg focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400 focus:border-transparent dark:bg-gray-600 dark:text-white"
                autoComplete="off"
              />

              {/* Clear button */}
              {searchInput && (
                <button
                  type="button"
                  onClick={resetToEmptyState}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
                  title="Clear search"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
              
              {/* Suggestions Dropdown */}
              {showSuggestions && (
                <div className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-500 rounded-lg shadow-xl max-h-80 overflow-y-auto">
                  {suggestionsLoading ? (
                    <div className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 flex items-center gap-2">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-600"></div>
                      Searching...
                    </div>
                  ) : (
                    suggestions.map((s, i) => (
                      <button
                        key={`${s.ticker}-${i}`}
                        type="button"
                        onClick={() => handleSuggestionClick(s)}
                        className="w-full px-4 py-3 text-left hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors flex items-center justify-between border-b border-gray-100 dark:border-gray-600 last:border-b-0"
                      >
                        <div className="flex items-center gap-3">
                          <span className="font-bold text-primary-600 dark:text-primary-400 min-w-[60px]">
                            {s.ticker}
                          </span>
                          <span className="text-sm text-gray-700 dark:text-gray-300 truncate">
                            {s.name}
                          </span>
                        </div>
                        {s.type && (
                          <span className="text-xs text-gray-400 dark:text-gray-500 ml-2 shrink-0">
                            {s.type === 'CS' ? 'Stock' : FUND_TYPES.has(s.type || '') ? 'ETF' : s.type === 'ADRC' ? 'ADR' : s.type}
                          </span>
                        )}
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
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
                  <p className="text-gray-600 dark:text-gray-400 mt-1 flex items-center gap-2">
                    {ticker} • {company.exchange}
                    {isFundType(company.type) && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
                        ETF
                      </span>
                    )}
                  </p>
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

            {/* Company Info + Dividends */}
            <div className="grid md:grid-cols-3 gap-6">
              <div className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 p-6 border dark:border-gray-500">
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
                  {isFundType(company.type) ? 'Fund Details' : 'Company Details'}
                </h3>
                <div className="space-y-3">
                  {company.type && (
                    <div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">Type</div>
                      <div className="text-gray-900 dark:text-white font-medium">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          isFundType(company.type)
                            ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300'
                            : company.type === 'ADRC'
                            ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-300'
                            : 'bg-gray-100 dark:bg-gray-600 text-gray-800 dark:text-gray-300'
                        }`}>
                          {company.type === 'CS' ? 'Common Stock' : isFundType(company.type) ? 'Exchange-Traded Fund' : company.type === 'ADRC' ? 'ADR' : company.type}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* === ETF-specific fields from yfinance === */}
                  {isFundType(company.type) && company.fund_category && (
                    <div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">Category</div>
                      <div className="text-gray-900 dark:text-white font-medium">{company.fund_category}</div>
                    </div>
                  )}
                  {isFundType(company.type) && company.fund_family && (
                    <div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">Fund Family</div>
                      <div className="text-gray-900 dark:text-white font-medium">{company.fund_family}</div>
                    </div>
                  )}
                  {isFundType(company.type) && company.fund_expense_ratio != null && (
                    <div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">Expense Ratio</div>
                      <div className="text-gray-900 dark:text-white font-medium">{(company.fund_expense_ratio * 100).toFixed(2)}%</div>
                    </div>
                  )}
                  {isFundType(company.type) && company.fund_inception_date && (
                    <div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">Inception Date</div>
                      <div className="text-gray-900 dark:text-white font-medium">
                        {new Date(company.fund_inception_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </div>
                    </div>
                  )}

                  {/* === Stock-specific fields === */}
                  {!isFundType(company.type) && company.sector && (
                    <div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">Sector</div>
                      <div className="text-gray-900 dark:text-white font-medium">{company.sector}</div>
                    </div>
                  )}
                  {!isFundType(company.type) && company.industry && (
                    <div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">Industry</div>
                      <div className="text-gray-900 dark:text-white font-medium">{company.industry}</div>
                    </div>
                  )}

                  {/* === Shared fields === */}
                  {(company.market_cap || (isFundType(company.type) && company.fund_total_assets)) && (
                    <div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">
                        {isFundType(company.type) ? 'Net Assets' : 'Market Cap'}
                      </div>
                      <div className="text-gray-900 dark:text-white font-medium">
                        {(() => {
                          const val = isFundType(company.type) ? (company.fund_total_assets || company.market_cap) : company.market_cap;
                          if (!val) return '—';
                          if (val >= 1e12) return `$${(val / 1e12).toFixed(2)}T`;
                          if (val >= 1e9) return `$${(val / 1e9).toFixed(2)}B`;
                          if (val >= 1e6) return `$${(val / 1e6).toFixed(2)}M`;
                          return `$${val.toLocaleString()}`;
                        })()}
                      </div>
                    </div>
                  )}
                  {company.employees && !isFundType(company.type) && (
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

              {/* Dividend Information Card */}
              <div className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 p-6 border dark:border-gray-500">
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Dividend Information</h3>

                {dividendLoading ? (
                  <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-sm py-4">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-600"></div>
                    Loading dividend data...
                  </div>
                ) : dividendInfo && dividendInfo.has_dividends && dividendInfo.dividends.length > 0 ? (
                  <div className="space-y-3">
                    {/* Annual Yield — hero stat */}
                    {dividendInfo.annual_yield !== null && (
                      <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-3 text-center">
                        <div className="text-2xl font-bold text-green-700 dark:text-green-300">
                          {dividendInfo.annual_yield.toFixed(2)}%
                        </div>
                        <div className="text-xs text-green-600 dark:text-green-400 font-medium">Annual Dividend Yield</div>
                      </div>
                    )}

                    {/* Key metrics grid */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <div className="text-sm text-gray-600 dark:text-gray-400">Per Share</div>
                        <div className="text-gray-900 dark:text-white font-medium">
                          ${dividendInfo.dividends[0].cash_amount?.toFixed(4) ?? '—'}
                        </div>
                      </div>
                      <div>
                        <div className="text-sm text-gray-600 dark:text-gray-400">Annual</div>
                        <div className="text-gray-900 dark:text-white font-medium">
                          {dividendInfo.annual_dividend !== null
                            ? `$${dividendInfo.annual_dividend.toFixed(2)}`
                            : '—'}
                        </div>
                      </div>
                      <div>
                        <div className="text-sm text-gray-600 dark:text-gray-400">Frequency</div>
                        <div className="text-gray-900 dark:text-white font-medium">
                          {formatFrequency(dividendInfo.dividends[0].frequency, dividendInfo.frequency_label)}
                        </div>
                      </div>
                      <div>
                        <div className="text-sm text-gray-600 dark:text-gray-400">Type</div>
                        <div className="text-gray-900 dark:text-white font-medium capitalize">
                          {dividendInfo.dividends[0].distribution_type || '—'}
                        </div>
                      </div>
                    </div>

                    {/* Dates */}
                    <div className="border-t border-gray-200 dark:border-gray-600 pt-3 space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600 dark:text-gray-400">Ex-Dividend</span>
                        <span className="text-gray-900 dark:text-white font-medium">
                          {formatDividendDate(dividendInfo.dividends[0].ex_dividend_date)}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600 dark:text-gray-400">Pay Date</span>
                        <span className="text-gray-900 dark:text-white font-medium">
                          {formatDividendDate(dividendInfo.dividends[0].pay_date)}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600 dark:text-gray-400">Declaration</span>
                        <span className="text-gray-900 dark:text-white font-medium">
                          {formatDividendDate(dividendInfo.dividends[0].declaration_date)}
                        </span>
                      </div>
                    </div>

                    {/* Recent history (last 4 dividends) */}
                    {dividendInfo.dividends.length > 1 && (
                      <div className="border-t border-gray-200 dark:border-gray-600 pt-3">
                        <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Recent History</div>
                        <div className="space-y-1.5">
                          {dividendInfo.dividends.slice(0, 4).map((div, idx) => (
                            <div key={idx} className="flex justify-between text-sm">
                              <span className="text-gray-500 dark:text-gray-400">
                                {formatDividendDate(div.ex_dividend_date)}
                              </span>
                              <span className="text-gray-900 dark:text-white font-medium">
                                ${div.cash_amount?.toFixed(4) ?? '—'}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-6 text-gray-500 dark:text-gray-400">
                    <div className="text-3xl mb-2">—</div>
                    <p className="text-sm">No dividends distributed</p>
                  </div>
                )}
              </div>

              <div className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 p-6 border dark:border-gray-500">
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
                  {isFundType(company.type) ? 'Investment Objective' : 'About'}
                </h3>
                <p className="text-gray-600 dark:text-gray-400 leading-relaxed">
                  {isFundType(company.type)
                    ? (company.fund_description || company.description || 'No investment objective available.')
                    : (company.description || 'No description available.')}
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
                  Enter a ticker symbol or company name above to view detailed stock information, charts, and analysis tools. Or, select from the list below.
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
                
                {/* Top Losers */}
                {losersLoading ? (
                  <div className="text-center py-4 mt-6">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-500 mx-auto mb-2"></div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Loading top losers...</p>
                  </div>
                ) : topLosers.length > 0 && (
                  <div className="mt-6">
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
                      📉 Today's Top Losers:
                    </p>
                    <div className="flex flex-wrap justify-center gap-3">
                      {topLosers.map((loser, index) => (
                        <button
                          key={index}
                          onClick={() => handleTickerClick(loser.ticker)}
                          className="group px-4 py-2.5 bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-red-600 hover:text-white dark:hover:bg-red-500 transition-all duration-200 transform hover:scale-105"
                          title={`${loser.change_percent.toFixed(2)}% loss`}
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-semibold">{loser.ticker}</span>
                            <span className="text-xs font-medium text-red-600 dark:text-red-400 group-hover:text-red-200">
                              {loser.change_percent.toFixed(2)}%
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
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