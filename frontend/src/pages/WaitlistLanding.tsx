import React, { useState, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

const WaitlistLanding: React.FC = () => {
  const [searchParams] = useSearchParams();

  // ── Form state (hero + bottom CTA share logic via prefix) ───
  const [heroEmail, setHeroEmail] = useState('');
  const [heroLoading, setHeroLoading] = useState(false);
  const [heroError, setHeroError] = useState('');
  const [heroSuccess, setHeroSuccess] = useState(false);

  const [ctaEmail, setCtaEmail] = useState('');
  const [ctaLoading, setCtaLoading] = useState(false);
  const [ctaError, setCtaError] = useState('');
  const [ctaSuccess, setCtaSuccess] = useState(false);

  const heroInputRef = useRef<HTMLInputElement>(null);

  // Reusable checkmark icon (matches Landing.tsx)
  const Check = () => (
    <svg className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
    </svg>
  );

  // ── Signup handler ──────────────────────────────────────────
  const handleSignup = async (
    email: string,
    setLoading: (v: boolean) => void,
    setError: (v: string) => void,
    setSuccess: (v: boolean) => void,
  ) => {
    const trimmed = email.trim().toLowerCase();
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!re.test(trimmed)) {
      setError('Please enter a valid email address.');
      return;
    }

    setError('');
    setLoading(true);

    // Capture UTM / referrer
    const source =
      searchParams.get('utm_source') ||
      searchParams.get('ref') ||
      document.referrer ||
      null;

    try {
      const res = await fetch(`${API_URL}/api/v1/waitlist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmed, source }),
      });

      if (res.ok || res.status === 409) {
        setSuccess(true);
      } else {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || 'Something went wrong. Please try again.');
      }
    } catch (err: any) {
      setError(err.message || 'Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const scrollToHeroInput = () => {
    heroInputRef.current?.focus();
    heroInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  return (
    <div className="min-h-screen bg-gray-800">
      {/* SEO */}
      <title>NWC-Analytics — Join the Waitlist</title>
      <meta name="description" content="Be the first to access NWC-Analytics — professional stock analysis for retail investors. Real-time data, 15+ indicators, DCF models, and more." />
      <link rel="canonical" href="https://nwc-analytics.com/waitlist" />
      <meta property="og:title" content="NWC-Analytics — Join the Waitlist" />
      <meta property="og:description" content="Professional stock analysis for retail investors. Join the waitlist for early access." />
      <meta property="og:url" content="https://nwc-analytics.com/waitlist" />
      <meta property="og:image" content="https://nwc-analytics.com/images/og-default.png" />

      {/* ═══════════ NAV ═══════════ */}
      <nav className="bg-gray-900 shadow-sm border-b border-gray-700 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <img src="/images/logo.png" alt="NWC-Analytics, LLC" className="h-12 w-12 mr-3" />
              <span className="text-xl font-bold text-primary-400"
                style={{ fontFamily: "'Viner Hand ITC', 'Caveat', cursive", fontSize: '1.8rem', fontStyle: 'italic' }}>
                NWC-Analytics
              </span>
            </div>
            <div className="flex items-center space-x-4">
              <a href="#features" className="hidden sm:block text-gray-400 hover:text-primary-400 px-3 py-2 rounded-md text-sm font-medium transition-colors">
                Features
              </a>
              <a href="#pricing" className="hidden sm:block text-gray-400 hover:text-primary-400 px-3 py-2 rounded-md text-sm font-medium transition-colors">
                Pricing
              </a>
              <button
                onClick={scrollToHeroInput}
                className="bg-primary-600 hover:bg-primary-500 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors shadow-sm cursor-pointer"
              >
                Get Early Access
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* ═══════════ HERO ═══════════ */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-16 text-center">
        <h1 className="text-5xl sm:text-6xl font-extrabold text-white leading-tight">
          <span className="block">Professional Stock Analysis.</span>
          <span className="block text-primary-400 mt-2">For Retail Investors.</span>
        </h1>
        <p className="mt-6 max-w-3xl mx-auto text-xl text-gray-400">
          Real-time market data, 15+ technical indicators, DCF valuation models, live portfolio tracking,
          and price alerts — everything you need to make informed investment decisions, all in one platform.
        </p>

        {/* Platform highlights */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 max-w-4xl mx-auto mt-12 text-center">
          {[
            { num: '15+', label: 'Technical Indicators' },
            { num: 'Live', label: 'WebSocket Market Data' },
            { num: 'DCF', label: 'Valuation Models' },
            { num: '24/7', label: 'Price Alerts' },
          ].map(h => (
            <div key={h.label}>
              <div className="text-3xl font-extrabold text-primary-400">{h.num}</div>
              <div className="text-sm text-gray-400 mt-1">{h.label}</div>
            </div>
          ))}
        </div>

        {/* ── Signup card ──────────────────────────────────── */}
        <div className="max-w-md mx-auto mt-12">
          <div className="bg-gray-700 border border-gray-600 rounded-xl p-7 shadow-xl">
            {!heroSuccess ? (
              <>
                <h2 className="text-lg font-bold text-white mb-1">Be the first to get access</h2>
                <p className="text-sm text-gray-400 mb-5">Join the waitlist — we'll notify you the moment we go live.</p>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    ref={heroInputRef}
                    type="email"
                    value={heroEmail}
                    onChange={e => { setHeroEmail(e.target.value); setHeroError(''); }}
                    onKeyDown={e => e.key === 'Enter' && handleSignup(heroEmail, setHeroLoading, setHeroError, setHeroSuccess)}
                    placeholder="you@email.com"
                    className="flex-1 px-4 py-3 rounded-lg border border-gray-600 bg-gray-900 text-white placeholder-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-transparent"
                  />
                  <button
                    onClick={() => handleSignup(heroEmail, setHeroLoading, setHeroError, setHeroSuccess)}
                    disabled={heroLoading}
                    className="px-5 py-3 bg-primary-600 hover:bg-primary-500 text-white font-bold text-sm rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed whitespace-nowrap"
                  >
                    {heroLoading ? (
                      <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      'Notify Me →'
                    )}
                  </button>
                </div>
                {heroError && <p className="text-red-400 text-sm mt-2">{heroError}</p>}
                <p className="text-xs text-gray-500 mt-3">🔒 No spam, no credit card. Unsubscribe anytime.</p>
              </>
            ) : (
              <div className="text-center py-2">
                <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-primary-400/15 border-2 border-primary-400 mb-3">
                  <svg className="w-5 h-5 text-primary-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <p className="text-primary-400 font-bold text-lg">You're on the list!</p>
                <p className="text-gray-400 text-sm mt-1">We'll email you when NWC-Analytics goes live.</p>
              </div>
            )}
          </div>

          {/* Social proof */}
          <div className="flex flex-col items-center gap-1 mt-5">
            <div className="flex">
              {['NW', 'JR', 'AS', 'TK', 'ML'].map((initials, i) => (
                <div
                  key={initials}
                  className="w-7 h-7 rounded-full border-2 border-gray-700 bg-gray-600 flex items-center justify-center text-[0.55rem] font-bold text-primary-400"
                  style={{ marginLeft: i === 0 ? 0 : -7 }}
                >
                  {initials}
                </div>
              ))}
              <div
                className="w-7 h-7 rounded-full border-2 border-gray-700 bg-primary-400/15 flex items-center justify-center text-[0.55rem] font-bold text-primary-400"
                style={{ marginLeft: -7 }}
              >
                +
              </div>
            </div>
            <span className="text-xs text-gray-500">Investors already on the waitlist</span>
          </div>
        </div>
      </section>

      {/* ═══════════ CORE FEATURES ═══════════ */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20" id="features">
        <h2 className="text-3xl font-bold text-center text-white mb-4">Everything You Need to Succeed</h2>
        <p className="text-center text-gray-400 mb-16 max-w-2xl mx-auto">
          Institutional-grade analysis tools designed for retail investors — no Bloomberg terminal required.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Technical Analysis */}
          <div className="bg-gray-700 border border-gray-600 p-8 rounded-xl hover:border-primary-600 hover:shadow-xl transition-all hover:-translate-y-0.5">
            <div className="w-12 h-12 bg-primary-900/30 rounded-lg flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-primary-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-white mb-2">Technical Analysis</h3>
            <p className="text-gray-400 text-sm leading-relaxed">
              15+ professional indicators including RSI, MACD, Bollinger Bands, Stochastic Oscillator,
              ADX, Ichimoku Cloud, VWAP, and more — with clear buy/sell signals and educational descriptions
              for every indicator.
            </p>
          </div>

          {/* Portfolio Tracking */}
          <div className="bg-gray-700 border border-gray-600 p-8 rounded-xl hover:border-primary-600 hover:shadow-xl transition-all hover:-translate-y-0.5">
            <div className="w-12 h-12 bg-emerald-900/30 rounded-lg flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-white mb-2">Portfolio Tracking</h3>
            <p className="text-gray-400 text-sm leading-relaxed">
              Track multiple purchase lots per stock, monitor real-time P&L, and view your sector
              diversification with interactive charts. See your total portfolio value update live
              via WebSocket connections.
            </p>
          </div>

          {/* Customizable Alerts */}
          <div className="bg-gray-700 border border-gray-600 p-8 rounded-xl hover:border-primary-600 hover:shadow-xl transition-all hover:-translate-y-0.5">
            <div className="w-12 h-12 bg-purple-900/30 rounded-lg flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-white mb-2">Customizable Alerts</h3>
            <p className="text-gray-400 text-sm leading-relaxed">
              Set alerts based on key indicators or price targets. Get notified instantly via email
              or email. Never miss a breakout or buying opportunity.
            </p>
          </div>
        </div>
      </section>

      {/* ═══════════ AND MUCH MORE ═══════════ */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-20">
        <h2 className="text-3xl font-bold text-center text-white mb-10">And Much More</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {[
            { icon: '📈', title: 'Trend Indicators', desc: 'Parabolic SAR, Ichimoku Cloud, and Donchian Channels — identify trend direction, reversals, and breakout setups all in one view.' },
            { icon: '🌊', title: 'Volatility & Risk', desc: 'ATR-based stop-loss guidance, Keltner Channel squeeze detection, and position sizing context — manage risk like a pro.' },
            { icon: '📄', title: 'Financial Summary', desc: 'SEC-sourced income statements, balance sheets, cash flows, and key ratios pulled from live 10-K and 10-Q filings.' },
            { icon: '🔥', title: 'Momentum Indicators', desc: 'Understand what drives a trend, how long it lasts, and the key indicators every momentum trader should know.' },
            { icon: '💰', title: 'DCF Valuation', desc: "Automatically pull a company's current SEC filings to calculate intrinsic value with AI-suggested assumptions." },
            { icon: '🔍', title: 'Stock Discovery Engine', desc: "Go beyond gainers and losers. Explore randomly surfaced stocks by sector or on demand — uncover opportunities the crowd hasn't found yet." },
          ].map(f => (
            <div key={f.title} className="bg-gray-700 border border-gray-600 rounded-xl p-6 text-center hover:border-gray-500 transition-colors">
              <div className="text-3xl mb-3">{f.icon}</div>
              <h3 className="text-lg font-bold text-white mb-1">{f.title}</h3>
              <p className="text-sm text-gray-400 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ═══════════ PRICING ═══════════ */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 border-t border-gray-700" id="pricing">
        <h2 className="text-3xl font-bold text-center text-white mb-4">Simple, Transparent Pricing</h2>
        <p className="text-center text-gray-400 mb-16">Every plan starts with a 14-day free trial — no credit card required</p>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 max-w-5xl mx-auto">
          {/* Beginner */}
          <div className="bg-gray-700 border border-gray-600 p-8 rounded-xl hover:border-primary-600 hover:shadow-xl hover:-translate-y-0.5 transition-all">
            <h3 className="text-2xl font-bold text-white mb-2">Beginner</h3>
            <div className="mb-2">
              <span className="text-4xl font-bold text-white">$10</span>
              <span className="text-gray-400">/month</span>
            </div>
            <p className="text-sm text-emerald-400 font-medium mb-6">14-day free trial</p>
            <ul className="space-y-3 mb-8">
              {['10 watchlist stocks', '10 portfolio entries', '5 price alerts', '5 stock reviews per week', '5 DCF valuations per week', 'Technical Analysis', 'Real-time market data'].map(f => (
                <li key={f} className="flex items-start gap-2 text-sm text-gray-300"><Check />{f}</li>
              ))}
            </ul>
            <button onClick={scrollToHeroInput} className="block w-full text-center bg-primary-600 hover:bg-primary-500 text-white font-semibold py-3 rounded-lg transition-colors">
              Start Free Trial
            </button>
          </div>

          {/* Casual — POPULAR */}
          <div className="bg-gray-700 border border-primary-500 p-8 rounded-xl relative scale-105 shadow-lg shadow-primary-500/20 hover:scale-[1.07] transition-all">
            <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
              <span className="bg-primary-600 text-white text-xs font-bold px-4 py-1 rounded-full">POPULAR</span>
            </div>
            <h3 className="text-2xl font-bold text-white mb-2">Casual Investor</h3>
            <div className="mb-2">
              <span className="text-4xl font-bold text-white">$20</span>
              <span className="text-gray-400">/month</span>
            </div>
            <p className="text-sm text-emerald-400 font-medium mb-6">14-day free trial</p>
            <ul className="space-y-3 mb-8">
              {['20 watchlist stocks', '20 portfolio entries', '10 price alerts', '15 stock reviews per week', '15 DCF valuations per week', 'Technical Analysis', 'Email price alerts', 'Priority support'].map(f => (
                <li key={f} className="flex items-start gap-2 text-sm text-gray-300"><Check />{f}</li>
              ))}
            </ul>
            <button onClick={scrollToHeroInput} className="block w-full text-center bg-primary-600 hover:bg-primary-500 text-white font-semibold py-3 rounded-lg transition-colors">
              Start Free Trial
            </button>
          </div>

          {/* Active */}
          <div className="bg-gray-700 border border-gray-600 p-8 rounded-xl hover:border-primary-600 hover:shadow-xl hover:-translate-y-0.5 transition-all">
            <h3 className="text-2xl font-bold text-white mb-2">Active Investor</h3>
            <div className="mb-6">
              <span className="text-4xl font-bold text-white">$40</span>
              <span className="text-gray-400">/month</span>
            </div>
            <ul className="space-y-3 mb-8">
              {['45 watchlist stocks', '45 portfolio entries', '20 price alerts', '10 stock reviews per day', '10 DCF valuations per day', 'Advanced Technical Analysis', 'Email price alerts', 'Priority support'].map(f => (
                <li key={f} className="flex items-start gap-2 text-sm text-gray-300"><Check />{f}</li>
              ))}
            </ul>
            <button onClick={scrollToHeroInput} className="block w-full text-center bg-primary-600 hover:bg-primary-500 text-white font-semibold py-3 rounded-lg transition-colors">
              Get Active
            </button>
          </div>

          {/* Professional */}
          <div className="bg-gray-700 border border-gray-600 p-8 rounded-xl hover:border-primary-600 hover:shadow-xl hover:-translate-y-0.5 transition-all">
            <h3 className="text-2xl font-bold text-white mb-2">Professional</h3>
            <div className="mb-6">
              <span className="text-4xl font-bold text-white">$50</span>
              <span className="text-gray-400">/month</span>
            </div>
            <ul className="space-y-3 mb-8">
              {['75 watchlist stocks', '75 portfolio entries', '50 price alerts', '20 stock reviews per day', '20 DCF valuations per day', 'Full Technical Analysis suite', 'Email & indicator alerts', 'Priority support'].map(f => (
                <li key={f} className="flex items-start gap-2 text-sm text-gray-300"><Check />{f}</li>
              ))}
            </ul>
            <button onClick={scrollToHeroInput} className="block w-full text-center bg-primary-600 hover:bg-primary-500 text-white font-semibold py-3 rounded-lg transition-colors">
              Go Professional
            </button>
          </div>
        </div>
      </section>

      {/* ═══════════ BOTTOM CTA ═══════════ */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-20">
        <div className="bg-primary-700 rounded-2xl p-12 text-center">
          <h2 className="text-3xl font-bold text-white mb-4">
            Ready to Take Control of Your Investments?
          </h2>
          <p className="text-xl text-primary-100 mb-8">
            Join investors making smarter, data-driven decisions every day.
          </p>

          {!ctaSuccess ? (
            <div className="max-w-md mx-auto">
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="email"
                  value={ctaEmail}
                  onChange={e => { setCtaEmail(e.target.value); setCtaError(''); }}
                  onKeyDown={e => e.key === 'Enter' && handleSignup(ctaEmail, setCtaLoading, setCtaError, setCtaSuccess)}
                  placeholder="you@email.com"
                  className="flex-1 px-4 py-3 rounded-lg border border-white/25 bg-white/10 text-white placeholder-white/50 text-sm focus:outline-none focus:border-white focus:bg-white/15"
                />
                <button
                  onClick={() => handleSignup(ctaEmail, setCtaLoading, setCtaError, setCtaSuccess)}
                  disabled={ctaLoading}
                  className="px-6 py-3 bg-white hover:bg-gray-100 text-primary-700 font-bold text-sm rounded-lg transition-colors disabled:opacity-60 whitespace-nowrap"
                >
                  {ctaLoading ? (
                    <span className="inline-block w-4 h-4 border-2 border-primary-700/30 border-t-primary-700 rounded-full animate-spin" />
                  ) : (
                    'Get Early Access →'
                  )}
                </button>
              </div>
              {ctaError && <p className="text-red-200 text-sm mt-2">{ctaError}</p>}
            </div>
          ) : (
            <div>
              <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-white/15 border-2 border-white mb-3">
                <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-white font-bold text-lg">You're on the list!</p>
              <p className="text-white/70 text-sm mt-1">We'll be in touch soon.</p>
            </div>
          )}
        </div>
      </div>

      {/* ═══════════ FOOTER ═══════════ */}
      <footer className="bg-gray-950 border-t border-gray-700 text-gray-400 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <div className="flex items-center mb-4 md:mb-0">
              <img src="/images/logo.png" alt="NWC-Analytics, LLC" className="h-12 w-12 mr-3" />
              <div>
                <p className="text-xl font-bold text-white">NWC-Analytics</p>
                <p className="text-sm">Professional stock analysis for retail investors</p>
              </div>
            </div>
            <div className="text-center md:text-right">
              <p className="text-sm">© 2026 NWC-Analytics, LLC. All rights reserved.</p>
              <p className="text-sm mt-1">Post Falls, Idaho</p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default WaitlistLanding;