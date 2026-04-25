import React from 'react';
import { Link } from 'react-router-dom';
import ThemeToggle from '../components/ThemeToggle';
import BackToTop from '../components/BackToTop';
import HeroSection from '../components/landing/HeroSection';
import FeatureSection from '../components/landing/FeatureSection';
import PricingTiers from '../components/landing/PricingTiers';

const Landing: React.FC = () => {

  const scrollToPricing = (e: React.MouseEvent) => {
    e.preventDefault();
    const el = document.getElementById('pricing');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 via-white to-emerald-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      {/* SEO — React 19 hoists these to <head> automatically */}
      <title>NWC-Analytics — Professional Stock Analysis for Retail Investors</title>
      <meta name="description" content="Real-time prices, AI-powered stock & portfolio analysis, 15+ technical indicators, DCF valuation, and smart alerts — built for retail investors who do their own homework." />
      <link rel="canonical" href="https://nwc-analytics.com" />
      <meta property="og:type" content="website" />
      <meta property="og:title" content="NWC-Analytics — Professional Stock Analysis for Retail Investors" />
      <meta property="og:description" content="Real-time prices, AI analysis, technical alerts, DCF modeling — for retail investors who do their own homework." />
      <meta property="og:url" content="https://nwc-analytics.com" />
      <meta property="og:image" content="https://nwc-analytics.com/images/og-default.png" />
      <meta property="og:site_name" content="NWC-Analytics" />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content="NWC-Analytics — Professional Stock Analysis" />
      <meta name="twitter:description" content="Institutional-grade stock analysis tools built for retail investors." />
      <meta name="twitter:image" content="https://nwc-analytics.com/images/og-default.png" />

      {/* JSON-LD: Organization + WebSite (valid anywhere in DOM for Google) */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
        "@context": "https://schema.org",
        "@graph": [
          {
            "@type": "Organization",
            "name": "NWC-Analytics, LLC",
            "url": "https://nwc-analytics.com",
            "logo": "https://nwc-analytics.com/images/logo.png",
            "description": "Professional stock analysis platform for retail investors.",
            "address": {
              "@type": "PostalAddress",
              "addressLocality": "Post Falls",
              "addressRegion": "ID",
              "addressCountry": "US"
            }
          },
          {
            "@type": "WebSite",
            "name": "NWC-Analytics",
            "url": "https://nwc-analytics.com",
            "description": "Real-time market data, AI analysis, technical indicators, DCF valuations, and smart alerts for retail investors.",
            "publisher": { "@type": "Organization", "name": "NWC-Analytics, LLC" }
          }
        ]
      }) }} />

      {/* Navbar */}
      <nav className="bg-gray-800 dark:bg-gray-900 shadow-sm border-b border-gray-700 dark:border-gray-700 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <img
                src="/images/logo.png"
                alt="NWC-Analytics, LLC"
                className="h-12 w-12 mr-3"
              />
              <span className="text-xl font-bold text-primary-400 dark:text-primary-400" style={{ fontFamily: "'Viner Hand ITC', 'Caveat', cursive", fontSize: '1.8rem', fontStyle: 'italic' }}>NWC-Analytics</span>
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

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

        {/* 1. Hero */}
        <HeroSection onChoosePlanClick={scrollToPricing} imageSrc="/landing/dashboard-hero.png" />

        {/* 2. Trusted-by strip */}
        <div className="mt-8 mb-20 text-center">
          <p className="text-sm uppercase tracking-widest text-gray-500 dark:text-gray-400 font-medium">
            Built in Post Falls, Idaho · Powered by Anthropic · FMP · Stripe · SendGrid
          </p>
        </div>

        {/* Platform Highlights — quick stats strip */}
        <div className="mb-32">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 max-w-4xl mx-auto text-center">
            <div>
              <div className="text-3xl font-extrabold text-primary-600 dark:text-primary-400">15+</div>
              <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">Technical Indicators</div>
            </div>
            <div>
              <div className="text-3xl font-extrabold text-primary-600 dark:text-primary-400">Live</div>
              <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">WebSocket Prices</div>
            </div>
            <div>
              <div className="text-3xl font-extrabold text-primary-600 dark:text-primary-400">AI</div>
              <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">Stock & Portfolio Analysis</div>
            </div>
            <div>
              <div className="text-3xl font-extrabold text-primary-600 dark:text-primary-400">DCF</div>
              <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">Valuation Models</div>
            </div>
          </div>
        </div>

        {/* Section heading for deep-dives */}
        <div className="text-center mb-16">
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
            Everything You Need to Succeed
          </h2>
          <p className="text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
            Institutional-grade analysis tools designed for retail investors — no Bloomberg terminal required.
          </p>
        </div>

        {/* 3. Live Dashboard & Real-Time Prices */}
        <div className="space-y-24">
          <FeatureSection
            eyebrow="🟢 LIVE"
            eyebrowColor="green"
            title="Live Dashboard & Real-Time Prices"
            body={
              <>
                See prices update the moment the market moves. Your watchlist, portfolio, and dashboard
                stream live via WebSocket — no refreshing required. Pre-market and after-hours quotes are
                tracked separately so you know exactly what's happening before the bell.
              </>
            }
            bullets={[
              'Live WebSocket price streaming for your entire watchlist',
              'Pre-market and after-hours badges with separate % change',
              'Real-time portfolio value with automatic P&L calculations',
              'Sector breakdown and diversification charts',
              'Market status badges — open, closed, or extended hours',
              'Daily top gainers and sector-based stock discovery',
            ]}
            screenshotFile="dashboard-livefeed.png"
            screenshotDescription="Dashboard or Watchlist showing live prices flashing green/red, with at least one ticker showing a PM or AH badge."
            imageSrc="/landing/dashboard-livefeed.png"
          />

          {/* 4. AI Stock & Portfolio Analysis */}
          <FeatureSection
            eyebrow="✨ AI-POWERED"
            eyebrowColor="purple"
            title="AI Stock & Portfolio Analysis"
            body={
              <>
                Get plain-language analysis of any stock or your entire portfolio, powered by Anthropic's
                Claude. Skip the jargon — understand what's actually happening with your investments and
                what to watch for next. Available on Casual, Active, and Professional tiers.
              </>
            }
            bullets={[
              'Plain-language stock breakdowns — fundamentals, technicals, sentiment',
              'Portfolio-level summaries: concentration, sector tilt, risk highlights',
              'AI-generated price forecasts cached for 6 hours',
              'Usage scales with tier: 5/week (Casual) → 25/day (Professional)',
              'Built on Anthropic Claude — no hallucinated tickers or made-up financials',
            ]}
            screenshotFile="ai-analysis.png"
            screenshotDescription="Stock detail or Dashboard showing the AI-generated analysis text panel for a real ticker."
            imageSrc="/landing/ai-analysis.png"
            reverse
          />

          {/* 5. Pro Technical Analysis + Intraday Charting */}
          <FeatureSection
            eyebrow="📈 15+ INDICATORS"
            eyebrowColor="primary"
            title="Pro Technical Analysis"
            body={
              <>
                Go beyond basic charts with the full suite of indicators professional traders use. Each
                comes with clear explanations so you understand exactly what the data is telling you.
              </>
            }
            bullets={[
              'RSI, MACD, Bollinger Bands, Stochastic, ADX, ATR',
              'Moving Averages (SMA/EMA), VWAP, OBV, A/D Line',
              'Ichimoku Cloud, Keltner & Donchian Channels, Parabolic SAR',
              'CCI and Rate of Change momentum indicators',
              'Watchlist batch analysis with preset filters (oversold, overbought, uptrend)',
            ]}
            screenshotFile="tech-analysis.png"
            screenshotDescription="TechnicalAnalysis page showing candlestick chart with RSI + MACD subpanels for a real ticker."
            imageSrc="/landing/tech-analysis.png"
          />

          <FeatureSection
            eyebrow="🕯️ 1-MINUTE BARS"
            eyebrowColor="amber"
            title="Intraday Charting with Drawing Tools"
            body={
              <>
                Zoom from 1-minute bars out to multi-day views, draw channels and trendlines directly on
                the chart, and overlay moving averages — all without leaving the page.
              </>
            }
            bullets={[
              '1-minute intraday bars (recently upgraded from 15-minute)',
              'Channel and trendline drawing tools',
              'Cursor-draw mode for free-form annotation',
              'Zoom levels 1× through 5× for detail-level analysis',
              '50-day and 200-day moving average overlays on price history',
              'Pre-market and after-hours bars included',
            ]}
            screenshotFile="intraday-drawing.png"
            screenshotDescription="Intraday chart with channel drawing visible, MA overlays on, zoomed in. Capture mid-draw if possible."
            imageSrc="/landing/intraday-drawing.png"
            reverse
          />

          {/* 6. DCF Valuation */}
          <FeatureSection
            eyebrow="💰 VALUATION"
            eyebrowColor="purple"
            title="DCF Valuation with Auto-Suggested Inputs"
            body={
              <>
                Run Discounted Cash Flow analyses on any stock to estimate intrinsic value. The system
                auto-suggests growth rates, discount rates, and projection periods based on the company's
                sector, size, and financial profile — or override every assumption yourself.
              </>
            }
            bullets={[
              'AI-suggested growth rate (with conservative 20% haircut by default)',
              'Auto-derived WACC, terminal growth, and projection horizon',
              'Year-by-year projected cash flows and present values',
              'Intrinsic value per share with margin of safety',
              'Clear Buy / Hold / Overvalued recommendation',
            ]}
            screenshotFile="dcf-suggestions.png"
            screenshotDescription="DCF page for a recognizable ticker (e.g. MSFT or AAPL) showing the suggestion panel and the resulting Buy/Hold/Overvalued recommendation."
            imageSrc="/landing/dcf-suggestions.png"
          />

          {/* 7. Smart Alerts */}
          <FeatureSection
            eyebrow="🔔 SMART ALERTS"
            eyebrowColor="rose"
            title="Price + Technical Alerts"
            body={
              <>
                Never stare at charts again. Set price alerts for crossings, or wire up technical alerts
                that fire on indicator events — RSI extremes, moving-average crossovers, MACD crosses,
                Bollinger band breaches, sentiment shifts, and Rule-of-40 changes. Delivered to your
                inbox the moment they fire.
              </>
            }
            bullets={[
              'Price alerts: above / below thresholds, 24/7 monitoring',
              'Technical alerts: RSI extreme, MA crossover, MACD cross',
              'Technical alerts: Bollinger breach, sentiment shift, Rule of 40',
              'Email delivery on every plan',
              'Up to 50 price alerts and 20 technical alerts on Professional',
            ]}
            screenshotFile="alerts-page.png"
            screenshotDescription="Alerts page showing both a price alert and at least one technical alert configured."
            imageSrc="/landing/alerts-page.png"
            reverse
          />

          {/* 8. Stock Screener */}
          <FeatureSection
            eyebrow="🔍 DISCOVERY"
            eyebrowColor="blue"
            title="Stock Screener with Technical Filters"
            body={
              <>
                Find the next setup before the crowd. Filter the market by price, market cap, volume,
                technical patterns, and 52-week range. Spot golden crosses and death crosses, gap-up
                breakouts, and volume spikes — without scrolling through thousands of tickers.
              </>
            }
            bullets={[
              'Filter by price, market cap, volume, and sector',
              'Technical filters: golden cross, death cross, 50/200-day MA position',
              '52-week high/low proximity, gap %, volume spikes',
              'Daily snapshot covers all common stocks and ETFs',
              'Save your screens (Active and Professional)',
            ]}
            screenshotFile="screener.png"
            screenshotDescription="Stocks page (screener view) with filters applied — ideally a technical filter like golden cross or 52-week range."
            imageSrc="/landing/screener.png"
          />

          {/* Options Calculator — condensed feature card */}
          <div className="bg-white dark:bg-gray-600 rounded-xl shadow-lg dark:shadow-gray-200/50 border dark:border-gray-300 p-8">
            <div className="grid md:grid-cols-3 gap-6 items-center">
              <div className="md:col-span-2">
                <div className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 mb-3">
                  🧮 Options Calculator
                </div>
                <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                  Black-Scholes & Binomial Pricing
                </h3>
                <p className="text-gray-600 dark:text-gray-300">
                  Price single-leg and multi-leg strategies, visualize P&L at expiration, and calculate
                  full Greeks (Delta, Gamma, Theta, Vega, Rho). Implied volatility solver included.
                  Available on Active and Professional tiers.
                </p>
              </div>
              <div className="flex flex-wrap gap-2 justify-start md:justify-end">
                {['Delta', 'Gamma', 'Theta', 'Vega', 'Rho'].map((g) => (
                  <span
                    key={g}
                    className="px-3 py-1 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 rounded-full text-sm font-medium"
                  >
                    {g}
                  </span>
                ))}
              </div>
            </div>
          </div>

        </div>

        {/* 9. Pricing */}
        <div className="mt-32">
          <PricingTiers />
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
                alt="NWC-Analytics, LLC"
                className="h-12 w-12 mr-3"
              />
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
        <BackToTop />
      </footer>
    </div>
  );
};

export default Landing;
