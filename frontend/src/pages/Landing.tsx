import React from 'react';
import { Link } from 'react-router-dom';
import ThemeToggle from '../components/ThemeToggle';

const Landing: React.FC = () => {

  const scrollToPricing = (e: React.MouseEvent) => {
    e.preventDefault();
    const el = document.getElementById('pricing');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  // Reusable checkmark icon
  const Check = () => (
    <svg className="w-5 h-5 text-emerald-500 dark:text-emerald-400 mr-2 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 via-white to-emerald-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      {/* Navbar */}
      <nav className="bg-gray-800 dark:bg-gray-900 shadow-sm border-b border-gray-700 dark:border-gray-700 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <img 
                src="/images/logo.png" 
                alt="Northwest Creek LLC" 
                className="h-12 w-12 mr-3"
              />
              <span className="text-xl font-bold text-primary-400 dark:text-primary-400" style={{ fontFamily: "'Caveat', cursive", fontSize: '1.65rem' }}>Northwest Creek</span>
            </div>
            <div className="flex items-center space-x-4">
              <Link
                to="/login"
                className="text-gray-700 dark:text-gray-300 hover:text-primary-600 dark:hover:text-primary-400 px-3 py-2 rounded-md text-sm font-medium transition-colors"
              >
                Sign In
              </Link>
              <button
                onClick={scrollToPricing}
                className="bg-primary-600 hover:bg-primary-700 dark:bg-primary-500 dark:hover:bg-primary-600 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors shadow-sm cursor-pointer"
              >
                Get Started
              </button>
              <ThemeToggle />
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
          <p className="mt-6 max-w-3xl mx-auto text-xl text-gray-600 dark:text-gray-300">
            Real-time market data, 15+ technical indicators, DCF valuation models, live portfolio tracking, 
            and price alerts — everything you need to make informed investment decisions, all in one platform.
          </p>
          <div className="mt-10 flex justify-center gap-4">
            <button
              onClick={scrollToPricing}
              className="px-8 py-4 bg-primary-600 hover:bg-primary-700 dark:bg-primary-500 dark:hover:bg-primary-600 text-white text-lg font-semibold rounded-lg shadow-lg transition-colors cursor-pointer"
            >
              Choose a Plan
            </button>
            <Link
              to="/login"
              className="px-8 py-4 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 text-primary-600 dark:text-primary-400 text-lg font-semibold rounded-lg shadow-lg border-2 border-primary-600 dark:border-primary-500 transition-colors"
            >
              Sign In
            </Link>
          </div>
        </div>

        {/* Platform Highlights */}
        <div className="mt-20">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 max-w-4xl mx-auto text-center">
            <div>
              <div className="text-3xl font-extrabold text-primary-600 dark:text-primary-400">15+</div>
              <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">Technical Indicators</div>
            </div>
            <div>
              <div className="text-3xl font-extrabold text-primary-600 dark:text-primary-400">Live</div>
              <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">WebSocket Market Data</div>
            </div>
            <div>
              <div className="text-3xl font-extrabold text-primary-600 dark:text-primary-400">DCF</div>
              <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">Valuation Models</div>
            </div>
            <div>
              <div className="text-3xl font-extrabold text-primary-600 dark:text-primary-400">24/7</div>
              <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">Price Alerts</div>
            </div>
          </div>
        </div>

        {/* Core Features Grid */}
        <div className="mt-32">
          <h2 className="text-3xl font-bold text-center text-gray-900 dark:text-white mb-4">
            Everything You Need to Succeed
          </h2>
          <p className="text-center text-gray-600 dark:text-gray-400 mb-16 max-w-2xl mx-auto">
            Institutional-grade analysis tools designed for retail investors — no Bloomberg terminal required.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Feature 1 — Technical Analysis */}
            <div className="bg-white dark:bg-gray-600 p-8 rounded-xl shadow-lg dark:shadow-gray-200/50 hover:shadow-xl transition-shadow border dark:border-gray-300">
              <div className="w-12 h-12 bg-primary-100 dark:bg-primary-900/30 rounded-lg flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-primary-600 dark:text-primary-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Technical Analysis</h3>
              <p className="text-gray-600 dark:text-gray-300">
                15+ professional indicators including RSI, MACD, Bollinger Bands, Stochastic Oscillator, 
                ADX, Ichimoku Cloud, VWAP, and more — with clear buy/sell signals and educational descriptions 
                for every indicator.
              </p>
            </div>

            {/* Feature 2 — Portfolio Tracking */}
            <div className="bg-white dark:bg-gray-600 p-8 rounded-xl shadow-lg dark:shadow-gray-200/50 hover:shadow-xl transition-shadow border dark:border-gray-300">
              <div className="w-12 h-12 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-emerald-600 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Portfolio Tracking</h3>
              <p className="text-gray-600 dark:text-gray-300">
                Track multiple purchase lots per stock, monitor real-time P&L, and view your sector 
                diversification with interactive charts. See your total portfolio value update live 
                via WebSocket connections.
              </p>
            </div>

            {/* Feature 3 — Price Alerts */}
            <div className="bg-white dark:bg-gray-600 p-8 rounded-xl shadow-lg dark:shadow-gray-200/50 hover:shadow-xl transition-shadow border dark:border-gray-300">
              <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-purple-600 dark:text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Price Alerts</h3>
              <p className="text-gray-600 dark:text-gray-300">
                Set custom price targets and get notified instantly when stocks hit your levels.
                Never miss a breakout or buying opportunity — alerts work 24/7 so you're always 
                in the loop.
              </p>
            </div>
          </div>
        </div>

        {/* Detailed Feature Sections */}
        <div className="mt-32 space-y-24">
          
          {/* Live Market Data Section */}
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <div className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300 mb-4">
                🟢 LIVE
              </div>
              <h3 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
                Real-Time Market Data
              </h3>
              <p className="text-lg text-gray-600 dark:text-gray-300 mb-6">
                See prices update in real-time with WebSocket connections — no refreshing required. 
                Your watchlist and portfolio values update the moment the market moves.
              </p>
              <ul className="space-y-3">
                <li className="flex items-start"><Check /><span className="text-gray-700 dark:text-gray-300">Live price streaming via WebSocket for your entire watchlist</span></li>
                <li className="flex items-start"><Check /><span className="text-gray-700 dark:text-gray-300">Real-time portfolio value with automatic P&L calculations</span></li>
                <li className="flex items-start"><Check /><span className="text-gray-700 dark:text-gray-300">Market status badges — know when markets are open, closed, or in pre/after-hours</span></li>
                <li className="flex items-start"><Check /><span className="text-gray-700 dark:text-gray-300">Daily top gainers and sector-based stock discovery</span></li>
                <li className="flex items-start"><Check /><span className="text-gray-700 dark:text-gray-300">Company news feed with sentiment analysis</span></li>
              </ul>
            </div>
            <div className="bg-gray-900 rounded-xl p-6 shadow-2xl border border-gray-700">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-3 h-3 rounded-full bg-red-500"></div>
                <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                <div className="w-3 h-3 rounded-full bg-green-500"></div>
                <span className="text-gray-400 text-sm ml-2">My Watchlist</span>
                <span className="ml-auto text-xs bg-green-900/50 text-green-400 px-2 py-0.5 rounded-full">● LIVE</span>
              </div>
              <div className="space-y-3">
                {[
                  { ticker: 'AAPL', price: '$242.58', change: '+1.24%', up: true },
                  { ticker: 'TSLA', price: '$338.12', change: '+3.87%', up: true },
                  { ticker: 'MSFT', price: '$428.90', change: '-0.42%', up: false },
                  { ticker: 'NVDA', price: '$142.67', change: '+5.21%', up: true },
                  { ticker: 'AMZN', price: '$219.44', change: '+0.98%', up: true },
                ].map(s => (
                  <div key={s.ticker} className="flex justify-between items-center py-2 border-b border-gray-700/50">
                    <span className="text-primary-400 font-mono font-bold">{s.ticker}</span>
                    <span className="text-white font-medium">{s.price}</span>
                    <span className={`font-medium ${s.up ? 'text-green-400' : 'text-red-400'}`}>{s.change}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Technical Analysis Detail Section */}
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div className="order-2 md:order-1 bg-gray-900 rounded-xl p-6 shadow-2xl border border-gray-700">
              <div className="text-gray-400 text-sm mb-3">Technical Analysis — AAPL</div>
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-white font-medium">Overall Outlook</span>
                  <span className="bg-green-900/50 text-green-400 px-3 py-1 rounded-full text-sm font-bold">🟢 BULLISH</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { name: 'RSI (14)', val: '58.3', signal: 'Neutral' },
                    { name: 'MACD', val: '+2.14', signal: 'Bullish' },
                    { name: 'Stochastic', val: '72.1', signal: 'Neutral' },
                    { name: 'ADX', val: '31.5', signal: 'Trending' },
                    { name: 'Bollinger', val: 'Mid-Band', signal: 'Neutral' },
                    { name: 'Ichimoku', val: 'Above Cloud', signal: 'Bullish' },
                  ].map(i => (
                    <div key={i.name} className="bg-gray-800 rounded-lg p-3">
                      <div className="text-gray-400 text-xs">{i.name}</div>
                      <div className="text-white font-bold text-sm">{i.val}</div>
                      <div className={`text-xs font-medium ${i.signal === 'Bullish' || i.signal === 'Trending' ? 'text-green-400' : 'text-gray-400'}`}>{i.signal}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="order-1 md:order-2">
              <div className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-primary-100 dark:bg-primary-900/30 text-primary-800 dark:text-primary-300 mb-4">
                📈 15+ Indicators
              </div>
              <h3 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
                Professional Technical Analysis
              </h3>
              <p className="text-lg text-gray-600 dark:text-gray-300 mb-6">
                Go beyond basic charts with a full suite of technical indicators used by professional traders. 
                Each indicator comes with clear explanations so you understand exactly what the data is telling you.
              </p>
              <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                {[
                  'RSI (Relative Strength Index)',
                  'MACD & Signal Line',
                  'Bollinger Bands',
                  'Moving Averages (SMA/EMA)',
                  'VWAP',
                  'Stochastic Oscillator',
                  'ADX (Trend Strength)',
                  'CCI & Rate of Change',
                  'ATR (Volatility)',
                  'Keltner Channels',
                  'Parabolic SAR',
                  'Ichimoku Cloud',
                  'Donchian Channels',
                  'OBV & A/D Line',
                ].map(ind => (
                  <div key={ind} className="flex items-center py-1">
                    <Check />
                    <span className="text-sm text-gray-700 dark:text-gray-300">{ind}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* DCF Valuation Section */}
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <div className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-300 mb-4">
                💰 Valuation
              </div>
              <h3 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
                DCF Valuation Models
              </h3>
              <p className="text-lg text-gray-600 dark:text-gray-300 mb-6">
                Run Discounted Cash Flow analyses on any stock to estimate intrinsic value. 
                The system auto-suggests growth rates, discount rates, and projection periods based 
                on the company's sector, size, and financial profile — or customize every assumption yourself.
              </p>
              <ul className="space-y-3">
                <li className="flex items-start"><Check /><span className="text-gray-700 dark:text-gray-300">AI-suggested assumptions based on sector and company size</span></li>
                <li className="flex items-start"><Check /><span className="text-gray-700 dark:text-gray-300">Intrinsic value per share with margin of safety</span></li>
                <li className="flex items-start"><Check /><span className="text-gray-700 dark:text-gray-300">Year-by-year projected cash flows and present values</span></li>
                <li className="flex items-start"><Check /><span className="text-gray-700 dark:text-gray-300">Clear Buy / Hold / Overvalued recommendations</span></li>
              </ul>
            </div>
            <div className="bg-gray-900 rounded-xl p-6 shadow-2xl border border-gray-700">
              <div className="text-gray-400 text-sm mb-3">DCF Valuation — MSFT</div>
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  <div className="text-center">
                    <div className="text-gray-400 text-xs">Current Price</div>
                    <div className="text-white font-bold text-lg">$428.90</div>
                  </div>
                  <div className="text-center">
                    <div className="text-gray-400 text-xs">Intrinsic Value</div>
                    <div className="text-primary-400 font-bold text-lg">$502.14</div>
                  </div>
                  <div className="text-center">
                    <div className="text-gray-400 text-xs">Margin of Safety</div>
                    <div className="text-green-400 font-bold text-lg">+17.1%</div>
                  </div>
                </div>
                <div className="bg-green-900/30 border border-green-700 rounded-lg p-3 text-center">
                  <span className="text-green-400 font-bold">✅ Potentially Undervalued</span>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="bg-gray-800 rounded p-2"><span className="text-gray-400">Growth Rate:</span> <span className="text-white">12.5%</span></div>
                  <div className="bg-gray-800 rounded p-2"><span className="text-gray-400">Discount Rate:</span> <span className="text-white">9.0%</span></div>
                  <div className="bg-gray-800 rounded p-2"><span className="text-gray-400">Terminal Growth:</span> <span className="text-white">2.5%</span></div>
                  <div className="bg-gray-800 rounded p-2"><span className="text-gray-400">Projection:</span> <span className="text-white">10 Years</span></div>
                </div>
              </div>
            </div>
          </div>

          {/* Additional Features */}
          <div>
            <h2 className="text-3xl font-bold text-center text-gray-900 dark:text-white mb-12">
              And Much More
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {[
                {
                  icon: '📊',
                  title: 'Sector Diversification',
                  desc: 'Interactive pie charts showing your portfolio breakdown by sector with clickable exploration.'
                },
                {
                  icon: '⭐',
                  title: 'Smart Watchlist',
                  desc: 'Track stocks with live prices, target prices, notes, and one-click access to analysis tools.'
                },
                {
                  icon: '📰',
                  title: 'News & Sentiment',
                  desc: 'Latest news for every stock with AI-powered sentiment analysis (positive, negative, neutral).'
                },
                {
                  icon: '⚠️',
                  title: 'Warrant Detection',
                  desc: 'Automatic warrant detection with warnings about derivative risks and links to underlying stock.'
                },
              ].map(f => (
                <div key={f.title} className="bg-white dark:bg-gray-600 p-6 rounded-xl shadow-lg dark:shadow-gray-200/50 border dark:border-gray-300 text-center">
                  <div className="text-3xl mb-3">{f.icon}</div>
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">{f.title}</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-300">{f.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Pricing Section */}
        <div className="mt-32 scroll-mt-20" id="pricing">
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
                <li className="flex items-start"><Check /><span className="text-gray-700 dark:text-gray-300">5 watchlist stocks</span></li>
                <li className="flex items-start"><Check /><span className="text-gray-700 dark:text-gray-300">5 portfolio entries</span></li>
                <li className="flex items-start"><Check /><span className="text-gray-700 dark:text-gray-300">5 stock reviews (total)</span></li>
                <li className="flex items-start"><Check /><span className="text-gray-700 dark:text-gray-300">Real-time market data</span></li>
                <li className="flex items-start"><Check /><span className="text-gray-700 dark:text-gray-300">Basic stock search</span></li>
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
                <li className="flex items-start"><Check /><span className="text-gray-700 dark:text-gray-300">20 watchlist stocks</span></li>
                <li className="flex items-start"><Check /><span className="text-gray-700 dark:text-gray-300">20 portfolio entries</span></li>
                <li className="flex items-start"><Check /><span className="text-gray-700 dark:text-gray-300">5 stock reviews per week</span></li>
                <li className="flex items-start"><Check /><span className="text-gray-700 dark:text-gray-300">5 DCF valuations per week</span></li>
                <li className="flex items-start"><Check /><span className="text-gray-700 dark:text-gray-300">Technical Analysis</span></li>
                <li className="flex items-start"><Check /><span className="text-gray-700 dark:text-gray-300">Priority support</span></li>
              </ul>
              <Link
                to="/registerwithpayment?tier=casual"
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
                <li className="flex items-start"><Check /><span className="text-gray-700 dark:text-gray-300">45 watchlist stocks</span></li>
                <li className="flex items-start"><Check /><span className="text-gray-700 dark:text-gray-300">45 portfolio entries</span></li>
                <li className="flex items-start"><Check /><span className="text-gray-700 dark:text-gray-300">20 price alerts</span></li>
                <li className="flex items-start"><Check /><span className="text-gray-700 dark:text-gray-300">5 stock reviews per day</span></li>
                <li className="flex items-start"><Check /><span className="text-gray-700 dark:text-gray-300">5 DCF valuations per day</span></li>
                <li className="flex items-start"><Check /><span className="text-gray-700 dark:text-gray-300">Advanced Technical Analysis</span></li>
                <li className="flex items-start"><Check /><span className="text-gray-700 dark:text-gray-300">Priority support</span></li>
              </ul>              
              <Link
                to="/registerwithpayment?tier=active"
                className="block w-full text-center bg-primary-600 hover:bg-primary-700 dark:bg-primary-500 dark:hover:bg-primary-600 text-white font-semibold py-3 rounded-lg transition-colors"
              >
                Get Active
              </Link>
            </div>

            {/* Professional Investor Tier */}
            <div className="bg-white dark:bg-gray-600 p-8 rounded-xl shadow-lg dark:shadow-gray-200/50 hover:shadow-xl transition-shadow border dark:border-gray-300">
              <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Professional</h3>
              <div className="mb-6">
                <span className="text-4xl font-bold text-gray-900 dark:text-white">$100</span>
                <span className="text-gray-600 dark:text-gray-400">/month</span>
              </div>
              <ul className="space-y-3 mb-8">
                <li className="flex items-start"><Check /><span className="text-gray-700 dark:text-gray-300">75 watchlist stocks</span></li>
                <li className="flex items-start"><Check /><span className="text-gray-700 dark:text-gray-300">75 portfolio entries</span></li>
                <li className="flex items-start"><Check /><span className="text-gray-700 dark:text-gray-300">50 price alerts</span></li>
                <li className="flex items-start"><Check /><span className="text-gray-700 dark:text-gray-300">20 stock reviews per day</span></li>
                <li className="flex items-start"><Check /><span className="text-gray-700 dark:text-gray-300">20 DCF valuations per day</span></li>
                <li className="flex items-start"><Check /><span className="text-gray-700 dark:text-gray-300">Full Technical Analysis suite</span></li>
                <li className="flex items-start"><Check /><span className="text-gray-700 dark:text-gray-300">Priority support</span></li>
              </ul>              
              <Link
                to="/registerwithpayment?tier=professional"
                className="block w-full text-center bg-primary-600 hover:bg-primary-700 dark:bg-primary-500 dark:hover:bg-primary-600 text-white font-semibold py-3 rounded-lg transition-colors"
              >
                Go Professional
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
            Join investors making smarter, data-driven decisions every day.
          </p>
          <button
            onClick={scrollToPricing}
            className="inline-block px-8 py-4 bg-white hover:bg-gray-100 text-primary-600 text-lg font-semibold rounded-lg shadow-lg transition-colors cursor-pointer"
          >
            Choose Your Plan
          </button>
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
