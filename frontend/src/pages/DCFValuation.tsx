import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { authAPI, dcfAPI } from '../services/api';
import { User } from '../types';
import ThemeToggle from '../components/ThemeToggle';

interface DCFSuggestions {
  ticker: string;
  company_name: string;
  sector: string;
  industry: string;
  current_price: number;
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
  const [dcfData, setDcfData] = useState<DCFData | null>(null);
  const [suggestions, setSuggestions] = useState<DCFSuggestions | null>(null);
  const [error, setError] = useState('');
  
  React.useEffect(() => {
    loadUser();
    if (urlTicker) {
      setTicker(urlTicker);
      loadSuggestions(urlTicker);
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

  const loadSuggestions = async (symbol: string) => {
    if (!symbol.trim()) return;

    try {
      const response = await dcfAPI.getSuggestions(symbol.toUpperCase());
      setSuggestions(response.data);
      setGrowthRate(response.data.suggestions.growth_rate * 100);
      setTerminalGrowth(response.data.suggestions.terminal_growth * 100);
      setDiscountRate(response.data.suggestions.discount_rate * 100);
      setProjectionYears(response.data.suggestions.projection_years);
      setShowSuggestions(true);
    } catch (err: any) {
      console.error('Failed to load suggestions:', err);
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
	
  const handleTickerChange = async (value: string) => {
    setTicker(value);
    if (value.length >= 1) {
      await loadSuggestions(value);
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
      free: 0,
      casual: 20,
      active: 45,
      professional: 75
    };
    return limits[user?.subscription_tier as keyof typeof limits] || 0;
  };

  const formatCurrency = (value: number) => {
    if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
    if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
    if (value >= 1e3) return `$${(value / 1e3).toFixed(2)}K`;
    return `$${value.toFixed(2)}`;
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
              <Link to="/dashboard" className="text-gray-400 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">Dashboard</Link>
              <Link to="/watchlist" className="text-gray-400 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">Watchlist</Link>
              <Link to="/portfolio" className="text-gray-400 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">Portfolio</Link>
              <Link to="/alerts" className="text-gray-400 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">Alerts</Link>
              <Link to="/stocks?showTopGainers=true" className="text-gray-400 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">Stocks</Link>
              <Link to="/technical-analysis" className="text-gray-400 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">Technical Analysis</Link>
              <Link to="/dcf-valuation" className="text-primary-400 dark:text-primary-400 font-medium border-b-2 border-primary-600 dark:border-primary-400 pb-1">DCF Valuation</Link>
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
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center mb-2">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">DCF Valuation</h1>
          </div>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Discounted Cash Flow analysis - Estimate intrinsic value based on projected future cash flows
          </p>
        </div>

        {/* Input Form */}
        <div className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 p-6 border dark:border-gray-500 mb-8">
          <form onSubmit={handleCalculate}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              {/* Ticker */}
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Ticker Symbol
                </label>
                <input
                  type="text"
                  value={ticker}
                  onChange={(e) => setTicker(e.target.value.toUpperCase())}
                  placeholder="e.g., AAPL"
                  className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  maxLength={10}
                />
              </div>

              {/* Growth Rate */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Growth Rate (%)
                </label>
                <input
                  type="number"
                  value={growthRate}
                  onChange={(e) => setGrowthRate(parseFloat(e.target.value))}
                  step="0.1"
                  min="-50"
                  max="100"
                  className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Expected annual FCF growth</p>
              </div>

              {/* Terminal Growth */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Terminal Growth (%)
                </label>
                <input
                  type="number"
                  value={terminalGrowth}
                  onChange={(e) => setTerminalGrowth(parseFloat(e.target.value))}
                  step="0.1"
                  min="0"
                  max="10"
                  className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Perpetual growth rate</p>
              </div>

              {/* Discount Rate */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Discount Rate / WACC (%)
                </label>
                <input
                  type="number"
                  value={discountRate}
                  onChange={(e) => setDiscountRate(parseFloat(e.target.value))}
                  step="0.1"
                  min="1"
                  max="30"
                  className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Required rate of return</p>
              </div>

              {/* Projection Years */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Projection Years
                </label>
                <select
                  value={projectionYears}
                  onChange={(e) => setProjectionYears(parseInt(e.target.value))}
                  className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                >
                  <option value={3}>3 Years</option>
                  <option value={5}>5 Years</option>
                  <option value={7}>7 Years</option>
                  <option value={10}>10 Years</option>
                </select>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Forecast horizon</p>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full px-8 py-3 bg-primary-600 hover:bg-primary-700 dark:bg-primary-500 dark:hover:bg-primary-600 text-white rounded-lg font-medium transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {loading ? 'Calculating...' : 'Calculate DCF Valuation'}
            </button>
          </form>

          {error && (
            <div className="mt-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 text-red-600 dark:text-red-400 px-4 py-3 rounded-lg">
              {error}
            </div>
          )}
        </div>

        {/* DCF Results */}
        {dcfData && (
          <div className="space-y-8">
            {/* Company Header */}
            <div className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 p-6 border dark:border-gray-500">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-white">{dcfData.ticker}</h2>
                  <p className="text-gray-600 dark:text-gray-400 mt-1">{dcfData.company_name}</p>
                </div>
                <div className="text-right">
                  <div className="text-sm text-gray-600 dark:text-gray-400">Current Price</div>
                  <div className="text-3xl font-bold text-gray-900 dark:text-white">
                    ${dcfData.current_price.toFixed(2)}
                  </div>
                </div>
              </div>

              {/* Recommendation */}
              <div className={`p-4 rounded-lg border-2 ${
                dcfData.recommendation.color === 'green'
                  ? 'bg-green-50 dark:bg-green-900/20 border-green-500'
                  : dcfData.recommendation.color === 'red'
                  ? 'bg-red-50 dark:bg-red-900/20 border-red-500'
                  : 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-500'
              }`}>
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                      Recommendation: {dcfData.recommendation.rating}
                    </h3>
                    <p className="text-gray-600 dark:text-gray-400 mt-1">{dcfData.recommendation.message}</p>
                  </div>
                  <div className="text-right">
                    <div className="text-sm text-gray-600 dark:text-gray-400">Margin of Safety</div>
                    <div className={`text-2xl font-bold ${
                      dcfData.valuation.margin_of_safety > 0 ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {dcfData.valuation.margin_of_safety > 0 ? '+' : ''}{dcfData.valuation.margin_of_safety.toFixed(1)}%
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Valuation Summary */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 p-6 border dark:border-gray-500">
                <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">Intrinsic Value</h3>
                <div className="text-3xl font-bold text-primary-600 dark:text-primary-400">
                  ${dcfData.valuation.intrinsic_value_per_share.toFixed(2)}
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">Per Share</p>
              </div>

              <div className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 p-6 border dark:border-gray-500">
                <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">Enterprise Value</h3>
                <div className="text-3xl font-bold text-gray-900 dark:text-white">
                  {formatCurrency(dcfData.valuation.enterprise_value)}
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">Total Value</p>
              </div>

              <div className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 p-6 border dark:border-gray-500">
                <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">Terminal Value</h3>
                <div className="text-3xl font-bold text-gray-900 dark:text-white">
                  {formatCurrency(dcfData.terminal_value.present_value)}
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">Present Value</p>
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
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DCFValuation;
