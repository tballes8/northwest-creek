import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { authAPI, dcfAPI, watchlistAPI } from '../services/api';
import { User } from '../types';
import ThemeToggle from '../components/ThemeToggle';


interface DCFSuggestions {
  ticker: string;
  company_name: string;
  sector: string;
  industry: string;
  current_price: number;
  market_cap: number;
  size_category: string;
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
}

interface DCFData {
  ticker: string;
  company_name: string;
  current_price: number;
  assumptions: {
    growth_rate: number;
    terminal_growth: number;
    discount_rate: number;
    projection_years: number;
    current_fcf: number;
    shares_outstanding: number;
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
    intrinsic_value_per_share: number;
    current_price: number;
    margin_of_safety: number;
  };
  recommendation: {
    rating: string;
    color: string;
    message: string;
  };
}

const DCFValuation: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const urlTicker = searchParams.get('ticker') || '';
  
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [user, setUser] = useState<User | null>(null);
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
  }, []);

  // Separate useEffect for handling URL ticker parameter
  useEffect(() => {
    if (urlTicker && !hasLoadedInitialSuggestions) {
      setTicker(urlTicker);
      setHasLoadedInitialSuggestions(true);
      
      // Check if warrant
      const isWarrantStock = detectWarrant(urlTicker);
      setIsWarrant(isWarrantStock);
      if (isWarrantStock) {
        setRelatedCommonStock(getRelatedCommonStock(urlTicker));
      }
      
      loadSuggestions(urlTicker);
    }
  }, [urlTicker, hasLoadedInitialSuggestions]);

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

  const loadSuggestions = async (symbol: string) => {
    if (!symbol.trim()) return;

    setLoadingSuggestions(true);
    setError('');
    
    try {
      const response = await dcfAPI.getSuggestions(symbol.toUpperCase());
      setSuggestions(response.data);
      
      // Set the suggested parameters
      setGrowthRate(response.data.suggestions.growth_rate * 100);
      setTerminalGrowth(response.data.suggestions.terminal_growth * 100);
      setDiscountRate(response.data.suggestions.discount_rate * 100);
      setProjectionYears(response.data.suggestions.projection_years);
      setShowSuggestions(true);
    } catch (err: any) {
      console.error('Failed to load suggestions:', err);
      // Don't show error to user, just use default values
      setShowSuggestions(false);
    } finally {
      setLoadingSuggestions(false);
    }
  };

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
      setError(err.response?.data?.detail || 'Failed to calculate DCF. Please check the ticker symbol and try again.');
    } finally {
      setLoading(false);
    }
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

  const formatCurrency = (value: number) => {
    if (Math.abs(value) >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
    if (Math.abs(value) >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
    if (Math.abs(value) >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
    if (Math.abs(value) >= 1e3) return `$${(value / 1e3).toFixed(2)}K`;
    return `$${value.toFixed(2)}`;
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
              <Link to={`/stocks${ticker ? `?ticker=${ticker}` : '?showTopGainers=true'}`} className="text-gray-400 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">Stocks</Link>
              <Link to={`/technical-analysis${ticker ? `?ticker=${ticker}` : ''}`} className="text-gray-400 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">Technical Analysis</Link>
              <Link to="/dcf-valuation" className="text-primary-400 dark:text-primary-400 font-medium border-b-2 border-primary-600 dark:border-primary-400 pb-1">DCF Valuation</Link>
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
                <input
                  type="text"
                  value={ticker}
                  onChange={(e) => handleTickerChange(e.target.value.toUpperCase())}
                  placeholder="e.g., AAPL, MSFT"
                  className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-600 text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500"
                />
                <button
                  type="button"
                  onClick={handleGetSuggestions}
                  disabled={loadingSuggestions || !ticker.trim()}
                  className="px-6 py-2 bg-gray-600 hover:bg-gray-700 dark:bg-gray-500 dark:hover:bg-gray-600 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
                >
                  {loadingSuggestions ? 'Loading...' : 'Get AI Suggestions'}
                </button>
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
                  <p className="mt-2 italic">Click "Calculate DCF" below to use these parameters!</p>
                </div>
              </div>
            )}

            {/* Parameter Inputs */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Growth Rate (%)
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
                  Discount Rate (%)
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
                  <div className="text-2xl font-bold text-primary-600 dark:text-primary-400">
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
            </div>

            {/* Assumptions */}
            <div className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 p-6 border dark:border-gray-500">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Assumptions</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">Growth Rate</div>
                  <div className="text-lg font-semibold text-gray-900 dark:text-white">
                    {(dcfData.assumptions.growth_rate * 100).toFixed(1)}%
                  </div>
                </div>
                <div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">Terminal Growth</div>
                  <div className="text-lg font-semibold text-gray-900 dark:text-white">
                    {(dcfData.assumptions.terminal_growth * 100).toFixed(1)}%
                  </div>
                </div>
                <div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">Discount Rate</div>
                  <div className="text-lg font-semibold text-gray-900 dark:text-white">
                    {(dcfData.assumptions.discount_rate * 100).toFixed(1)}%
                  </div>
                </div>
                <div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">Projection Years</div>
                  <div className="text-lg font-semibold text-gray-900 dark:text-white">
                    {dcfData.assumptions.projection_years} years
                  </div>
                </div>
                <div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">Current FCF</div>
                  <div className="text-lg font-semibold text-gray-900 dark:text-white">
                    {formatCurrency(dcfData.assumptions.current_fcf)}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">Shares Outstanding</div>
                  <div className="text-lg font-semibold text-gray-900 dark:text-white">
                    {(dcfData.assumptions.shares_outstanding / 1e6).toFixed(1)}M
                  </div>
                </div>
              </div>
            </div>

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
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900 dark:text-white">
                          {formatCurrency(projection.cash_flow)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-600 dark:text-gray-400">
                          {projection.discount_factor.toFixed(4)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-semibold text-primary-600 dark:text-primary-400">
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
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-bold text-primary-600 dark:text-primary-400">
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
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-bold text-primary-600 dark:text-primary-400">
                        {formatCurrency(dcfData.terminal_value.present_value)}
                      </td>
                    </tr>
                    <tr className="bg-primary-100 dark:bg-primary-900/30">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900 dark:text-white">
                        Enterprise Value
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-right"></td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-right"></td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-bold text-primary-600 dark:text-primary-400">
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
    </div>
  );
};

export default DCFValuation;