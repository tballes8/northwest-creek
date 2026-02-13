import React, { useEffect, useState, useRef, useMemo } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { authAPI, watchlistAPI, portfolioAPI, alertsAPI } from '../services/api';
import { User, WatchlistItem, PortfolioPosition, Alert } from '../types';
import ThemeToggle from '../components/ThemeToggle';
import { useLivePriceContext } from '../contexts/LivePriceContext';
import MarketStatusBadge from '../components/MarketStatusBadge';
import SectorPieChart from '../components/SectorPieChart';
import { computeSectorBreakdown } from '../utils/sectorMap';
import '../styles/livePrice.css';
import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

interface IPOItem {
  ticker: string;
  issuer_name: string;
  listing_date: string | null;
  final_issue_price: number | null;
  lowest_offer_price: number | null;
  highest_offer_price: number | null;
  total_offer_size: number | null;
  primary_exchange: string | null;
  security_type: string | null;
  ipo_status: string | null;
}

interface DashboardPosition {
  ticker: string;
  quantity: number;
  buy_price: number;
  current_price?: number;
  total_value?: number;
  profit_loss?: number;
  profit_loss_percent?: number;
}

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [positions, setPositions] = useState<DashboardPosition[]>([]);
  const [watchlistTickers, setWatchlistTickers] = useState<string[]>([]);
  const [stats, setStats] = useState({
    watchlistCount: 0,
    portfolioCount: 0,
    alertsCount: 0,
    portfolioValue: 0,
    portfolioPL: 0,
    portfolioPLPercent: 0,
  });

  // Live price context
  const { prices, isConnected, subscribe, unsubscribe } = useLivePriceContext();
  const previousPricesRef = useRef<Map<string, number>>(new Map());
  const [valueFlash, setValueFlash] = useState<'green' | 'red' | null>(null);

  // IPO data
  const [ipoData, setIpoData] = useState<{ upcoming: IPOItem[]; pending: IPOItem[]; rumored: IPOItem[] }>({ upcoming: [], pending: [], rumored: [] });
  const [ipoLoading, setIpoLoading] = useState(false);
  const [ipoTab, setIpoTab] = useState<'upcoming' | 'pending' | 'rumored'>('upcoming');

  // User dropdown menu
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  // Sector breakdowns for pie charts
  const portfolioSectors = useMemo(
    () => computeSectorBreakdown(
      positions.map(p => ({ ticker: p.ticker, value: p.total_value || (p.current_price || p.buy_price) * p.quantity }))
    ),
    [positions]
  );

  const watchlistSectors = useMemo(
    () => computeSectorBreakdown(
      watchlistTickers.map(ticker => ({ ticker }))
    ),
    [watchlistTickers]
  );

  useEffect(() => {
    loadDashboardData();
  }, [location.pathname]);

  // Derive a stable ticker string so we only re-subscribe when actual tickers change
  const tickerList = useMemo(
    () => positions.map(pos => pos.ticker).sort().join(','),
    [positions]
  );

  // Subscribe to portfolio tickers for live prices
  useEffect(() => {
    if (tickerList && isConnected) {
      const tickers = tickerList.split(',');
      subscribe(tickers);
      return () => {
        unsubscribe(tickers);
      };
    }
  }, [tickerList, isConnected, subscribe, unsubscribe]);

  // Update positions and dashboard stats with live prices
  useEffect(() => {
    if (prices.size === 0 || positions.length === 0) return;

    let hasChange = false;

    const updatedPositions = positions.map(pos => {
      const livePrice = prices.get(pos.ticker);
      if (!livePrice) return pos;

      const previousPrice = previousPricesRef.current.get(pos.ticker) || pos.current_price || livePrice.price;

      if (livePrice.price !== previousPrice) {
        hasChange = true;
        previousPricesRef.current.set(pos.ticker, livePrice.price);

        const totalValue = livePrice.price * pos.quantity;
        const profitLoss = totalValue - (pos.buy_price * pos.quantity);
        const profitLossPercent = ((livePrice.price - pos.buy_price) / pos.buy_price) * 100;

        return {
          ...pos,
          current_price: livePrice.price,
          total_value: totalValue,
          profit_loss: profitLoss,
          profit_loss_percent: profitLossPercent,
        };
      }
      return pos;
    });

    if (hasChange) {
      setPositions(updatedPositions);

      // Recalculate dashboard totals
      const totalValue = updatedPositions.reduce((sum, p) => sum + (p.total_value || 0), 0);
      const totalCost = updatedPositions.reduce((sum, p) => sum + (p.buy_price * p.quantity), 0);
      const totalPL = totalValue - totalCost;
      const totalPLPercent = totalCost > 0 ? (totalPL / totalCost) * 100 : 0;

      // Flash animation on the portfolio value card
      const prevTotalValue = stats.portfolioValue;
      if (totalValue !== prevTotalValue) {
        setValueFlash(totalValue > prevTotalValue ? 'green' : 'red');
        setTimeout(() => setValueFlash(null), 600);
      }

      setStats(prev => ({
        ...prev,
        portfolioValue: totalValue,
        portfolioPL: totalPL,
        portfolioPLPercent: totalPLPercent,
      }));
    }
  }, [prices]);

  // Close user menu on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const loadDashboardData = async () => {
    try {
      // Get current user
      const userResponse = await authAPI.getCurrentUser();
      setUser(userResponse.data);

      // Get watchlist count
      const watchlistResponse = await watchlistAPI.getAll();
      const watchlistItems = watchlistResponse.data.items || [];
      const watchlistCount = watchlistItems.length;
      setWatchlistTickers(watchlistItems.map((item: any) => item.ticker));

      // Get portfolio data
      const portfolioResponse = await portfolioAPI.getAll();
      const portfolioData = portfolioResponse.data;
      const portfolioPositions: DashboardPosition[] = (portfolioData.positions || []).map((p: any) => ({
        ticker: p.ticker,
        quantity: p.quantity,
        buy_price: p.buy_price,
        current_price: p.current_price,
        total_value: p.total_value,
        profit_loss: p.profit_loss,
        profit_loss_percent: p.profit_loss_percent,
      }));
      const portfolioCount = portfolioPositions.length;
      const portfolioValue = portfolioData.total_current_value || 0;
      const portfolioPL = portfolioData.total_profit_loss || 0;
      const portfolioPLPercent = portfolioData.total_profit_loss_percent || 0;

      // Get alerts count
      const alertsResponse = await alertsAPI.getAll();
      const alertsCount = alertsResponse.data.alerts?.filter((a: Alert) => a.is_active).length || 0;

      setPositions(portfolioPositions);
      setStats({
        watchlistCount,
        portfolioCount,
        alertsCount,
        portfolioValue,
        portfolioPL,
        portfolioPLPercent,
      });

      // Fetch IPO data
      try {
        setIpoLoading(true);
        const token = localStorage.getItem('access_token');
        const ipoResponse = await axios.get(`${API_URL}/api/v1/stocks/ipos`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setIpoData(ipoResponse.data);
      } catch (ipoErr) {
        console.warn('Could not fetch IPO data:', ipoErr);
      } finally {
        setIpoLoading(false);
      }
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
      // If unauthorized, redirect to login
      if ((error as any).response?.status === 401) {
        localStorage.removeItem('access_token');
        navigate('/login');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadDashboardData();
  };

  const handleLogout = () => {
    localStorage.removeItem('access_token');
    navigate('/');
  };

  const handleSectorClick = (sector: string) => {
    navigate(`/stocks?sector=${encodeURIComponent(sector)}`);
  };

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

  const getTierLimit = () => {
    const limits = {
      free: 5,
      casual: 20,
      active: 45,
      professional: 75
    };
    return limits[user?.subscription_tier as keyof typeof limits] || 5;
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
    <div className="min-h-screen bg-gray-50 dark:bg-gray-800">
      {/* Navigation */}
      <nav className="bg-gray-900 dark:bg-gray-900 shadow-sm border-b border-gray-700 dark:border-gray-700">
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <img src="/images/logo.png" alt="Northwest Creek" className="h-10 w-10 mr-3" />
              <span className="text-xl font-bold text-primary-400 dark:text-primary-400" style={{ fontFamily: "'Viner Hand ITC', 'Caveat', cursive", fontSize: '1.8rem', fontStyle: 'italic' }}>Northwest Creek</span>
            </div>
            
            <div className="hidden md:flex items-center space-x-8">
              <Link to="/dashboard" className="text-primary-400 dark:text-primary-400 font-medium border-b-2 border-primary-600 dark:border-primary-400 pb-1">Dashboard</Link>
              <Link to="/watchlist" className="text-gray-400 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">Watchlist</Link>
              <Link to="/portfolio" className="text-gray-400 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">Portfolio</Link>
              <Link to="/alerts" className="text-gray-400 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">Alerts</Link>
              <Link to="/stocks" className="text-gray-400 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">Stocks</Link>
              <Link to="/technical-analysis" className="text-gray-400 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">Technical Analysis</Link>
              <Link to="/dcf-valuation" className="text-gray-400 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">DCF Valuation</Link>
            </div>

            <div className="flex items-center space-x-4">
              <div className="relative" ref={userMenuRef}>
                <button
                  onClick={() => setUserMenuOpen(!userMenuOpen)}
                  className="flex items-center gap-2 text-sm text-gray-300 hover:text-teal-400 transition-colors focus:outline-none"
                >
                  <span className="hidden lg:inline">{user?.email}</span>
                  <span className="lg:hidden">{user?.email?.split('@')[0]}</span>
                  {user && getTierBadge(user.subscription_tier)}
                  <svg className={`w-4 h-4 transition-transform ${userMenuOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {userMenuOpen && (
                  <div className="absolute right-0 mt-2 w-56 bg-gray-800 border border-gray-600 rounded-lg shadow-xl z-50 py-1 animate-in fade-in duration-150">
                    <div className="px-4 py-2 border-b border-gray-700">
                      <p className="text-sm font-medium text-white truncate">{user?.full_name || user?.email}</p>
                      <p className="text-xs text-gray-400 truncate">{user?.email}</p>
                    </div>

                    <Link
                      to="/account"
                      onClick={() => setUserMenuOpen(false)}
                      className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                      Account Settings
                    </Link>
                    <Link
                      to="/tutorials"
                      onClick={() => setUserMenuOpen(false)}
                      className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                      Tutorials
                    </Link>
                    <Link
                      to="/blogs"
                      onClick={() => setUserMenuOpen(false)}
                      className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" /></svg>
                      Blog
                    </Link>

                    {user?.is_admin && (
                      <>
                        <div className="border-t border-gray-700 my-1"></div>
                        <Link
                          to="/admin"
                          onClick={() => setUserMenuOpen(false)}
                          className="flex items-center gap-3 px-4 py-2.5 text-sm text-amber-400 hover:bg-gray-700 hover:text-amber-300 transition-colors"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                          Admin Panel
                        </Link>
                      </>
                    )}

                    <div className="border-t border-gray-700 my-1"></div>
                    <button
                      onClick={() => { setUserMenuOpen(false); handleLogout(); }}
                      className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-red-400 hover:bg-gray-700 hover:text-red-300 transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                      Logout
                    </button>
                  </div>
                )}
              </div>
              <ThemeToggle />
            </div>
          </div>
        </div>
      </nav>

    {/* Main Content */}
    <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Welcome Section with Refresh Button & Market Status */}
      <div className="mb-8 flex justify-between items-start">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
              Welcome back, {user?.full_name || 'Investor'}!
            </h1>
            <MarketStatusBadge isConnected={isConnected} />
          </div>
          <p className="text-gray-600 dark:text-gray-400 mt-1">Here's your portfolio overview</p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 dark:bg-primary-500 dark:hover:bg-primary-600 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <svg 
            className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} 
            fill="none" 
            viewBox="0 0 24 24" 
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          {refreshing ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {/* Portfolio Value Card — flashes on live update */}
        <div
          className={`bg-white dark:bg-gray-700 rounded-lg shadow dark:shadow-gray-200/20 p-4 border dark:border-gray-500 price-transition ${
            valueFlash === 'green'
              ? 'ring-2 ring-green-400'
              : valueFlash === 'red'
              ? 'ring-2 ring-red-400'
              : ''
          }`}
          style={
            valueFlash === 'green'
              ? { animation: 'price-flash-green 0.6s ease-in-out' }
              : valueFlash === 'red'
              ? { animation: 'price-flash-red 0.6s ease-in-out' }
              : undefined
          }
        >
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <p className="text-xs text-gray-600 dark:text-gray-400 mb-0.5">Portfolio Value</p>
              <p className="text-xl font-bold text-gray-900 dark:text-white truncate">
                ${stats.portfolioValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              <p className={`text-xs font-medium mt-0.5 ${stats.portfolioPL >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                {stats.portfolioPL >= 0 ? '+' : ''}{stats.portfolioPL.toFixed(2)} ({stats.portfolioPLPercent >= 0 ? '+' : ''}{stats.portfolioPLPercent.toFixed(2)}%)
              </p>
            </div>
            <div className="bg-green-100 dark:bg-green-900/30 rounded-lg p-2 ml-2 flex-shrink-0">
              <svg className="w-5 h-5 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-700 rounded-lg shadow dark:shadow-gray-200/20 p-4 border dark:border-gray-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-600 dark:text-gray-400 mb-0.5">Watchlist</p>
              <p className="text-xl font-bold text-gray-900 dark:text-white">{stats.watchlistCount}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">of {getTierLimit()} stocks</p>
            </div>
            <div className="bg-primary-100 dark:bg-primary-900/30 rounded-lg p-2 ml-2 flex-shrink-0">
              <svg className="w-5 h-5 text-primary-600 dark:text-primary-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
              </svg>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-700 rounded-lg shadow dark:shadow-gray-200/20 p-4 border dark:border-gray-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-600 dark:text-gray-400 mb-0.5">Positions</p>
              <p className="text-xl font-bold text-gray-900 dark:text-white">{stats.portfolioCount}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">of {getTierLimit()} positions</p>
            </div>
            <div className="bg-purple-100 dark:bg-purple-900/30 rounded-lg p-2 ml-2 flex-shrink-0">
              <svg className="w-5 h-5 text-purple-600 dark:text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-700 rounded-lg shadow dark:shadow-gray-200/20 p-4 border dark:border-gray-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-600 dark:text-gray-400 mb-0.5">Active Alerts</p>
              <p className="text-xl font-bold text-gray-900 dark:text-white">{stats.alertsCount}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">monitoring</p>
            </div>
            <div className="bg-yellow-100 dark:bg-yellow-900/30 rounded-lg p-2 ml-2 flex-shrink-0">
              <svg className="w-5 h-5 text-yellow-600 dark:text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-white dark:bg-gray-700 rounded-lg shadow p-4 border dark:border-gray-500">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Quick Actions</h2>
        <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
          <Link to="/watchlist" className="flex items-center p-2.5 border border-gray-200 dark:border-gray-600 rounded-lg hover:border-primary-500 dark:hover:border-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors">
            <div className="bg-primary-100 dark:bg-primary-900/30 rounded p-1.5 mr-2">
              <svg className="w-3.5 h-3.5 text-primary-600 dark:text-primary-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </div>
            <span className="text-xs font-medium text-gray-700 dark:text-gray-300">Watchlist</span>
          </Link>
          <Link to="/portfolio" className="flex items-center p-2.5 border border-gray-200 dark:border-gray-600 rounded-lg hover:border-green-500 dark:hover:border-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors">
            <div className="bg-green-100 dark:bg-green-900/30 rounded p-1.5 mr-2">
              <svg className="w-3.5 h-3.5 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </div>
            <span className="text-xs font-medium text-gray-700 dark:text-gray-300">Portfolio</span>
          </Link>
          <Link to="/alerts" className="flex items-center p-2.5 border border-gray-200 dark:border-gray-600 rounded-lg hover:border-purple-500 dark:hover:border-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors">
            <div className="bg-purple-100 dark:bg-purple-900/30 rounded p-1.5 mr-2">
              <svg className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
            </div>
            <span className="text-xs font-medium text-gray-700 dark:text-gray-300">Alerts</span>
          </Link>
          <Link to="/stocks" className="flex items-center p-2.5 border border-gray-200 dark:border-gray-600 rounded-lg hover:border-blue-500 dark:hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors">
            <div className="bg-blue-100 dark:bg-blue-900/30 rounded p-1.5 mr-2">
              <svg className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <span className="text-xs font-medium text-gray-700 dark:text-gray-300">Stocks</span>
          </Link>
          <Link to="/stocks?showTopGainers=true" className="flex items-center p-2.5 border border-gray-200 dark:border-gray-600 rounded-lg hover:border-orange-500 dark:hover:border-orange-400 hover:bg-orange-50 dark:hover:bg-orange-900/20 transition-colors">
            <div className="bg-orange-100 dark:bg-orange-900/30 rounded p-1.5 mr-2">
              <svg className="w-3.5 h-3.5 text-orange-600 dark:text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
            </div>
            <span className="text-xs font-medium text-gray-700 dark:text-gray-300">Gainers</span>
          </Link>
          <Link to="/technical-analysis" className="flex items-center p-2.5 border border-gray-200 dark:border-gray-600 rounded-lg hover:border-teal-500 dark:hover:border-teal-400 hover:bg-teal-50 dark:hover:bg-teal-900/20 transition-colors">
            <div className="bg-teal-100 dark:bg-teal-900/30 rounded p-1.5 mr-2">
              <svg className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <span className="text-xs font-medium text-gray-700 dark:text-gray-300">Analysis</span>
          </Link>
        </div>
      </div>

      {/* Recent Activity / Empty State */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-8">
        {/* Portfolio Summary */}
        <div className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 p-6 border dark:border-gray-500">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Portfolio Overview</h2>
            <Link to="/portfolio" className="text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 font-medium">
              View all →
            </Link>
          </div>
          {stats.portfolioCount > 0 ? (
            <div className="space-y-4">
              <p className="text-sm text-gray-600 dark:text-gray-400">{stats.portfolioCount} position(s) tracked</p>
              {portfolioSectors.length > 0 && (
                <div className="pt-2">
                  <SectorPieChart
                    data={portfolioSectors}
                    title="Sector Allocation"
                    mode="value"
                    size={140}
                    onSectorClick={handleSectorClick}
                  />
                </div>
              )}
              <div className="border-t dark:border-gray-600 pt-3">
                <Link 
                  to="/portfolio"
                  className="text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 text-sm font-medium"
                >
                  Manage your positions →
                </Link>
              </div>
            </div>
          ) : (
            <div className="text-center py-8">
              <div className="bg-gray-100 dark:bg-gray-700 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-gray-400 dark:text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </div>
              <p className="text-gray-600 dark:text-gray-400 mb-4">No portfolio positions yet</p>
              <Link
                to="/portfolio"
                className="inline-block bg-primary-600 hover:bg-primary-700 dark:bg-primary-500 dark:hover:bg-primary-600 text-white px-4 py-2 rounded-lg font-medium transition-colors"
              >
                Add Your First Position
              </Link>
            </div>
          )}
        </div>

        {/* Watchlist Summary */}
        <div className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 p-6 border dark:border-gray-500">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Watchlist Overview</h2>
            <Link to="/watchlist" className="text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 font-medium">
              View all →
            </Link>
          </div>
          {stats.watchlistCount > 0 ? (
            <div className="space-y-4">
              <p className="text-sm text-gray-600 dark:text-gray-400">{stats.watchlistCount} stock(s) watched</p>
              {watchlistSectors.length > 0 && (
                <div className="pt-2">
                  <SectorPieChart
                    data={watchlistSectors}
                    title="Sector Breakdown"
                    mode="count"
                    size={140}
                    onSectorClick={handleSectorClick}
                  />
                </div>
              )}
              <div className="border-t dark:border-gray-600 pt-3">
                <Link 
                  to="/watchlist"
                  className="text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 text-sm font-medium"
                >
                  View your watchlist →
                </Link>
              </div>
            </div>
          ) : (
            <div className="text-center py-8">
              <div className="bg-gray-100 dark:bg-gray-700 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-gray-400 dark:text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                </svg>
              </div>
              <p className="text-gray-600 dark:text-gray-400 mb-4">No stocks in watchlist</p>
              <Link
                to="/watchlist"
                className="inline-block bg-primary-600 hover:bg-primary-700 dark:bg-primary-500 dark:hover:bg-primary-600 text-white px-4 py-2 rounded-lg font-medium transition-colors"
              >
                Add Your First Stock
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* IPO Tracker */}
      <div className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 p-6 border dark:border-gray-500 mt-8">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-primary-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">IPO Tracker</h2>
          </div>
          <div className="flex rounded-lg overflow-hidden border border-gray-200 dark:border-gray-600">
            {(['upcoming', 'pending', 'rumored'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setIpoTab(tab)}
                className={`px-4 py-1.5 text-xs font-medium transition-colors ${
                  ipoTab === tab
                    ? 'bg-primary-600 text-white'
                    : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                }`}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
                {ipoData[tab].length > 0 && (
                  <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-xs ${
                    ipoTab === tab ? 'bg-primary-500 text-white' : 'bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300'
                  }`}>
                    {ipoData[tab].length}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {ipoLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
            <span className="ml-3 text-gray-500 dark:text-gray-400">Loading IPOs...</span>
          </div>
        ) : ipoData[ipoTab].length === 0 ? (
          <div className="text-center py-10">
            <svg className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
            </svg>
            <p className="text-gray-500 dark:text-gray-400">No {ipoTab} IPOs found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-600">
              <thead className="bg-gray-800 dark:bg-gray-900">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Ticker</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Company</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                    {ipoTab === 'rumored' ? 'Status' : 'Expected Date'}
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-300 uppercase tracking-wider">
                    {ipoTab === 'rumored' ? 'Exchange' : 'Est. Price'}
                  </th>
                  {ipoTab !== 'rumored' && (
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-300 uppercase tracking-wider">Price Range</th>
                  )}
                  {ipoTab !== 'rumored' && (
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-300 uppercase tracking-wider">Offer Size</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-600">
                {ipoData[ipoTab].map((ipo, idx) => (
                  <tr key={`${ipo.ticker}-${idx}`} className="hover:bg-gray-50 dark:hover:bg-gray-600/50 transition-colors">
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="text-sm font-semibold text-primary-600 dark:text-primary-400">
                        {ipo.ticker || '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm text-gray-900 dark:text-white font-medium truncate max-w-xs">{ipo.issuer_name}</div>
                      {ipo.security_type && (
                        <div className="text-xs text-gray-500 dark:text-gray-400">{ipo.security_type}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {ipoTab === 'rumored' ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300">
                          Rumored
                        </span>
                      ) : ipo.listing_date ? (
                        <span className="text-sm text-gray-900 dark:text-white">
                          {new Date(ipo.listing_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </span>
                      ) : (
                        <span className="text-sm text-gray-400 dark:text-gray-500">TBD</span>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-right">
                      {ipoTab === 'rumored' ? (
                        <span className="text-sm text-gray-600 dark:text-gray-400">{ipo.primary_exchange || '—'}</span>
                      ) : ipo.final_issue_price ? (
                        <span className="text-sm font-semibold text-gray-900 dark:text-white">${ipo.final_issue_price.toFixed(2)}</span>
                      ) : (
                        <span className="text-sm text-gray-400 dark:text-gray-500">—</span>
                      )}
                    </td>
                    {ipoTab !== 'rumored' && (
                      <td className="px-4 py-3 whitespace-nowrap text-right">
                        {ipo.lowest_offer_price && ipo.highest_offer_price ? (
                          <span className="text-sm text-gray-600 dark:text-gray-400">
                            ${ipo.lowest_offer_price.toFixed(2)} – ${ipo.highest_offer_price.toFixed(2)}
                          </span>
                        ) : (
                          <span className="text-sm text-gray-400 dark:text-gray-500">—</span>
                        )}
                      </td>
                    )}
                    {ipoTab !== 'rumored' && (
                      <td className="px-4 py-3 whitespace-nowrap text-right">
                        {ipo.total_offer_size ? (
                          <span className="text-sm text-gray-600 dark:text-gray-400">
                            ${(ipo.total_offer_size / 1e6).toFixed(1)}M
                          </span>
                        ) : (
                          <span className="text-sm text-gray-400 dark:text-gray-500">—</span>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Upgrade CTA (for Free users) */}
      {user?.subscription_tier === 'free' && (
        <div className="mt-8 bg-gradient-to-r from-primary-600 to-primary-700 dark:from-primary-700 dark:to-primary-800 rounded-lg shadow-lg p-8 text-center">
          <h3 className="text-2xl font-bold text-white mb-2">
            Upgrade to Casual Investor to unlock more features
          </h3>
          <p className="text-primary-100 dark:text-primary-200 mb-6">
            Track 20 stocks, 20 positions, and 5 alerts. Only $20/month.
          </p>
          <button className="bg-white text-primary-600 px-8 py-3 rounded-lg font-semibold hover:bg-gray-100 transition-colors">
            Upgrade to Casual Investor
          </button>
        </div>
      )}
    </div>
  </div>
);
};

export default Dashboard;