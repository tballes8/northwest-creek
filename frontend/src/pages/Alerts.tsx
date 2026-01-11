import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { authAPI, alertsAPI } from '../services/api';
import { User } from '../types';
import ThemeToggle from '../components/ThemeToggle';

interface Alert {
  id: string;
  ticker: string;
  condition: 'above' | 'below';
  target_price: number;
  is_active: boolean;
  triggered_at?: string;
  notes?: string;
  created_at: string;
}

const Alerts: React.FC = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [addingAlert, setAddingAlert] = useState(false);
  const [newTicker, setNewTicker] = useState('');
  const [newCondition, setNewCondition] = useState<'above' | 'below'>('above');
  const [newTargetPrice, setNewTargetPrice] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const userResponse = await authAPI.getCurrentUser();
      setUser(userResponse.data);

      const alertsResponse = await alertsAPI.getAll();
      setAlerts(alertsResponse.data.alerts || []);
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

  const handleAddAlert = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!newTicker.trim() || !newTargetPrice) {
      setError('Please fill in all required fields');
      return;
    }

    if (parseFloat(newTargetPrice) <= 0) {
      setError('Target price must be greater than 0');
      return;
    }

    // Check tier limits
    const limits = {
      free: 5,
      pro: 20,
      enterprise: Infinity
    };
    const limit = limits[user?.subscription_tier as keyof typeof limits] || 5;

    if (alerts.length >= limit) {
      setError(`You've reached your ${user?.subscription_tier} tier limit of ${limit} alerts`);
      return;
    }

    try {
      await alertsAPI.create({
        ticker: newTicker.toUpperCase().trim(),
        condition: newCondition,
        target_price: parseFloat(newTargetPrice),
        notes: newNotes.trim() || undefined
      });

      await loadData();

      setNewTicker('');
      setNewCondition('above');
      setNewTargetPrice('');
      setNewNotes('');
      setAddingAlert(false);
    } catch (err: any) {
      console.error('Add alert error:', err.response?.data);
      setError(err.response?.data?.detail || 'Failed to create alert. Please try again.');
    }
  };

  const handleDeleteAlert = async (id: string) => {
    if (!window.confirm('Delete this alert?')) {
      return;
    }

    try {
      await alertsAPI.delete(id);
      setAlerts(prevList => prevList.filter(alert => alert.id !== id));
    } catch (err) {
      console.error('Failed to delete alert:', err);
      setError('Failed to delete alert');
      await loadData();
    }
  };

  const handleToggleAlert = async (id: string, currentStatus: boolean) => {
    try {
      await alertsAPI.update(id, { is_active: !currentStatus });
      await loadData();
    } catch (err) {
      console.error('Failed to toggle alert:', err);
      setError('Failed to update alert');
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

  const getTierLimit = () => {
    const limits = {
      free: 5,
      pro: 20,
      enterprise: 'Unlimited'
    };
    return limits[user?.subscription_tier as keyof typeof limits] || 5;
  };

  const getActiveAlertsCount = () => {
    return alerts.filter(alert => alert.is_active && !alert.triggered_at).length;
  };

  const getTriggeredAlertsCount = () => {
    return alerts.filter(alert => alert.triggered_at).length;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
          <p className="mt-4 text-gray-600 dark:text-gray-400">Loading alerts...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Navigation */}
      <nav className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <img src="/images/logo.png" alt="Northwest Creek" className="h-10 w-10 mr-3" />
              <span className="text-xl font-bold text-primary-600 dark:text-primary-400">Northwest Creek</span>
            </div>
            
            <div className="hidden md:flex items-center space-x-8">
              <Link to="/dashboard" className="text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">Dashboard</Link>
              <Link to="/watchlist" className="text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">Watchlist</Link>
              <Link to="/portfolio" className="text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">Portfolio</Link>
              <Link to="/alerts" className="text-primary-600 dark:text-primary-400 font-medium border-b-2 border-primary-600 dark:border-primary-400 pb-1">Alerts</Link>
              {user?.subscription_tier === 'enterprise' && (
                <Link to="/screener" className="text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">Screener</Link>
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
        {/* Header with Summary */}
        <div className="mb-8">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Price Alerts</h1>
              <p className="text-gray-600 dark:text-gray-400 mt-1">
                {alerts.length} of {getTierLimit()} alerts
              </p>
            </div>
            <button
              onClick={() => setAddingAlert(!addingAlert)}
              className="px-6 py-3 bg-primary-600 hover:bg-primary-700 dark:bg-primary-500 dark:hover:bg-primary-600 text-white rounded-lg font-medium transition-colors flex items-center"
            >
              <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              Create Alert
            </button>
          </div>

          {/* Alert Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 p-6 border dark:border-gray-500">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Active Alerts</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
                    {getActiveAlertsCount()}
                  </p>
                </div>
                <div className="bg-green-100 dark:bg-green-900/30 p-3 rounded-full">
                  <svg className="w-6 h-6 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                  </svg>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 p-6 border dark:border-gray-500">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Triggered</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
                    {getTriggeredAlertsCount()}
                  </p>
                </div>
                <div className="bg-purple-100 dark:bg-purple-900/30 p-3 rounded-full">
                  <svg className="w-6 h-6 text-purple-600 dark:text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 p-6 border dark:border-gray-500">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Total Alerts</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
                    {alerts.length}
                  </p>
                </div>
                <div className="bg-primary-100 dark:bg-primary-900/30 p-3 rounded-full">
                  <svg className="w-6 h-6 text-primary-600 dark:text-primary-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Add Alert Form */}
        {addingAlert && (
          <div className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 p-6 border dark:border-gray-500 mb-8">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Create Price Alert</h2>
            
            {error && (
              <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 text-red-600 dark:text-red-400 px-4 py-3 rounded-lg mb-4">
                {error}
              </div>
            )}

            <form onSubmit={handleAddAlert} className="space-y-4">
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
                    Condition *
                  </label>
                  <select
                    value={newCondition}
                    onChange={(e) => setNewCondition(e.target.value as 'above' | 'below')}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  >
                    <option value="above">Above</option>
                    <option value="below">Below</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Target Price *
                  </label>
                  <input
                    type="number"
                    value={newTargetPrice}
                    onChange={(e) => setNewTargetPrice(e.target.value)}
                    placeholder="150.00"
                    step="0.01"
                    min="0"
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Notes (optional)
                </label>
                <input
                  type="text"
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  placeholder="Why are you setting this alert?"
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                />
              </div>

              <div className="flex gap-3">
                <button
                  type="submit"
                  className="px-6 py-2 bg-primary-600 hover:bg-primary-700 dark:bg-primary-500 dark:hover:bg-primary-600 text-white rounded-lg font-medium transition-colors"
                >
                  Create Alert
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAddingAlert(false);
                    setNewTicker('');
                    setNewCondition('above');
                    setNewTargetPrice('');
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

        {/* Alerts Table */}
        {alerts.length === 0 ? (
          <div className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 p-12 border dark:border-gray-500 text-center">
            <div className="bg-gray-100 dark:bg-gray-600 rounded-full w-24 h-24 flex items-center justify-center mx-auto mb-6">
              <svg className="w-12 h-12 text-gray-400 dark:text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
            </div>
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">No Alerts Yet</h3>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              Create your first price alert to get notified when stocks hit your target
            </p>
            <button
              onClick={() => setAddingAlert(true)}
              className="px-6 py-3 bg-primary-600 hover:bg-primary-700 dark:bg-primary-500 dark:hover:bg-primary-600 text-white rounded-lg font-medium transition-colors"
            >
              Create Your First Alert
            </button>
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 border dark:border-gray-500 overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-600">
              <thead className="bg-gray-50 dark:bg-gray-800">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Ticker</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Condition</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Target Price</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Notes</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-700 divide-y divide-gray-200 dark:divide-gray-600">
                {alerts.map((alert) => (
                  <tr key={alert.id} className="hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-bold text-gray-900 dark:text-white">{alert.ticker}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {new Date(alert.created_at).toLocaleDateString()}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        {alert.condition === 'above' ? (
                          <>
                            <svg className="w-4 h-4 text-green-600 dark:text-green-400 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                            </svg>
                            <span className="text-sm text-green-600 dark:text-green-400 font-medium">Above</span>
                          </>
                        ) : (
                          <>
                            <svg className="w-4 h-4 text-red-600 dark:text-red-400 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                            <span className="text-sm text-red-600 dark:text-red-400 font-medium">Below</span>
                          </>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <div className="text-sm font-semibold text-gray-900 dark:text-white">
                        ${alert.target_price.toFixed(2)}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {alert.triggered_at ? (
                        <span className="px-2 py-1 text-xs font-semibold rounded-full bg-purple-100 dark:bg-purple-900/50 text-purple-800 dark:text-purple-200">
                          Triggered
                        </span>
                      ) : alert.is_active ? (
                        <span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 dark:bg-green-900/50 text-green-800 dark:text-green-200">
                          Active
                        </span>
                      ) : (
                        <span className="px-2 py-1 text-xs font-semibold rounded-full bg-gray-100 dark:bg-gray-600 text-gray-800 dark:text-gray-200">
                          Paused
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-600 dark:text-gray-400 max-w-xs truncate">
                        {alert.notes || '-'}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                      {!alert.triggered_at && (
                        <button
                          onClick={() => handleToggleAlert(alert.id, alert.is_active)}
                          className="text-primary-600 hover:text-primary-900 dark:text-primary-400 dark:hover:text-primary-300"
                        >
                          {alert.is_active ? 'Pause' : 'Resume'}
                        </button>
                      )}
                      <button
                        onClick={() => handleDeleteAlert(alert.id)}
                        className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300"
                      >
                        Delete
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

export default Alerts;