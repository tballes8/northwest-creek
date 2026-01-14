import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { authAPI, watchlistAPI } from '../services/api';
import { User } from '../types';
import ThemeToggle from '../components/ThemeToggle';
import { WatchlistItem } from '../types';


const Watchlist: React.FC = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [addingStock, setAddingStock] = useState(false);
  const [newTicker, setNewTicker] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [newTargetPrice, setNewTargetPrice] = useState('');
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);  

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const userResponse = await authAPI.getCurrentUser();
      setUser(userResponse.data);

      const watchlistResponse = await watchlistAPI.getAll();
      setWatchlist(watchlistResponse.data.items || []);
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

  const handleAddStock = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!newTicker.trim()) {
      setError('Please enter a ticker symbol');
      return;
    }

    const limits = {
      free: 5,
      pro: 50,
      enterprise: Infinity
    };
    const limit = limits[user?.subscription_tier as keyof typeof limits] || 5;

    if (watchlist.length >= limit) {
      setError(`You've reached your ${user?.subscription_tier} tier limit of ${limit} stocks`);
      return;
    }

    try {
      const payload: any = {
        ticker: newTicker.toUpperCase().trim(),
      };
      
      if (newNotes.trim()) {
        payload.notes = newNotes.trim();
      }
      
      if (newTargetPrice && parseFloat(newTargetPrice) > 0) {
        payload.target_price = parseFloat(newTargetPrice);
      }

      await watchlistAPI.add(payload);
      await loadData();

      setNewTicker('');
      setNewNotes('');
      setNewTargetPrice('');
      setAddingStock(false);
    } catch (err: any) {
      console.error('Add stock error:', err.response?.data);
      setError(err.response?.data?.detail || 'Failed to add stock. Please check the ticker symbol.');
    }
  };

  const handleRemoveStock = async (id: string) => {  // ← Changed from number to string
    if (!window.confirm('Remove this stock from your watchlist?')) {
      return;
    }

    try {
      await watchlistAPI.remove(id);
      // Immediately update local state to remove the item
      setWatchlist(prevList => prevList.filter(stock => stock.id !== id));
    } catch (err) {
      console.error('Failed to remove stock:', err);
      setError('Failed to remove stock');
      // Reload data in case of error
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
      active: { bg: 'bg-primary-100 dark:bg-primary-900/50', text: 'text-primary-800 dark:text-primary-200', label: 'Active' },
      unlimited: { bg: 'bg-purple-100 dark:bg-purple-900/50', text: 'text-purple-800 dark:text-purple-200', label: 'Unlimited' },
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
      unlimited: 'Unlimited'
    };
    return limits[user?.subscription_tier as keyof typeof limits] || 5;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-800 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
          <p className="mt-4 text-gray-600 dark:text-gray-400">Loading watchlist...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-800">
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
              {user?.subscription_tier === 'active' && (
                <Link to="/technical-analysis" className="text-gray-400 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">Technical Analysis</Link>
              )}
              {user?.subscription_tier === 'unlimited' && (
                <Link to="/dcf-valuation" className="text-gray-400 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">DCF Valuation</Link>
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
        <div className="mb-8">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Watchlist</h1>
              <p className="text-gray-600 dark:text-gray-400 mt-1">
                {watchlist.length} of {getTierLimit()} stocks
              </p>
            </div>
            <button
              onClick={() => setAddingStock(!addingStock)}
              className="px-6 py-3 bg-primary-600 hover:bg-primary-700 dark:bg-primary-500 dark:hover:bg-primary-600 text-white rounded-lg font-medium transition-colors flex items-center"
            >
              <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Stock
            </button>
          </div>
        </div>

        {/* Add Stock Form */}
        {addingStock && (
          <div className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 p-6 border dark:border-gray-500 mb-8">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Add Stock to Watchlist</h2>
            
            {error && (
              <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 text-red-600 dark:text-red-400 px-4 py-3 rounded-lg mb-4">
                {error}
              </div>
            )}

            <form onSubmit={handleAddStock} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                    Started watching when price was
                  </label>
                  <input
                    type="number"
                    value={newTargetPrice}
                    onChange={(e) => setNewTargetPrice(e.target.value)}
                    placeholder="150.00"
                    step="0.01"
                    min="0"
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Notes (optional)
                </label>
                <textarea
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  placeholder="Why are you watching this stock?"
                  rows={3}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                />
              </div>

              <div className="flex gap-3">
                <button
                  type="submit"
                  className="px-6 py-2 bg-primary-600 hover:bg-primary-700 dark:bg-primary-500 dark:hover:bg-primary-600 text-white rounded-lg font-medium transition-colors"
                >
                  Add to Watchlist
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAddingStock(false);
                    setNewTicker('');
                    setNewNotes('');
                    setNewTargetPrice('');
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

        {/* Watchlist Table */}
        {watchlist.length === 0 ? (
          <div className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 p-12 border dark:border-gray-500 text-center">
            <div className="bg-gray-100 dark:bg-gray-600 rounded-full w-24 h-24 flex items-center justify-center mx-auto mb-6">
              <svg className="w-12 h-12 text-gray-400 dark:text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
              </svg>
            </div>
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">No Stocks Yet</h3>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              Add your first stock to start tracking prices and performance
            </p>
            <button
              onClick={() => setAddingStock(true)}
              className="px-6 py-3 bg-primary-600 hover:bg-primary-700 dark:bg-primary-500 dark:hover:bg-primary-600 text-white rounded-lg font-medium transition-colors"
            >
              Add Your First Stock
            </button>
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 border dark:border-gray-500 overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-600">
              <thead className="bg-gray-50 dark:bg-gray-900">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Ticker</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Current Price</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Day Change</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Started At</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">vs Start</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Notes</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-700 divide-y divide-gray-200 dark:divide-gray-600">
                {watchlist.map((stock) => (
                  <tr key={stock.id} className="hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-bold text-gray-900 dark:text-white">{stock.ticker}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <div className="text-sm font-semibold text-gray-900 dark:text-white">
                        {stock.price ? `$${stock.price.toFixed(2)}` : '-'}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <div className={`text-sm font-semibold ${
                        stock.change && stock.change >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                      }`}>
                        {stock.change ? `${stock.change >= 0 ? '+' : ''}$${stock.change.toFixed(2)} (${stock.change_percent?.toFixed(2)}%)` : '-'}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <div className="text-sm text-gray-600 dark:text-gray-400">
                        {stock.target_price ? `$${stock.target_price.toFixed(2)}` : '-'}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      {stock.price_vs_target !== undefined && stock.price_vs_target !== null && stock.target_price ? (
                        <div className={`text-sm font-semibold ${
                          stock.price_vs_target >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                        }`}>
                          {stock.price_vs_target >= 0 ? '+' : ''}${stock.price_vs_target.toFixed(2)}
                          {stock.price_vs_target_percent !== undefined && stock.price_vs_target_percent !== null && (
                            <div className="text-xs">
                              ({stock.price_vs_target_percent >= 0 ? '+' : ''}{stock.price_vs_target_percent.toFixed(2)}%)
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="text-sm text-gray-600 dark:text-gray-400">-</div>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-600 dark:text-gray-400 max-w-xs truncate">
                        {stock.notes || '-'}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <button
                        onClick={() => handleRemoveStock(stock.id)}
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

export default Watchlist;