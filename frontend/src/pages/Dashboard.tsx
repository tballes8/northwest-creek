import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { authAPI, watchlistAPI, portfolioAPI, alertsAPI } from '../services/api';
import { User, WatchlistItem, PortfolioPosition, Alert } from '../types';

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    watchlistCount: 0,
    portfolioCount: 0,
    alertsCount: 0,
    portfolioValue: 0,
    portfolioPL: 0,
    portfolioPLPercent: 0,
  });

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      // Get current user
      const userResponse = await authAPI.getCurrentUser();
      setUser(userResponse.data);

      // Get watchlist count
      const watchlistResponse = await watchlistAPI.getAll();
      const watchlistCount = watchlistResponse.data.items?.length || 0;

      // Get portfolio data
      const portfolioResponse = await portfolioAPI.getAll();
      const portfolioData = portfolioResponse.data;
      const portfolioCount = portfolioData.positions?.length || 0;
      const portfolioValue = portfolioData.total_current_value || 0;
      const portfolioPL = portfolioData.total_profit_loss || 0;
      const portfolioPLPercent = portfolioData.total_profit_loss_percent || 0;

      // Get alerts count
      const alertsResponse = await alertsAPI.getAll();
      const alertsCount = alertsResponse.data.alerts?.filter((a: Alert) => a.is_active).length || 0;

      setStats({
        watchlistCount,
        portfolioCount,
        alertsCount,
        portfolioValue,
        portfolioPL,
        portfolioPLPercent,
      });
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
      // If unauthorized, redirect to login
      if ((error as any).response?.status === 401) {
        localStorage.removeItem('access_token');
        navigate('/login');
      }
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
      free: { bg: 'bg-gray-100', text: 'text-gray-800', label: 'Free' },
      pro: { bg: 'bg-primary-100', text: 'text-primary-800', label: 'Pro' },
      enterprise: { bg: 'bg-purple-100', text: 'text-purple-800', label: 'Enterprise' },
    };
    const badge = badges[tier as keyof typeof badges] || badges.free;
    return (
      <span className={`px-3 py-1 rounded-full text-sm font-semibold ${badge.bg} ${badge.text}`}>
        {badge.label}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top Navigation */}
      <nav className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <img 
                src="/images/logo.png" 
                alt="Northwest Creek" 
                className="h-10 w-10 mr-3"
              />
              <span className="text-xl font-bold text-primary-600">Northwest Creek</span>
            </div>
            
            {/* Navigation Links */}
            <div className="hidden md:flex items-center space-x-8">
              <Link to="/dashboard" className="text-primary-600 font-medium border-b-2 border-primary-600 pb-1">
                Dashboard
              </Link>
              <Link to="/watchlist" className="text-gray-600 hover:text-gray-900">
                Watchlist
              </Link>
              <Link to="/portfolio" className="text-gray-600 hover:text-gray-900">
                Portfolio
              </Link>
              <Link to="/alerts" className="text-gray-600 hover:text-gray-900">
                Alerts
              </Link>
              {user?.subscription_tier === 'enterprise' && (
                <Link to="/screener" className="text-gray-600 hover:text-gray-900">
                  Screener
                </Link>
              )}
            </div>

            {/* User Menu */}
            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-600">{user?.email}</span>
              {user && getTierBadge(user.subscription_tier)}
              <button
                onClick={handleLogout}
                className="text-gray-600 hover:text-gray-900 text-sm font-medium"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Welcome Section */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">
            Welcome back, {user?.full_name || 'Investor'}! 👋
          </h1>
          <p className="text-gray-600 mt-1">Here's your portfolio overview</p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {/* Portfolio Value */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Portfolio Value</p>
                <p className="text-2xl font-bold text-gray-900 mt-2">
                  ${stats.portfolioValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              </div>
              <div className="bg-primary-100 rounded-full p-3">
                <svg className="w-6 h-6 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
          </div>

          {/* P&L */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total P&L</p>
                <p className={`text-2xl font-bold mt-2 ${stats.portfolioPL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {stats.portfolioPL >= 0 ? '+' : ''}${Math.abs(stats.portfolioPL).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
                <p className={`text-sm mt-1 ${stats.portfolioPL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {stats.portfolioPL >= 0 ? '+' : ''}{stats.portfolioPLPercent.toFixed(2)}%
                </p>
              </div>
              <div className={`${stats.portfolioPL >= 0 ? 'bg-green-100' : 'bg-red-100'} rounded-full p-3`}>
                <svg className={`w-6 h-6 ${stats.portfolioPL >= 0 ? 'text-green-600' : 'text-red-600'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  {stats.portfolioPL >= 0 ? (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                  ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6" />
                  )}
                </svg>
              </div>
            </div>
          </div>

          {/* Watchlist */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Watchlist</p>
                <p className="text-2xl font-bold text-gray-900 mt-2">{stats.watchlistCount} stocks</p>
                <p className="text-sm text-gray-500 mt-1">
                  {user?.subscription_tier === 'free' ? '5 max' : user?.subscription_tier === 'pro' ? '50 max' : 'Unlimited'}
                </p>
              </div>
              <div className="bg-yellow-100 rounded-full p-3">
                <svg className="w-6 h-6 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                </svg>
              </div>
            </div>
          </div>

          {/* Alerts */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Active Alerts</p>
                <p className="text-2xl font-bold text-gray-900 mt-2">{stats.alertsCount} alerts</p>
                <p className="text-sm text-gray-500 mt-1">Monitoring prices</p>
              </div>
              <div className="bg-purple-100 rounded-full p-3">
                <svg className="w-6 h-6 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
              </div>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Link
              to="/watchlist"
              className="flex items-center p-4 border-2 border-gray-200 rounded-lg hover:border-primary-500 hover:bg-primary-50 transition-colors"
            >
              <div className="bg-primary-100 rounded-lg p-2 mr-3">
                <svg className="w-5 h-5 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </div>
              <span className="font-medium text-gray-700">Add to Watchlist</span>
            </Link>

            <Link
              to="/portfolio"
              className="flex items-center p-4 border-2 border-gray-200 rounded-lg hover:border-green-500 hover:bg-green-50 transition-colors"
            >
              <div className="bg-green-100 rounded-lg p-2 mr-3">
                <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </div>
              <span className="font-medium text-gray-700">Add Position</span>
            </Link>

            <Link
              to="/alerts"
              className="flex items-center p-4 border-2 border-gray-200 rounded-lg hover:border-purple-500 hover:bg-purple-50 transition-colors"
            >
              <div className="bg-purple-100 rounded-lg p-2 mr-3">
                <svg className="w-5 h-5 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </div>
              <span className="font-medium text-gray-700">Create Alert</span>
            </Link>

            <Link
              to="/search"
              className="flex items-center p-4 border-2 border-gray-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors"
            >
              <div className="bg-blue-100 rounded-lg p-2 mr-3">
                <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <span className="font-medium text-gray-700">Search Stocks</span>
            </Link>
          </div>
        </div>

        {/* Recent Activity / Empty State */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Portfolio Summary */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Portfolio Overview</h2>
              <Link to="/portfolio" className="text-sm text-primary-600 hover:text-primary-700 font-medium">
                View all →
              </Link>
            </div>
            {stats.portfolioCount > 0 ? (
              <div className="space-y-3">
                <p className="text-sm text-gray-600">{stats.portfolioCount} position(s) tracked</p>
                <div className="border-t pt-3">
                  <Link 
                    to="/portfolio"
                    className="text-primary-600 hover:text-primary-700 text-sm font-medium"
                  >
                    Manage your positions →
                  </Link>
                </div>
              </div>
            ) : (
              <div className="text-center py-8">
                <div className="bg-gray-100 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                </div>
                <p className="text-gray-600 mb-4">No portfolio positions yet</p>
                <Link
                  to="/portfolio"
                  className="inline-block bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
                >
                  Add Your First Position
                </Link>
              </div>
            )}
          </div>

          {/* Watchlist Summary */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Watchlist</h2>
              <Link to="/watchlist" className="text-sm text-primary-600 hover:text-primary-700 font-medium">
                View all →
              </Link>
            </div>
            {stats.watchlistCount > 0 ? (
              <div className="space-y-3">
                <p className="text-sm text-gray-600">{stats.watchlistCount} stock(s) watched</p>
                <div className="border-t pt-3">
                  <Link 
                    to="/watchlist"
                    className="text-primary-600 hover:text-primary-700 text-sm font-medium"
                  >
                    View your watchlist →
                  </Link>
                </div>
              </div>
            ) : (
              <div className="text-center py-8">
                <div className="bg-gray-100 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                  </svg>
                </div>
                <p className="text-gray-600 mb-4">No stocks in watchlist</p>
                <Link
                  to="/watchlist"
                  className="inline-block bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
                >
                  Add Your First Stock
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* Upgrade CTA (for Free users) */}
        {user?.subscription_tier === 'free' && (
          <div className="mt-8 bg-gradient-to-r from-primary-600 to-primary-700 rounded-lg shadow-lg p-8 text-center">
            <h3 className="text-2xl font-bold text-white mb-2">
              Unlock More Power with Pro
            </h3>
            <p className="text-primary-100 mb-6">
              Track 50 stocks, 50 positions, and 50 alerts. Only $29/month.
            </p>
            <button className="bg-white text-primary-600 px-8 py-3 rounded-lg font-semibold hover:bg-gray-100 transition-colors">
              Upgrade to Pro
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;