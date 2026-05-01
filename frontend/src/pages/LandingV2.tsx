import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import ThemeToggle from '../components/ThemeToggle';
import TickerTape from '../components/landing/TickerTape';
import HeroDemoCard from '../components/landing/HeroDemoCard';
import PricingCard from '../components/landing/PricingCard';
import FAQAccordion from '../components/landing/FAQAccordion';
import { PRICING_TIERS } from '../data/pricingTiers';

const PILLARS = [
  {
    title: 'Stock Research',
    desc: 'Quotes, fundamentals, news, and AI-generated summaries on any ticker.',
    icon: '📊',
    href: '/stocks',
  },
  {
    title: 'Technical Analysis',
    desc: '19 indicators with plain-English signals — RSI, MACD, Bollinger, and more.',
    icon: '📈',
    href: '/technical-analysis',
  },
  {
    title: 'DCF Valuation',
    desc: 'AI-suggested growth and discount rates produce an intrinsic value estimate.',
    icon: '🧮',
    href: '/dcf-valuation',
  },
  {
    title: 'Market Movers',
    desc: 'Daily gainers, losers, and screener results to find your next idea.',
    icon: '🎯',
    href: '/stocks',
  },
];

const STEPS = [
  { n: '1', title: 'Sign Up Free', desc: '14-day trial on paid tiers, no card required to browse.' },
  { n: '2', title: 'Search Any Ticker', desc: 'US stocks, ETFs, and indexes — all in one place.' },
  { n: '3', title: 'Get Institutional-Grade Analysis', desc: 'Charts, indicators, DCF, and AI commentary in seconds.' },
];

const LandingV2: React.FC = () => {
  const reduceMotion = useReducedMotion();
  const [billing, setBilling] = useState<'monthly' | 'annual'>('monthly');

  const fadeUp = reduceMotion
    ? { initial: {}, animate: {}, transition: {} }
    : {
        initial: { opacity: 0, y: 20 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0.5 },
      };

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950 text-gray-900 dark:text-white">
      {/* ── Navbar ─────────────────────────────────────────── */}
      <nav className="sticky top-0 z-50 backdrop-blur bg-white/80 dark:bg-gray-950/80 border-b border-gray-200 dark:border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center text-white font-bold text-sm">
              N
            </div>
            <span className="font-bold tracking-tight">NWC-Analytics</span>
          </Link>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <Link
              to="/login"
              className="text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
            >
              Login
            </Link>
            <Link
              to="/register"
              className="px-4 py-2 rounded-lg text-sm font-semibold bg-primary-600 hover:bg-primary-700 text-white transition-colors"
            >
              Sign Up Free
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Live ticker tape ──────────────────────────────── */}
      <TickerTape />

      {/* ── Hero ──────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <div
          className="absolute inset-0 -z-10 opacity-40 dark:opacity-30"
          style={{
            background:
              'radial-gradient(60% 50% at 30% 20%, rgba(13,148,136,0.25) 0%, transparent 60%), radial-gradient(40% 40% at 80% 70%, rgba(13,148,136,0.18) 0%, transparent 60%)',
          }}
        />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-16 md:py-24 grid md:grid-cols-2 gap-10 items-center">
          <div>
            <motion.h1
              {...fadeUp}
              className="text-4xl md:text-5xl lg:text-6xl font-extrabold tracking-tight leading-[1.05]"
            >
              Wall Street's research tools.
              <span className="block text-primary-600 dark:text-primary-400">
                Built for the rest of us.
              </span>
            </motion.h1>
            <motion.p
              {...fadeUp}
              transition={{ ...fadeUp.transition, delay: reduceMotion ? 0 : 0.1 }}
              className="mt-5 text-lg text-gray-600 dark:text-gray-300 max-w-xl"
            >
              Real-time prices, technical indicators, DCF valuation, and AI-generated
              analysis on every US stock — without paying a Bloomberg terminal price.
            </motion.p>
            <motion.div
              {...fadeUp}
              transition={{ ...fadeUp.transition, delay: reduceMotion ? 0 : 0.2 }}
              className="mt-7 flex flex-wrap gap-3"
            >
              <Link
                to="/register"
                className="px-6 py-3 rounded-lg font-semibold bg-primary-600 hover:bg-primary-700 text-white transition-colors shadow-lg shadow-primary-500/30"
              >
                Start Free →
              </Link>
              <Link
                to="/technical-analysis?ticker=AAPL"
                className="px-6 py-3 rounded-lg font-semibold border border-gray-300 dark:border-gray-700 hover:border-primary-500 dark:hover:border-primary-500 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
              >
                See Sample Analysis
              </Link>
            </motion.div>
          </div>
          <div className="md:pl-6">
            <HeroDemoCard />
          </div>
        </div>
      </section>

      {/* ── Pillar grid ───────────────────────────────────── */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-16 md:py-20">
        <div className="text-center mb-10">
          <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight">
            Everything you need to research a stock
          </h2>
          <p className="mt-3 text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
            One platform. Four core tools. Built around how retail investors actually work.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          {PILLARS.map((p, i) => (
            <motion.div
              key={p.title}
              initial={reduceMotion ? false : { opacity: 0, y: 20 }}
              whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-50px' }}
              transition={{ duration: 0.4, delay: i * 0.08 }}
              className="rounded-2xl p-6 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 hover:border-primary-500 dark:hover:border-primary-500 hover:shadow-lg hover:shadow-primary-500/10 transition-all"
            >
              <div className="text-3xl mb-3">{p.icon}</div>
              <h3 className="font-bold text-lg mb-2">{p.title}</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed mb-4">
                {p.desc}
              </p>
              <Link
                to={p.href}
                className="text-sm font-semibold text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300"
              >
                Learn more →
              </Link>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ── See It In Action ──────────────────────────────── */}
      <section className="bg-gray-50 dark:bg-gray-900/50 py-16 md:py-24">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 text-center">
          <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight">
            See it in action
          </h2>
          <p className="mt-3 text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
            Every indicator, every chart, with plain-English signals.
          </p>
          <div className="mt-10 relative mx-auto max-w-5xl">
            <div className="absolute -inset-4 bg-primary-500/20 blur-3xl rounded-3xl -z-10" />
            <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-2xl shadow-primary-500/20 ring-1 ring-primary-500/20 overflow-hidden">
              <img
                src="/landing/technical-analysis-preview.png"
                alt="Technical Analysis screenshot"
                className="w-full h-auto"
                onError={(e) => {
                  const target = e.currentTarget as HTMLImageElement;
                  target.style.display = 'none';
                  const fallback = target.nextElementSibling as HTMLElement | null;
                  if (fallback) fallback.style.display = 'flex';
                }}
              />
              <div
                className="hidden items-center justify-center h-96 text-gray-400 dark:text-gray-500 text-sm"
                style={{ display: 'none' }}
              >
                Drop a screenshot at <code className="ml-1 px-2 py-0.5 bg-gray-100 dark:bg-gray-800 rounded">/public/landing/technical-analysis-preview.png</code>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── How it works ──────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-16 md:py-20">
        <div className="text-center mb-10">
          <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight">
            How it works
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {STEPS.map((s) => (
            <div
              key={s.n}
              className="rounded-2xl p-6 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800"
            >
              <div className="w-10 h-10 rounded-full bg-primary-600 text-white font-bold flex items-center justify-center mb-4">
                {s.n}
              </div>
              <h3 className="font-bold text-lg mb-1">{s.title}</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                {s.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Data sources ──────────────────────────────────── */}
      <section className="border-y border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 text-center text-sm text-gray-500 dark:text-gray-400">
          <span className="font-semibold text-gray-700 dark:text-gray-300">
            Powered by
          </span>{' '}
          Polygon · Financial Modeling Prep · SEC EDGAR · Anthropic Claude
        </div>
      </section>

      {/* ── Pricing ───────────────────────────────────────── */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-16 md:py-24">
        <div className="text-center mb-10">
          <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight">
            Pick a tier. Cancel anytime.
          </h2>
          <p className="mt-3 text-gray-600 dark:text-gray-400">
            All plans include real-time WebSocket prices and email alerts.
          </p>

          <div className="mt-8 inline-flex items-center bg-gray-100 dark:bg-gray-800 rounded-full p-1">
            <button
              type="button"
              onClick={() => setBilling('monthly')}
              className={`px-5 py-2 rounded-full text-sm font-semibold transition-colors ${
                billing === 'monthly'
                  ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow'
                  : 'text-gray-600 dark:text-gray-400'
              }`}
            >
              Monthly
            </button>
            <button
              type="button"
              onClick={() => setBilling('annual')}
              className={`px-5 py-2 rounded-full text-sm font-semibold transition-colors flex items-center gap-2 ${
                billing === 'annual'
                  ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow'
                  : 'text-gray-600 dark:text-gray-400'
              }`}
            >
              Annual
              <span className="text-[10px] font-bold bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400 px-1.5 py-0.5 rounded">
                Save 20%
              </span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 pt-4">
          {PRICING_TIERS.map((tier) => (
            <PricingCard key={tier.slug} tier={tier} billing={billing} />
          ))}
        </div>
      </section>

      {/* ── FAQ ───────────────────────────────────────────── */}
      <section className="bg-gray-50 dark:bg-gray-900/50 py-16 md:py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-10">
            <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight">
              Frequently asked questions
            </h2>
          </div>
          <FAQAccordion />
        </div>
      </section>

      {/* ── Final CTA ─────────────────────────────────────── */}
      <section className="bg-gray-950 text-white">
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 20 }}
          whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 0.5 }}
          className="max-w-4xl mx-auto px-4 sm:px-6 py-20 md:py-28 text-center"
        >
          <h2 className="text-3xl md:text-5xl font-extrabold tracking-tight">
            Ready to see what the numbers actually say?
          </h2>
          <p className="mt-4 text-gray-400 max-w-2xl mx-auto">
            Free to start. No card required to browse. Cancel any time.
          </p>
          <Link
            to="/register"
            className="inline-block mt-8 px-8 py-4 rounded-lg font-semibold bg-primary-500 hover:bg-primary-400 text-gray-950 text-lg transition-colors shadow-2xl shadow-primary-500/30"
          >
            Start Free →
          </Link>
        </motion.div>
      </section>

      {/* ── Footer ────────────────────────────────────────── */}
      <footer className="bg-white dark:bg-gray-950 border-t border-gray-200 dark:border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12 grid grid-cols-2 md:grid-cols-4 gap-8 text-sm">
          <div className="col-span-2 md:col-span-1">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center text-white font-bold text-sm">
                N
              </div>
              <span className="font-bold">NWC-Analytics</span>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
              Stock research tools built for retail investors. Built in Post Falls, Idaho.
            </p>
          </div>
          <div>
            <div className="font-semibold mb-3">Product</div>
            <ul className="space-y-2 text-gray-600 dark:text-gray-400">
              <li><Link to="/stocks" className="hover:text-primary-600 dark:hover:text-primary-400">Stock Research</Link></li>
              <li><Link to="/technical-analysis" className="hover:text-primary-600 dark:hover:text-primary-400">Technical Analysis</Link></li>
              <li><Link to="/dcf-valuation" className="hover:text-primary-600 dark:hover:text-primary-400">DCF Valuation</Link></li>
              <li><Link to="/pricing" className="hover:text-primary-600 dark:hover:text-primary-400">Pricing</Link></li>
            </ul>
          </div>
          <div>
            <div className="font-semibold mb-3">Company</div>
            <ul className="space-y-2 text-gray-600 dark:text-gray-400">
              <li><Link to="/blogs" className="hover:text-primary-600 dark:hover:text-primary-400">Blog</Link></li>
              <li><Link to="/tutorials" className="hover:text-primary-600 dark:hover:text-primary-400">Tutorials</Link></li>
              <li><Link to="/faq" className="hover:text-primary-600 dark:hover:text-primary-400">FAQ</Link></li>
            </ul>
          </div>
          <div>
            <div className="font-semibold mb-3">Legal</div>
            <ul className="space-y-2 text-gray-600 dark:text-gray-400">
              <li><Link to="/terms" className="hover:text-primary-600 dark:hover:text-primary-400">Terms</Link></li>
              <li><Link to="/privacy" className="hover:text-primary-600 dark:hover:text-primary-400">Privacy</Link></li>
            </ul>
          </div>
        </div>
        <div className="border-t border-gray-200 dark:border-gray-800 py-5 text-center text-xs text-gray-500">
          © {new Date().getFullYear()} Northwest Creek LLC. All rights reserved.
        </div>
      </footer>
    </div>
  );
};

export default LandingV2;
