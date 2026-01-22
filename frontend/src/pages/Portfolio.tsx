import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { authAPI, portfolioAPI } from '../services/api';
import { User } from '../types';
import ThemeToggle from '../components/ThemeToggle';

interface PortfolioPosition {
  id: string;
  ticker: string;
  quantity: number;
  buy_price: number;
  buy_date: string;
  notes?: string;
  current_price?: number;
  total_value?: number;
  profit_loss?: number;
  profit_loss_percent?: number;
  created_at: string;
}

const Portfolio: React.FC = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [portfolio, setPortfolio] = useState<PortfolioPosition[]>([]);
  const [loading, setLoading] = useState(true);
  const [addingPosition, setAddingPosition] = useState(false);
  const [newTicker, setNewTicker] = useState('');
  const [newQuantity, setNewQuantity] = useState('');
  const [newBuyPrice, setNewBuyPrice] = useState('');
  const [newBuyDate, setNewBuyDate] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const userResponse = await authAPI.getCurrentUser();
      setUser(userResponse.data);

      const portfolioResponse = await portfolioAPI.getAll();
      setPortfolio(portfolioResponse.data.positions || []);
    } catch (error) {
      console.error('Failed to load data:', error);
      if ((error as any).response?.status === 401) {
        localStorage.removeItem('access_token');
        navigate('/login');
      }
    } finally {
      setLoading(false);
    }
  };

  const calculateTotals = () => {
    const totalValue = portfolio.reduce((sum, pos) => sum + (pos.total_value || 0), 0);
    const totalCost = portfolio.reduce((sum, pos) => sum + (pos.buy_price * pos.quantity), 0);
    const totalPL = totalValue - totalCost;
    const totalPLPercent = totalCost > 0 ? (totalPL / totalCost) * 100 : 0;

    return { totalValue, totalCost, totalPL, totalPLPercent };
  };

  const handleAddPosition = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!newTicker.trim() || !newQuantity || !newBuyPrice || !newBuyDate) {
      setError('Please fill in all required fields');
      return;
    }

    if (parseFloat(newQuantity) <= 0) {
      setError('Quantity must be greater than 0');
      return;
    }

    if (parseFloat(newBuyPrice) <= 0) {
      setError('Buy price must be greater than 0');
      return;
    }

    try {
      await portfolioAPI.add({
        ticker: newTicker.toUpperCase().trim(),
        quantity: parseFloat(newQuantity),
        buy_price: parseFloat(newBuyPrice),
        buy_date: newBuyDate,
        notes: newNotes.trim() || undefined
      });

      await loadData();

      setNewTicker('');
      setNewQuantity('');
      setNewBuyPrice('');
      setNewBuyDate('');
      setNewNotes('');
      setAddingPosition(false);
    } catch (err: any) {
      console.error('Add position error:', err.response?.data);
      setError(err.response?.data?.detail || 'Failed to add position. Please check the ticker symbol.');
    }
  };

  const handleRemovePosition = async (id: string) => {
    if (!window.confirm('Remove this position from your portfolio?')) {
      return;
    }

    try {
      await portfolioAPI.remove(id);
      setPortfolio(prevList => prevList.filter(pos => pos.id !== id));
    } catch (err) {
      console.error('Failed to remove position:', err);
      setError('Failed to remove position');
      await loadData();
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

  const getTierLimit = () => {
    const limits = {
      free: 5,
      casual: 20,
      active: 45,
      enterprise: 'Unlimited'
    };
    return limits[user?.subscription_tier as keyof typeof limits] || 3;
  };

  const totals = calculateTotals();

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
          <p className="mt-4 text-gray-600 dark:text-gray-400">Loading portfolio...</p>
        </div>
      </div>
    );
  }

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
              <Link to="/portfolio" className="text-primary-400 dark:text-primary-400 font-medium border-b-2 border-primary-600 dark:border-primary-400 pb-1">Portfolio</Link>
              <Link to="/alerts" className="text-gray-400 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">Alerts</Link>
              <Link to="/stocks" className="text-gray-400 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">Stocks</Link>
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
        {/* Header with Summary */}
        <div className="mb-8">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Portfolio</h1>
              <p className="text-gray-600 dark:text-gray-400 mt-1">
                {portfolio.length} of {getTierLimit()} positions
              </p>
            </div>
            <button
              onClick={() => setAddingPosition(!addingPosition)}
              className="px-6 py-3 bg-primary-600 hover:bg-primary-700 dark:bg-primary-500 dark:hover:bg-primary-600 text-white rounded-lg font-medium transition-colors flex items-center"
            >
              <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Position
            </button>
          </div>

          {/* Portfolio Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <div className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 hover:shadow-xl dark:hover:shadow-gray-200/30 transition-shadow p-6 border dark:border-gray-500">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Total Value</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
                    ${totals.totalValue.toFixed(2)}
                  </p>
                </div>
                <div className="bg-primary-100 dark:bg-primary-900/30 p-3 rounded-full">
                  <svg className="w-6 h-6 text-primary-600 dark:text-primary-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 hover:shadow-xl dark:hover:shadow-gray-200/30 transition-shadow p-6 border dark:border-gray-500">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Total Cost</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
                    ${totals.totalCost.toFixed(2)}
                  </p>
                </div>
                <div className="bg-gray-100 dark:bg-gray-600 p-3 rounded-full">
                  <svg className="w-6 h-6 text-gray-600 dark:text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                  </svg>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 hover:shadow-xl dark:hover:shadow-gray-200/30 transition-shadow p-6 border dark:border-gray-500">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Total P&L</p>
                  <p className={`text-2xl font-bold mt-1 ${
                    totals.totalPL >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                  }`}>
                    {totals.totalPL >= 0 ? '+' : ''}${totals.totalPL.toFixed(2)}
                  </p>
                </div>
                <div className={`p-3 rounded-full ${
                  totals.totalPL >= 0 ? 'bg-green-100 dark:bg-green-900/30' : 'bg-red-100 dark:bg-red-900/30'
                }`}>
                  <svg className={`w-6 h-6 ${
                    totals.totalPL >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                  }`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={totals.totalPL >= 0 ? "M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" : "M13 17h8m0 0V9m0 8l-8-8-4 4-6-6"} />
                  </svg>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 hover:shadow-xl dark:hover:shadow-gray-200/30 transition-shadow p-6 border dark:border-gray-500">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Return %</p>
                  <p className={`text-2xl font-bold mt-1 ${
                    totals.totalPLPercent >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                  }`}>
                    {totals.totalPLPercent >= 0 ? '+' : ''}{totals.totalPLPercent.toFixed(2)}%
                  </p>
                </div>
                <div className={`p-3 rounded-full ${
                  totals.totalPLPercent >= 0 ? 'bg-green-100 dark:bg-green-900/30' : 'bg-red-100 dark:bg-red-900/30'
                }`}>
                  <svg className={`w-6 h-6 ${
                    totals.totalPLPercent >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                  }`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Add Position Form */}
        {addingPosition && (
          <div className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 p-6 border dark:border-gray-500 mb-8">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Add Position to Portfolio</h2>
            
            {error && (
              <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 text-red-600 dark:text-red-400 px-4 py-3 rounded-lg mb-4">
                {error}
              </div>
            )}

            <form onSubmit={handleAddPosition} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Ticker Symbol *
                  </label>
                  <input
                    type="text"
                    value={newTicker}
                    onChange={(e) => setNewTicker(e.target.value.toUpperCase())}
                    placeholder="AAPL"
                    maxLength={10}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Quantity *
                  </label>
                  <input
                    type="number"
                    value={newQuantity}
                    onChange={(e) => setNewQuantity(e.target.value)}
                    placeholder="100"
                    step="0.00000001"
                    min="0"
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Buy Price *
                  </label>
                  <input
                    type="number"
                    value={newBuyPrice}
                    onChange={(e) => setNewBuyPrice(e.target.value)}
                    placeholder="150.00"
                    step="0.01"
                    min="0"
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Buy Date *
                  </label>
                  <input
                    type="date"
                    value={newBuyDate}
                    onChange={(e) => setNewBuyDate(e.target.value)}
                    max={new Date().toISOString().split('T')[0]}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Notes (optional)
                  </label>
                  <input
                    type="text"
                    value={newNotes}
                    onChange={(e) => setNewNotes(e.target.value)}
                    placeholder="Long-term hold"
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  />
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  type="submit"
                  className="px-6 py-2 bg-primary-600 hover:bg-primary-700 dark:bg-primary-500 dark:hover:bg-primary-600 text-white rounded-lg font-medium transition-colors"
                >
                  Add Position
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAddingPosition(false);
                    setNewTicker('');
                    setNewQuantity('');
                    setNewBuyPrice('');
                    setNewBuyDate('');
                    setNewNotes('');
                    setError('');
                  }}
                  className="px-6 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-600 dark:hover:bg-gray-500 text-gray-900 dark:text-white rounded-lg font-medium transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Portfolio Table */}
        {portfolio.length === 0 ? (
          <div className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 p-12 border dark:border-gray-500 text-center">
            <div className="bg-gray-100 dark:bg-gray-600 rounded-full w-24 h-24 flex items-center justify-center mx-auto mb-6">
              <svg className="w-12 h-12 text-gray-400 dark:text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">No Positions Yet</h3>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              Add your first position to start tracking your investments
            </p>
            <button
              onClick={() => setAddingPosition(true)}
              className="px-6 py-3 bg-primary-600 hover:bg-primary-700 dark:bg-primary-500 dark:hover:bg-primary-600 text-white rounded-lg font-medium transition-colors"
            >
              Add Your First Position
            </button>
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 border dark:border-gray-500 overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-600">
              <thead className="bg-gray-50 dark:bg-gray-900">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Ticker</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Quantity</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Buy Price</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Current Price</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Total Value</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">P&L</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Notes</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-700 divide-y divide-gray-200 dark:divide-gray-600">
                {portfolio.map((position) => (
                  <tr key={position.id} className="hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-bold text-gray-900 dark:text-white">{position.ticker}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">{new Date(position.buy_date).toLocaleDateString()}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <div className="text-sm text-gray-900 dark:text-white">{position.quantity}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <div className="text-sm text-gray-900 dark:text-white">${position.buy_price.toFixed(2)}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <div className="text-sm font-semibold text-gray-900 dark:text-white">
                        {position.current_price ? `$${position.current_price.toFixed(2)}` : '-'}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <div className="text-sm font-semibold text-gray-900 dark:text-white">
                        {position.total_value ? `$${position.total_value.toFixed(2)}` : '-'}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      {position.profit_loss !== undefined && position.profit_loss !== null ? (
                        <div>
                          <div className={`text-sm font-semibold ${
                            position.profit_loss >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                          }`}>
                            {position.profit_loss >= 0 ? '+' : ''}${position.profit_loss.toFixed(2)}
                          </div>
                          {position.profit_loss_percent !== undefined && (
                            <div className={`text-xs ${
                              position.profit_loss_percent >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                            }`}>
                              ({position.profit_loss_percent >= 0 ? '+' : ''}{position.profit_loss_percent.toFixed(2)}%)
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="text-sm text-gray-600 dark:text-gray-400">-</div>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-600 dark:text-gray-400 max-w-xs truncate">
                        {position.notes || '-'}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <button
                        onClick={() => handleRemovePosition(position.id)}
                        className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default Portfolio;