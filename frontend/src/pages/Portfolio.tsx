import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { authAPI, portfolioAPI, stocksAPI } from '../services/api';
import { User } from '../types';
import NavBar from '../components/NavBar';
import BackToTop from '../components/BackToTop';
import ScreenerChartPanel from '../components/ScreenerChartPanel';
import { useLivePriceContext } from '../contexts/LivePriceContext';
import MarketStatusBadge from '../components/MarketStatusBadge';
import '../styles/livePrice.css';
import { useSectors, SECTOR_COLORS } from '../utils/sectorMap';
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
  const [prevCloseMap, setPrevCloseMap] = useState<Record<string, number>>({});
  const [extendedHoursMap, setExtendedHoursMap] = useState<Record<string, {
    earlyChange?: number | null;
    earlyChangePercent?: number | null;
    lateChange?: number | null;
    lateChangePercent?: number | null;
    marketStatus?: string | null;
  }>>({});

  // Dividend data
  const [dividendMap, setDividendMap] = useState<Record<string, {
    annual_dividend: number | null;
    annual_yield: number | null;
    frequency_label: string | null;
    has_dividends: boolean;
    dividends: any[];
    dividend_status: 'active' | 'suspended' | 'review' | 'unknown' | 'none';
    last_ex_date: string | null;
  }>>({});
  const [dividendsLoading, setDividendsLoading] = useState(false);
  const [showDividendModal, setShowDividendModal] = useState(false);

  // Column sorting
  type SortColumn = 'ticker' | 'sector' | 'quantity' | 'buy_price' | 'current_price' | 'day_change' | 'total_value' | 'profit_loss';
  const [sortColumn, setSortColumn] = useState<SortColumn | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const handleSort = useCallback((column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection(column === 'ticker' || column === 'sector' ? 'asc' : 'desc');
    }
  }, [sortColumn]);

  useEffect(() => {
    loadData();
  }, [location.pathname]);
  
  const tickerList = useMemo(
    () => portfolio.map(pos => pos.ticker).sort().join(','),
    [portfolio]
  );

  useEffect(() => {
    if (tickerList && isConnected) {
      const tickers = tickerList.split(',');
      subscribe(tickers);
      
      return () => {
        unsubscribe(tickers);
      };
    }
  }, [tickerList, isConnected, subscribe, unsubscribe]);

  // Fetch dividend data for all portfolio tickers
  useEffect(() => {
    if (!tickerList) return;
    const tickers = tickerList.split(',');
    setDividendsLoading(true);
    Promise.allSettled(tickers.map(t => stocksAPI.getDividends(t)))
      .then(results => {
        const newMap: typeof dividendMap = {};
        results.forEach((result, idx) => {
          const ticker = tickers[idx];
          if (result.status === 'fulfilled') {
            const d = result.value.data;
            newMap[ticker] = {
              annual_dividend: d.annual_dividend,
              annual_yield: d.annual_yield,
              frequency_label: d.frequency_label,
              has_dividends: d.has_dividends,
              dividends: d.dividends || [],
              dividend_status: d.dividend_status ?? 'none',
              last_ex_date: d.last_ex_date ?? null,
            };
          }
        });
        setDividendMap(newMap);
      })
      .catch(() => {})
      .finally(() => setDividendsLoading(false));
  }, [tickerList]);

  const exportDividendsCSV = () => {
    const csvEscape = (v: string | number | null | undefined): string => {
      const s = v == null ? '' : String(v);
      if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
      return s;
    };

    const rows: Array<{
      ticker: string; shares: number; exDate: string; payDate: string;
      divPerShare: number; total: number; type: string;
    }> = [];

    for (const pos of portfolio) {
      const divInfo = dividendMap[pos.ticker];
      // Gate on actual payments, not on the projection — this export is payment
      // history, which stays true even when the annualized figure is withheld.
      if (!divInfo?.dividends?.length) continue;
      for (const d of (divInfo.dividends || [])) {
        const exDate = d.ex_dividend_date || '';
        const payDate = d.pay_date || '';
        if (!exDate && !payDate) continue;
        const divPerShare = Number(d.cash_amount) || 0;
        rows.push({
          ticker: pos.ticker,
          shares: pos.quantity,
          exDate, payDate, divPerShare,
          total: divPerShare * pos.quantity,
          type: d.distribution_type || '',
        });
      }
    }

    rows.sort((a, b) => {
      const da = a.payDate || a.exDate;
      const db = b.payDate || b.exDate;
      return db.localeCompare(da);
    });

    const header = ['Ticker', 'Shares Held', 'Ex-Date', 'Pay Date', 'Dividend Per Share', 'Total Payment', 'Distribution Type'];
    const lines = [header.join(',')];
    for (const r of rows) {
      lines.push([
        csvEscape(r.ticker),
        csvEscape(r.shares),
        csvEscape(r.exDate),
        csvEscape(r.payDate),
        csvEscape(r.divPerShare.toFixed(4)),
        csvEscape(r.total.toFixed(2)),
        csvEscape(r.type),
      ].join(','));
    }
    const csv = lines.join('\r\n');

    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `portfolio_dividends_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

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
        const freshPrevClose: Record<string, number> = {};
        const freshExtended: Record<string, any> = {};
        if (Array.isArray(priceResponse.data)) {
          priceResponse.data.forEach((item: any) => {
            if (item.ticker && item.price) {
              freshPrices[item.ticker] = item.price;
            }
            if (item.ticker && item.previous_close) {
              freshPrevClose[item.ticker] = item.previous_close;
            }
            if (item.ticker) {
              freshExtended[item.ticker] = {
                earlyChange: item.early_trading_change ?? null,
                earlyChangePercent: item.early_trading_change_percent ?? null,
                lateChange: item.late_trading_change ?? null,
                lateChangePercent: item.late_trading_change_percent ?? null,
                marketStatus: item.market_status ?? null,
              };
            }
          });
        }

        if (Object.keys(freshPrevClose).length > 0) {
          setPrevCloseMap(prev => ({ ...prev, ...freshPrevClose }));
        }

        if (Object.keys(freshExtended).length > 0) {
          setExtendedHoursMap(prev => ({ ...prev, ...freshExtended }));
        }

        setPortfolio(prev => prev.map(pos => {
          const freshPrice = freshPrices[pos.ticker];
          if (freshPrice && freshPrice !== pos.current_price) {
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

      const portfolioResponse = await portfolioAPI.getAll();
      const positions = portfolioResponse.data.positions || [];
      
      if (positions.length > 0) {
        try {
          const tickers = positions.map((p: PortfolioPosition) => p.ticker).join(',');
          const token = localStorage.getItem('access_token');
          const priceResponse = await axios.get(
            `${API_URL}/api/v1/intraday/batch?tickers=${tickers}`,
            { headers: { Authorization: `Bearer ${token}` } }
          );
          
          const freshPrices: Record<string, number> = {};
          const freshPrevClose: Record<string, number> = {};
          const freshExtended: Record<string, any> = {};
          if (Array.isArray(priceResponse.data)) {
            priceResponse.data.forEach((item: any) => {
              if (item.ticker && item.price) {
                freshPrices[item.ticker] = item.price;
              }
              if (item.ticker && item.previous_close) {
                freshPrevClose[item.ticker] = item.previous_close;
              }
              if (item.ticker) {
                freshExtended[item.ticker] = {
                  earlyChange: item.early_trading_change ?? null,
                  earlyChangePercent: item.early_trading_change_percent ?? null,
                  lateChange: item.late_trading_change ?? null,
                  lateChangePercent: item.late_trading_change_percent ?? null,
                  marketStatus: item.market_status ?? null,
                };
              }
            });
          }
          
          if (Object.keys(freshPrevClose).length > 0) {
            setPrevCloseMap(prev => ({ ...prev, ...freshPrevClose }));
          }
          
          if (Object.keys(freshExtended).length > 0) {
            setExtendedHoursMap(prev => ({ ...prev, ...freshExtended }));
          }
          
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

  const calculateTotals = () => {
    const totalValue = portfolio.reduce((sum, pos) => sum + (pos.total_value || 0), 0);
    const totalCost = portfolio.reduce((sum, pos) => sum + (pos.buy_price * pos.quantity), 0);
    const totalPL = totalValue - totalCost;
    const totalPLPercent = totalCost > 0 ? (totalPL / totalCost) * 100 : 0;

    // Day-change baseline = Σ(previous close × qty). When a position has no
    // previous close (FMP gap / illiquid ticker), fall back to its cost basis so
    // its full current value isn't miscounted as a one-day move. Skip positions
    // we can't value at all, keeping the baseline symmetric with totalValue.
    const totalPrevClose = portfolio.reduce((sum, pos) => {
      if (pos.total_value == null) return sum;
      const baseline = prevCloseMap[pos.ticker] ?? pos.buy_price;
      return sum + (baseline ? baseline * pos.quantity : 0);
    }, 0);
    const dayChange = totalPrevClose > 0 ? totalValue - totalPrevClose : 0;
    const dayChangePercent = totalPrevClose > 0 ? (dayChange / totalPrevClose) * 100 : 0;

    // Only aggregate dividends we stand behind per-position. A "review" or
    // "suspended" figure is withheld in the rows below, so folding it into the
    // headline would make the total disagree with what's displayed.
    const excludedDividendPositions = portfolio.filter(pos => {
      const d = dividendMap[pos.ticker];
      return d?.annual_dividend && d.dividend_status !== 'active';
    }).length;

    const totalAnnualDividends = portfolio.reduce((sum, pos) => {
      const divInfo = dividendMap[pos.ticker];
      if (divInfo?.dividend_status === 'active' && divInfo.annual_dividend) {
        return sum + (divInfo.annual_dividend * pos.quantity);
      }
      return sum;
    }, 0);
    const portfolioDividendYield = totalValue > 0 ? (totalAnnualDividends / totalValue) * 100 : 0;

    return { totalValue, totalCost, totalPL, totalPLPercent, dayChange, dayChangePercent, totalAnnualDividends, portfolioDividendYield, excludedDividendPositions };
  };

  const handleAddPosition = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!newTicker.trim() || !newQuantity || !newBuyPrice || !newBuyDate) {
      setError('Please fill in all required fields');
      return;
    }

    if (parseInt(newQuantity, 10) <= 0 || isNaN(parseInt(newQuantity, 10))) {
      setError('Quantity must be a whole number greater than 0');
      return;
    }

    if (parseFloat(newBuyPrice) <= 0) {
      setError('Buy price must be greater than 0');
      return;
    }

    try {
      await portfolioAPI.add({
        ticker: newTicker.toUpperCase().trim(),
        quantity: parseInt(newQuantity, 10),
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
      
      if (editQuantity && parseInt(editQuantity, 10) > 0) {
        payload.quantity = parseInt(editQuantity, 10);
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

  const getTierLimit = () => {
    const limits = {
      beginner: 10,
      casual: 20,
      active: 45,
      professional: 75
    };
    return limits[user?.subscription_tier as keyof typeof limits] || 10;
  };

  const totals = calculateTotals();

  const sectorFilter = new URLSearchParams(location.search).get('sector') || '';

  // Resolve sectors from the backend so they match the Company Details panel.
  const getSector = useSectors(useMemo(() => portfolio.map(p => p.ticker), [portfolio]));

  const sortedPortfolio = useMemo(() => {
    let result = [...portfolio];

    // Apply sector filter first
    if (sectorFilter) {
      result.sort((a, b) => {
        const aMatch = getSector(a.ticker) === sectorFilter ? 0 : 1;
        const bMatch = getSector(b.ticker) === sectorFilter ? 0 : 1;
        return aMatch - bMatch;
      });
    }

    // Then apply column sort
    if (sortColumn) {
      result.sort((a, b) => {
        let aVal: any;
        let bVal: any;

        switch (sortColumn) {
          case 'ticker':
            aVal = a.ticker;
            bVal = b.ticker;
            break;
          case 'sector':
            aVal = getSector(a.ticker);
            bVal = getSector(b.ticker);
            break;
          case 'quantity':
            aVal = a.quantity ?? 0;
            bVal = b.quantity ?? 0;
            break;
          case 'buy_price':
            aVal = a.buy_price ?? 0;
            bVal = b.buy_price ?? 0;
            break;
          case 'current_price':
            aVal = prices.get(a.ticker)?.price ?? a.current_price ?? 0;
            bVal = prices.get(b.ticker)?.price ?? b.current_price ?? 0;
            break;
          case 'day_change': {
            const aPx = prices.get(a.ticker)?.price ?? a.current_price ?? 0;
            const aPrev = prevCloseMap[a.ticker];
            aVal = aPrev ? ((aPx - aPrev) / aPrev) * 100 : 0;
            const bPx = prices.get(b.ticker)?.price ?? b.current_price ?? 0;
            const bPrev = prevCloseMap[b.ticker];
            bVal = bPrev ? ((bPx - bPrev) / bPrev) * 100 : 0;
            break;
          }
          case 'total_value':
            aVal = a.total_value ?? 0;
            bVal = b.total_value ?? 0;
            break;
          case 'profit_loss':
            aVal = a.profit_loss ?? 0;
            bVal = b.profit_loss ?? 0;
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
    }

    return result;
  }, [portfolio, sectorFilter, sortColumn, sortDirection, prices, prevCloseMap, getSector]);

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
      {/* SEO — React 19 hoists to <head> */}
      <title>Portfolio — NWC-Analytics</title>
      <meta name="description" content="Track your portfolio holdings, performance, and allocation." />
      <link rel="canonical" href="https://nwc-analytics.com/portfolio" />
      {/* Navigation */}
      <NavBar currentPage="portfolio" user={user} onLogout={handleLogout} />

      <div className="max-w-screen-2xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        {/* Portfolio Summary */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-6 mb-8">
          <div className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 p-6 border dark:border-gray-500">
            <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Day Change</div>
            <div className={`text-2xl font-bold ${
              totals.dayChange >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
            }`}>
              {totals.dayChange >= 0 ? '+' : ''}${totals.dayChange.toFixed(2)}
            </div>
            <div className={`text-xs mt-0.5 ${
              totals.dayChangePercent >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
            }`}>
              {totals.dayChangePercent >= 0 ? '+' : ''}{totals.dayChangePercent.toFixed(2)}%
            </div>
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
          <div
            className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 p-6 border dark:border-gray-500 cursor-pointer hover:ring-2 hover:ring-primary-500 transition-all"
            onClick={() => setShowDividendModal(true)}
            title="Click to view dividend details"
          >
            <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Annual Dividends</div>
            <div className="text-2xl font-bold text-green-600 dark:text-green-400">
              ${totals.totalAnnualDividends.toFixed(2)}
            </div>
            <div className="text-xs mt-0.5 text-gray-500 dark:text-gray-400">
              Yield: {totals.portfolioDividendYield.toFixed(2)}% · <span className="text-primary-500">View details</span>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">My Portfolio</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Tracking {portfolio.length} of {getTierLimit()} positions
            </p>
          </div>
          <div className="flex gap-3">
            <MarketStatusBadge isConnected={isConnected} />
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 flex items-center gap-2">
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
                    step="1"
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
                  {([
                    { key: 'ticker', label: 'Ticker', align: 'text-left' },
                    { key: 'sector', label: 'Sector', align: 'text-left' },
                    { key: 'quantity', label: 'Quantity', align: 'text-right' },
                    { key: 'buy_price', label: 'Cost Basis', align: 'text-right' },
                    { key: 'current_price', label: 'Current Price', align: 'text-right' },
                    { key: 'day_change', label: 'Day Change', align: 'text-right' },
                    { key: 'total_value', label: 'Total Value', align: 'text-right' },
                    { key: 'profit_loss', label: 'P&L', align: 'text-right' },
                  ] as { key: SortColumn; label: string; align: string }[]).map(col => (
                    <th
                      key={col.key}
                      onClick={() => handleSort(col.key)}
                      className={`px-6 py-3 ${col.align} text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:text-gray-900 dark:hover:text-white select-none transition-colors`}
                    >
                      <span className="inline-flex items-center gap-1">
                        {col.label}
                        {sortColumn === col.key ? (
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
                {sortedPortfolio.map((position) => (
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
                          step="1"
                          min="0"
                          className="w-24 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-right"
                        />
                      ) : (
                        <div className="text-sm text-gray-900 dark:text-white">
                          {Number.isInteger(position.quantity) ? position.quantity : position.quantity.toFixed(2)}
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
                        const displayPrice = prices.get(position.ticker)?.price ?? position.current_price;
                        const flashClass = priceFlash[position.ticker] ? `flash-${priceFlash[position.ticker]}` : '';
                        
                        const prevClose = prevCloseMap[position.ticker];
                        const priceColor = displayPrice && prevClose
                          ? displayPrice > prevClose
                            ? 'text-green-600 dark:text-green-400'
                            : displayPrice < prevClose
                              ? 'text-red-600 dark:text-red-400'
                              : 'text-gray-900 dark:text-white'
                          : 'text-gray-900 dark:text-white';
                        
                        // Extended hours data
                        const ext = extendedHoursMap[position.ticker];
                        const earlyPct = ext?.earlyChangePercent;
                        const latePct = ext?.lateChangePercent;
                        
                        // Show PM badge when market is closed and early trading data exists
                        const showEarlyBadge = ext?.marketStatus === 'closed' && earlyPct != null && earlyPct !== 0;
                        // Show AH badge when market is closed and late trading data exists
                        const showLateBadge = ext?.marketStatus === 'closed' && latePct != null && latePct !== 0;
                        
                        return (
                          <div>
                            <div className={`text-sm font-medium ${priceColor} ${flashClass}`}>
                              ${displayPrice ? displayPrice.toFixed(2) : 'N/A'}
                            </div>
                            {showEarlyBadge && (
                              <span className={`inline-flex items-center gap-0.5 mt-1 px-1.5 py-0.5 rounded text-[0.65rem] font-semibold leading-none ${
                                earlyPct! > 0
                                  ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400'
                                  : 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400'
                              }`}>
                                <span className="opacity-60">PM</span>
                                {earlyPct! > 0 ? '↑' : '↓'}{Math.abs(earlyPct!).toFixed(2)}%
                              </span>
                            )}
                            {showLateBadge && (
                              <span className={`inline-flex items-center gap-0.5 mt-1 px-1.5 py-0.5 rounded text-[0.65rem] font-semibold leading-none ${
                                latePct! > 0
                                  ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400'
                                  : 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400'
                              }`}>
                                <span className="opacity-60">AH</span>
                                {latePct! > 0 ? '↑' : '↓'}{Math.abs(latePct!).toFixed(2)}%
                              </span>
                            )}
                          </div>
                        );
                      })()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      {(() => {
                        const displayPrice = prices.get(position.ticker)?.price ?? position.current_price;
                        const prevClose = prevCloseMap[position.ticker];
                        if (!displayPrice || !prevClose) return <div className="text-sm text-gray-500">-</div>;
                        const change = displayPrice - prevClose;
                        const changePct = (change / prevClose) * 100;
                        const isUp = change >= 0;
                        return (
                          <div className={`text-sm font-semibold ${isUp ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                            {isUp ? '+' : ''}${change.toFixed(2)}
                            <div className="text-xs">
                              ({isUp ? '+' : ''}{changePct.toFixed(2)}%)
                            </div>
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

      {/* Intraday chart panel */}
      {showIntradayModal && (
        <ScreenerChartPanel
          ticker={selectedTicker}
          onClose={() => setShowIntradayModal(false)}
          displayMode="modal"
        />
      )}
      {/* Dividend Details Modal */}
      {showDividendModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/60" onClick={() => setShowDividendModal(false)} />
          <div className="relative bg-white dark:bg-gray-800 rounded-xl shadow-2xl border dark:border-gray-600 w-full max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
            {/* Header */}
            {(() => {
              const hasAnyPayments = portfolio.some(
                pos => (dividendMap[pos.ticker]?.dividends?.length ?? 0) > 0
              );
              return (
                <div className="flex items-center justify-between px-6 py-4 border-b dark:border-gray-700">
                  <div>
                    <h2 className="text-lg font-bold text-gray-900 dark:text-white">Dividend Income</h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Projected annual income: <span className="text-green-600 dark:text-green-400 font-semibold">${totals.totalAnnualDividends.toFixed(2)}</span>
                      {' · '}Portfolio yield: <span className="text-green-600 dark:text-green-400 font-semibold">{totals.portfolioDividendYield.toFixed(2)}%</span>
                    </p>
                    {/* Say so explicitly — a silently smaller headline reads as a bug. */}
                    {totals.excludedDividendPositions > 0 && (
                      <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
                        {totals.excludedDividendPositions} position{totals.excludedDividendPositions === 1 ? '' : 's'} excluded — annualized figure flagged for review
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={exportDividendsCSV}
                      disabled={!hasAnyPayments}
                      title={hasAnyPayments ? 'Download payment history as CSV' : 'No payment history available'}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-teal-500/50 text-teal-600 dark:text-teal-400 hover:bg-teal-500/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <path d="M7 1v8m-3-3l3 3 3-3M1 11h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      Export CSV
                    </button>
                    <button
                      onClick={() => setShowDividendModal(false)}
                      className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
                    >
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </div>
                </div>
              );
            })()}
            {/* Body */}
            <div className="overflow-y-auto px-6 py-4 flex-1">
              {(() => {
                const dividendPositions = portfolio.filter(pos => dividendMap[pos.ticker]?.has_dividends && dividendMap[pos.ticker]?.annual_dividend);
                if (dividendPositions.length === 0) {
                  return (
                    <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                      <div className="text-4xl mb-3">📭</div>
                      <p className="font-medium">No dividend-paying positions</p>
                      <p className="text-sm mt-1">Add dividend-paying stocks to your portfolio to see income projections here.</p>
                    </div>
                  );
                }
                return (
                  <div className="space-y-4">
                    {/* Summary table */}
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                          <th className="text-left py-2 font-medium">Ticker</th>
                          <th className="text-right py-2 font-medium">Shares</th>
                          <th className="text-right py-2 font-medium">Annual/Share</th>
                          <th className="text-right py-2 font-medium">Frequency</th>
                          <th className="text-right py-2 font-medium">Yield</th>
                          <th className="text-right py-2 font-medium">Annual Income</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y dark:divide-gray-700">
                        {dividendPositions.map(pos => {
                          const divInfo = dividendMap[pos.ticker]!;
                          const income = (divInfo.annual_dividend || 0) * pos.quantity;
                          // Figures for a flagged position are shown but muted, and are the
                          // ones left out of the header total — green means "counted".
                          const counted = divInfo.dividend_status === 'active';
                          const flagTitle = counted
                            ? undefined
                            : 'Annualized from a single payment that looks unrepresentative — excluded from portfolio totals';
                          const muted = 'text-gray-400 dark:text-gray-500';
                          return (
                            <React.Fragment key={pos.id}>
                              <tr className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors" title={flagTitle}>
                                <td className="py-3 font-bold text-primary-600 dark:text-primary-400">{pos.ticker}</td>
                                <td className="py-3 text-right text-gray-900 dark:text-white">{pos.quantity}</td>
                                <td className={`py-3 text-right ${counted ? 'text-gray-900 dark:text-white' : muted}`}>
                                  ${divInfo.annual_dividend?.toFixed(2)}
                                </td>
                                <td className="py-3 text-right text-gray-600 dark:text-gray-400">{divInfo.frequency_label || '—'}</td>
                                <td className={`py-3 text-right font-medium ${counted ? 'text-green-600 dark:text-green-400' : muted}`}>
                                  {divInfo.annual_yield != null ? `${divInfo.annual_yield.toFixed(2)}%` : '—'}
                                </td>
                                <td className={`py-3 text-right font-bold ${counted ? 'text-green-600 dark:text-green-400' : muted}`}>
                                  ${income.toFixed(2)}
                                  {!counted && <span className="ml-1 text-[10px] font-normal uppercase tracking-wide">excl</span>}
                                </td>
                              </tr>
                              {/* Dividend history for this position */}
                              {divInfo.dividends && divInfo.dividends.length > 0 && (
                                <tr>
                                  <td colSpan={6} className="py-2 pl-4">
                                    <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-3">
                                      <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Recent Payments</div>
                                      <div className="grid grid-cols-4 gap-2 text-xs text-gray-400 dark:text-gray-500 font-medium mb-1">
                                        <div>Ex-Date</div>
                                        <div>Pay Date</div>
                                        <div>Amount</div>
                                        <div>Type</div>
                                      </div>
                                      {divInfo.dividends.slice(0, 6).map((div: any, idx: number) => (
                                        <div key={idx} className="grid grid-cols-4 gap-2 text-xs py-1 text-gray-700 dark:text-gray-300">
                                          <div>{div.ex_dividend_date || '—'}</div>
                                          <div>{div.pay_date || '—'}</div>
                                          <div className="text-green-600 dark:text-green-400 font-medium">${div.cash_amount?.toFixed(4) || '—'}</div>
                                          <div className="capitalize">{div.distribution_type || '—'}</div>
                                        </div>
                                      ))}
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      <BackToTop />
    </div>
  );
};

export default Portfolio;