import React from 'react';
import { Link } from 'react-router-dom';
import ThemeToggle from '../components/ThemeToggle';

const Landing: React.FC = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 via-white to-emerald-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      {/* Navbar */}
      <nav className="bg-gray-800 dark:bg-gray-900 shadow-sm border-b border-gray-700 dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <img 
                src="/images/logo.png" 
                alt="Northwest Creek LLC" 
                className="h-12 w-12 mr-3"
              />
              <span className="text-4xl font-bold text-primary-600 dark:text-primary-400">Northwest Creek</span>
            </div>
            <div className="flex items-center space-x-4">
              <Link
                to="/login"
                className="text-gray-700 dark:text-gray-300 hover:text-primary-600 dark:hover:text-primary-400 px-3 py-2 rounded-md text-sm font-medium transition-colors"
              >
                Sign In
              </Link>
              <Link
                to="/register"
                className="bg-primary-600 hover:bg-primary-700 dark:bg-primary-500 dark:hover:bg-primary-600 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors shadow-sm"
              >
                Get Started Free
              </Link>

              <ThemeToggle />  {/* ADD THIS */}
            
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-16">
        <div className="text-center">
          <h1 className="text-5xl font-extrabold text-gray-900 dark:text-white sm:text-6xl">
            <span className="block">Professional Stock Analysis</span>
            <span className="block text-primary-600 dark:text-primary-400 mt-2">For Retail Investors</span>
          </h1>
          <p className="mt-6 max-w-2xl mx-auto text-xl text-gray-600 dark:text-gray-300">
            Track your portfolio, get price alerts, and make informed decisions with 
            professional-grade technical analysis tools.
          </p>
          <div className="mt-10 flex justify-center gap-4">
            <Link
              to="/register"
              className="px-8 py-4 bg-primary-600 hover:bg-primary-700 dark:bg-primary-500 dark:hover:bg-primary-600 text-white text-lg font-semibold rounded-lg shadow-lg transition-colors"
            >
              Start Free Trial
            </Link>
            <Link
              to="/login"
              className="px-8 py-4 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 text-primary-600 dark:text-primary-400 text-lg font-semibold rounded-lg shadow-lg border-2 border-primary-600 dark:border-primary-500 transition-colors"
            >
              Sign In
            </Link>
          </div>
        </div>

        {/* Features Grid */}
        <div className="mt-32">
          <h2 className="text-3xl font-bold text-center text-gray-900 dark:text-white mb-16">
            Everything You Need to Succeed
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Feature 1 */}
            <div className="bg-white dark:bg-gray-600 p-8 rounded-xl shadow-lg dark:shadow-gray-200/50 hover:shadow-xl transition-shadow border dark:border-gray-300">
              <div className="w-12 h-12 bg-primary-100 dark:bg-primary-900/30 rounded-lg flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-primary-600 dark:text-primary-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Technical Analysis</h3>
              <p className="text-gray-600 dark:text-gray-300">
                RSI, MACD, Moving Averages, Bollinger Bands with clear trading signals.
              </p>
            </div>

            {/* Feature 2 */}
            <div className="bg-white dark:bg-gray-600 p-8 rounded-xl shadow-lg dark:shadow-gray-200/50 hover:shadow-xl transition-shadow border dark:border-gray-300">
              <div className="w-12 h-12 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-emerald-600 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Portfolio Tracking</h3>
              <p className="text-gray-600 dark:text-gray-300">
                Track multiple purchase lots and see your P&L in real-time.
              </p>
            </div>

            {/* Feature 3 */}
            <div className="bg-white dark:bg-gray-600 p-8 rounded-xl shadow-lg dark:shadow-gray-200/50 hover:shadow-xl transition-shadow border dark:border-gray-300">
              <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-purple-600 dark:text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Price Alerts</h3>
              <p className="text-gray-600 dark:text-gray-300">
                Never miss a breakout or buying opportunity with custom alerts.
              </p>
            </div>
          </div>
        </div>

        {/* Pricing Section */}
        <div className="mt-32">
          <h2 className="text-3xl font-bold text-center text-gray-900 dark:text-white mb-4">
            Simple, Transparent Pricing
          </h2>
          <p className="text-center text-gray-600 dark:text-gray-400 mb-16">
            Start free, upgrade when you need more
          </p>
          
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 max-w-25xl mx-auto">
            {/* Free Tier */}
            <div className="bg-white dark:bg-gray-600 p-8 rounded-xl shadow-lg dark:shadow-gray-200/50 hover:shadow-xl transition-shadow border dark:border-gray-300">
              <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Free</h3>
              <div className="mb-6">
                <span className="text-4xl font-bold text-gray-900 dark:text-white">$0</span>
                <span className="text-gray-600 dark:text-gray-400">/month</span>
              </div>
              <ul className="space-y-3 mb-8">
                <li className="flex items-start">
                  <svg className="w-5 h-5 text-emerald-500 dark:text-emerald-400 mr-2 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-gray-700 dark:text-gray-300">5 watchlist stocks</span>
                </li>
                <li className="flex items-start">
                  <svg className="w-5 h-5 text-emerald-500 dark:text-emerald-400 mr-2 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-gray-700 dark:text-gray-300">5 portfolio entries</span>
                </li>
                <li className="flex items-start">
                  <svg className="w-5 h-5 text-emerald-500 dark:text-emerald-400 mr-2 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-gray-700 dark:text-gray-300">5 technical indicators</span>
                </li>
              </ul>
              <Link
                to="/register"
                className="block w-full text-center bg-primary-600 hover:bg-primary-700 dark:bg-primary-500 dark:hover:bg-primary-600 text-white font-semibold py-3 rounded-lg transition-colors"
              >
                Try For Free
              </Link>
            </div>

            {/* Casual Investor Tier */}
            <div className="bg-white dark:bg-gray-600 p-8 rounded-xl shadow-lg dark:shadow-gray-200/50 hover:shadow-xl transition-shadow border dark:border-gray-300 relative transform scale-105">
              <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                <span className="bg-primary-600 dark:bg-primary-500 text-white text-sm font-bold px-4 py-1 rounded-full">
                  POPULAR
                </span>
              </div>
              <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Casual Investor</h3>
              <div className="mb-6">
                <span className="text-4xl font-bold text-gray-900 dark:text-white">$20</span>
                <span className="text-gray-600 dark:text-gray-400">/month</span>
              </div>
              <ul className="space-y-3 mb-8">
                <li className="flex items-start">
                  <svg className="w-5 h-5 text-emerald-500 dark:text-emerald-400 mr-2 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-gray-700 dark:text-gray-300">20 watchlist stocks</span>
                </li>
                <li className="flex items-start">
                  <svg className="w-5 h-5 text-emerald-500 dark:text-emerald-400 mr-2 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-gray-700 dark:text-gray-300">20 portfolio entries</span>
                </li>
                <li className="flex items-start">
                  <svg className="w-5 h-5 text-emerald-500 dark:text-emerald-400 mr-2 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-gray-700 dark:text-gray-300">5 Stock Technical Analysis Data per week</span>
                </li>
                <li className="flex items-start">
                  <svg className="w-5 h-5 text-emerald-500 dark:text-emerald-400 mr-2 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-gray-700 dark:text-gray-300">5 DCF Valuations per week</span>
                </li>                
                <li className="flex items-start">
                  <svg className="w-5 h-5 text-emerald-500 dark:text-emerald-400 mr-2 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-gray-700 dark:text-gray-300">Priority support</span>
                </li>
              </ul>
              <Link
                to="/register"
                className="block w-full text-center bg-primary-600 hover:bg-primary-700 dark:bg-primary-500 dark:hover:bg-primary-600 text-white font-semibold py-3 rounded-lg transition-colors"
              >
                Get Started Now
              </Link>
            </div>

            {/* Active Investor Tier */}
            <div className="bg-white dark:bg-gray-600 p-8 rounded-xl shadow-lg dark:shadow-gray-200/50 hover:shadow-xl transition-shadow border dark:border-gray-300">
              <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Active Investor</h3>
              <div className="mb-6">
                <span className="text-4xl font-bold text-gray-900 dark:text-white">$40</span>
                <span className="text-gray-600 dark:text-gray-400">/month</span>
              </div>
              <ul className="space-y-3 mb-8">
                <li className="flex items-start">
                  <svg className="w-5 h-5 text-emerald-500 dark:text-emerald-400 mr-2 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-gray-700 dark:text-gray-300">45 watchlist stocks</span>
                </li>
                <li className="flex items-start">
                  <svg className="w-5 h-5 text-emerald-500 dark:text-emerald-400 mr-2 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-gray-700 dark:text-gray-300">45 portfolio entries</span>
                </li>
                <li className="flex items-start">
                  <svg className="w-5 h-5 text-emerald-500 dark:text-emerald-400 mr-2 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-gray-700 dark:text-gray-300">45 Price Alerts</span>
                </li>
                <li className="flex items-start">
                  <svg className="w-5 h-5 text-emerald-500 dark:text-emerald-400 mr-2 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-gray-700 dark:text-gray-300">5 Stock Technical Analysis Data per day</span>
                </li>
                <li className="flex items-start">
                  <svg className="w-5 h-5 text-emerald-500 dark:text-emerald-400 mr-2 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-gray-700 dark:text-gray-300">5 DCF Valuations per day</span>
                </li>
                <li className="flex items-start">
                  <svg className="w-5 h-5 text-emerald-500 dark:text-emerald-400 mr-2 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-gray-700 dark:text-gray-300">Priority support</span>
                </li>
              </ul>              
              <Link
                to="/register"
                className="block w-full text-center bg-primary-600 hover:bg-primary-700 dark:bg-primary-500 dark:hover:bg-primary-600 text-white font-semibold py-3 rounded-lg transition-colors"
              >
                Get Active
              </Link>
            </div>

            {/* Unlimited Investor Tier */}
            <div className="bg-white dark:bg-gray-600 p-8 rounded-xl shadow-lg dark:shadow-gray-200/50 hover:shadow-xl transition-shadow border dark:border-gray-300">
              <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Unlimited</h3>
              <div className="mb-6">
                <span className="text-4xl font-bold text-gray-900 dark:text-white">$100</span>
                <span className="text-gray-600 dark:text-gray-400">/month</span>
              </div>
              <ul className="space-y-3 mb-8">
                <li className="flex items-start">
                  <svg className="w-5 h-5 text-emerald-500 dark:text-emerald-400 mr-2 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-gray-700 dark:text-gray-300">Unlimited watchlist stocks</span>
                </li>
                <li className="flex items-start">
                  <svg className="w-5 h-5 text-emerald-500 dark:text-emerald-400 mr-2 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-gray-700 dark:text-gray-300">Unlimited portfolio entries</span>
                </li>
                <li className="flex items-start">
                  <svg className="w-5 h-5 text-emerald-500 dark:text-emerald-400 mr-2 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-gray-700 dark:text-gray-300">Unlimited Stock Technical Analysis Data</span>
                </li>
                <li className="flex items-start">
                  <svg className="w-5 h-5 text-emerald-500 dark:text-emerald-400 mr-2 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-gray-700 dark:text-gray-300">Unlimited DCF Valuations</span>
                </li>                
                <li className="flex items-start">
                  <svg className="w-5 h-5 text-emerald-500 dark:text-emerald-400 mr-2 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-gray-700 dark:text-gray-300">Unlimited Price Alerts</span>
                </li>                
                <li className="flex items-start">
                  <svg className="w-5 h-5 text-emerald-500 dark:text-emerald-400 mr-2 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-gray-700 dark:text-gray-300">Priority support</span>
                </li>
              </ul>              
              <Link
                to="/register"
                className="block w-full text-center bg-primary-600 hover:bg-primary-700 dark:bg-primary-500 dark:hover:bg-primary-600 text-white font-semibold py-3 rounded-lg transition-colors"
              >
                Go Unlimited
              </Link>
            </div>
          </div>
        </div>

        {/* CTA Section */}
        <div className="mt-32 bg-primary-600 dark:bg-primary-700 rounded-2xl p-12 text-center">
          <h2 className="text-3xl font-bold text-white mb-4">
            Ready to Take Control of Your Investments?
          </h2>
          <p className="text-xl text-primary-100 dark:text-primary-200 mb-8">
            Join investors making smarter decisions
          </p>
          <Link
            to="/register"
            className="inline-block px-8 py-4 bg-white hover:bg-gray-100 text-primary-600 text-lg font-semibold rounded-lg shadow-lg transition-colors"
          >
            Start Your Free Trial
          </Link>
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-forest-800 dark:bg-gray-950 text-gray-300 dark:text-gray-400 py-12 mt-32">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <div className="flex items-center mb-4 md:mb-0">
              <img 
                src="/images/logo.png" 
                alt="Northwest Creek LLC" 
                className="h-12 w-12 mr-3"
              />
              <div>
                <p className="text-xl font-bold text-white">Northwest Creek</p>
                <p className="text-sm">Professional stock analysis for retail investors</p>
              </div>
            </div>
            <div className="text-center md:text-right">
              <p className="text-sm">© 2026 Northwest Creek LLC. All rights reserved.</p>
              <p className="text-sm mt-1">Post Falls, Idaho</p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Landing;