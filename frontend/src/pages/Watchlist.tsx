import React, { useEffect, useState, useRef, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { authAPI, watchlistAPI } from '../services/api';
import { User } from '../types';
import NavBar from '../components/NavBar';
import BackToTop from '../components/BackToTop';
import { WatchlistItem } from '../types';
import ScreenerChartPanel from '../components/ScreenerChartPanel';
import { useLivePriceContext } from '../contexts/LivePriceContext';
import MarketStatusBadge from '../components/MarketStatusBadge';
import UpgradeRequired from '../components/UpgradeRequired';
import '../styles/livePrice.css';
import axios from 'axios';
import { getSector, SECTOR_COLORS } from '../utils/sectorMap';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

const Watchlist: React.FC = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [addingStock, setAddingStock] = useState(false);
  const [newTicker, setNewTicker] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [newTargetPrice, setNewTargetPrice] = useState('');
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [showIntradayModal, setShowIntradayModal] = useState(false);
  const [selectedTicker, setSelectedTicker] = useState<string>('');
  const { prices, isConnected, subscribe, unsubscribe } = useLivePriceContext();
  const [priceFlash, setPriceFlash] = useState<Record<string, 'green' | 'red' | null>>({});
  const [editingStock, setEditingStock] = useState<string | null>(null);
  const [editNotes, setEditNotes] = useState('');
  const [editTargetPrice, setEditTargetPrice] = useState('');
  const previousPricesRef = useRef<Map<string, number>>(new Map());

  // Sorting state
  const [sortField, setSortField] = useState<string>('');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  useEffect(() => {
    loadData();
  }, []);

  // Derive a stable ticker string that only changes when the actual tickers change,
  // NOT when prices/notes/etc update within the watchlist array.
  const tickerList = useMemo(
    () => watchlist.map(item => item.ticker).sort().join(','),
    [watchlist]
  );

  // Subscribe to watchlist tickers for live prices.
  // Depends on tickerList (stable string) instead of watchlist (changes on every price update).
  useEffect(() => {
    if (tickerList && isConnected) {
      const tickers = tickerList.split(',');
      subscribe(tickers);
      
      return () => {
        unsubscribe(tickers);
      };
    }
  }, [tickerList, isConnected, subscribe, unsubscribe]);

  // Update watchlist with live prices and trigger flash animations
  useEffect(() => {
    if (prices.size === 0) return;

    setWatchlist(prevWatchlist => {
      return prevWatchlist.map(item => {
        const livePrice = prices.get(item.ticker);
        if (!livePrice) return item;

        const previousPrice = previousPricesRef.current.get(item.ticker) ?? item.price ?? livePrice.price;

        if (livePrice.price !== previousPrice) {
          const isUp = livePrice.price > previousPrice;
          setPriceFlash(prev => ({ ...prev, [item.ticker]: isUp ? 'green' : 'red' }));

          setTimeout(() => {
            setPriceFlash(prev => ({ ...prev, [item.ticker]: null }));
          }, 600);

          previousPricesRef.current.set(item.ticker, livePrice.price);

          // Day change is measured from the previous close (a stable per-day
          // baseline), NOT the last tick. Using item.price here would make the
          // value drift to ~0 as the price settles and blank the field out.
          if (item.previous_close && item.previous_close > 0) {
            const change = livePrice.price - item.previous_close;
            const changePercent = (change / item.previous_close) * 100;
            return {
              ...item,
              price: livePrice.price,
              change: change,
              change_percent: changePercent
            };
          }

          // No previous close available — update the price but keep the last
          // known day change rather than overwriting it with a bad value.
          return { ...item, price: livePrice.price };
        }

        return item;
      });
    });
  }, [prices]);

  // Auto-refresh prices every 30s via REST (catches updates WebSocket misses on low-volume stocks)
  useEffect(() => {
    if (!tickerList) return;

    const refreshPrices = async () => {
      try {
        const token = localStorage.getItem('access_token');
        const priceResponse = await axios.get(
          `${API_URL}/api/v1/intraday/batch?tickers=${tickerList}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );

        const freshData: Record<string, any> = {};
        if (Array.isArray(priceResponse.data)) {
          priceResponse.data.forEach((item: any) => {
            if (item.ticker && item.price) {
              freshData[item.ticker] = item;
            }
          });
        }

        setWatchlist(prev => prev.map(item => {
          const fresh = freshData[item.ticker];
          if (!fresh) return item;
          const freshPrice = fresh.price;
          if (freshPrice && freshPrice !== item.price) {
            const isUp = freshPrice > (item.price || 0);
            setPriceFlash(pf => ({ ...pf, [item.ticker]: isUp ? 'green' : 'red' }));
            setTimeout(() => setPriceFlash(pf => ({ ...pf, [item.ticker]: null })), 600);
          }
          // Always refresh day-change fields from the batch quote so the live
          // baseline (previous_close) stays in sync and the field never goes stale.
          return {
            ...item,
            price: freshPrice,
            change: fresh.change ?? item.change,
            change_percent: fresh.change_percent ?? item.change_percent,
            previous_close: fresh.previous_close ?? item.previous_close,
          };
        }));
      } catch (err) {
        // Silent fail
      }
    };

    const interval = setInterval(refreshPrices, 30000);
    return () => clearInterval(interval);
  }, [tickerList]);

  const loadData = async () => {
    try {
      const userResponse = await authAPI.getCurrentUser();
      setUser(userResponse.data);

      const watchlistResponse = await watchlistAPI.getAll();
      const items = watchlistResponse.data.items || [];

      // Fetch fresh prices from batch endpoint
      if (items.length > 0) {
        try {
          const tickers = items.map((item: WatchlistItem) => item.ticker).join(',');
          const token = localStorage.getItem('access_token');
          const priceResponse = await axios.get(
            `${API_URL}/api/v1/intraday/batch?tickers=${tickers}`,
            { headers: { Authorization: `Bearer ${token}` } }
          );

          const freshData: Record<string, any> = {};
          if (Array.isArray(priceResponse.data)) {
            priceResponse.data.forEach((item: any) => {
              if (item.ticker && item.price) {
                freshData[item.ticker] = item;
              }
            });
          }

          // Overlay fresh price + day-change baseline onto watchlist items.
          // previous_close is what the live WebSocket effect uses to compute
          // day change, so it must be carried through here.
          const updatedItems = items.map((item: WatchlistItem) => {
            const fresh = freshData[item.ticker];
            if (fresh) {
              return {
                ...item,
                price: fresh.price,
                change: fresh.change ?? item.change,
                change_percent: fresh.change_percent ?? item.change_percent,
                previous_close: fresh.previous_close ?? item.previous_close,
              };
            }
            return item;
          });

          setWatchlist(updatedItems);
          console.log(`✅ Refreshed watchlist prices for ${Object.keys(freshData).length} tickers`);
        } catch (priceErr) {
          console.warn('⚠️ Could not fetch fresh prices, using cached:', priceErr);
          setWatchlist(items);
        }
      } else {
        setWatchlist(items);
      }
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

  const handleLogout = () => {
    localStorage.removeItem('access_token');
    navigate('/');
  };

  const handleAddStock = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!newTicker.trim()) {
      setError('Please enter a ticker symbol');
      return;
    }

  const limits = {
      beginner: 10,
      casual: 20,
      active: 45,
      professional: 75
    };
  
    const limit = limits[user?.subscription_tier as keyof typeof limits] || 10;

    if (watchlist.length >= limit) {
      setError(`You've reached your ${user?.subscription_tier} tier limit of ${limit} stocks`);
      return;
    }

    try {
      const payload: any = {
        ticker: newTicker.toUpperCase().trim(),
      };
      
      if (newNotes.trim()) {
        payload.notes = newNotes.trim();
      }
      
      if (newTargetPrice && parseFloat(newTargetPrice) > 0) {
        payload.target_price = parseFloat(newTargetPrice);
      }

      await watchlistAPI.add(payload);
      await loadData();

      setNewTicker('');
      setNewNotes('');
      setNewTargetPrice('');
      setAddingStock(false);
    } catch (err: any) {
      console.error('Add stock error:', err.response?.data);
      setError(err.response?.data?.detail || 'Failed to add stock. Please check the ticker symbol.');
    }
  };

  const handleRemoveStock = async (id: string) => {
    if (!window.confirm('Remove this stock from your watchlist?')) {
      return;
    }

    try {
      await watchlistAPI.remove(id);
      setWatchlist(prevList => prevList.filter(stock => stock.id !== id));
    } catch (err: any) {
      console.error('Remove stock error:', err);
      alert('Failed to remove stock. Please try again.');
    }
  };

  const handleStartEdit = (stock: WatchlistItem) => {
    setEditingStock(stock.id);
    setEditNotes(stock.notes || '');
    setEditTargetPrice(stock.target_price?.toString() || '');
  };

  const handleCancelEdit = () => {
    setEditingStock(null);
    setEditNotes('');
    setEditTargetPrice('');
  };

  const handleSaveEdit = async (id: string) => {
    try {
      const payload: any = {};
      
      if (editNotes.trim()) {
        payload.notes = editNotes.trim();
      }
      
      if (editTargetPrice && parseFloat(editTargetPrice) > 0) {
        payload.target_price = parseFloat(editTargetPrice);
      } else {
        payload.target_price = null;
      }
      
      await watchlistAPI.update(id, payload);
      await loadData();
      setEditingStock(null);
      setEditNotes('');
      setEditTargetPrice('');
    } catch (err: any) {
      console.error('Update stock error:', err);
      alert('Failed to update stock. Please try again.');
    }
  };  

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const handleTickerClick = (ticker: string) => {
    setSelectedTicker(ticker);
    setShowIntradayModal(true);
  };


  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const sortedWatchlist = useMemo(() => {
    if (!sortField) return watchlist;
    return [...watchlist].sort((a, b) => {
      let aVal: any;
      let bVal: any;

      switch (sortField) {
        case 'ticker':
          aVal = a.ticker; bVal = b.ticker;
          break;
        case 'sector':
          aVal = getSector(a.ticker); bVal = getSector(b.ticker);
          break;
        case 'price':
          aVal = prices.get(a.ticker)?.price ?? a.price ?? 0;
          bVal = prices.get(b.ticker)?.price ?? b.price ?? 0;
          break;
        case 'change':
          aVal = a.change_percent ?? 0; bVal = b.change_percent ?? 0;
          break;
        case 'added_at':
          aVal = (a as any).added_at || (a as any).created_at || '';
          bVal = (b as any).added_at || (b as any).created_at || '';
          break;
        case 'target_price':
          aVal = a.target_price ?? 0; bVal = b.target_price ?? 0;
          break;
        case 'vs_target':
          aVal = a.price_vs_target_percent ?? 0; bVal = b.price_vs_target_percent ?? 0;
          break;
        default:
          return 0;
      }

      if (typeof aVal === 'string') {
        const cmp = aVal.localeCompare(bVal);
        return sortDirection === 'asc' ? cmp : -cmp;
      }
      return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
    });
  }, [watchlist, sortField, sortDirection, prices]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 dark:bg-gray-800 flex items-center justify-center transition-colors duration-200">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
          <p className="mt-4 text-gray-600 dark:text-gray-400">Loading watchlist...</p>
        </div>
      </div>
    );
  }

  const watchlistLimits: Record<string, number> = { beginner: 10, casual: 20, active: 45, professional: 75 };
  const watchlistLimit = watchlistLimits[user?.subscription_tier || 'beginner'] || 10;
  const isAtLimit = watchlist.length >= watchlistLimit;

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-800 transition-colors duration-200">
      {/* SEO — React 19 hoists to <head> */}
      <title>Watchlist — NWC-Analytics</title>
      <meta name="description" content="Track your watchlist with live prices and daily performance." />
      <link rel="canonical" href="https://nwc-analytics.com/watchlist" />
      {/* Navigation */}
      <NavBar currentPage="watchlist" user={user} onLogout={handleLogout} />

      {/* Show upgrade banner when at limit */}
      {isAtLimit && user && (
        <UpgradeRequired
          feature="Watchlist"
          currentTier={user.subscription_tier}
          limitReached={true}
          currentUsage={watchlist.length}
          maxUsage={watchlistLimit}
          onBack={() => {}}
        />
      )}

      {/* Main Content */}
      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">My Watchlist</h1>
              <p className="text-gray-600 dark:text-gray-400">
                Track stocks you're interested in ({watchlist.length} / {(() => {
                  const limits = { beginner: 10, casual: 20, active: 45, professional: 75 };
                  return limits[user?.subscription_tier as keyof typeof limits] || 10;
                })()})
              </p>
            </div>
            <div className="flex items-center gap-4">
              <MarketStatusBadge isConnected={isConnected} />
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="px-4 py-2 bg-primary-600 hover:bg-primary-700 dark:bg-primary-500 dark:hover:bg-primary-600 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <svg className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                {refreshing ? 'Refreshing...' : 'Refresh Prices'}
              </button>
              {!addingStock && (
                <button
                  onClick={() => setAddingStock(true)}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 dark:bg-green-500 dark:hover:bg-green-600 text-white rounded-lg font-medium transition-colors"
                >
                  + Add Stock
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Add Stock Form */}
        {addingStock && (
          <div className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 border dark:border-gray-500 p-6 mb-6">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Add New Stock</h2>
            {error && (
              <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/50 border border-red-400 dark:border-red-500 text-red-700 dark:text-red-400 rounded">
                {error}
              </div>
            )}
            <form onSubmit={handleAddStock}>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
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
                    Started At Price (optional)
                  </label>
                  <input
                    type="number"
                    value={newTargetPrice}
                    onChange={(e) => setNewTargetPrice(e.target.value)}
                    placeholder="150.00"
                    step="0.01"
                    min="0"
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Notes (optional)
                  </label>
                  <input
                    type="text"
                    value={newNotes}
                    onChange={(e) => setNewNotes(e.target.value)}
                    placeholder="Watching for earnings"
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  />
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  type="submit"
                  className="px-6 py-2 bg-primary-600 hover:bg-primary-700 dark:bg-primary-500 dark:hover:bg-primary-600 text-white rounded-lg font-medium transition-colors"
                >
                  Add Stock
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAddingStock(false);
                    setNewTicker('');
                    setNewNotes('');
                    setNewTargetPrice('');
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

        {/* Watchlist Table */}
        {watchlist.length === 0 ? (
          <div className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 p-12 border dark:border-gray-500 text-center">
            <div className="bg-gray-100 dark:bg-gray-600 rounded-full w-24 h-24 flex items-center justify-center mx-auto mb-6">
              <svg className="w-12 h-12 text-gray-400 dark:text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
              </svg>
            </div>
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">No Stocks Yet</h3>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              Add your first stock to start tracking prices and performance
            </p>
            <button
              onClick={() => setAddingStock(true)}
              className="px-6 py-3 bg-primary-600 hover:bg-primary-700 dark:bg-primary-500 dark:hover:bg-primary-600 text-white rounded-lg font-medium transition-colors">
              Add Your First Stock
            </button>
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 border dark:border-gray-500 overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-600">
              <thead className="bg-gray-50 dark:bg-gray-900">
                <tr>
                  {[
                    { key: 'ticker', label: 'Ticker', align: 'text-left' },
                    { key: 'sector', label: 'Sector', align: 'text-center' },
                    { key: 'price', label: 'Current Price', align: 'text-right' },
                    { key: 'change', label: 'Day Change', align: 'text-right' },
                    { key: 'added_at', label: 'Watching Since', align: 'text-center' },
                    { key: 'target_price', label: 'Started At', align: 'text-right' },
                    { key: 'vs_target', label: 'vs Start', align: 'text-right' },
                  ].map(col => (
                    <th
                      key={col.key}
                      onClick={() => handleSort(col.key)}
                      className={`px-6 py-3 ${col.align} text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:text-gray-700 dark:hover:text-gray-200 select-none transition-colors`}
                    >
                      <span className="inline-flex items-center gap-1">
                        {col.label}
                        {sortField === col.key ? (
                          <span className="text-primary-500">{sortDirection === 'asc' ? '▲' : '▼'}</span>
                        ) : (
                          <span className="text-gray-300 dark:text-gray-600">⇅</span>
                        )}
                      </span>
                    </th>
                  ))}
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Notes</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-700 divide-y divide-gray-200 dark:divide-gray-600">
                {sortedWatchlist.map((stock) => (
                  <tr key={stock.id} className="hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <button
                        onClick={() => handleTickerClick(stock.ticker)}
                        className="text-left hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
                      >
                        <div className="text-sm font-bold text-primary-600 dark:text-primary-400 underline cursor-pointer">
                          {stock.ticker}
                        </div>
                      </button>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <span
                        className="inline-block w-3 h-3 rounded-full"
                        style={{ backgroundColor: SECTOR_COLORS[getSector(stock.ticker)] || SECTOR_COLORS['Other'] }}
                        title={getSector(stock.ticker)}
                      />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {(() => {
                        // Use live price if available, otherwise use static price
                        const displayPrice = prices.get(stock.ticker)?.price ?? stock.price;
                        const flashClass = priceFlash[stock.ticker] ? `flash-${priceFlash[stock.ticker]}` : '';
                        
                        return (
                          <div className={`text-sm font-medium text-gray-900 dark:text-white ${flashClass}`}>
                            ${displayPrice?.toFixed(2)}
                          </div>
                        );
                      })()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      {stock.change != null && stock.change_percent != null ? (
                        <div className={`text-sm font-semibold ${
                          stock.change >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                        }`}>
                          {stock.change >= 0 ? '+' : ''}${stock.change.toFixed(2)} ({stock.change_percent.toFixed(2)}%)
                        </div>
                      ) : (
                        <div className="text-sm text-gray-600 dark:text-gray-400">-</div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <div className="text-sm text-gray-600 dark:text-gray-400">
                        {(() => {
                          const dateStr = (stock as any).added_at || (stock as any).created_at;
                          if (!dateStr) return '-';
                          return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                        })()}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      {editingStock === stock.id ? (
                        <input
                          type="number"
                          value={editTargetPrice}
                          onChange={(e) => setEditTargetPrice(e.target.value)}
                          placeholder="0.00"
                          step="0.01"
                          className="w-24 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                        />
                      ) : (
                        <div className="text-sm text-gray-600 dark:text-gray-400">
                          {stock.target_price ? `$${stock.target_price.toFixed(2)}` : '-'}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      {stock.price_vs_target !== undefined && stock.price_vs_target !== null && stock.target_price ? (
                        <div className={`text-sm font-semibold ${
                          stock.price_vs_target >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                        }`}>
                          {stock.price_vs_target >= 0 ? '+' : ''}${stock.price_vs_target.toFixed(2)}
                          {stock.price_vs_target_percent !== undefined && stock.price_vs_target_percent !== null && (
                            <div className="text-xs">
                              ({stock.price_vs_target_percent >= 0 ? '+' : ''}{stock.price_vs_target_percent.toFixed(2)}%)
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="text-sm text-gray-600 dark:text-gray-400">-</div>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {editingStock === stock.id ? (
                        <input
                          type="text"
                          value={editNotes}
                          onChange={(e) => setEditNotes(e.target.value)}
                          placeholder="Notes"
                          className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                        />
                      ) : (
                        <div
                          className="text-sm text-gray-600 dark:text-gray-400 max-w-xs truncate"
                          title={stock.notes || undefined}
                        >
                          {stock.notes || '-'}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      {editingStock === stock.id ? (
                        <div className="flex gap-2 justify-end">
                          <button
                            onClick={() => handleSaveEdit(stock.id)}
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
                            onClick={() => handleStartEdit(stock)}
                            className="text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleRemoveStock(stock.id)}
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

      {/* Intraday chart panel */}
      {showIntradayModal && (
        <ScreenerChartPanel
          ticker={selectedTicker}
          onClose={() => setShowIntradayModal(false)}
          displayMode="modal"
        />
      )}
      <BackToTop />
    </div>
  );
};

export default Watchlist;