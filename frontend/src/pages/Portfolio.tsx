import React, { useEffect, useState, useRef, useMemo } from 'react';
import { useLocation, Link, useNavigate } from 'react-router-dom';
import { authAPI, portfolioAPI } from '../services/api';
import { User } from '../types';
import ThemeToggle from '../components/ThemeToggle';
import IntradayModal from '../components/Intradaymodal';
import { useLivePriceContext } from '../contexts/LivePriceContext';
import MarketStatusBadge from '../components/MarketStatusBadge';
import '../styles/livePrice.css';
import { getSector, SECTOR_COLORS } from '../utils/sectorMap';
import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

interface PortfolioPosition {
  id: string;
  ticker: string;
  quantity: number;
  buy_price: number;
  buy_date: string;
  notes?: string;
  current_price?: number;
  total_value?: number;
  profit_loss?: number;
  profit_loss_percent?: number;
  created_at: string;
}

const Portfolio: React.FC = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [portfolio, setPortfolio] = useState<PortfolioPosition[]>([]);
  const [loading, setLoading] = useState(true);
  const [addingPosition, setAddingPosition] = useState(false);
  const [newTicker, setNewTicker] = useState('');
  const [newQuantity, setNewQuantity] = useState('');
  const [newBuyPrice, setNewBuyPrice] = useState('');
  const [newBuyDate, setNewBuyDate] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [error, setError] = useState('');
  const location = useLocation();
  const [refreshing, setRefreshing] = useState(false);
  const [showIntradayModal, setShowIntradayModal] = useState(false);
  const [selectedTicker, setSelectedTicker] = useState<string>('');
  const { prices, isConnected, subscribe, unsubscribe } = useLivePriceContext();
  const [priceFlash, setPriceFlash] = useState<Record<string, 'green' | 'red' | null>>({});
  const [editingPosition, setEditingPosition] = useState<string | null>(null);
  const [editQuantity, setEditQuantity] = useState('');
  const [editBuyPrice, setEditBuyPrice] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const previousPricesRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    loadData();
  }, [location.pathname]);
  
  // Derive a stable ticker string that only changes when the actual tickers change,
  // NOT when prices/quantities/etc update within the portfolio array.
  const tickerList = useMemo(
    () => portfolio.map(pos => pos.ticker).sort().join(','),
    [portfolio]
  );

  // Subscribe to portfolio tickers for live prices.
  // Depends on tickerList (stable string) instead of portfolio (changes on every price update).
  useEffect(() => {
    if (tickerList && isConnected) {
      const tickers = tickerList.split(',');
      subscribe(tickers);
      
      return () => {
        unsubscribe(tickers);
      };
    }
  }, [tickerList, isConnected, subscribe, unsubscribe]);

  // Update portfolio with live prices and trigger flash animations
  useEffect(() => {
    if (prices.size === 0) return;
    
    setPortfolio(prevPortfolio => {
      return prevPortfolio.map(pos => {
        const livePrice = prices.get(pos.ticker);
        if (!livePrice) return pos;
        
        const previousPrice = previousPricesRef.current.get(pos.ticker) || pos.current_price || livePrice.price;
        
        if (livePrice.price !== previousPrice) {
          const isUp = livePrice.price > previousPrice;
          setPriceFlash(prev => ({ ...prev, [pos.ticker]: isUp ? 'green' : 'red' }));
          
          setTimeout(() => {
            setPriceFlash(prev => ({ ...prev, [pos.ticker]: null }));
          }, 600);
          
          previousPricesRef.current.set(pos.ticker, livePrice.price);
          
          const totalValue = livePrice.price * pos.quantity;
          const profitLoss = totalValue - (pos.buy_price * pos.quantity);
          const profitLossPercent = ((livePrice.price - pos.buy_price) / pos.buy_price) * 100;
          
          return {
            ...pos,
            current_price: livePrice.price,
            total_value: totalValue,
            profit_loss: profitLoss,
            profit_loss_percent: profitLossPercent
          };
        }
        
        return pos;
      });
    });
  }, [prices]);

  // Auto-refresh prices every 30 seconds via REST (catches updates WebSocket misses on low-volume stocks)
  useEffect(() => {
    if (!tickerList) return;

    const refreshPrices = async () => {
      try {
        const token = localStorage.getItem('access_token');
        const priceResponse = await axios.get(
          `${API_URL}/api/v1/intraday/batch?tickers=${tickerList}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );

        const freshPrices: Record<string, number> = {};
        if (Array.isArray(priceResponse.data)) {
          priceResponse.data.forEach((item: any) => {
            if (item.ticker && item.price) {
              freshPrices[item.ticker] = item.price;
            }
          });
        }

        setPortfolio(prev => prev.map(pos => {
          const freshPrice = freshPrices[pos.ticker];
          if (freshPrice && freshPrice !== pos.current_price) {
            // Flash animation
            const isUp = freshPrice > (pos.current_price || 0);
            setPriceFlash(pf => ({ ...pf, [pos.ticker]: isUp ? 'green' : 'red' }));
            setTimeout(() => setPriceFlash(pf => ({ ...pf, [pos.ticker]: null })), 600);

            const totalValue = freshPrice * pos.quantity;
            const profitLoss = totalValue - (pos.buy_price * pos.quantity);
            const profitLossPercent = ((freshPrice - pos.buy_price) / pos.buy_price) * 100;
            return { ...pos, current_price: freshPrice, total_value: totalValue, profit_loss: profitLoss, profit_loss_percent: profitLossPercent };
          }
          return pos;
        }));
      } catch (err) {
        // Silent fail — WebSocket and initial load are primary, this is supplemental
      }
    };

    const interval = setInterval(refreshPrices, 30000);
    return () => clearInterval(interval);
  }, [tickerList]);

  const loadData = async () => {
    try {
      const userResponse = await authAPI.getCurrentUser();
      setUser(userResponse.data);

      const portfolioResponse = await portfolioAPI.getAll();
      const positions = portfolioResponse.data.positions || [];
      
      // Fetch fresh prices from Massive API for all portfolio tickers
      if (positions.length > 0) {
        try {
          const tickers = positions.map((p: PortfolioPosition) => p.ticker).join(',');
          const token = localStorage.getItem('access_token');
          const priceResponse = await axios.get(
            `${API_URL}/api/v1/intraday/batch?tickers=${tickers}`,
            { headers: { Authorization: `Bearer ${token}` } }
          );
          
          // Build a price map from the fresh data
          const freshPrices: Record<string, number> = {};
          if (Array.isArray(priceResponse.data)) {
            priceResponse.data.forEach((item: any) => {
              if (item.ticker && item.price) {
                freshPrices[item.ticker] = item.price;
              }
            });
          }
          
          // Update positions with fresh prices
          const updatedPositions = positions.map((pos: PortfolioPosition) => {
            const freshPrice = freshPrices[pos.ticker];
            if (freshPrice) {
              const totalValue = freshPrice * pos.quantity;
              const profitLoss = totalValue - (pos.buy_price * pos.quantity);
              const profitLossPercent = ((freshPrice - pos.buy_price) / pos.buy_price) * 100;
              return {
                ...pos,
                current_price: freshPrice,
                total_value: totalValue,
                profit_loss: profitLoss,
                profit_loss_percent: profitLossPercent,
              };
            }
            return pos;
          });
          
          setPortfolio(updatedPositions);
          console.log(`✅ Refreshed prices for ${Object.keys(freshPrices).length} tickers`);
        } catch (priceErr) {
          console.warn('⚠️ Could not fetch fresh prices, using cached:', priceErr);
          setPortfolio(positions);
        }
      } else {
        setPortfolio(positions);
      }
    } catch (error) {
      console.error('Failed to load data:', error);
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
    await loadData();
  };

  // User dropdown menu
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);  

  const calculateTotals = () => {
    const totalValue = portfolio.reduce((sum, pos) => sum + (pos.total_value || 0), 0);
    const totalCost = portfolio.reduce((sum, pos) => sum + (pos.buy_price * pos.quantity), 0);
    const totalPL = totalValue - totalCost;
    const totalPLPercent = totalCost > 0 ? (totalPL / totalCost) * 100 : 0;

    return { totalValue, totalCost, totalPL, totalPLPercent };
  };

  const handleAddPosition = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!newTicker.trim() || !newQuantity || !newBuyPrice || !newBuyDate) {
      setError('Please fill in all required fields');
      return;
    }

    if (parseFloat(newQuantity) <= 0) {
      setError('Quantity must be greater than 0');
      return;
    }

    if (parseFloat(newBuyPrice) <= 0) {
      setError('Buy price must be greater than 0');
      return;
    }

    try {
      await portfolioAPI.add({
        ticker: newTicker.toUpperCase().trim(),
        quantity: parseFloat(newQuantity),
        buy_price: parseFloat(newBuyPrice),
        buy_date: newBuyDate,
        notes: newNotes.trim() || undefined
      });

      await loadData();

      setNewTicker('');
      setNewQuantity('');
      setNewBuyPrice('');
      setNewBuyDate('');
      setNewNotes('');
      setAddingPosition(false);
    } catch (err: any) {
      console.error('Add position error:', err.response?.data);
      setError(err.response?.data?.detail || 'Failed to add position. Please check the ticker symbol.');
    }
  };

  const handleRemovePosition = async (id: string) => {
    if (!window.confirm('Remove this position from your portfolio?')) {
      return;
    }

    try {
      await portfolioAPI.remove(id);
      setPortfolio(prevList => prevList.filter(pos => pos.id !== id));
    } catch (err) {
      console.error('Failed to remove position:', err);
      setError('Failed to remove position');
      await loadData();
    }
  };

  const handleStartEdit = (position: PortfolioPosition) => {
    setEditingPosition(position.id);
    setEditQuantity(position.quantity.toString());
    setEditBuyPrice(position.buy_price.toFixed(2));
    setEditNotes(position.notes || '');
  };

  const handleCancelEdit = () => {
    setEditingPosition(null);
    setEditQuantity('');
    setEditBuyPrice('');
    setEditNotes('');
  };

  const handleSaveEdit = async (id: string) => {
    try {
      const payload: any = {};
      
      if (editQuantity && parseFloat(editQuantity) > 0) {
        payload.quantity = parseFloat(editQuantity);
      }
      
      if (editBuyPrice && parseFloat(editBuyPrice) > 0) {
        payload.buy_price = parseFloat(editBuyPrice);
      }

      if (editNotes.trim()) {
        payload.notes = editNotes.trim();
      }
      
      await portfolioAPI.update(id, payload);
      await loadData();
      setEditingPosition(null);
      setEditQuantity('');
      setEditBuyPrice('');
      setEditNotes('');
    } catch (err: any) {
      console.error('Update position error:', err);
      alert('Failed to update position. Please try again.');
    }
  };  

  const handleTickerClick = (ticker: string) => {
    setSelectedTicker(ticker);
    setShowIntradayModal(true);
  };

  const handleLogout = () => {
    localStorage.removeItem('access_token');
    navigate('/');
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
    return limits[user?.subscription_tier as keyof typeof limits] || 3;
  };

  const totals = calculateTotals();

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
          <p className="mt-4 text-gray-600 dark:text-gray-400">Loading portfolio...</p>
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
              <Link to="/dashboard" className="text-gray-400 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">Dashboard</Link>
              <Link to="/watchlist" className="text-gray-400 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">Watchlist</Link>
              <Link to="/portfolio" className="text-primary-400 dark:text-primary-400 font-medium border-b-2 border-primary-600 dark:border-primary-400 pb-1">Portfolio</Link>
              <Link to="/alerts" className="text-gray-400 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">Alerts</Link>
              <Link to="/stocks?showTopGainers=true" className="text-gray-400 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">Stocks</Link>
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

      <div className="max-w-screen-2xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        {/* Portfolio Summary */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 p-6 border dark:border-gray-500">
            <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Positions</div>
            <div className="text-2xl font-bold text-gray-900 dark:text-white">{portfolio.length} / {getTierLimit()}</div>
          </div>
          <div className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 p-6 border dark:border-gray-500">
            <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Total Value</div>
            <div className="text-2xl font-bold text-gray-900 dark:text-white">${totals.totalValue.toFixed(2)}</div>
          </div>
          <div className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 p-6 border dark:border-gray-500">
            <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Total P&L</div>
            <div className={`text-2xl font-bold ${
              totals.totalPL >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
            }`}>
              {totals.totalPL >= 0 ? '+' : ''}${totals.totalPL.toFixed(2)}
            </div>
          </div>
          <div className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 p-6 border dark:border-gray-500">
            <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Total P&L %</div>
            <div className={`text-2xl font-bold ${
              totals.totalPLPercent >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
            }`}>
              {totals.totalPLPercent >= 0 ? '+' : ''}{totals.totalPLPercent.toFixed(2)}%
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">My Portfolio</h1>
          <div className="flex gap-3">
            <MarketStatusBadge isConnected={isConnected} />
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 flex items-center gap-2">
              {/* refresh button content */}
              {refreshing ? 'Refreshing...' : 'Refresh Prices'}
            </button>
            {!addingPosition && (
              <button
                onClick={() => setAddingPosition(true)}
                className="px-6 py-2 bg-primary-600 hover:bg-primary-700 dark:bg-primary-500 dark:hover:bg-primary-600 text-white rounded-lg font-medium transition-colors"
              >
                Add Position
              </button>
            )}
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-6 p-4 bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-700 rounded-lg">
            <p className="text-red-700 dark:text-red-400">{error}</p>
          </div>
        )}

        {/* Add Position Form */}
        {addingPosition && (
          <div className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 p-6 mb-6 border dark:border-gray-500">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Add New Position</h2>
            <form onSubmit={handleAddPosition} className="space-y-4">
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
                    Quantity *
                  </label>
                  <input
                    type="number"
                    value={newQuantity}
                    onChange={(e) => setNewQuantity(e.target.value)}
                    placeholder="10"
                    step="0.001"
                    min="0"
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Buy Price *
                  </label>
                  <input
                    type="number"
                    value={newBuyPrice}
                    onChange={(e) => setNewBuyPrice(e.target.value)}
                    placeholder="150.00"
                    step="0.01"
                    min="0"
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Buy Date *
                  </label>
                  <input
                    type="date"
                    value={newBuyDate}
                    onChange={(e) => setNewBuyDate(e.target.value)}
                    max={new Date().toISOString().split('T')[0]}
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
                  placeholder="Long-term hold"
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                />
              </div>

              <div className="flex gap-3">
                <button
                  type="submit"
                  className="px-6 py-2 bg-primary-600 hover:bg-primary-700 dark:bg-primary-500 dark:hover:bg-primary-600 text-white rounded-lg font-medium transition-colors"
                >
                  Add Position
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAddingPosition(false);
                    setNewTicker('');
                    setNewQuantity('');
                    setNewBuyPrice('');
                    setNewBuyDate('');
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

        {/* Portfolio Table */}
        {portfolio.length === 0 ? (
          <div className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 p-12 border dark:border-gray-500 text-center">
            <div className="bg-gray-100 dark:bg-gray-600 rounded-full w-24 h-24 flex items-center justify-center mx-auto mb-6">
              <svg className="w-12 h-12 text-gray-400 dark:text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">No Positions Yet</h3>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              Add your first position to start tracking your investments
            </p>
            <button
              onClick={() => setAddingPosition(true)}
              className="px-6 py-3 bg-primary-600 hover:bg-primary-700 dark:bg-primary-500 dark:hover:bg-primary-600 text-white rounded-lg font-medium transition-colors"
            >
              Add Your First Position
            </button>
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 border dark:border-gray-500 overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-600">
              <thead className="bg-gray-50 dark:bg-gray-900">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Ticker</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Sector</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Quantity</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Cost Basis</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Current Price</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Total Value</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">P&L</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Notes</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-700 divide-y divide-gray-200 dark:divide-gray-600">
                {portfolio.map((position) => (
                  <tr key={position.id} className="hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <button
                        onClick={() => handleTickerClick(position.ticker)}
                        className="text-left hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
                      >
                        <div className="text-sm font-bold text-primary-600 dark:text-primary-400 underline cursor-pointer">
                          {position.ticker}
                        </div>
                      </button>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {(() => {
                        const sector = getSector(position.ticker);
                        const color = SECTOR_COLORS[sector] || SECTOR_COLORS['Other'];
                        return (
                          <div className="flex items-center gap-2">
                            <span
                              className="inline-block w-3 h-3 rounded-full flex-shrink-0"
                              style={{ backgroundColor: color }}
                            />
                            <span className="text-sm text-gray-700 dark:text-gray-300">{sector}</span>
                          </div>
                        );
                      })()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      {editingPosition === position.id ? (
                        <input
                          type="number"
                          value={editQuantity}
                          onChange={(e) => setEditQuantity(e.target.value)}
                          step="0.01"
                          min="0"
                          className="w-24 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-right"
                        />
                      ) : (
                        <div className="text-sm text-gray-900 dark:text-white">
                          {position.quantity.toFixed(2)}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      {editingPosition === position.id ? (
                        <input
                          type="number"
                          value={editBuyPrice}
                          onChange={(e) => setEditBuyPrice(e.target.value)}
                          step="0.01"
                          min="0"
                          className="w-24 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-right"
                        />
                      ) : (
                        <div className="text-sm text-gray-900 dark:text-white">
                          ${position.buy_price.toFixed(2)}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      {(() => {
                        // Use live price if available, otherwise use static price
                        const displayPrice = prices.get(position.ticker)?.price ?? position.current_price;
                        const flashClass = priceFlash[position.ticker] ? `flash-${priceFlash[position.ticker]}` : '';
                        
                        return (
                          <div className={`text-sm font-medium text-gray-900 dark:text-white ${flashClass}`}>
                            ${displayPrice ? displayPrice.toFixed(2) : 'N/A'}
                          </div>
                        );
                      })()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <div className="text-sm text-gray-900 dark:text-white">
                        ${position.total_value?.toFixed(2) || '-'}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <div className={`text-sm font-semibold ${
                        (position.profit_loss ?? 0) >= 0 
                          ? 'text-green-600 dark:text-green-400' 
                          : 'text-red-600 dark:text-red-400'
                      }`}>
                        {position.profit_loss !== undefined 
                          ? `${position.profit_loss >= 0 ? '+' : ''}$${position.profit_loss.toFixed(2)}` 
                          : '-'
                        }
                        {position.profit_loss_percent !== undefined && (
                          <div className="text-xs">
                            ({position.profit_loss_percent >= 0 ? '+' : ''}{position.profit_loss_percent.toFixed(2)}%)
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {editingPosition === position.id ? (
                        <input
                          type="text"
                          value={editNotes}
                          onChange={(e) => setEditNotes(e.target.value)}
                          placeholder="Notes"
                          className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                        />
                      ) : (
                        <div className="text-sm text-gray-600 dark:text-gray-400 max-w-xs truncate">
                          {position.notes || '-'}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      {editingPosition === position.id ? (
                        <div className="flex gap-2 justify-end">
                          <button
                            onClick={() => handleSaveEdit(position.id)}
                            className="text-green-600 hover:text-green-900 dark:text-green-400 dark:hover:text-green-300"
                          >
                            Save
                          </button>
                          <button
                            onClick={handleCancelEdit}
                            className="text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-300"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div className="flex gap-2 justify-end">
                          <button
                            onClick={() => handleStartEdit(position)}
                            className="text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleRemovePosition(position.id)}
                            className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300"
                          >
                            Remove
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Intraday Modal */}
      <IntradayModal
        ticker={selectedTicker}
        isOpen={showIntradayModal}
        onClose={() => setShowIntradayModal(false)}
      />
    </div>
  );
};

export default Portfolio;