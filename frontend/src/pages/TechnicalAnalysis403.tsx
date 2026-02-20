import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import ThemeToggle from '../components/ThemeToggle';
import { User } from '../types';

interface TechnicalAnalysis403Props {
  user: User | null;
  onLogout: () => void;
}

const TechnicalAnalysis403: React.FC<TechnicalAnalysis403Props> = ({ user, onLogout }) => {
  const navigate = useNavigate();

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

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Navigation */}
      <nav className="bg-white dark:bg-gray-800 shadow-sm border-b dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-8">
              <Link to="/dashboard" className="text-2xl font-bold text-primary-600 dark:text-primary-400">
                📈 StockAnalyzer
              </Link>
              <div className="hidden md:flex space-x-4">
                <Link to="/dashboard" className="text-gray-600 dark:text-gray-300 hover:text-primary-600 dark:hover:text-primary-400">
                  Dashboard
                </Link>
                <Link to="/watchlist" className="text-gray-600 dark:text-gray-300 hover:text-primary-600 dark:hover:text-primary-400">
                  Watchlist
                </Link>
                <Link to="/technical-analysis" className="text-primary-600 dark:text-primary-400 font-semibold">
                  Technical Analysis
                </Link>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              {user && getTierBadge(user.subscription_tier)}
              <ThemeToggle />
              <button
                onClick={onLogout}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-primary-600 dark:hover:text-primary-400"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* 403 Error Section */}
        <div className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 p-8 border dark:border-gray-500 mb-8">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-primary-500 to-purple-600 text-white text-3xl font-bold mb-4">
              403
            </div>
            <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
              Access Restricted
            </h1>
            <p className="text-xl text-gray-600 dark:text-gray-400 mb-2">
              Technical Analysis requires a paid subscription
            </p>
            {user && (
              <p className="text-lg text-gray-500 dark:text-gray-400">
                Your current plan: {getTierBadge(user.subscription_tier)}
              </p>
            )}
          </div>

          <div className="max-w-2xl mx-auto">
            <div className="bg-gradient-to-br from-primary-50 to-purple-50 dark:from-gray-800 dark:to-gray-800 rounded-lg p-6 border border-primary-200 dark:border-gray-600 mb-6">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-3">
                🚀 Unlock Advanced Technical Analysis
              </h2>
              <p className="text-gray-700 dark:text-gray-300 mb-4">
                Upgrade to Professional to access powerful technical indicators and real-time market analysis tools:
              </p>
              <ul className="space-y-2 text-gray-700 dark:text-gray-300 mb-6">
                <li className="flex items-start">
                  <span className="text-green-500 mr-2">✓</span>
                  <span>RSI (Relative Strength Index) with buy/sell signals</span>
                </li>
                <li className="flex items-start">
                  <span className="text-green-500 mr-2">✓</span>
                  <span>MACD (Moving Average Convergence Divergence) analysis</span>
                </li>
                <li className="flex items-start">
                  <span className="text-green-500 mr-2">✓</span>
                  <span>Multiple Moving Averages (20, 50, 200-day)</span>
                </li>
                <li className="flex items-start">
                  <span className="text-green-500 mr-2">✓</span>
                  <span>Bollinger Bands for volatility tracking</span>
                </li>
                <li className="flex items-start">
                  <span className="text-green-500 mr-2">✓</span>
                  <span>Interactive charts with technical overlays</span>
                </li>
                <li className="flex items-start">
                  <span className="text-green-500 mr-2">✓</span>
                  <span>Automated signal detection and alerts</span>
                </li>
              </ul>
              <div className="flex flex-col sm:flex-row gap-4">
                <Link
                  to="/pricing"
                  className="flex-1 px-6 py-3 bg-gradient-to-r from-primary-600 to-purple-600 text-white font-semibold rounded-lg hover:from-primary-700 hover:to-purple-700 transition-all text-center shadow-lg"
                >
                  Upgrade to Professional
                </Link>
                <Link
                  to="/dashboard"
                  className="flex-1 px-6 py-3 bg-gray-200 dark:bg-gray-600 text-gray-900 dark:text-white font-semibold rounded-lg hover:bg-gray-300 dark:hover:bg-gray-500 transition-all text-center"
                >
                  Back to Dashboard
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* Educational Content - How to Use Technical Analysis */}
        <div className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 p-8 border dark:border-gray-500">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
            How to Use Technical Analysis
          </h2>
          
          <div className="space-y-6">
            <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                📊 RSI (Relative Strength Index)
              </h3>
              <p className="text-gray-600 dark:text-gray-400">
                Measures momentum on a scale of 0-100. Below 30 = oversold (potential buy), Above 70 = overbought (potential sell).
              </p>
            </div>

            <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                📈 MACD (Moving Average Convergence Divergence)
              </h3>
              <p className="text-gray-600 dark:text-gray-400">
                Shows trend direction and momentum. Bullish = upward momentum, Bearish = downward momentum. When MACD line crosses above signal line = buy signal.
              </p>
            </div>

            <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                📉 Moving Averages
              </h3>
              <p className="text-gray-600 dark:text-gray-400">
                Average price over time. Price above MA = uptrend, Price below MA = downtrend. 20-day shows short-term trend, 50-day shows medium-term trend.
              </p>
            </div>

            <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                🎯 Bollinger Bands
              </h3>
              <p className="text-gray-600 dark:text-gray-400">
                Show volatility. When price touches lower band = potential bounce opportunity. When price touches upper band = potential reversal down.
              </p>
            </div>
          </div>

          {/* Comparison Table */}
          <div className="mt-8">
            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
              What You Get with Professional
            </h3>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-600">
                <thead className="bg-gray-50 dark:bg-gray-800">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Feature
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Free
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Casual Investor
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Active Investor
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Professional Investor
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-700 divide-y divide-gray-200 dark:divide-gray-600">
                  <tr>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                      Basic Stock Search
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-center">
                      <span className="text-green-500">✓</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-center">
                      <span className="text-green-500">✓</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-center">
                      <span className="text-green-500">✓</span>
                    </td>
                  </tr>
                  <tr className="bg-gray-50 dark:bg-gray-800">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                      Watchlist
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-center">
                      <span className="text-gray-400">—</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-center">
                      <span className="text-green-500">✓</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-center">
                      <span className="text-green-500">✓</span>
                    </td>
                  </tr>
                  <tr>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                      Technical Analysis
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-center">
                      <span className="text-gray-400">—</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-center">
                      <span className="text-gray-400">—</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-center">
                      <span className="text-green-500">✓</span>
                    </td>
                  </tr>
                  <tr className="bg-gray-50 dark:bg-gray-800">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                      Advanced Charts
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-center">
                      <span className="text-gray-400">—</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-center">
                      <span className="text-gray-400">—</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-center">
                      <span className="text-green-500">✓</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TechnicalAnalysis403;
