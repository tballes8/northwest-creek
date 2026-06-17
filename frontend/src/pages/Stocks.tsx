import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { User } from '../types';
import NavBar from '../components/NavBar';
import BackToTop from '../components/BackToTop';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler } from 'chart.js';
import { Line } from 'react-chartjs-2';
import { authAPI, stocksAPI, watchlistAPI, screenerAPI } from '../services/api';
import ScreenerChartPanel from '../components/ScreenerChartPanel';
import { getTickersForSector, SECTOR_COLORS } from '../utils/sectorMap';
import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';
// Register Chart.js components
ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

interface StockQuote {
  ticker: string;
  price: number;
  change: number;
  change_percent: number;
  volume: number;
  high: number;
  low: number;
  open: number;
  previous_close: number;
  timestamp: string;
}

interface CompanyInfo {
  ticker: string;
  name: string;
  description?: string;
  sector?: string;
  industry?: string;
  website?: string;
  exchange?: string;
  market_cap?: number;
  phone?: string;
  employees?: number;
  country?: string;
  type?: string;
  fund_description?: string | null;
  fund_category?: string | null;
  fund_family?: string | null;
  fund_expense_ratio?: number | null;
  fund_inception_date?: string | null;
  fund_total_assets?: number | null;
}

interface HistoricalPrice {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface NewsArticle {
  title: string;
  publisher: string;
  published_utc: string;
  article_url: string;
  summary?: string;
  insights?: Array<{
    ticker: string;
    sentiment: string;
    sentiment_reasoning: string;
  }>;
}

interface TopGainer {
  ticker: string;
  open: number;
  close: number;
  change_percent: number;
}

interface DividendRecord {
  cash_amount: number | null;
  currency: string;
  declaration_date: string | null;
  ex_dividend_date: string | null;
  pay_date: string | null;
  record_date: string | null;
  frequency: number | null;
  distribution_type: string;
}

interface DividendInfo {
  ticker: string;
  has_dividends: boolean;
  dividends: DividendRecord[];
  annual_dividend: number | null;
  annual_yield: number | null;
  frequency_label: string | null;
}

interface DailySnapshot {
  ticker: string;
  open_price: number;
  close_price: number;
  change_percent: number;
  snapshot_date: string;
}

interface EtfHolding {
  ticker: string;
  name: string;
  weight: number;
  market_value?: number;
}

interface SearchSuggestion {
  ticker: string;
  name: string;
  type?: string;
  primary_exchange?: string;
}

interface SecFiling {
  type: string | null;
  date: string | null;
  link: string | null;
}

interface InstitutionalHolder {
  holder: string | null;
  shares: number | null;
  date_reported: string | null;
  change: number | null;
  weight_percent: number | null;
}

interface BankruptcyFlag {
  detected: boolean;
  date: string | null;
  link: string | null;
}

interface OwnershipData {
  filings: SecFiling[];
  institutional_holders: InstitutionalHolder[];
  bankruptcy: BankruptcyFlag | null;
}

interface AnalystEstimates {
  forward_eps: number | null;
  forward_eps_high: number | null;
  forward_eps_low: number | null;
  forward_revenue_avg: number | null;
  num_analysts_eps: number | null;
  estimate_year: number | null;
  price_target_consensus: number | null;
  price_target_high: number | null;
  price_target_low: number | null;
  price_target_median: number | null;
}

interface ScreenerResult {
  symbol: string;
  name: string | null;
  price: number | null;
  change_percentage: number | null;
  volume: number | null;
  market_cap: number | null;
  year_high: number | null;
  year_low: number | null;
  price_avg_50: number | null;
  price_avg_200: number | null;
  exchange: string | null;
  pct_from_52wk_high: number | null;
  pct_from_52wk_low: number | null;
  dollar_volume: number | null;
  last_refreshed: string | null;
  squeeze_state: 'on' | 'fired' | 'none' | null;
  squeeze_bars: number | null;
  squeeze_ratio: number | null;
}


interface ScreenerFormState {
  priceMin: string; priceMax: string;
  marketCapMinB: string; marketCapMaxB: string;
  changePctMin: string; changePctMax: string;
  dollarVolMinM: string;
  volumeMinM: string; volumeMaxM: string;
  pctFromHighMin: string; pctFromHighMax: string;
  pctFromLowMin: string; pctFromLowMax: string;
  goldenCross: boolean | null;
  deathCross: boolean | null;
  priceAbove50ma: boolean | null;
  priceAbove200ma: boolean | null;
  squeezeOn: boolean | null;
  squeezeFiredWithinDays: string;
  squeezeMinBars: string;
  squeezeMaxRatio: string;
  exchange: string[];
  excludeEtfs: boolean;
  gapPctMin: string;
  gapPctMax: string;
}

interface ScreenerPreset {
  id: string;
  name: string;
  description: string;
  criteria: Record<string, any>;
}

interface SavedScreenItem {
  id: string;
  name: string;
  criteria: Record<string, any>;
  created_at: string;
}

type DrawPoint = { xi: number; price: number };
type DrawingShape =
  | { type: 'trendline'; p1: DrawPoint; p2: DrawPoint }
  | { type: 'channel'; p1: DrawPoint; p2: DrawPoint; p3: DrawPoint }
  | { type: 'fibonacci'; p1: DrawPoint; p2: DrawPoint };

const defaultScreenerForm: ScreenerFormState = {
  priceMin: '', priceMax: '',
  marketCapMinB: '', marketCapMaxB: '',
  changePctMin: '', changePctMax: '',
  dollarVolMinM: '',
  volumeMinM: '', volumeMaxM: '',
  pctFromHighMin: '', pctFromHighMax: '',
  pctFromLowMin: '', pctFromLowMax: '',
  goldenCross: null,
  deathCross: null,
  priceAbove50ma: null,
  priceAbove200ma: null,
  squeezeOn: null,
  squeezeFiredWithinDays: '',
  squeezeMinBars: '',
  squeezeMaxRatio: '',
  exchange: [],
  excludeEtfs: true,
  gapPctMin: '', gapPctMax: '',
};

function fmtMarketCap(v: number | null): string {
  if (v == null) return '—';
  if (v >= 1e12) return `$${(v / 1e12).toFixed(2)}T`;
  if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  return `$${v.toLocaleString()}`;
}

function fmtVolume(v: number | null): string {
  if (v == null) return '—';
  if (v >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(0)}K`;
  return v.toLocaleString();
}

function buildScreenerCriteria(
  form: ScreenerFormState,
  sortBy: string,
  sortDesc: boolean,
  page: number,
): object {
  const c: Record<string, any> = { sort_by: sortBy, sort_desc: sortDesc, page, page_size: 50 };
  const nr = (min: string, max: string) => {
    const r: Record<string, number> = {};
    if (min !== '') r.min = parseFloat(min);
    if (max !== '') r.max = parseFloat(max);
    return Object.keys(r).length ? r : undefined;
  };
  const p = nr(form.priceMin, form.priceMax);
  if (p) c.price = p;
  const mcMin = form.marketCapMinB !== '' ? parseFloat(form.marketCapMinB) * 1e9 : undefined;
  const mcMax = form.marketCapMaxB !== '' ? parseFloat(form.marketCapMaxB) * 1e9 : undefined;
  if (mcMin != null || mcMax != null) {
    c.market_cap = {};
    if (mcMin != null) c.market_cap.min = mcMin;
    if (mcMax != null) c.market_cap.max = mcMax;
  }
  const ch = nr(form.changePctMin, form.changePctMax);
  if (ch) c.change_percentage = ch;
  if (form.dollarVolMinM !== '') c.dollar_volume = { min: parseFloat(form.dollarVolMinM) * 1e6 };
  const vol = nr(
    form.volumeMinM !== '' ? (parseFloat(form.volumeMinM) * 1e6).toString() : '',
    form.volumeMaxM !== '' ? (parseFloat(form.volumeMaxM) * 1e6).toString() : '',
  );
  if (vol) c.volume = vol;
  const ph = nr(form.pctFromHighMin, form.pctFromHighMax);
  if (ph) c.pct_from_52wk_high = ph;
  const pl = nr(form.pctFromLowMin, form.pctFromLowMax);
  if (pl) c.pct_from_52wk_low = pl;
  if (form.goldenCross !== null) c.golden_cross = form.goldenCross;
  if (form.deathCross !== null) c.death_cross = form.deathCross;
  if (form.priceAbove50ma !== null) c.price_above_50ma = form.priceAbove50ma;
  if (form.priceAbove200ma !== null) c.price_above_200ma = form.priceAbove200ma;
  if (form.squeezeOn !== null) c.squeeze_on = form.squeezeOn;
  if (form.squeezeFiredWithinDays !== '') c.squeeze_fired_within_days = parseInt(form.squeezeFiredWithinDays, 10);
  if (form.squeezeMinBars !== '') c.squeeze_min_bars = parseInt(form.squeezeMinBars, 10);
  if (form.squeezeMaxRatio !== '') c.squeeze_max_ratio = parseFloat(form.squeezeMaxRatio);
  if (form.exchange.length) c.exchange = form.exchange;
  c.exclude_etfs = form.excludeEtfs;
  const gp = nr(form.gapPctMin, form.gapPctMax);
  if (gp) c.gap_percent = gp;
  return c;
}

const Stocks: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialTicker = searchParams.get('ticker') || '';
  const showTopGainers = searchParams.get('showTopGainers') === 'true';
  const sectorParam = searchParams.get('sector') || '';
  const [user, setUser] = useState<User | null>(null);
  const [ticker, setTicker] = useState(initialTicker);
  const [searchInput, setSearchInput] = useState(initialTicker);
  const [searchMode, setSearchMode] = useState<'ticker' | 'keywords'>('ticker'); // New state for search mode
  const [keywordResults, setKeywordResults] = useState<any[]>([]); // Results from keyword search
  const [showKeywordResults, setShowKeywordResults] = useState(false);
  const [quote, setQuote] = useState<StockQuote | null>(null);
  const [company, setCompany] = useState<CompanyInfo | null>(null);
  const [historical, setHistorical] = useState<HistoricalPrice[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [historyDays, setHistoryDays] = useState(365);
  const [news, setNews] = useState<NewsArticle[]>([]);
  const [fallbackNews, setFallbackNews] = useState<NewsArticle[]>([]);
  const [newsLoading, setNewsLoading] = useState(false);
  const [topGainers, setTopGainers] = useState<TopGainer[]>([]);
  const [gainersLoading, setGainersLoading] = useState(false);
  const [topLosers, setTopLosers] = useState<TopGainer[]>([]);
  const [losersLoading, setLosersLoading] = useState(false);
  const [dailySnapshots, setDailySnapshots] = useState<DailySnapshot[]>(() => {
    try {
      const cached = sessionStorage.getItem('nwc_daily_snapshots');
      return cached ? JSON.parse(cached) : [];
    } catch { return []; }
  });
  const [etfSnapshots, setEtfSnapshots] = useState<DailySnapshot[]>(() => {
    try {
      const cached = sessionStorage.getItem('nwc_etf_snapshots');
      return cached ? JSON.parse(cached) : [];
    } catch { return []; }
  });
  const resolvedSector = sectorParam || (() => {
    try { return sessionStorage.getItem('nwc_active_sector') || ''; } catch { return ''; }
  })();
  const [sectorSnapshots, setSectorSnapshots] = useState<DailySnapshot[]>(() => {
    try {
      if (resolvedSector) {
        const cached = sessionStorage.getItem(`nwc_sector_snapshots_${resolvedSector}`);
        return cached ? JSON.parse(cached) : [];
      }
      return [];
    } catch { return []; }
  });
  const [sectorLoading, setSectorLoading] = useState(false);
  const [activeSector, setActiveSector] = useState(resolvedSector);
  const [isWarrant, setIsWarrant] = useState(false);
  const [relatedCommonStock, setRelatedCommonStock] = useState<string | null>(null);
  const [watchlistMsg, setWatchlistMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [addingToWatchlist, setAddingToWatchlist] = useState(false);
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const [dividendInfo, setDividendInfo] = useState<DividendInfo | null>(null);
  const [dividendLoading, setDividendLoading] = useState(false);
  const [etfHoldings, setEtfHoldings] = useState<EtfHolding[]>([]);
  const [holdingsLoading, setHoldingsLoading] = useState(false);
  const [ownershipData, setOwnershipData] = useState<OwnershipData | null>(null);
  const [ownershipLoading, setOwnershipLoading] = useState(false);
  const [peRatio, setPeRatio] = useState<number | null>(null);
  const [analystEstimates, setAnalystEstimates] = useState<AnalystEstimates | null>(null);
  const [nwcForecast, setNwcForecast] = useState<{
    bear: number; base: number; bull: number;
    horizon: string; rationale: string; generated_at: string;
  } | null>(null);
  const [forecastLoading, setForecastLoading] = useState(false);
  const chartRef = useRef<ChartJS<'line', (number | null)[], string> | null>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const [drawTool, setDrawTool] = useState<'trendline' | 'channel' | 'fibonacci' | null>(null);
  const [pendingPoints, setPendingPoints] = useState<DrawPoint[]>([]);
  const [drawings, setDrawings] = useState<DrawingShape[]>([]);
  const mousePixelRef = useRef<{ x: number; y: number } | null>(null);
  const rafRef = useRef<number>(0);

  const detectWarrantHint = (tickerSymbol: string): boolean => {
    const upper = tickerSymbol.toUpperCase();
    return (
      upper.includes('.W') ||
      upper.includes('+W') ||
      upper.endsWith('/WS') ||
      upper.endsWith('/WT')
    );
  };

  const getRelatedCommonStock = (warrantTicker: string): string | null => {
    const upper = warrantTicker.toUpperCase();
    const patterns = ['.WS', '.WT', '.W', '+WS', '+WT', '+W', '/WS', '/WT', '/W'];
    for (const pat of patterns) {
      if (upper.endsWith(pat)) {
        return upper.slice(0, -pat.length);
      }
    }
    return null;
  };

  useEffect(() => {
    loadUser();
    if (dailySnapshots.length === 0) {
      loadDailySnapshots();
    }
    if (etfSnapshots.length === 0) {
      loadDailyEtfSnapshots();
    }
    if (initialTicker) {
      loadStockData(initialTicker);
      loadNews(initialTicker);
    }
    if (showTopGainers || initialTicker || !initialTicker) {
      loadTopGainers();
      loadTopLosers();
    }
    const sector = sectorParam || resolvedSector;
    if (sector) {
      setActiveSector(sector);
      try { sessionStorage.setItem('nwc_active_sector', sector); } catch {}
      if (sectorSnapshots.length === 0) {
        loadSectorSnapshots(sector);
      }
    }
  }, [initialTicker, showTopGainers, sectorParam]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
        setShowKeywordResults(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const searchTickers = useCallback(async (query: string) => {
    if (query.length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    setSuggestionsLoading(true);
    try {
      const response = await stocksAPI.search(query);
      const results = response.data.results || [];
      setSuggestions(results);
      setShowSuggestions(results.length > 0);
    } catch (err) {
      console.error('Search error:', err);
      setSuggestions([]);
    } finally {
      setSuggestionsLoading(false);
    }
  }, []);

  const searchByKeywords = useCallback(async (keywords: string) => {
    if (keywords.length < 2) {
      setKeywordResults([]);
      setShowKeywordResults(false);
      return;
    }

    setSuggestionsLoading(true);
    setShowKeywordResults(true);
    try {
      const response = await stocksAPI.searchByKeywords(keywords);
      const results = response.data.results || [];
      setKeywordResults(results);
    } catch (err) {
      console.error('Keyword search error:', err);
      setKeywordResults([]);
    } finally {
      setSuggestionsLoading(false);
    }
  }, []);

  const handleSearchInputChange = (value: string) => {
    setSearchInput(value);

    if (!value.trim()) {
      resetToEmptyState();
      return;
    }

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      if (searchMode === 'ticker') {
        searchTickers(value);
      } else {
        searchByKeywords(value);
      }
    }, 300);
  };

  const resetToEmptyState = () => {
    setTicker('');
    setSearchInput('');
    setQuote(null);
    setCompany(null);
    setHistorical([]);
    setNews([]);
    setFallbackNews([]);
    setDividendInfo(null);
    setEtfHoldings([]);
    setOwnershipData(null);
    setPeRatio(null);
    setAnalystEstimates(null);
    setNwcForecast(null);
    setForecastLoading(false);
    setError('');
    setIsWarrant(false);
    setRelatedCommonStock(null);
    setSuggestions([]);
    setShowSuggestions(false);
    setKeywordResults([]);
    setShowKeywordResults(false);
    setWatchlistMsg(null);
    if (activeSector) {
      navigate(`/stocks?sector=${encodeURIComponent(activeSector)}`, { replace: true });
    } else {
      navigate('/stocks', { replace: true });
    }
  };

  const clearSectorContext = () => {
    try {
      sessionStorage.removeItem(`nwc_sector_snapshots_${activeSector}`);
      sessionStorage.removeItem('nwc_active_sector');
    } catch {}
    setActiveSector('');
    setSectorSnapshots([]);
    navigate('/stocks', { replace: true });
  };

  const handleSuggestionClick = (suggestion: SearchSuggestion) => {
    setSearchInput(suggestion.ticker);
    setShowSuggestions(false);
    setSuggestions([]);
    handleTickerClick(suggestion.ticker);
  };

  const loadSectorSnapshots = async (sector: string) => {
    setSectorLoading(true);
    try {
      const sectorTickers = getTickersForSector(sector);
      if (sectorTickers.length === 0) {
        setSectorSnapshots([]);
        return;
      }
      const shuffled = [...sectorTickers].sort(() => Math.random() - 0.5);
      const subset = shuffled.slice(0, 100);
      const response = await stocksAPI.getDailySnapshot(10, subset);
      const snaps = response.data.snapshots || [];
      setSectorSnapshots(snaps);
      if (snaps.length > 0) {
        try { sessionStorage.setItem(`nwc_sector_snapshots_${sector}`, JSON.stringify(snaps)); } catch {}
      }
    } catch (error) {
      console.error('Failed to load sector snapshots:', error);
      setSectorSnapshots([]);
    } finally {
      setSectorLoading(false);
    }
  };

  const loadDailySnapshots = async () => {
    try {
      const response = await stocksAPI.getDailySnapshot(10, undefined, 'CS');
      const snaps = response.data.snapshots || [];
      setDailySnapshots(snaps);
      try { sessionStorage.setItem('nwc_daily_snapshots', JSON.stringify(snaps)); } catch {}
    } catch (error) {
      console.error('Failed to load daily snapshots:', error);
    }
  };

  const KNOWN_ETF_TICKERS = [
    'SPY','QQQ','IWM','VTI','GLD','SLV','TLT','HYG','EEM','XLF',
    'XLK','XLE','XLV','XLI','XLU','XLP','XLB','XLC','XLRE','VNQ',
    'AGG','LQD','BND','IEFA','VEA','VWO','EFA','DIA','MDY','IJR',
    'ARKK','ARKG','ARKW','ARKF','ARKQ','SOXX','SMH','IBB','XBI','GDX',
    'GDXJ','USO','UNG','UVXY','SQQQ','TQQQ','SPXS','SPXL','TNA','TZA',
  ];

  const loadDailyEtfSnapshots = async () => {
    try {
      // First try asset_type filter (works after migration + fetch re-run)
      const response = await stocksAPI.getDailySnapshot(10, undefined, 'ETF');
      let snaps = response.data.snapshots || [];
      // Fallback: use curated ETF ticker list if asset_type column not yet populated
      if (snaps.length === 0) {
        const shuffled = [...KNOWN_ETF_TICKERS].sort(() => Math.random() - 0.5);
        const fallback = await stocksAPI.getDailySnapshot(10, shuffled.slice(0, 30));
        snaps = fallback.data.snapshots || [];
      }
      setEtfSnapshots(snaps);
      try { sessionStorage.setItem('nwc_etf_snapshots', JSON.stringify(snaps)); } catch {}
    } catch (error) {
      console.error('Failed to load ETF snapshots:', error);
    }
  };

  const loadUser = async () => {
    try {
      const response = await authAPI.getCurrentUser();
      setUser(response.data);
    } catch (error) {
      console.error('Failed to load user:', error);
      if ((error as any).response?.status === 401) {
        localStorage.removeItem('access_token');
        navigate('/login');
      }
    }
  };

  const loadStockData = async (symbol: string) => {
    if (!symbol.trim()) return;

    setLoading(true);
    setError('');
    setTicker(symbol.toUpperCase());
    
    const isWarrantHint = detectWarrantHint(symbol);
    setIsWarrant(isWarrantHint);
    if (isWarrantHint) {
      setRelatedCommonStock(getRelatedCommonStock(symbol));
    } else {
      setRelatedCommonStock(null);
    }

    try {
      // Fetch quote, company, and historical independently so one failure
      // doesn't block the others.  Quote + company are required; historical
      // is optional (FMP may not have data for every ticker).
      const [quoteResult, companyResult, historicalResult] = await Promise.allSettled([
        stocksAPI.getQuote(symbol),
        stocksAPI.getCompany(symbol),
        stocksAPI.getHistorical(symbol, historyDays),
      ]);

      // Quote is essential — if it failed, show error
      if (quoteResult.status === 'rejected') {
        const errMsg = (quoteResult.reason as any)?.response?.data?.detail
          || 'Failed to load stock data. Please check the ticker symbol and try again.';
        setError(errMsg);
        setQuote(null);
        setCompany(null);
        setHistorical([]);
        setDividendInfo(null);
        setLoading(false);
        return;
      }

      // Company is essential — if it failed, show error
      if (companyResult.status === 'rejected') {
        const errMsg = (companyResult.reason as any)?.response?.data?.detail
          || 'Failed to load company information. Please check the ticker symbol and try again.';
        setError(errMsg);
        setQuote(null);
        setCompany(null);
        setHistorical([]);
        setDividendInfo(null);
        setLoading(false);
        return;
      }

      // Set quote and company from successful results
      setQuote(quoteResult.value.data);
      setCompany(companyResult.value.data);

      // Historical is optional — use data if available, otherwise empty array
      if (historicalResult.status === 'fulfilled') {
        setHistorical(historicalResult.value.data.data);
      } else {
        console.warn(`Historical data not available for ${symbol} — chart will be hidden`);
        setHistorical([]);
      }

      // Overlay live intraday price on top of previous-day quote
      try {
        const token = localStorage.getItem('access_token');
        const intradayRes = await axios.get(
          `${API_URL}/api/v1/intraday/batch?tickers=${symbol.toUpperCase()}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (Array.isArray(intradayRes.data) && intradayRes.data.length > 0) {
          const live = intradayRes.data[0];
          if (live.price) {
            setQuote(prev => prev ? {
              ...prev,
              price: live.price,
              change: live.change ?? prev.change,
              change_percent: live.change_percent ?? prev.change_percent,
            } : prev);
          }
        }
      } catch {
        // Non-fatal — keep previous-day quote as fallback
      }
      
      // API-driven warrant detection
      const apiType = companyResult.value.data?.type || '';
      if (apiType === 'WARRANT') {
        setIsWarrant(true);
        const related = getRelatedCommonStock(symbol);
        if (related) {
          setRelatedCommonStock(related);
        } else {
          const stripped = symbol.toUpperCase().replace(/W+$/, '');
          setRelatedCommonStock(stripped.length >= 2 && stripped !== symbol.toUpperCase() ? stripped : null);
        }
      } else if (apiType === 'CS' || apiType === 'ADRC' || apiType === 'PFD' || apiType === 'ETF') {
        setIsWarrant(false);
        setRelatedCommonStock(null);
      }
      loadDividends(symbol);
      // PE ratio comes from company financials, which funds/ETFs don't have
      // (the /financials endpoint 404s for them), and a PE is meaningless for a
      // fund anyway — skip the call for fund types to avoid console 404 noise.
      if (isFundType(apiType)) {
        setPeRatio(null);
      } else {
        loadPeRatio(symbol);
      }
      loadAnalystEstimates(symbol);
      loadOwnership(symbol);
      loadPriceForecast(symbol);

      // ETF holdings — non-blocking, only for fund types
      const companyType = companyResult.value.data?.type || '';
      if (FUND_TYPES.has(companyType)) {
        loadEtfHoldings(symbol);
      } else {
        setEtfHoldings([]);
      }
    } catch (err: any) {
      console.error('Stock API Error:', err);
      setError(err.response?.data?.detail || 'Failed to load stock data. Please check the ticker symbol and try again.');
      setQuote(null);
      setCompany(null);
      setHistorical([]);
      setDividendInfo(null);
      setEtfHoldings([]);
    } finally {
      setLoading(false);
    }
  };

  const loadNews = async (symbol: string) => {
    setNewsLoading(true);
    try {
      const response = await stocksAPI.getNews(symbol, 3);
      const articles: NewsArticle[] = response.data.data || [];
      setNews(articles);

      if (articles.length === 0) {
        try {
          const fallbackResponse = await stocksAPI.getMarketNews(20);
          const pool: NewsArticle[] = fallbackResponse.data.data || [];
          const shuffled = [...pool].sort(() => Math.random() - 0.5);
          setFallbackNews(shuffled.slice(0, 3));
        } catch (fallbackErr) {
          console.error('Failed to load fallback news:', fallbackErr);
          setFallbackNews([]);
        }
      } else {
        setFallbackNews([]);
      }
    } catch (err) {
      console.error('Failed to load news:', err);
      setNews([]);
      setFallbackNews([]);
    } finally {
      setNewsLoading(false);
    }
  };

  const loadDividends = async (symbol: string) => {
    setDividendLoading(true);
    try {
      const token = localStorage.getItem('access_token');
      const response = await axios.get(
        `${API_URL}/api/v1/stocks/dividends/${encodeURIComponent(symbol.toUpperCase())}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setDividendInfo(response.data);
    } catch (err) {
      console.error('Failed to load dividends:', err);
      setDividendInfo(null);
    } finally {
      setDividendLoading(false);
    }
  };

  const loadEtfHoldings = async (symbol: string) => {
    setHoldingsLoading(true);
    try {
      const token = localStorage.getItem('access_token');
      const response = await axios.get(
        `${API_URL}/api/v1/stocks/etf/${encodeURIComponent(symbol.toUpperCase())}/holdings?limit=5`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setEtfHoldings(response.data.holdings || []);
    } catch (err) {
      console.error('Failed to load ETF holdings:', err);
      setEtfHoldings([]);
    } finally {
      setHoldingsLoading(false);
    }
  };

  const loadOwnership = async (symbol: string) => {
    setOwnershipLoading(true);
    try {
      const response = await stocksAPI.getOwnership(symbol);
      setOwnershipData(response.data);
    } catch (err) {
      console.error('Failed to load ownership data:', err);
      setOwnershipData(null);
    } finally {
      setOwnershipLoading(false);
    }
  };

  const loadPeRatio = async (symbol: string) => {
    try {
      const { financialsAPI } = await import('../services/api');
      const response = await financialsAPI.get(symbol);
      const pe = response.data?.ratios?.pe_ratio;
      setPeRatio(typeof pe === 'number' ? pe : null);
    } catch {
      setPeRatio(null);
    }
  };

  const loadAnalystEstimates = async (symbol: string) => {
    try {
      const { financialsAPI } = await import('../services/api');
      const response = await financialsAPI.getAnalystEstimates(symbol);
      setAnalystEstimates(response.data);
    } catch {
      setAnalystEstimates(null);
    }
  };

  const loadPriceForecast = async (symbol: string) => {
    setForecastLoading(true);
    try {
      const { technicalAPI } = await import('../services/api');
      const response = await technicalAPI.priceForecast(symbol);
      setNwcForecast(response.data);
    } catch {
      setNwcForecast(null);
    } finally {
      setForecastLoading(false);
    }
  };

  const loadTopGainers = async () => {
    setGainersLoading(true);
    try {
      const response = await stocksAPI.getTopGainers(10);
      setTopGainers(response.data.top_gainers || []);
    } catch (err) {
      console.error('Failed to load top gainers:', err);
      setTopGainers([]);
    } finally {
      setGainersLoading(false);
    }
  };

  const loadTopLosers = async () => {
    setLosersLoading(true);
    try {
      const token = localStorage.getItem('access_token');
      const response = await axios.get(
        `${API_URL}/api/v1/stocks/top-losers?limit=10`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setTopLosers(response.data.top_losers || []);
    } catch (err) {
      console.error('Failed to load top losers:', err);
      setTopLosers([]);
    } finally {
      setLosersLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setShowSuggestions(false);
    setSuggestions([]);
    if (searchInput.trim()) {
      const input = searchInput.trim();
      const looksLikeTicker = /^[A-Z]{1,5}(\.[A-Z])?$/.test(input.toUpperCase()) && input.length <= 6;
      
      if (looksLikeTicker) {
        loadStockData(input);
        loadNews(input);
        navigate(`/stocks?ticker=${input.toUpperCase()}`);
      } else if (suggestions.length > 0) {
        const firstTicker = suggestions[0].ticker;
        setSearchInput(firstTicker);
        loadStockData(firstTicker);
        loadNews(firstTicker);
        navigate(`/stocks?ticker=${firstTicker}`);
      } else {
        loadStockData(input);
        loadNews(input);
        navigate(`/stocks?ticker=${input.toUpperCase()}`);
      }
    }
  };

  const handleTickerClick = (tickerSymbol: string) => {
    setSearchInput(tickerSymbol);
    loadStockData(tickerSymbol);
    loadNews(tickerSymbol);
    const sectorQuery = activeSector ? `&sector=${encodeURIComponent(activeSector)}` : '';
    navigate(`/stocks?ticker=${tickerSymbol.toUpperCase()}${sectorQuery}`);
  };

  const handleRelatedStockClick = () => {
    if (relatedCommonStock) {
      handleTickerClick(relatedCommonStock);
    }
  };

  const handleHistoryDaysChange = async (days: number) => {
    setHistoryDays(days);
    if (ticker) {
      try {
        const response = await stocksAPI.getHistorical(ticker, days);
        setHistorical(response.data.data);
      } catch (err) {
        console.error('Failed to load historical data:', err);
      }
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('access_token');
    navigate('/login');
  };

  const handleAddToWatchlist = async () => {
    if (!ticker.trim()) return;
    setAddingToWatchlist(true);
    setWatchlistMsg(null);
    try {
      const payload: any = { ticker: ticker.toUpperCase().trim() };
      if (quote?.price) {
        payload.target_price = quote.price;
      }
      const parts = [];
      if (company?.name) parts.push(company.name);
      if (company?.sector) parts.push(company.sector);
      if (parts.length > 0) {
        payload.notes = parts.join(' – ');
      }
      await watchlistAPI.add(payload);
      setWatchlistMsg({ type: 'success', text: `${ticker.toUpperCase()} added to watchlist!` });
      setTimeout(() => setWatchlistMsg(null), 3000);
    } catch (err: any) {
      const msg = err.response?.data?.detail || 'Failed to add to watchlist';
      setWatchlistMsg({ type: 'error', text: typeof msg === 'string' ? msg : 'Failed to add to watchlist' });
      setTimeout(() => setWatchlistMsg(null), 4000);
    } finally {
      setAddingToWatchlist(false);
    }
  };

  const FUND_TYPES = new Set(['ETF', 'ETS', 'ETN', 'ETV', 'ETD']);
  const isFundType = (type?: string): boolean => !!type && FUND_TYPES.has(type);

  const formatFrequency = (freq: number | null, label: string | null): string => {
    if (label && label !== 'Unknown') return label;
    if (freq === null) return '—';
    const map: Record<number, string> = { 0: 'One-time', 1: 'Annual', 2: 'Semi-Annual', 4: 'Quarterly', 12: 'Monthly', 52: 'Weekly' };
    return map[freq] ?? `${freq}x/yr`;
  };

  const formatDividendDate = (dateStr: string | null): string => {
    if (!dateStr) return '—';
    try {
      return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  const calcSMA = (data: number[], period: number): (number | null)[] =>
    data.map((_, i) =>
      i < period - 1
        ? null
        : data.slice(i - period + 1, i + 1).reduce((s, v) => s + v, 0) / period
    );

  const closes = historical.map((h) => h.close);
  const sma50 = calcSMA(closes, 50);
  const sma200 = calcSMA(closes, 200);

  const chartData = {
    labels: historical.map((h) => new Date(h.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })),
    datasets: [
      {
        label: `${ticker} Price`,
        data: closes,
        borderColor: 'rgb(59, 130, 246)',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        fill: true,
        tension: 0.4,
        pointRadius: 0,
      },
      {
        label: '50-Day MA',
        data: sma50,
        borderColor: 'rgb(251, 191, 36)',
        backgroundColor: 'transparent',
        fill: false,
        tension: 0.4,
        pointRadius: 0,
        borderWidth: 1.5,
        spanGaps: false,
      },
      {
        label: '200-Day MA',
        data: sma200,
        borderColor: 'rgb(167, 139, 250)',
        backgroundColor: 'transparent',
        fill: false,
        tension: 0.4,
        pointRadius: 0,
        borderWidth: 1.5,
        spanGaps: false,
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: 'top' as const,
        align: 'end' as const,
        labels: {
          boxWidth: 24,
          boxHeight: 2,
          padding: 16,
          color: 'rgb(156, 163, 175)',
          font: { size: 11 },
        },
      },
      tooltip: {
        mode: 'index' as const,
        intersect: false,
        callbacks: {
          label: (context: any) =>
            context.parsed.y !== null ? `${context.dataset.label}: $${context.parsed.y.toFixed(2)}` : '',
        },
      },
    },
    scales: {
      y: {
        ticks: {
          callback: (value: any) => `$${Number(value).toFixed(2)}`,
        },
        grid: {
          color: 'rgba(156, 163, 175, 0.1)',
        },
      },
      x: {
        grid: {
          display: false,
        },
      },
    },
  };

  // ── Drawing tools ────────────────────────────────────────────────────────────

  const redrawOverlay = useCallback(() => {
    const chart = chartRef.current;
    const canvas = overlayRef.current;
    if (!chart || !canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const cssW = Math.round(rect.width);
    const cssH = Math.round(rect.height);
    if (canvas.width !== cssW || canvas.height !== cssH) {
      canvas.width = cssW;
      canvas.height = cssH;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, cssW, cssH);
    const xScale = chart.scales['x'];
    const yScale = chart.scales['y'];
    if (!xScale || !yScale) return;
    const ca = chart.chartArea;

    const toPixel = (xi: number, price: number) => ({
      x: xScale.getPixelForValue(xi),
      y: yScale.getPixelForValue(price),
    });

    const extendLine = (
      a: { x: number; y: number },
      b: { x: number; y: number }
    ): [{ x: number; y: number }, { x: number; y: number }] => {
      const dx = b.x - a.x;
      if (Math.abs(dx) < 0.001) {
        return [{ x: a.x, y: ca.top }, { x: a.x, y: ca.bottom }];
      }
      const slope = (b.y - a.y) / dx;
      return [
        { x: ca.left, y: a.y + slope * (ca.left - a.x) },
        { x: ca.right, y: a.y + slope * (ca.right - a.x) },
      ];
    };

    const strokeLine = (
      p1: DrawPoint, p2: DrawPoint,
      color: string, width: number, dash: number[] = []
    ) => {
      const [s, e] = extendLine(toPixel(p1.xi, p1.price), toPixel(p2.xi, p2.price));
      ctx.save();
      ctx.beginPath();
      ctx.rect(ca.left, ca.top, ca.right - ca.left, ca.bottom - ca.top);
      ctx.clip();
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(e.x, e.y);
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.setLineDash(dash);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    };

    const dot = (p: DrawPoint, color: string) => {
      const px = toPixel(p.xi, p.price);
      ctx.beginPath();
      ctx.arc(px.x, px.y, 4, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    };

    const FIB_COLOR = '#ffffff';
    const FIB_RETRACEMENTS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1.0];
    const FIB_EXTENSIONS = [1.272, 1.618, 2.618];

    const drawFibLevel = (price: number, ratio: number, dashed: boolean) => {
      const y = yScale.getPixelForValue(price);
      if (y < ca.top - 1 || y > ca.bottom + 1) return;
      ctx.save();
      ctx.beginPath();
      ctx.rect(ca.left, ca.top, ca.right - ca.left, ca.bottom - ca.top);
      ctx.clip();
      ctx.beginPath();
      ctx.moveTo(ca.left, y);
      ctx.lineTo(ca.right, y);
      ctx.strokeStyle = FIB_COLOR;
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.9;
      ctx.setLineDash(dashed ? [4, 3] : []);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
      ctx.save();
      ctx.font = '600 11px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      const label = `${(ratio * 100).toFixed(1)}%  $${price.toFixed(2)}`;
      // Dark stroke first (text-shadow equivalent), then white fill
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0,0,0,0.9)';
      ctx.lineJoin = 'round';
      ctx.strokeText(label, ca.left + 8, y - 2);
      ctx.fillStyle = FIB_COLOR;
      ctx.fillText(label, ca.left + 8, y - 2);
      ctx.restore();
    };

    for (const d of drawings) {
      if (d.type === 'trendline') {
        strokeLine(d.p1, d.p2, 'rgba(251,191,36,0.9)', 1.5);
        dot(d.p1, 'rgba(251,191,36,0.9)');
        dot(d.p2, 'rgba(251,191,36,0.9)');
      } else if (d.type === 'fibonacci') {
        const range = d.p2.price - d.p1.price;
        for (const r of FIB_RETRACEMENTS) {
          drawFibLevel(d.p1.price + range * r, r, false);
        }
        for (const r of FIB_EXTENSIONS) {
          drawFibLevel(d.p1.price + range * r, r, true);
        }
        dot(d.p1, FIB_COLOR);
        dot(d.p2, FIB_COLOR);
      } else {
        const slope = d.p2.xi !== d.p1.xi
          ? (d.p2.price - d.p1.price) / (d.p2.xi - d.p1.xi) : 0;
        const offset = d.p3.price - (d.p1.price + slope * (d.p3.xi - d.p1.xi));
        const sp1: DrawPoint = { xi: d.p1.xi, price: d.p1.price + offset };
        const sp2: DrawPoint = { xi: d.p2.xi, price: d.p2.price + offset };
        // Fill between lines
        const [s1, e1] = extendLine(toPixel(d.p1.xi, d.p1.price), toPixel(d.p2.xi, d.p2.price));
        const [s2, e2] = extendLine(toPixel(sp1.xi, sp1.price), toPixel(sp2.xi, sp2.price));
        ctx.save();
        ctx.beginPath();
        ctx.rect(ca.left, ca.top, ca.right - ca.left, ca.bottom - ca.top);
        ctx.clip();
        ctx.beginPath();
        ctx.moveTo(s1.x, s1.y);
        ctx.lineTo(e1.x, e1.y);
        ctx.lineTo(e2.x, e2.y);
        ctx.lineTo(s2.x, s2.y);
        ctx.closePath();
        ctx.fillStyle = 'rgba(249,115,22,0.07)';
        ctx.fill();
        ctx.restore();
        strokeLine(d.p1, d.p2, 'rgba(249,115,22,0.9)', 1.5);
        strokeLine(sp1, sp2, 'rgba(249,115,22,0.9)', 1.5);
        dot(d.p1, 'rgba(249,115,22,0.9)');
        dot(d.p2, 'rgba(249,115,22,0.9)');
        dot(d.p3, 'rgba(249,115,22,0.9)');
      }
    }

    // Rubber-band while drawing
    const mp = mousePixelRef.current;
    if (pendingPoints.length >= 1 && mp) {
      const mpData: DrawPoint = {
        xi: xScale.getValueForPixel(mp.x) ?? 0,
        price: yScale.getValueForPixel(mp.y) ?? 0,
      };
      if (pendingPoints.length === 1) {
        if (drawTool === 'fibonacci') {
          const y0 = yScale.getPixelForValue(pendingPoints[0].price);
          const y1 = yScale.getPixelForValue(mpData.price);
          ctx.save();
          ctx.beginPath();
          ctx.rect(ca.left, ca.top, ca.right - ca.left, ca.bottom - ca.top);
          ctx.clip();
          ctx.beginPath();
          ctx.moveTo(ca.left, y0);
          ctx.lineTo(ca.right, y0);
          ctx.moveTo(ca.left, y1);
          ctx.lineTo(ca.right, y1);
          ctx.strokeStyle = 'rgba(255,255,255,0.6)';
          ctx.lineWidth = 1;
          ctx.setLineDash([5, 5]);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.restore();
          dot(pendingPoints[0], 'rgba(255,255,255,0.9)');
        } else {
          strokeLine(pendingPoints[0], mpData, 'rgba(255,255,255,0.35)', 1, [5, 5]);
          dot(pendingPoints[0], 'rgba(255,255,255,0.6)');
        }
      } else if (pendingPoints.length === 2 && drawTool === 'channel') {
        strokeLine(pendingPoints[0], pendingPoints[1], 'rgba(249,115,22,0.7)', 1.5);
        const slope = pendingPoints[1].xi !== pendingPoints[0].xi
          ? (pendingPoints[1].price - pendingPoints[0].price) / (pendingPoints[1].xi - pendingPoints[0].xi) : 0;
        const offset = mpData.price - (pendingPoints[0].price + slope * (mpData.xi - pendingPoints[0].xi));
        strokeLine(
          { xi: pendingPoints[0].xi, price: pendingPoints[0].price + offset },
          { xi: pendingPoints[1].xi, price: pendingPoints[1].price + offset },
          'rgba(249,115,22,0.4)', 1, [5, 5]
        );
        dot(pendingPoints[0], 'rgba(249,115,22,0.9)');
        dot(pendingPoints[1], 'rgba(249,115,22,0.9)');
      }
    }
  }, [drawings, pendingPoints, drawTool]);

  useEffect(() => { redrawOverlay(); }, [redrawOverlay]);

  useEffect(() => {
    const onResize = () => redrawOverlay();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [redrawOverlay]);

  useEffect(() => {
    setDrawings([]);
    setPendingPoints([]);
  }, [ticker, historyDays]);

  const handleOverlayClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!drawTool || !chartRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const chart = chartRef.current;
    const xi = chart.scales['x'].getValueForPixel(px) ?? 0;
    const price = chart.scales['y'].getValueForPixel(py) ?? 0;
    const pt: DrawPoint = { xi, price };
    setPendingPoints(prev => {
      const next = [...prev, pt];
      if (drawTool === 'trendline' && next.length === 2) {
        setDrawings(d => [...d, { type: 'trendline', p1: next[0], p2: next[1] }]);
        return [];
      }
      if (drawTool === 'channel' && next.length === 3) {
        setDrawings(d => [...d, { type: 'channel', p1: next[0], p2: next[1], p3: next[2] }]);
        return [];
      }
      if (drawTool === 'fibonacci' && next.length === 2) {
        setDrawings(d => [...d, { type: 'fibonacci', p1: next[1], p2: next[0] }]);
        return [];
      }
      return next;
    });
  }, [drawTool]);

  const handleOverlayMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    mousePixelRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(redrawOverlay);
  }, [redrawOverlay]);

  const handleOverlayMouseLeave = useCallback(() => {
    mousePixelRef.current = null;
    redrawOverlay();
  }, [redrawOverlay]);

  // ── Screener state ──────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<'search' | 'screener'>('search');
  const [screenerForm, setScreenerForm] = useState<ScreenerFormState>(defaultScreenerForm);
  const [screenerResults, setScreenerResults] = useState<ScreenerResult[]>([]);
  const [screenerLoading, setScreenerLoading] = useState(false);
  const [screenerError, setScreenerError] = useState('');
  const [screenerTotal, setScreenerTotal] = useState(0);
  const [screenerPage, setScreenerPage] = useState(1);
  const [screenerTotalPages, setScreenerTotalPages] = useState(0);
  const [screenerDataAsOf, setScreenerDataAsOf] = useState<string | null>(null);
  const [screenerSortBy, setScreenerSortBy] = useState('market_cap');
  const [screenerSortDesc, setScreenerSortDesc] = useState(true);
  const [presets, setPresets] = useState<ScreenerPreset[]>([]);
  const [activePresetId, setActivePresetId] = useState<string | null>(null);
  const [activeSavedScreenId, setActiveSavedScreenId] = useState<string | null>(null);
  const [savedScreens, setSavedScreens] = useState<SavedScreenItem[]>([]);
  const [showSaveForm, setShowSaveForm] = useState(false);
  const [saveScreenName, setSaveScreenName] = useState('');
  const [savingScreen, setSavingScreen] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [screenerChartTicker, setScreenerChartTicker] = useState<string | null>(null);
  const [screenerChartUpgrade, setScreenerChartUpgrade] = useState(false);
  const lastScreenerTickerRef = useRef<string | null>(null);
  const presetsLoadedRef = useRef(false);

  useEffect(() => {
    if (activeTab === 'screener' && !presetsLoadedRef.current) {
      presetsLoadedRef.current = true;
      screenerAPI.getPresets().then(r => setPresets(r.data.presets)).catch(() => {});
      screenerAPI.getSavedScreens().then(r => setSavedScreens(r.data.screens)).catch(() => {});
    }
  }, [activeTab]);

  const runScreener = async (
    page: number,
    form: ScreenerFormState,
    sortBy: string,
    sortDesc: boolean,
  ) => {
    setScreenerLoading(true);
    setScreenerError('');
    try {
      const criteria = buildScreenerCriteria(form, sortBy, sortDesc, page);
      const resp = await screenerAPI.runScreen(criteria);
      setScreenerResults(resp.data.results);
      setScreenerTotal(resp.data.total);
      setScreenerPage(resp.data.page);
      setScreenerTotalPages(resp.data.total_pages);
      setScreenerDataAsOf(resp.data.data_as_of);
    } catch {
      setScreenerError('Failed to run screener. Please try again.');
    } finally {
      setScreenerLoading(false);
    }
  };

  const handleScreenerSort = (col: string) => {
    const newDesc = col === screenerSortBy ? !screenerSortDesc : true;
    setScreenerSortBy(col);
    setScreenerSortDesc(newDesc);
    runScreener(1, screenerForm, col, newDesc);
  };

  const applyPreset = (preset: ScreenerPreset) => {
    const c = preset.criteria;
    const form: ScreenerFormState = {
      priceMin: c.price?.min?.toString() ?? '',
      priceMax: c.price?.max?.toString() ?? '',
      marketCapMinB: c.market_cap?.min != null ? (c.market_cap.min / 1e9).toString() : '',
      marketCapMaxB: c.market_cap?.max != null ? (c.market_cap.max / 1e9).toString() : '',
      changePctMin: c.change_percentage?.min?.toString() ?? '',
      changePctMax: c.change_percentage?.max?.toString() ?? '',
      dollarVolMinM: c.dollar_volume?.min != null ? (c.dollar_volume.min / 1e6).toString() : '',
      volumeMinM: c.volume?.min != null ? (c.volume.min / 1e6).toString() : '',
      volumeMaxM: c.volume?.max != null ? (c.volume.max / 1e6).toString() : '',
      pctFromHighMin: c.pct_from_52wk_high?.min?.toString() ?? '',
      pctFromHighMax: c.pct_from_52wk_high?.max?.toString() ?? '',
      pctFromLowMin: c.pct_from_52wk_low?.min?.toString() ?? '',
      pctFromLowMax: c.pct_from_52wk_low?.max?.toString() ?? '',
      goldenCross: c.golden_cross ?? null,
      deathCross: c.death_cross ?? null,
      priceAbove50ma: c.price_above_50ma ?? null,
      priceAbove200ma: c.price_above_200ma ?? null,
      squeezeOn: c.squeeze_on ?? null,
      squeezeFiredWithinDays: c.squeeze_fired_within_days?.toString() ?? '',
      squeezeMinBars: c.squeeze_min_bars?.toString() ?? '',
      squeezeMaxRatio: c.squeeze_max_ratio?.toString() ?? '',
      exchange: c.exchange ?? [],
      excludeEtfs: c.exclude_etfs ?? true,
      gapPctMin: c.gap_percent?.min?.toString() ?? '',
      gapPctMax: c.gap_percent?.max?.toString() ?? '',
    };
    const sb = c.sort_by ?? 'market_cap';
    const sd = c.sort_desc ?? true;
    setScreenerForm(form);
    setScreenerSortBy(sb);
    setScreenerSortDesc(sd);
    setActivePresetId(preset.id);
    setActiveSavedScreenId(null);
    runScreener(1, form, sb, sd);
  };

  const applySavedScreen = (screen: SavedScreenItem) => {
    const c = screen.criteria;
    const form: ScreenerFormState = {
      priceMin: c.price?.min?.toString() ?? '',
      priceMax: c.price?.max?.toString() ?? '',
      marketCapMinB: c.market_cap?.min != null ? (c.market_cap.min / 1e9).toString() : '',
      marketCapMaxB: c.market_cap?.max != null ? (c.market_cap.max / 1e9).toString() : '',
      changePctMin: c.change_percentage?.min?.toString() ?? '',
      changePctMax: c.change_percentage?.max?.toString() ?? '',
      dollarVolMinM: c.dollar_volume?.min != null ? (c.dollar_volume.min / 1e6).toString() : '',
      volumeMinM: c.volume?.min != null ? (c.volume.min / 1e6).toString() : '',
      volumeMaxM: c.volume?.max != null ? (c.volume.max / 1e6).toString() : '',
      pctFromHighMin: c.pct_from_52wk_high?.min?.toString() ?? '',
      pctFromHighMax: c.pct_from_52wk_high?.max?.toString() ?? '',
      pctFromLowMin: c.pct_from_52wk_low?.min?.toString() ?? '',
      pctFromLowMax: c.pct_from_52wk_low?.max?.toString() ?? '',
      goldenCross: c.golden_cross ?? null,
      deathCross: c.death_cross ?? null,
      priceAbove50ma: c.price_above_50ma ?? null,
      priceAbove200ma: c.price_above_200ma ?? null,
      squeezeOn: c.squeeze_on ?? null,
      squeezeFiredWithinDays: c.squeeze_fired_within_days?.toString() ?? '',
      squeezeMinBars: c.squeeze_min_bars?.toString() ?? '',
      squeezeMaxRatio: c.squeeze_max_ratio?.toString() ?? '',
      exchange: c.exchange ?? [],
      excludeEtfs: c.exclude_etfs ?? true,
      gapPctMin: c.gap_percent?.min?.toString() ?? '',
      gapPctMax: c.gap_percent?.max?.toString() ?? '',
    };
    const sb = c.sort_by ?? 'market_cap';
    const sd = c.sort_desc ?? true;
    setScreenerForm(form);
    setScreenerSortBy(sb);
    setScreenerSortDesc(sd);
    setActivePresetId(null);
    setActiveSavedScreenId(screen.id);
    runScreener(1, form, sb, sd);
  };

  const saveCurrentScreen = async () => {
    if (!saveScreenName.trim()) return;
    setSavingScreen(true);
    setSaveError('');
    try {
      const criteria = buildScreenerCriteria(screenerForm, screenerSortBy, screenerSortDesc, screenerPage);
      const r = await screenerAPI.saveScreen({ name: saveScreenName.trim(), criteria });
      setSavedScreens(prev => [r.data, ...prev]);
      setSaveScreenName('');
      setShowSaveForm(false);
    } catch (e: any) {
      setSaveError(e.response?.data?.detail || 'Failed to save screen');
    } finally {
      setSavingScreen(false);
    }
  };

  const deleteSavedScreen = async (id: string) => {
    try {
      await screenerAPI.deleteSavedScreen(id);
      setSavedScreens(prev => prev.filter(s => s.id !== id));
      setActiveSavedScreenId(prev => (prev === id ? null : prev));
    } catch {}
  };

  const screenerInputCls = "w-full px-2 py-1.5 text-xs border border-gray-300 dark:border-gray-600 rounded dark:bg-gray-800 dark:text-white focus:outline-none focus:ring-1 focus:ring-teal-500";

  // Recent bankruptcy/receivership 8-K (Item 1.03) on record — suppresses going-concern valuation.
  const bankruptcy = ownershipData?.bankruptcy ?? null;
  const inBankruptcy = !!bankruptcy?.detected;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white transition-colors">
      {/* Navigation */}
      <NavBar currentPage="stocks" user={user} onLogout={handleLogout} />

      {/* Main Content */}
      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-6">Stock Screener</h1>

        {/* Tab Bar */}
        <div className="flex gap-1 border-b border-gray-200 dark:border-gray-700 mb-6">
          {(['search', 'screener'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => {
                if (tab === 'search' && lastScreenerTickerRef.current) {
                  const t = lastScreenerTickerRef.current;
                  setSearchInput(t);
                  loadStockData(t);
                  loadNews(t);
                }
                setActiveTab(tab);
              }}
              className={`px-8 py-3.5 text-base font-semibold transition-colors ${
                activeTab === tab
                  ? 'border-b-2 border-teal-600 text-teal-600 dark:text-teal-400 -mb-px'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
              }`}
            >
              {tab === 'search' ? 'Stock Search' : 'Screener'}
            </button>
          ))}
        </div>

        {activeTab === 'search' && (
        <>
        {/* Search Bar */}
        <div className="mb-8" ref={searchContainerRef}>
          {/* Search Mode Toggle */}
          <div className="flex gap-2 mb-3">
            <button
              type="button"
              onClick={() => {
                setSearchMode('ticker');
                setSearchInput('');
                setKeywordResults([]);
                setShowKeywordResults(false);
              }}
              className={`px-4 py-2 rounded-lg transition-colors ${
                searchMode === 'ticker'
                  ? 'bg-teal-500 text-white'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
              }`}
            >
              Company/Ticker Search
            </button>
            <button
              type="button"
              onClick={() => {
                setSearchMode('keywords');
                setSearchInput('');
                setSuggestions([]);
                setShowSuggestions(false);
              }}
              className={`px-4 py-2 rounded-lg transition-colors ${
                searchMode === 'keywords'
                  ? 'bg-teal-500 text-white'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
              }`}
            >
              Industry/Keyword Search
            </button>
          </div>

          {/* Industry Quick Filters - Only show in keyword mode */}
          {searchMode === 'keywords' && (
            <div className="mb-4">
              <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">Popular searches:</div>
              <div className="flex flex-wrap gap-2">
                {[
                  'Semiconductors',
                  'Artificial Intelligence',
                  'Electric Vehicles',
                  'Copper Mining',
                  'Memory Chips',
                  'Biotechnology',
                  'Cloud Computing',
                  'Renewable Energy',
                  'Gold Mining',
                  'Lithium',
                  'Cannabis',
                  'Cybersecurity',
                ].map((keyword) => (
                  <button
                    key={keyword}
                    type="button"
                    onClick={() => {
                      setSearchInput(keyword);
                      searchByKeywords(keyword);
                    }}
                    className="px-3 py-1.5 text-xs bg-gray-100 dark:bg-gray-700 hover:bg-teal-100 dark:hover:bg-teal-900/30 text-gray-700 dark:text-gray-300 hover:text-teal-700 dark:hover:text-teal-300 rounded-full transition-colors"
                  >
                    {keyword}
                  </button>
                ))}
              </div>
            </div>
          )}

          <form onSubmit={handleSearch} className="flex gap-4">
            <div className="flex-1 relative">
              <input
                type="text"
                value={searchInput}
                onChange={(e) => handleSearchInputChange(e.target.value)}
                onFocus={() => {
                  if (searchMode === 'ticker' && suggestions.length > 0) setShowSuggestions(true);
                  if (searchMode === 'keywords' && keywordResults.length > 0) setShowKeywordResults(true);
                }}
                placeholder={
                  searchMode === 'ticker'
                    ? "Search by ticker symbol or company name (e.g., AAPL or Apple)"
                    : "Search by industry or keywords (e.g., 'memory chips', 'copper mining', 'AI')"
                }
                className="w-full px-4 py-3 pr-10 border border-gray-300 dark:border-gray-500 rounded-lg focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400 focus:border-transparent dark:bg-gray-600 dark:text-white"
                autoComplete="off"
              />

              {searchInput && (
                <button
                  type="button"
                  onClick={resetToEmptyState}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
                  title="Clear search"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
              
              {showSuggestions && (
                <div className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-500 rounded-lg shadow-xl max-h-80 overflow-y-auto">
                  {suggestionsLoading ? (
                    <div className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 flex items-center gap-2">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-600"></div>
                      Searching...
                    </div>
                  ) : (
                    suggestions.map((s, i) => (
                      <button
                        key={`${s.ticker}-${i}`}
                        type="button"
                        onClick={() => handleSuggestionClick(s)}
                        className="w-full px-4 py-3 text-left hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors flex items-center justify-between border-b border-gray-100 dark:border-gray-600 last:border-b-0"
                      >
                        <div className="flex items-center gap-3">
                          <span className="font-bold text-primary-600 dark:text-primary-400 min-w-[60px]">
                            {s.ticker}
                          </span>
                          <span className="text-sm text-gray-700 dark:text-gray-300 truncate">
                            {s.name}
                          </span>
                        </div>
                        {s.type && (
                          <span className="text-xs text-gray-400 dark:text-gray-500 ml-2 shrink-0">
                            {s.type === 'CS' ? 'Stock' : FUND_TYPES.has(s.type || '') ? 'ETF' : s.type === 'ADRC' ? 'ADR' : s.type}
                          </span>
                        )}
                      </button>
                    ))
                  )}
                </div>
              )}

              {/* Keyword Search Results Dropdown */}
              {showKeywordResults && (
                <div className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-500 rounded-lg shadow-xl max-h-96 overflow-y-auto">
                  {suggestionsLoading ? (
                    <div className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 flex items-center gap-2">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-600"></div>
                      Searching...
                    </div>
                  ) : keywordResults.length === 0 ? (
                    <div className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                      No matching companies found for "{searchInput}". Try a different keyword.
                    </div>
                  ) : (
                    keywordResults.map((result, i) => (
                      <button
                        key={`${result.ticker}-${i}`}
                        type="button"
                        onClick={() => {
                          setShowKeywordResults(false);
                          setKeywordResults([]);
                          handleTickerClick(result.ticker);
                        }}
                        className="w-full px-4 py-3 text-left hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors border-b border-gray-100 dark:border-gray-600 last:border-b-0"
                      >
                        <div className="flex items-center justify-between mb-1">
                          <div>
                            <span className="font-bold text-primary-600 dark:text-primary-400">
                              {result.ticker}
                            </span>
                            <span className="text-sm text-gray-700 dark:text-gray-300 ml-2">
                              {result.name}
                            </span>
                          </div>
                          {result.price && (
                            <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
                              ${result.price.toFixed(2)}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                          <span className="inline-block bg-gray-100 dark:bg-gray-600 px-2 py-1 rounded mr-2">
                            {result.sector || 'N/A'}
                          </span>
                          <span className="inline-block bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-2 py-1 rounded">
                            {result.match_reason}
                          </span>
                        </div>
                        {result.description_snippet && (
                          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">
                            {result.description_snippet.replace(/<\/?b>/g, '')}
                          </div>
                        )}
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
            <button
              type="submit"
              className="px-8 py-3 bg-primary-600 hover:bg-primary-700 dark:bg-primary-500 dark:hover:bg-primary-600 text-white rounded-lg font-medium transition-colors"
            >
              Search
            </button>
          </form>
        </div>

        {/* Error State */}
        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-6">
            <p className="text-red-800 dark:text-red-200">{error}</p>
          </div>
        )}

        {/* Warrant Alert */}
        {isWarrant && (
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 mb-6">
            <div className="flex items-start">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                  Warrant Detected
                </h3>
                <div className="mt-2 text-sm text-yellow-700 dark:text-yellow-300">
                  <p>
                    You're viewing a warrant. Warrants are derivative securities that give the holder the right to purchase shares at a specified price.
                    {relatedCommonStock && (
                      <>
                        {' '}Would you like to view the{' '}
                        <button
                          onClick={handleRelatedStockClick}
                          className="font-medium underline hover:text-yellow-900 dark:hover:text-yellow-100"
                        >
                          related common stock ({relatedCommonStock})
                        </button>
                        ?
                      </>
                    )}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 dark:border-primary-400 mx-auto"></div>
            <p className="mt-4 text-gray-600 dark:text-gray-400">Loading stock data...</p>
          </div>
        )}

        {/* Stock Data */}
        {quote && company && !loading && (
          <div className="space-y-6">
            {/* Stock Header */}
            <div className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 p-6 border dark:border-gray-500">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-3xl font-bold text-gray-900 dark:text-white">{company.name}</h2>
                  <p className="text-gray-600 dark:text-gray-400 mt-1 flex items-center gap-2">
                    {ticker} • {company.exchange}
                    {isFundType(company.type) && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
                        ETF
                      </span>
                    )}
                  </p>
                </div>
                <div className="mt-4 md:mt-0 text-right">
                  <div className="text-4xl font-bold text-gray-900 dark:text-white">${quote.price.toFixed(2)}</div>
                  <div className={`text-lg font-semibold ${quote.change >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                    {quote.change >= 0 ? '+' : ''}{quote.change.toFixed(2)} ({quote.change_percent >= 0 ? '+' : ''}{quote.change_percent.toFixed(2)}%)
                  </div>
                  {!isFundType(company.type) && !isWarrant && inBankruptcy && (
                    <div className="mt-1 text-sm font-medium text-red-600 dark:text-red-400">
                      ⚠ Bankruptcy/receivership filing on record — valuation estimates hidden (see Company Details)
                    </div>
                  )}
                  {!isFundType(company.type) && !isWarrant && !inBankruptcy && (() => {
                    const forwardEps = analystEstimates?.forward_eps;
                    const forwardPE = forwardEps && forwardEps > 0 ? quote.price / forwardEps : null;
                    const target = analystEstimates?.price_target_consensus;
                    const upside = target ? ((target - quote.price) / quote.price) * 100 : null;
                    const estYear = analystEstimates?.estimate_year;
                    const numAnalysts = analystEstimates?.num_analysts_eps;

                    return (
                      <div className="mt-1 space-y-0.5">
                        {forwardPE !== null ? (
                          <div className="text-sm text-gray-500 dark:text-gray-400">
                            Trading at <span className="font-semibold text-gray-700 dark:text-gray-200">{forwardPE.toFixed(1)}x</span> forward earnings
                            {estYear && <span className="text-xs ml-1">({estYear}E{numAnalysts ? `, ${numAnalysts} analysts` : ''})</span>}
                            {peRatio !== null && <span className="text-xs ml-1 text-gray-400 dark:text-gray-500">· {Math.round(peRatio)}x trailing</span>}
                          </div>
                        ) : peRatio !== null ? (
                          <div className="text-sm text-gray-500 dark:text-gray-400">
                            Trading at <span className="font-semibold text-gray-700 dark:text-gray-200">{Math.round(peRatio)}x</span> trailing earnings (P/E)
                          </div>
                        ) : null}
                        {target !== null && target !== undefined && upside !== null && (
                          <div className="text-sm text-gray-500 dark:text-gray-400">
                            Analyst price target: <span className="font-semibold text-gray-700 dark:text-gray-200">${target.toFixed(2)}</span>
                            <span className={`ml-1.5 text-xs font-medium ${upside >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>
                              {upside >= 0 ? '+' : ''}{upside.toFixed(1)}% from current price
                            </span>
                            {analystEstimates?.price_target_low != null && analystEstimates?.price_target_high != null && (
                              <span className="text-xs ml-1 text-gray-400 dark:text-gray-500">
                                (${analystEstimates.price_target_low.toFixed(0)}–${analystEstimates.price_target_high.toFixed(0)} range)
                              </span>
                            )}
                          </div>
                        )}
                        {(forecastLoading || nwcForecast) && (
                          <div className="text-sm text-gray-500 dark:text-gray-400">
                            <span className="text-indigo-500 dark:text-indigo-400">✦ NWC AI target price:</span>{' '}
                            {forecastLoading ? (
                              <span className="text-xs italic">calculating…</span>
                            ) : nwcForecast ? (() => {
                              const aiUpside = ((nwcForecast.base - quote.price) / quote.price) * 100;
                              return (
                                <>
                                  <span className="font-semibold text-gray-700 dark:text-gray-200">
                                    ${nwcForecast.base.toFixed(2)}
                                  </span>
                                  <span className={`ml-1.5 text-xs font-medium ${aiUpside >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>
                                    {aiUpside >= 0 ? '+' : ''}{aiUpside.toFixed(1)}% from current price
                                  </span>
                                  <span className="text-xs ml-1.5 text-gray-400 dark:text-gray-500">
                                    (${nwcForecast.bear.toFixed(0)}–${nwcForecast.bull.toFixed(0)} range)
                                  </span>
                                </>
                              );
                            })() : null}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              </div>
              {/* Quick Actions */}
              <div className="mt-4 flex items-center gap-3 flex-wrap">
                <button
                  onClick={handleAddToWatchlist}
                  disabled={addingToWatchlist}
                  className="px-4 py-2 bg-yellow-500 hover:bg-yellow-600 dark:bg-yellow-600 dark:hover:bg-yellow-700 text-white rounded-lg font-medium text-sm transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  {addingToWatchlist ? '⏳ Adding...' : '⭐ Add to Watchlist'}
                </button>
                <Link
                  to={`/technical-analysis?ticker=${ticker}`}
                  className="px-4 py-2 bg-primary-600 hover:bg-primary-700 dark:bg-primary-500 dark:hover:bg-primary-600 text-white rounded-lg font-medium text-sm transition-colors"
                >
                  📈 Technical Analysis
                </Link>
                {watchlistMsg && (
                  <span className={`text-sm font-medium ${watchlistMsg.type === 'success' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                    {watchlistMsg.text}
                  </span>
                )}
              </div>
            </div>

            {/* Quote Details */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 p-4 border dark:border-gray-500">
                <div className="text-sm text-gray-600 dark:text-gray-400">Open</div>
                <div className="text-xl font-semibold text-gray-900 dark:text-white">${quote.open.toFixed(2)}</div>
              </div>
              <div className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 p-4 border dark:border-gray-500">
                <div className="text-sm text-gray-600 dark:text-gray-400">High</div>
                <div className="text-xl font-semibold text-gray-900 dark:text-white">${quote.high.toFixed(2)}</div>
              </div>
              <div className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 p-4 border dark:border-gray-500">
                <div className="text-sm text-gray-600 dark:text-gray-400">Low</div>
                <div className="text-xl font-semibold text-gray-900 dark:text-white">${quote.low.toFixed(2)}</div>
              </div>
              <div className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 p-4 border dark:border-gray-500">
                <div className="text-sm text-gray-600 dark:text-gray-400">Volume</div>
                <div className="text-xl font-semibold text-gray-900 dark:text-white">{quote.volume.toLocaleString()}</div>
              </div>
            </div>

            {/* Price Chart — only shown when historical data is available */}
            {historical.length > 0 ? (
              <div className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 p-6 border dark:border-gray-500">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white">Price History</h3>
                  <div className="flex gap-2">
                    {[
                      { days: 30, label: '30D' },
                      { days: 90, label: '90D' },
                      { days: 180, label: '180D' },
                      { days: 365, label: '1Y' },
                      { days: 1825, label: '5Y' },
                    ].map(({ days, label }) => (
                      <button
                        key={days}
                        onClick={() => handleHistoryDaysChange(days)}
                        className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                          historyDays === days
                            ? 'bg-primary-600 dark:bg-primary-500 text-white'
                            : 'bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-500'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                {/* Drawing toolbar */}
                <div className="flex flex-col gap-1.5 mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500 dark:text-gray-400 select-none">Draw:</span>
                    <button
                      onClick={() => { setDrawTool(t => t === 'trendline' ? null : 'trendline'); setPendingPoints([]); }}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                        drawTool === 'trendline'
                          ? 'bg-amber-500/20 text-amber-500 border border-amber-500/50'
                          : 'bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-500'
                      }`}
                    >
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <line x1="1" y1="13" x2="13" y2="1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                      </svg>
                      Trend Line
                    </button>
                    <button
                      onClick={() => { setDrawTool(t => t === 'channel' ? null : 'channel'); setPendingPoints([]); }}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                        drawTool === 'channel'
                          ? 'bg-orange-500/20 text-orange-500 border border-orange-500/50'
                          : 'bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-500'
                      }`}
                    >
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <line x1="1" y1="10" x2="13" y2="3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                        <line x1="1" y1="13" x2="13" y2="6" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeDasharray="2 1.5"/>
                      </svg>
                      Channel
                    </button>
                    <button
                      onClick={() => { setDrawTool(t => t === 'fibonacci' ? null : 'fibonacci'); setPendingPoints([]); }}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                        drawTool === 'fibonacci'
                          ? 'bg-violet-500/20 text-violet-500 border border-violet-500/50'
                          : 'bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-500'
                      }`}
                    >
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <line x1="1" y1="2" x2="13" y2="2" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
                        <line x1="1" y1="5" x2="13" y2="5" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
                        <line x1="1" y1="8" x2="13" y2="8" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
                        <line x1="1" y1="11" x2="13" y2="11" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeDasharray="2 1.5"/>
                      </svg>
                      Fibonacci
                    </button>
                  </div>
                  {(drawings.length > 0 || drawTool) && (
                    <div className="flex items-center gap-3">
                      {drawings.length > 0 && (
                        <button
                          onClick={() => { setDrawings([]); setPendingPoints([]); }}
                          className="flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium bg-red-500/10 text-red-500 border border-red-500/30 hover:bg-red-500/20 transition-colors"
                        >
                          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                            <path d="M1 1l8 8M9 1L1 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                          </svg>
                          Clear
                        </button>
                      )}
                      {drawTool && (
                        <span className="text-xs text-gray-400 dark:text-gray-500">
                          {drawTool === 'trendline'
                            ? pendingPoints.length === 0 ? 'Click to set start point' : 'Click to set end point'
                            : drawTool === 'fibonacci'
                            ? pendingPoints.length === 0 ? 'Click start of move' : 'Click end of move (0%)'
                            : pendingPoints.length === 0 ? 'Click to set start point'
                            : pendingPoints.length === 1 ? 'Click to set end point'
                            : 'Click to set channel width'}
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <div style={{ height: '400px', position: 'relative' }}>
                  <Line ref={chartRef} data={chartData} options={chartOptions} />
                  <canvas
                    ref={overlayRef}
                    onMouseMove={handleOverlayMouseMove}
                    onClick={drawTool ? handleOverlayClick : undefined}
                    onMouseLeave={handleOverlayMouseLeave}
                    style={{
                      position: 'absolute',
                      inset: 0,
                      width: '100%',
                      height: '100%',
                      cursor: drawTool ? 'crosshair' : 'default',
                      pointerEvents: drawTool ? 'auto' : 'none',
                      zIndex: 10,
                    }}
                  />
                </div>
              </div>
            ) : (
              <div className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 p-6 border dark:border-gray-500">
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Price History</h3>
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                  <svg className="w-12 h-12 mx-auto mb-3 text-gray-300 dark:text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
                  </svg>
                  <p className="text-sm">Historical price data is not available for {ticker}.</p>
                  <p className="text-xs mt-1 text-gray-400 dark:text-gray-500">This can happen with newly listed or less-traded securities.</p>
                </div>
              </div>
            )}

            {/* Company Info + Dividends */}
            <div className="grid md:grid-cols-3 gap-6">
              <div className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 p-6 border dark:border-gray-500">
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
                  {isFundType(company.type) ? 'Fund Details' : 'Company Details'}
                </h3>
                <div className="space-y-3">
                  {company.type && (
                    <div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">Type</div>
                      <div className="text-gray-900 dark:text-white font-medium">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          isFundType(company.type)
                            ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300'
                            : company.type === 'ADRC'
                            ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-300'
                            : 'bg-gray-100 dark:bg-gray-600 text-gray-800 dark:text-gray-300'
                        }`}>
                          {company.type === 'CS' ? 'Common Stock' : isFundType(company.type) ? 'Exchange-Traded Fund' : company.type === 'ADRC' ? 'ADR' : company.type}
                        </span>
                      </div>
                    </div>
                  )}

                  {isFundType(company.type) && company.fund_category && (
                    <div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">Category</div>
                      <div className="text-gray-900 dark:text-white font-medium">{company.fund_category}</div>
                    </div>
                  )}
                  {isFundType(company.type) && company.fund_family && (
                    <div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">Fund Family</div>
                      <div className="text-gray-900 dark:text-white font-medium">{company.fund_family}</div>
                    </div>
                  )}
                  {isFundType(company.type) && company.fund_expense_ratio != null && (
                    <div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">Expense Ratio</div>
                      <div className="text-gray-900 dark:text-white font-medium">{(company.fund_expense_ratio * 100).toFixed(2)}%</div>
                    </div>
                  )}
                  {isFundType(company.type) && company.fund_inception_date && (
                    <div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">Inception Date</div>
                      <div className="text-gray-900 dark:text-white font-medium">
                        {new Date(company.fund_inception_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </div>
                    </div>
                  )}

                  {!isFundType(company.type) && company.sector && (
                    <div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">Sector</div>
                      <div className="text-gray-900 dark:text-white font-medium">{company.sector}</div>
                    </div>
                  )}
                  {!isFundType(company.type) && company.industry && (
                    <div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">Industry</div>
                      <div className="text-gray-900 dark:text-white font-medium">{company.industry}</div>
                    </div>
                  )}

                  {(company.market_cap || (isFundType(company.type) && company.fund_total_assets)) && (
                    <div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">
                        {isFundType(company.type) ? 'Net Assets' : 'Market Cap'}
                      </div>
                      <div className="text-gray-900 dark:text-white font-medium">
                        {(() => {
                          const val = isFundType(company.type) ? (company.fund_total_assets || company.market_cap) : company.market_cap;
                          if (!val) return '—';
                          if (val >= 1e12) return `$${(val / 1e12).toFixed(2)}T`;
                          if (val >= 1e9) return `$${(val / 1e9).toFixed(2)}B`;
                          if (val >= 1e6) return `$${(val / 1e6).toFixed(2)}M`;
                          return `$${val.toLocaleString()}`;
                        })()}
                      </div>
                    </div>
                  )}
                  {company.employees && !isFundType(company.type) && (
                    <div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">Employees</div>
                      <div className="text-gray-900 dark:text-white font-medium">{company.employees.toLocaleString()}</div>
                    </div>
                  )}
                  {company.country && (
                    <div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">Country</div>
                      <div className="text-gray-900 dark:text-white font-medium">{company.country}</div>
                    </div>
                  )}
                  {company.website && (
                    <div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">Website</div>
                      <a href={company.website} target="_blank" rel="noopener noreferrer" className="text-primary-600 dark:text-primary-400 hover:underline font-medium">
                        {company.website}
                      </a>
                    </div>
                  )}
                </div>

                {/* Dilution Filings + Institutional Holders — only for common stocks */}
                {!isFundType(company.type) && (
                  <div className="border-t border-gray-200 dark:border-gray-600 pt-4 mt-4 space-y-5">

                    {/* Bankruptcy / Receivership flag */}
                    {inBankruptcy && (
                      <div className="rounded-md border border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/20 p-3">
                        <div className="flex items-center gap-2 text-sm font-semibold text-red-700 dark:text-red-300">
                          ⚠ Bankruptcy / Receivership
                        </div>
                        <p className="text-xs text-red-700/90 dark:text-red-300/90 mt-1">
                          An 8-K Item 1.03 (Bankruptcy or Receivership) filing is on record
                          {bankruptcy?.date ? ` (filed ${new Date(bankruptcy.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })})` : ''}.
                          Going-concern valuation estimates are suppressed — in restructuring, existing equity is typically cancelled.
                          {bankruptcy?.link && (
                            <>
                              {' '}
                              <a href={bankruptcy.link} target="_blank" rel="noopener noreferrer" className="underline font-medium">
                                View filing
                              </a>
                            </>
                          )}
                        </p>
                      </div>
                    )}

                    {/* SEC Dilution Filings */}
                    <div>
                      <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-2">Dilution Filings</h4>
                      {inBankruptcy && (
                        <p className="text-xs italic text-gray-500 dark:text-gray-400 mb-2">
                          Any S-3 / 424B5 shelf filings below are pre-petition and are typically rendered moot by the restructuring.
                        </p>
                      )}
                      {ownershipLoading ? (
                        <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-sm py-2">
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-teal-600"></div>
                          Loading...
                        </div>
                      ) : ownershipData && ownershipData.filings.length > 0 ? (
                        <div className="space-y-2">
                          {ownershipData.filings.map((f, i) => (
                            <div key={i} className="flex items-center justify-between gap-2 text-sm">
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 shrink-0">
                                {f.type ?? '—'}
                              </span>
                              <span className="text-gray-500 dark:text-gray-400 shrink-0">
                                {f.date ? new Date(f.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                              </span>
                              {f.link ? (
                                <a href={f.link} target="_blank" rel="noopener noreferrer" className="text-teal-600 dark:text-teal-400 hover:underline text-xs truncate">
                                  View filing
                                </a>
                              ) : <span />}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-gray-400 dark:text-gray-500">No recent S-3 or 424B5 filings</p>
                      )}
                    </div>

                    {/* Institutional Holders */}
                    <div>
                      <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-2">Top Institutional Holders</h4>
                      {ownershipLoading ? (
                        <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-sm py-2">
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-teal-600"></div>
                          Loading...
                        </div>
                      ) : ownershipData && ownershipData.institutional_holders.length > 0 ? (
                        <div className="space-y-2">
                          {ownershipData.institutional_holders.map((h, i) => (
                            <div key={i} className="flex items-center justify-between gap-2 text-sm">
                              <span className="text-gray-700 dark:text-gray-300 truncate flex-1">{h.holder ?? '—'}</span>
                              <div className="flex items-center gap-2 shrink-0">
                                {h.weight_percent != null && (
                                  <span className="text-gray-500 dark:text-gray-400 text-xs">{h.weight_percent.toFixed(2)}%</span>
                                )}
                                {h.change != null && (
                                  <span className={`text-xs font-medium ${h.change > 0 ? 'text-green-600 dark:text-green-400' : h.change < 0 ? 'text-red-500 dark:text-red-400' : 'text-gray-400'}`}>
                                    {h.change > 0 ? '+' : ''}{h.change >= 1e6 ? `${(h.change / 1e6).toFixed(1)}M` : h.change >= 1e3 ? `${(h.change / 1e3).toFixed(0)}K` : h.change.toLocaleString()}
                                  </span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-gray-400 dark:text-gray-500">No institutional holder data available</p>
                      )}
                    </div>

                  </div>
                )}

                {/* ETF Top Holdings — only for fund types */}
                {isFundType(company.type) && (
                  <div className="border-t border-gray-200 dark:border-gray-600 pt-4 mt-4">
                    <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-3">Top Holdings</h4>
                    {holdingsLoading ? (
                      <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-sm py-4">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-600"></div>
                        Loading holdings...
                      </div>
                    ) : etfHoldings.length > 0 ? (
                      (() => {
                        const CHART_COLORS = [
                          '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
                          '#EC4899', '#14B8A6', '#F97316', '#6366F1', '#84CC16',
                        ];
                        const OTHER_COLOR = '#6B7280';

                        const topN = etfHoldings.slice(0, 10);
                        const topNTotal = topN.reduce((sum, h) => sum + (h.weight || 0), 0);
                        const otherWeight = Math.max(0, 100 - topNTotal);

                        const slices = [
                          ...topN.map((h, i) => ({
                            label: h.ticker || h.name,
                            weight: h.weight || 0,
                            color: CHART_COLORS[i],
                          })),
                          ...(otherWeight > 0.5 ? [{ label: 'Other', weight: otherWeight, color: OTHER_COLOR }] : []),
                        ];

                        const total = slices.reduce((s, sl) => s + sl.weight, 0);

                        // Build SVG donut
                        let cumulativePercent = 0;
                        const paths = slices.map((slice) => {
                          const pct = slice.weight / total;
                          const startAngle = cumulativePercent * 2 * Math.PI;
                          cumulativePercent += pct;
                          const endAngle = cumulativePercent * 2 * Math.PI;

                          const x1 = Math.cos(startAngle - Math.PI / 2);
                          const y1 = Math.sin(startAngle - Math.PI / 2);
                          const x2 = Math.cos(endAngle - Math.PI / 2);
                          const y2 = Math.sin(endAngle - Math.PI / 2);
                          const largeArc = pct > 0.5 ? 1 : 0;

                          const outerR = 1;
                          const innerR = 0.6;

                          const d = [
                            `M ${x1 * outerR} ${y1 * outerR}`,
                            `A ${outerR} ${outerR} 0 ${largeArc} 1 ${x2 * outerR} ${y2 * outerR}`,
                            `L ${x2 * innerR} ${y2 * innerR}`,
                            `A ${innerR} ${innerR} 0 ${largeArc} 0 ${x1 * innerR} ${y1 * innerR}`,
                            'Z',
                          ].join(' ');

                          return { d, color: slice.color, label: slice.label, weight: slice.weight };
                        });

                        return (
                          <div className="flex items-start gap-4">
                            {/* Donut Chart */}
                            <div className="flex-shrink-0">
                              <svg width="160" height="160" viewBox="-1.15 -1.15 2.3 2.3">
                                {paths.map((p, i) => (
                                  <path key={i} d={p.d} fill={p.color} stroke="white" strokeWidth="0.02" className="dark:stroke-gray-700" />
                                ))}
                              </svg>
                            </div>

                            {/* Legend */}
                            <div className="flex-1 space-y-1.5 min-w-0">
                              {slices.map((slice, i) => (
                                <div key={i} className="flex items-center justify-between gap-2">
                                  <div className="flex items-center gap-1.5 min-w-0">
                                    <span
                                      className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
                                      style={{ backgroundColor: slice.color }}
                                    />
                                    <span className="text-xs text-gray-700 dark:text-gray-300 truncate">
                                      {slice.label}
                                    </span>
                                  </div>
                                  <span className="text-xs font-semibold text-gray-900 dark:text-white flex-shrink-0">
                                    {slice.weight.toFixed(1)}%
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })()
                    ) : (
                      <p className="text-sm text-gray-400 dark:text-gray-500">Holdings data not available</p>
                    )}
                  </div>
                )}
              </div>

              {/* Dividend Information Card */}
              <div className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 p-6 border dark:border-gray-500">
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Dividend Information</h3>

                {dividendLoading ? (
                  <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-sm py-4">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-600"></div>
                    Loading dividend data...
                  </div>
                ) : dividendInfo && dividendInfo.has_dividends && dividendInfo.dividends.length > 0 ? (
                  <div className="space-y-3">
                    {dividendInfo.annual_yield !== null && (
                      <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-3 text-center">
                        <div className="text-2xl font-bold text-green-700 dark:text-green-300">
                          {dividendInfo.annual_yield.toFixed(2)}%
                        </div>
                        <div className="text-xs text-green-600 dark:text-green-400 font-medium">Annual Dividend Yield</div>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <div className="text-sm text-gray-600 dark:text-gray-400">Per Share</div>
                        <div className="text-gray-900 dark:text-white font-medium">
                          ${dividendInfo.dividends[0].cash_amount?.toFixed(4) ?? '—'}
                        </div>
                      </div>
                      <div>
                        <div className="text-sm text-gray-600 dark:text-gray-400">Annual</div>
                        <div className="text-gray-900 dark:text-white font-medium">
                          {dividendInfo.annual_dividend !== null
                            ? `$${dividendInfo.annual_dividend.toFixed(2)}`
                            : '—'}
                        </div>
                      </div>
                      <div>
                        <div className="text-sm text-gray-600 dark:text-gray-400">Frequency</div>
                        <div className="text-gray-900 dark:text-white font-medium">
                          {formatFrequency(dividendInfo.dividends[0].frequency, dividendInfo.frequency_label)}
                        </div>
                      </div>
                      <div>
                        <div className="text-sm text-gray-600 dark:text-gray-400">Type</div>
                        <div className="text-gray-900 dark:text-white font-medium capitalize">
                          {dividendInfo.dividends[0].distribution_type || '—'}
                        </div>
                      </div>
                    </div>

                    <div className="border-t border-gray-200 dark:border-gray-600 pt-3 space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600 dark:text-gray-400">Ex-Dividend</span>
                        <span className="text-gray-900 dark:text-white font-medium">
                          {formatDividendDate(dividendInfo.dividends[0].ex_dividend_date)}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600 dark:text-gray-400">Pay Date</span>
                        <span className="text-gray-900 dark:text-white font-medium">
                          {formatDividendDate(dividendInfo.dividends[0].pay_date)}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600 dark:text-gray-400">Declaration</span>
                        <span className="text-gray-900 dark:text-white font-medium">
                          {formatDividendDate(dividendInfo.dividends[0].declaration_date)}
                        </span>
                      </div>
                    </div>

                    {dividendInfo.dividends.length > 1 && (
                      <div className="border-t border-gray-200 dark:border-gray-600 pt-3">
                        <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Recent History</div>
                        <div className="space-y-1.5">
                          {dividendInfo.dividends.slice(0, 4).map((div, idx) => (
                            <div key={idx} className="flex justify-between text-sm">
                              <span className="text-gray-500 dark:text-gray-400">
                                {formatDividendDate(div.ex_dividend_date)}
                              </span>
                              <span className="text-gray-900 dark:text-white font-medium">
                                ${div.cash_amount?.toFixed(4) ?? '—'}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-6 text-gray-500 dark:text-gray-400">
                    <div className="text-3xl mb-2">—</div>
                    <p className="text-sm">No dividends distributed</p>
                  </div>
                )}
              </div>

              <div className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 p-6 border dark:border-gray-500">
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
                  {isFundType(company.type) ? 'Investment Objective' : 'About'}
                </h3>
                <p className="text-gray-600 dark:text-gray-400 leading-relaxed">
                  {isFundType(company.type)
                    ? (company.fund_description || company.description || 'No investment objective available.')
                    : (company.description || 'No description available.')}
                </p>
              </div>
            </div>

            {/* News Section */}
            <div className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 p-6 border dark:border-gray-500">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Latest News</h3>
              {newsLoading ? (
                <div className="text-center py-8 text-gray-600 dark:text-gray-400">
                  Loading news...
                </div>
              ) : news.length > 0 ? (
                <div className="space-y-4">
                  {news.map((article, index) => (
                    <div key={index} className="border-b border-gray-200 dark:border-gray-600 last:border-b-0 pb-4 last:pb-0">
                      <a 
                        href={article.article_url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-lg font-semibold text-gray-900 dark:text-white hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
                      >
                        {article.title}
                      </a>
                      <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                        {article.publisher} • {new Date(article.published_utc).toLocaleDateString('en-US', { 
                          month: 'short', 
                          day: 'numeric', 
                          year: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit'
                        })}
                      </div>
                      {article.summary && (
                        <p className="text-gray-600 dark:text-gray-400 mt-2 text-sm leading-relaxed">
                          {article.summary}
                        </p>
                      )}
                      {article.insights && article.insights.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {article.insights.slice(0, 3).map((insight, idx) => (
                            <span 
                              key={idx}
                              className={`text-xs px-2 py-1 rounded-full font-medium ${
                                insight.sentiment === 'positive' 
                                  ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                                  : insight.sentiment === 'negative'
                                  ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                                  : 'bg-gray-100 dark:bg-gray-600 text-gray-700 dark:text-gray-300'
                              }`}
                            >
                              {insight.sentiment === 'positive' ? '📈' : insight.sentiment === 'negative' ? '📉' : '➖'} {insight.ticker}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div>
                  <div className="text-teal-600 dark:text-teal-400 font-medium mb-4">
                    No recent news available for {ticker}
                  </div>
                  {fallbackNews.length > 0 && (
                    <div className="space-y-4">
                      {fallbackNews.map((article, index) => (
                        <div key={index} className="border-b border-gray-200 dark:border-gray-600 last:border-b-0 pb-4 last:pb-0">
                          <a
                            href={article.article_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-lg font-semibold text-gray-900 dark:text-white hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
                          >
                            {article.title}
                          </a>
                          <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                            {article.publisher} • {new Date(article.published_utc).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                              hour: 'numeric',
                              minute: '2-digit'
                            })}
                          </div>
                          {article.summary && (
                            <p className="text-gray-600 dark:text-gray-400 mt-2 text-sm leading-relaxed">
                              {article.summary}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

          </div>
        )}

        {/* Empty State with Top Gainers, Daily Snapshots, and Sector Explorer */}
        {!quote && !loading && !error && (
          <div className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 p-12 border dark:border-gray-500 text-center">
            
            {activeSector && (
              <div className="mb-8 pb-8 border-b border-gray-200 dark:border-gray-600">
                <div className="flex items-center justify-center gap-3 mb-3">
                  <span
                    className="inline-block w-4 h-4 rounded-full"
                    style={{ backgroundColor: SECTOR_COLORS[activeSector] || SECTOR_COLORS['Other'] }}
                  />
                  <h3 className="text-2xl font-bold text-gray-900 dark:text-white">
                    {activeSector} Sector
                  </h3>
                  <button
                    onClick={clearSectorContext}
                    className="ml-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                    title="Exit sector view"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <p className="text-gray-600 dark:text-gray-400 mb-1">
                  Explore companies in the {activeSector} sector to diversify your portfolio
                </p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mb-6">
                  Showing random stocks from today's market snapshot
                </p>
                
                {sectorLoading ? (
                  <div className="text-center py-6">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto mb-2"></div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Loading {activeSector} stocks...</p>
                  </div>
                ) : sectorSnapshots.length > 0 ? (
                  <>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                      {sectorSnapshots.map((snap) => (
                        <button
                          key={snap.ticker}
                          onClick={() => handleTickerClick(snap.ticker)}
                          className="p-4 rounded-lg transition-all text-left group hover:scale-[1.03]"
                          style={{
                            backgroundColor: `${SECTOR_COLORS[activeSector] || SECTOR_COLORS['Other']}15`,
                            borderWidth: '1px',
                            borderColor: `${SECTOR_COLORS[activeSector] || SECTOR_COLORS['Other']}30`,
                          }}
                        >
                          <div
                            className="font-semibold text-lg transition-colors"
                            style={{ color: SECTOR_COLORS[activeSector] || SECTOR_COLORS['Other'] }}
                          >
                            {snap.ticker}
                          </div>
                          <div className={`text-sm font-medium ${snap.change_percent >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                            {snap.change_percent >= 0 ? '+' : ''}{snap.change_percent.toFixed(2)}%
                          </div>
                        </button>
                      ))}
                    </div>
                    <div className="mt-4 flex items-center justify-center gap-3">
                      <button
                        onClick={() => loadSectorSnapshots(activeSector)}
                        className="px-4 py-2 text-white rounded-lg text-sm transition-colors font-medium hover:opacity-90"
                        style={{ backgroundColor: SECTOR_COLORS[activeSector] || SECTOR_COLORS['Other'] }}
                      >
                        🔄 Load Different {activeSector} Stocks
                      </button>
                      <button
                        onClick={() => { clearSectorContext(); loadDailySnapshots(); }}
                        className="px-4 py-2 bg-gray-500 hover:bg-gray-600 text-white rounded-lg text-sm transition-colors font-medium"
                      >
                        🎲 10 Random Stocks
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="text-center py-6">
                    <p className="text-gray-500 dark:text-gray-400">
                      No {activeSector} stocks found in today's snapshot. Try running the daily snapshot fetch first.
                    </p>
                  </div>
                )}
              </div>
            )}


            {dailySnapshots.length > 0 && (
              <div className="mt-8 border-t border-gray-200 dark:border-gray-600 pt-8">
                <h3 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">Randomly selected stocks from today's market</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                  To start researching a different 10 stocks click the Load Different Stocks button
                </p>
                <div className="flex flex-wrap justify-center gap-3">
                  {dailySnapshots.map((snap) => (
                    <button
                      key={snap.ticker}
                      onClick={() => handleTickerClick(snap.ticker)}
                      className="group px-4 py-2.5 bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-primary-600 hover:text-white dark:hover:bg-primary-500 transition-all duration-200 transform hover:scale-105"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{snap.ticker}</span>
                        <span className={`text-xs font-medium group-hover:text-white ${snap.change_percent >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>
                          {snap.change_percent >= 0 ? '+' : ''}{snap.change_percent.toFixed(2)}%
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
                <button
                  onClick={loadDailySnapshots}
                  className="mt-4 px-4 py-2 bg-primary-600 hover:bg-primary-700 dark:bg-primary-500 dark:hover:bg-primary-600 text-white rounded-lg text-sm transition-colors font-medium"
                >
                  🔄 Load Different Stocks
                </button>
              </div>
            )}

            {/* Randomly Selected ETFs */}
            <div className="mt-8 border-t border-gray-200 dark:border-gray-600 pt-8">
              <h3 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">Randomly selected ETFs from today's market</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                To start researching a different 10 ETFs click the Load Different ETFs button
              </p>
              {etfSnapshots.length > 0 ? (
                <div className="flex flex-wrap justify-center gap-3">
                  {etfSnapshots.map((snap) => (
                    <button
                      key={snap.ticker}
                      onClick={() => handleTickerClick(snap.ticker)}
                      className="group px-4 py-2.5 bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-primary-600 hover:text-white dark:hover:bg-primary-500 transition-all duration-200 transform hover:scale-105"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{snap.ticker}</span>
                        <span className={`text-xs font-medium group-hover:text-white ${snap.change_percent >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>
                          {snap.change_percent >= 0 ? '+' : ''}{snap.change_percent.toFixed(2)}%
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="text-center py-4 text-gray-500 dark:text-gray-400 text-sm">
                  Loading ETFs...
                </div>
              )}
              <button
                onClick={loadDailyEtfSnapshots}
                className="mt-4 px-4 py-2 bg-primary-600 hover:bg-primary-700 dark:bg-primary-500 dark:hover:bg-primary-600 text-white rounded-lg text-sm transition-colors font-medium"
              >
                🔄 Load Different ETFs
              </button>
            </div>

            {/* Top Gainers */}
            {gainersLoading ? (
              <div className="text-center py-4 mt-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto mb-2"></div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Loading top gainers...</p>
              </div>
            ) : topGainers.length > 0 && (
              <div className="mt-8 border-t border-gray-200 dark:border-gray-600 pt-8">
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
                  📈 Today's Top Gainers:
                </p>
                <div className="flex flex-wrap justify-center gap-3">
                  {topGainers.map((gainer, index) => (
                    <button
                      key={index}
                      onClick={() => handleTickerClick(gainer.ticker)}
                      className="group px-4 py-2.5 bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-primary-600 hover:text-white dark:hover:bg-primary-500 transition-all duration-200 transform hover:scale-105"
                      title={`${gainer.change_percent.toFixed(2)}% gain`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{gainer.ticker}</span>
                        <span className="text-xs font-medium text-green-600 dark:text-green-400 group-hover:text-green-200">
                          +{gainer.change_percent.toFixed(2)}%
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
                
            {/* Top Losers */}
            {losersLoading ? (
              <div className="text-center py-4 mt-6">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-500 mx-auto mb-2"></div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Loading top losers...</p>
              </div>
            ) : topLosers.length > 0 && (
              <div className="mt-6">
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
                  📉 Today's Top Losers:
                </p>
                <div className="flex flex-wrap justify-center gap-3">
                  {topLosers.map((loser, index) => (
                    <button
                      key={index}
                      onClick={() => handleTickerClick(loser.ticker)}
                      className="group px-4 py-2.5 bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-red-600 hover:text-white dark:hover:bg-red-500 transition-all duration-200 transform hover:scale-105"
                      title={`${loser.change_percent.toFixed(2)}% loss`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{loser.ticker}</span>
                        <span className="text-xs font-medium text-red-600 dark:text-red-400 group-hover:text-red-200">
                          {loser.change_percent.toFixed(2)}%
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        </>
        )}

        {activeTab === 'screener' && (
        <div>
          {/* Quick screens + Saved screens + Save form */}
          <div className="mb-5 space-y-2">
            {presets.length > 0 && (
              <div className="flex flex-wrap gap-2 items-center">
                <span className="text-sm font-medium text-gray-500 dark:text-gray-400 shrink-0">Quick screens:</span>
                {presets.map(p => (
                  <button
                    key={p.id}
                    onClick={() => applyPreset(p)}
                    className={`px-4 py-2 text-sm font-medium rounded-full border transition-colors ${
                      activePresetId === p.id
                        ? 'bg-teal-600 border-teal-600 text-white'
                        : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:border-teal-500 hover:text-teal-700 dark:hover:border-teal-500 dark:hover:text-teal-400'
                    }`}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            )}

            {activePresetId && (() => {
              const active = presets.find(p => p.id === activePresetId);
              return active ? (
                <p className="text-xs text-gray-500 dark:text-gray-400">{active.description}</p>
              ) : null;
            })()}

            <div className="border-t border-gray-200 dark:border-gray-700" />

            {savedScreens.length > 0 && (
              <div className="flex flex-wrap gap-2 items-center">
                <span className="text-sm font-medium text-gray-500 dark:text-gray-400 shrink-0">Saved:</span>
                {savedScreens.map(s => {
                  const isActive = activeSavedScreenId === s.id;
                  return (
                  <div
                    key={s.id}
                    className={`flex items-center gap-0.5 pl-3 pr-1 py-1.5 border rounded-full transition-colors ${
                      isActive
                        ? 'bg-teal-600 border-teal-600'
                        : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600'
                    }`}
                  >
                    <button
                      onClick={() => applySavedScreen(s)}
                      className={`text-sm transition-colors ${
                        isActive
                          ? 'text-white'
                          : 'text-gray-700 dark:text-gray-300 hover:text-teal-600 dark:hover:text-teal-400'
                      }`}
                    >
                      {s.name}
                    </button>
                    <button
                      onClick={() => deleteSavedScreen(s.id)}
                      className={`ml-1.5 transition-colors text-base leading-none pb-0.5 ${
                        isActive ? 'text-teal-200 hover:text-white' : 'text-gray-400 hover:text-red-500'
                      }`}
                      title="Delete saved screen"
                    >
                      ×
                    </button>
                  </div>
                  );
                })}
              </div>
            )}

            {!showSaveForm ? (
              <div>
                <button
                  onClick={() => { setShowSaveForm(true); setSaveError(''); }}
                  className="text-sm font-medium text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-300 transition-colors"
                >
                  + Save current screen
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2 items-center">
                <input
                  type="text"
                  placeholder="Screen name..."
                  value={saveScreenName}
                  onChange={e => setSaveScreenName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && saveCurrentScreen()}
                  className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-800 dark:text-white focus:outline-none focus:ring-1 focus:ring-teal-500 w-48"
                  autoFocus
                />
                <button
                  onClick={saveCurrentScreen}
                  disabled={savingScreen || !saveScreenName.trim()}
                  className="px-3 py-1.5 text-sm bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 transition-colors"
                >
                  {savingScreen ? 'Saving…' : 'Save'}
                </button>
                <button
                  onClick={() => { setShowSaveForm(false); setSaveScreenName(''); setSaveError(''); }}
                  className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                >
                  Cancel
                </button>
                {saveError && <span className="text-xs text-red-500">{saveError}</span>}
              </div>
            )}
          </div>

          {/* Main layout */}
          <div className="flex gap-5 items-start">
            {/* Criteria panel */}
            <div className="w-60 shrink-0 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
              <div className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-3">Filters</div>

              {/* Price */}
              <div className="mb-3">
                <div className="text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Price ($)</div>
                <div className="flex gap-1.5">
                  <input type="number" placeholder="Min" value={screenerForm.priceMin}
                    onChange={e => setScreenerForm(f => ({ ...f, priceMin: e.target.value }))}
                    className={screenerInputCls} />
                  <input type="number" placeholder="Max" value={screenerForm.priceMax}
                    onChange={e => setScreenerForm(f => ({ ...f, priceMax: e.target.value }))}
                    className={screenerInputCls} />
                </div>
              </div>

              {/* Market Cap */}
              <div className="mb-3">
                <div className="text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Market Cap ($B)</div>
                <div className="flex gap-1.5">
                  <input type="number" placeholder="Min" value={screenerForm.marketCapMinB}
                    onChange={e => setScreenerForm(f => ({ ...f, marketCapMinB: e.target.value }))}
                    className={screenerInputCls} />
                  <input type="number" placeholder="Max" value={screenerForm.marketCapMaxB}
                    onChange={e => setScreenerForm(f => ({ ...f, marketCapMaxB: e.target.value }))}
                    className={screenerInputCls} />
                </div>
              </div>

              {/* Daily Change */}
              <div className="mb-3">
                <div className="text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Daily Change (%)</div>
                <div className="flex gap-1.5">
                  <input type="number" placeholder="Min" value={screenerForm.changePctMin}
                    onChange={e => setScreenerForm(f => ({ ...f, changePctMin: e.target.value }))}
                    className={screenerInputCls} />
                  <input type="number" placeholder="Max" value={screenerForm.changePctMax}
                    onChange={e => setScreenerForm(f => ({ ...f, changePctMax: e.target.value }))}
                    className={screenerInputCls} />
                </div>
              </div>

              {/* Dollar Volume */}
              <div className="mb-3">
                <div className="text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Dollar Volume ($M min)</div>
                <input type="number" placeholder="e.g. 50" value={screenerForm.dollarVolMinM}
                  onChange={e => setScreenerForm(f => ({ ...f, dollarVolMinM: e.target.value }))}
                  className={screenerInputCls} />
              </div>

              {/* Trading Volume */}
              <div className="mb-3">
                <div className="text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Trading Volume (M shares)</div>
                <div className="flex gap-1.5">
                  <input type="number" placeholder="Min" value={screenerForm.volumeMinM}
                    onChange={e => setScreenerForm(f => ({ ...f, volumeMinM: e.target.value }))}
                    className={screenerInputCls} />
                  <input type="number" placeholder="Max" value={screenerForm.volumeMaxM}
                    onChange={e => setScreenerForm(f => ({ ...f, volumeMaxM: e.target.value }))}
                    className={screenerInputCls} />
                </div>
              </div>

              {/* % from 52-Wk High */}
              <div className="mb-3">
                <div className="text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">% from 52-Wk High</div>
                <div className="flex gap-1.5">
                  <input type="number" placeholder="Min" value={screenerForm.pctFromHighMin}
                    onChange={e => setScreenerForm(f => ({ ...f, pctFromHighMin: e.target.value }))}
                    className={screenerInputCls} />
                  <input type="number" placeholder="Max" value={screenerForm.pctFromHighMax}
                    onChange={e => setScreenerForm(f => ({ ...f, pctFromHighMax: e.target.value }))}
                    className={screenerInputCls} />
                </div>
              </div>

              {/* Moving Averages */}
              <div className="mb-3">
                <div className="text-xs font-medium text-gray-600 dark:text-gray-300 mb-1.5">Moving Averages</div>
                {([
                  { key: 'goldenCross', label: 'Golden Cross (50MA > 200MA)' },
                  { key: 'priceAbove50ma', label: 'Price > 50-Day MA' },
                  { key: 'priceAbove200ma', label: 'Price > 200-Day MA' },
                ] as const).map(({ key, label }) => (
                  <label key={key} className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300 mb-1.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={screenerForm[key] === true}
                      onChange={e => setScreenerForm(f => ({ ...f, [key]: e.target.checked ? true : null }))}
                      className="rounded border-gray-300 dark:border-gray-600 text-teal-600 focus:ring-teal-500"
                    />
                    {label}
                  </label>
                ))}
              </div>

              {/* Squeeze */}
              <div className="mb-3">
                <div className="text-xs font-medium text-gray-600 dark:text-gray-300 mb-1.5">Volatility Squeeze</div>
                <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300 mb-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={screenerForm.squeezeOn === true}
                    onChange={e => setScreenerForm(f => ({ ...f, squeezeOn: e.target.checked ? true : null }))}
                    className="rounded border-gray-300 dark:border-gray-600 text-teal-600 focus:ring-teal-500"
                  />
                  In squeeze only
                </label>
                <div className="text-[11px] text-gray-500 dark:text-gray-400 mb-1">Min days coiling</div>
                <input type="number" placeholder="e.g. 10" value={screenerForm.squeezeMinBars}
                  onChange={e => setScreenerForm(f => ({ ...f, squeezeMinBars: e.target.value }))}
                  className={`${screenerInputCls} mb-2`} />
                <div className="text-[11px] text-gray-500 dark:text-gray-400 mb-1">Max tightness (BB÷KC, lower = tighter)</div>
                <input type="number" step="0.05" placeholder="e.g. 0.85" value={screenerForm.squeezeMaxRatio}
                  onChange={e => setScreenerForm(f => ({ ...f, squeezeMaxRatio: e.target.value }))}
                  className={`${screenerInputCls} mb-2`} />
                <div className="text-[11px] text-gray-500 dark:text-gray-400 mb-1">Fired within N days</div>
                <input type="number" placeholder="e.g. 3" value={screenerForm.squeezeFiredWithinDays}
                  onChange={e => setScreenerForm(f => ({ ...f, squeezeFiredWithinDays: e.target.value }))}
                  className={screenerInputCls} />
              </div>

              {/* Exchange */}
              <div className="mb-4">
                <div className="text-xs font-medium text-gray-600 dark:text-gray-300 mb-1.5">Exchange</div>
                <div className="flex gap-1.5 flex-wrap">
                  {['NYSE', 'NASDAQ', 'AMEX'].map(ex => (
                    <button
                      key={ex}
                      onClick={() => setScreenerForm(f => ({
                        ...f,
                        exchange: f.exchange.includes(ex)
                          ? f.exchange.filter(e => e !== ex)
                          : [...f.exchange, ex],
                      }))}
                      className={`px-2.5 py-1 text-xs font-medium rounded-full border transition-colors ${
                        screenerForm.exchange.includes(ex)
                          ? 'border-teal-500 bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400'
                          : 'border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-gray-400'
                      }`}
                    >
                      {ex}
                    </button>
                  ))}
                </div>
              </div>

              {/* Exclude ETFs */}
              <div className="mb-4">
                <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={screenerForm.excludeEtfs}
                    onChange={e => setScreenerForm(f => ({ ...f, excludeEtfs: e.target.checked }))}
                    className="rounded border-gray-300 dark:border-gray-600 text-teal-600 focus:ring-teal-500"
                  />
                  Exclude ETFs &amp; Funds
                </label>
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                <button
                  onClick={() => { setScreenerForm(defaultScreenerForm); setScreenerResults([]); setScreenerTotal(0); setActivePresetId(null); setActiveSavedScreenId(null); }}
                  className="flex-1 py-1.5 text-xs border border-gray-300 dark:border-gray-600 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  Clear
                </button>
                <button
                  onClick={() => runScreener(1, screenerForm, screenerSortBy, screenerSortDesc)}
                  className="flex-1 py-1.5 text-xs bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors font-medium"
                >
                  Run Screen
                </button>
              </div>
            </div>

            {/* Results panel */}
            <div className="flex-1 min-w-0">
              {screenerLoading && (
                <div className="flex items-center justify-center h-64">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600"></div>
                </div>
              )}

              {screenerError && !screenerLoading && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 text-sm text-red-600 dark:text-red-400">
                  {screenerError}
                </div>
              )}

              {!screenerLoading && !screenerError && screenerResults.length === 0 && (
                <div className="flex flex-col items-center justify-center h-64 text-gray-400 dark:text-gray-500">
                  <div className="text-5xl mb-3">📊</div>
                  <div className="text-sm">Select a preset or set filters and click Run Screen</div>
                </div>
              )}

              {!screenerLoading && screenerResults.length > 0 && (
                <>
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-sm text-gray-500 dark:text-gray-400">
                      <span className="font-medium text-gray-900 dark:text-white">{screenerTotal.toLocaleString()}</span> results
                      {screenerDataAsOf && (
                        <span className="ml-2 text-xs">· data as of {new Date(screenerDataAsOf).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      )}
                    </div>
                  </div>

                  <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 dark:bg-gray-800/60">
                        <tr>
                          {([
                            { key: 'symbol', label: 'Symbol' },
                            { key: 'name', label: 'Name' },
                            { key: 'price', label: 'Price' },
                            { key: 'change_percentage', label: 'Chg%' },
                            { key: 'market_cap', label: 'Mkt Cap' },
                            { key: 'volume', label: 'Volume' },
                          ] as const).map(col => (
                            <th
                              key={col.key}
                              onClick={() => handleScreenerSort(col.key)}
                              className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 cursor-pointer select-none hover:text-gray-700 dark:hover:text-gray-200 whitespace-nowrap"
                            >
                              {col.label}
                              {screenerSortBy === col.key && (
                                <span className="ml-1">{screenerSortDesc ? '↓' : '↑'}</span>
                              )}
                            </th>
                          ))}
                          <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 whitespace-nowrap">52-Wk Range</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
                        {screenerResults.map(r => {
                          const pos = r.year_high && r.year_low && r.price && r.year_high > r.year_low
                            ? Math.min(100, Math.max(0, ((r.price - r.year_low) / (r.year_high - r.year_low)) * 100))
                            : null;
                          return (
                            <tr
                              key={r.symbol}
                              onClick={() => navigate(`/stocks?ticker=${r.symbol}`)}
                              className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors"
                            >
                              <td
                                className="px-3 py-2.5 font-semibold text-teal-600 dark:text-teal-400 whitespace-nowrap"
                                onClick={e => {
                                  e.stopPropagation();
                                  if (user?.subscription_tier === 'active' || user?.subscription_tier === 'professional') {
                                    lastScreenerTickerRef.current = r.symbol;
                                    setScreenerChartTicker(r.symbol);
                                    setScreenerChartUpgrade(false);
                                  } else {
                                    setScreenerChartUpgrade(true);
                                    setScreenerChartTicker(null);
                                  }
                                }}
                              >
                                <span className="cursor-pointer hover:underline">{r.symbol}</span>
                                {r.squeeze_state === 'on' && (
                                  <span className="ml-1.5 px-1.5 py-0.5 text-[10px] font-bold rounded bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 align-middle">
                                    SQUEEZE
                                  </span>
                                )}
                                {r.squeeze_state === 'fired' && (
                                  <span className="ml-1.5 px-1.5 py-0.5 text-[10px] font-bold rounded bg-teal-100 dark:bg-teal-900/30 text-teal-800 dark:text-teal-300 align-middle">
                                    FIRED{r.squeeze_bars != null ? ` ${r.squeeze_bars}d` : ''}
                                  </span>
                                )}
                              </td>
                              <td className="px-3 py-2.5 text-gray-700 dark:text-gray-300 max-w-[180px] truncate">{r.name ?? '—'}</td>
                              <td className="px-3 py-2.5 font-medium whitespace-nowrap">{r.price != null ? `$${r.price.toFixed(2)}` : '—'}</td>
                              <td className={`px-3 py-2.5 font-medium whitespace-nowrap ${r.change_percentage == null ? '' : r.change_percentage >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                                {r.change_percentage != null ? `${r.change_percentage >= 0 ? '+' : ''}${r.change_percentage.toFixed(2)}%` : '—'}
                              </td>
                              <td className="px-3 py-2.5 text-gray-600 dark:text-gray-300 whitespace-nowrap">{fmtMarketCap(r.market_cap)}</td>
                              <td className="px-3 py-2.5 text-gray-600 dark:text-gray-300 whitespace-nowrap">{fmtVolume(r.volume)}</td>
                              <td className="px-3 py-2.5">
                                {pos != null ? (
                                  <div className="flex items-center gap-1.5 min-w-[120px]">
                                    <span className="text-xs text-gray-400 w-10 text-right tabular-nums">
                                      {r.year_low != null ? `$${r.year_low < 10 ? r.year_low.toFixed(2) : Math.round(r.year_low)}` : ''}
                                    </span>
                                    <div className="relative flex-1 h-1.5 bg-gray-200 dark:bg-gray-600 rounded-full">
                                      <div
                                        className="absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-teal-500 dark:bg-teal-400 -ml-1"
                                        style={{ left: `${pos}%` }}
                                      />
                                    </div>
                                    <span className="text-xs text-gray-400 w-10 tabular-nums">
                                      {r.year_high != null ? `$${r.year_high < 10 ? r.year_high.toFixed(2) : Math.round(r.year_high)}` : ''}
                                    </span>
                                  </div>
                                ) : '—'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {screenerTotalPages > 1 && (
                    <div className="flex items-center justify-between mt-4">
                      <button
                        disabled={screenerPage <= 1}
                        onClick={() => runScreener(screenerPage - 1, screenerForm, screenerSortBy, screenerSortDesc)}
                        className="px-3 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-gray-700 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                      >
                        ← Previous
                      </button>
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        Page {screenerPage} of {screenerTotalPages}
                      </span>
                      <button
                        disabled={screenerPage >= screenerTotalPages}
                        onClick={() => runScreener(screenerPage + 1, screenerForm, screenerSortBy, screenerSortDesc)}
                        className="px-3 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-gray-700 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                      >
                        Next →
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>

          </div>
        </div>
        )}
      </div>

      {/* Intraday chart popup — active/professional only, large centered modal */}
      {screenerChartTicker && (
        <ScreenerChartPanel
          ticker={screenerChartTicker}
          onClose={() => setScreenerChartTicker(null)}
          displayMode="modal"
        />
      )}

      {/* Upgrade notice — floats in same position for consistent UX */}
      {screenerChartUpgrade && !screenerChartTicker && (
        <div className="fixed top-20 right-4 z-40 w-96 bg-white dark:bg-gray-900 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 p-6 flex flex-col items-center gap-3 text-center">
          <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          <div>
            <p className="text-sm font-semibold text-gray-900 dark:text-white mb-1">
              Active or Professional plan required
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Live intraday charts with drawing tools are available on the Active and Professional tiers.
            </p>
          </div>
          <button
            onClick={() => setScreenerChartUpgrade(false)}
            className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            Dismiss
          </button>
        </div>
      )}

      <BackToTop />
    </div>
  );
};

export default Stocks;