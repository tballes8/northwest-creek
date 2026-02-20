import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { authAPI, dcfAPI, watchlistAPI } from '../services/api';
import { User } from '../types';
import ThemeToggle from '../components/ThemeToggle';
import UpgradeRequired from '../components/UpgradeRequired';

interface DCFSuggestions {
  ticker: string;
  company_name: string;
  sector: string;
  industry: string;
  current_price: number;
  market_cap: number;
  size_category: string;
  security_type?: string;  // CS, WARRANT, ETF, etc. from Polygon
  suggestions: {
    growth_rate: number;
    terminal_growth: number;
    discount_rate: number;
    projection_years: number;
  };
  reasoning: {
    growth_rate: string;
    terminal_growth: string;
    discount_rate: string;
    projection_years: string;
  };
  actuals?: {
    revenue_ttm: number | null;
    revenue_ttm_fmt: string | null;
    net_income_ttm: number | null;
    net_income_ttm_fmt: string | null;
    fcf_ttm: number | null;
    fcf_ttm_fmt: string | null;
    operating_cf_ttm: number | null;
    operating_cf_ttm_fmt: string | null;
    gross_margin_pct: number | null;
    operating_margin_pct: number | null;
    net_margin_pct: number | null;
    revenue_growth_yoy_pct: number | null;
    pe_ratio: number | null;
    ev_to_ebitda: number | null;
    debt_to_equity: number | null;
    current_ratio: number | null;
    roe: number | null;
    diluted_eps: number | null;
  } | null;
}

interface DCFData {
  ticker: string;
  company_name: string;
  security_type?: string;  // CS, WARRANT, ETF, etc. from Polygon
  current_price: number;
  assumptions: {
    growth_rate: number;
    terminal_growth: number;
    discount_rate: number;
    projection_years: number;
    current_fcf: number;
    shares_outstanding: number;
    fcf_source?: string;
  };
  projections: Array<{
    year: number;
    cash_flow: number;
    present_value: number;
    discount_factor: number;
  }>;
  terminal_value: {
    value: number;
    present_value: number;
    growth_rate: number;
  };
  valuation: {
    sum_pv_cash_flows: number;
    terminal_pv: number;
    enterprise_value: number;
    intrinsic_value_per_share: number;
    current_price: number;
    margin_of_safety: number;
  };
  recommendation: {
    rating: string;
    color: string;
    message: string;
  };
}

const DCFValuation: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const urlTicker = searchParams.get('ticker') || '';
  const [user, setUser] = useState<User | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [ticker, setTicker] = useState(urlTicker);
  const [growthRate, setGrowthRate] = useState(5);
  const [terminalGrowth, setTerminalGrowth] = useState(2.5);
  const [discountRate, setDiscountRate] = useState(10);
  const [projectionYears, setProjectionYears] = useState(5);
  const [loading, setLoading] = useState(false);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [dcfData, setDcfData] = useState<DCFData | null>(null);
  const [suggestions, setSuggestions] = useState<DCFSuggestions | null>(null);
  const [error, setError] = useState('');
  const [hasLoadedInitialSuggestions, setHasLoadedInitialSuggestions] = useState(false);
  const [isWarrant, setIsWarrant] = useState(false);
  const [relatedCommonStock, setRelatedCommonStock] = useState<string | null>(null);
  const [watchlistMsg, setWatchlistMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [addingToWatchlist, setAddingToWatchlist] = useState(false);
  const [prefilledFromTA, setPrefilledFromTA] = useState<{
    growth: number | null;
    wacc: number | null;
    fcf: number | null;
    revGrowth: number | null;
    opMargin: number | null;
    deRatio: number | null;
  } | null>(null);

  // Warrant detection is now API-driven using Polygon's `type` field (CS, WARRANT, ETF, etc.)
  // These helpers are only used as a pre-fetch hint for explicit separator patterns
  const detectWarrantHint = (tickerSymbol: string): boolean => {
    const upper = tickerSymbol.toUpperCase();
    // Only match unambiguous separator-based warrant patterns
    return (
      upper.includes('.W') ||   // e.g. ACAH.W, ACAH.WS
      upper.includes('+W') ||   // e.g. ACAH+W
      upper.endsWith('/WS') ||  // e.g. ACAH/WS
      upper.endsWith('/WT')     // e.g. ACAH/WT
    );
  };

  const getRelatedCommonStock = (warrantTicker: string): string | null => {
    const upper = warrantTicker.toUpperCase();
    // Strip explicit warrant suffixes with separators
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
  }, []);

  // Separate useEffect for handling URL ticker parameter
  useEffect(() => {
    if (urlTicker && !hasLoadedInitialSuggestions) {
      setTicker(urlTicker);
      setHasLoadedInitialSuggestions(true);
      
      // Pre-fetch hint only — real warrant detection happens after API response
      const isWarrantHint = detectWarrantHint(urlTicker);
      setIsWarrant(isWarrantHint);
      if (isWarrantHint) {
        setRelatedCommonStock(getRelatedCommonStock(urlTicker));
      }
      
      // Check if we have pre-populated inputs from Technical Analysis
      const fromTA = searchParams.get('from') === 'ta';
      const urlGrowth = searchParams.get('growth');
      const urlWacc = searchParams.get('wacc');
      
      if (fromTA && (urlGrowth || urlWacc)) {
        // Apply actual financials directly — skip the suggestions API call
        if (urlGrowth) setGrowthRate(parseFloat(urlGrowth));
        if (urlWacc) setDiscountRate(parseFloat(urlWacc));
        
        // Build a lightweight "suggestions" object from URL params for display
        const urlRevGrowth = searchParams.get('revgrowth');
        const urlFcf = searchParams.get('fcf');
        const urlOpMarg = searchParams.get('opmarg');
        const urlDe = searchParams.get('de');
        
        setPrefilledFromTA({
          growth: urlGrowth ? parseFloat(urlGrowth) : null,
          wacc: urlWacc ? parseFloat(urlWacc) : null,
          fcf: urlFcf ? parseFloat(urlFcf) : null,
          revGrowth: urlRevGrowth ? parseFloat(urlRevGrowth) : null,
          opMargin: urlOpMarg ? parseFloat(urlOpMarg) : null,
          deRatio: urlDe ? parseFloat(urlDe) : null,
        });
        
        // Still load full suggestions in background to get company name, sector, actuals grid
        loadSuggestions(urlTicker, true);
      } else {
        loadSuggestions(urlTicker);
      }
    }
  }, [urlTicker, hasLoadedInitialSuggestions]);

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
  
  const loadSuggestions = async (symbol: string, skipParamOverride: boolean = false) => {
    if (!symbol.trim()) return;

    setLoadingSuggestions(true);
    setError('');
    
    try {
      const response = await dcfAPI.getSuggestions(symbol.toUpperCase());
      setSuggestions(response.data);
      
      // API-driven warrant detection — overrides any pre-fetch hint
      const apiType = response.data.security_type || '';
      if (apiType === 'WARRANT') {
        setIsWarrant(true);
        const related = getRelatedCommonStock(symbol);
        if (related) {
          setRelatedCommonStock(related);
        } else {
          const stripped = symbol.toUpperCase().replace(/W+$/, '');
          setRelatedCommonStock(stripped.length >= 2 && stripped !== symbol.toUpperCase() ? stripped : null);
        }
      } else if (apiType === 'CS' || apiType === 'ADRC' || apiType === 'PFD') {
        // Confirmed common stock / ADR / preferred — clear any false positive
        setIsWarrant(false);
        setRelatedCommonStock(null);
      }
      // If apiType is empty/unknown, keep the hint-based detection as-is
      
      // Only set parameters if NOT pre-filled from Technical Analysis
      if (!skipParamOverride) {
        setGrowthRate(response.data.suggestions.growth_rate * 100);
        setTerminalGrowth(response.data.suggestions.terminal_growth * 100);
        setDiscountRate(response.data.suggestions.discount_rate * 100);
        setProjectionYears(response.data.suggestions.projection_years);
      }
      setShowSuggestions(true);
    } catch (err: any) {
      console.error('Failed to load suggestions:', err);
      // Don't show error to user, just use default values
      setShowSuggestions(false);
    } finally {
      setLoadingSuggestions(false);
    }
  };

  // User dropdown menu
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  const TIER_LIMITS: Record<string, number> = {
    free: 5, casual: 5, active: 5, professional: 20
  };

  const tierLimit = TIER_LIMITS[user?.subscription_tier || 'free'] || 5;

  const [usageCount, setUsageCount] = useState(0);

  const handleCalculate = async (e: React.FormEvent) => {
    e.preventDefault();

    if (user && usageCount >= tierLimit) {
      return;
    }
  
    if (!ticker.trim()) {
      setError('Please enter a ticker symbol');
      return;
    }

    setLoading(true);
    setError('');
    setDcfData(null);

    try {
      const response = await dcfAPI.calculate(ticker.toUpperCase(), {
        growth_rate: growthRate / 100,
        terminal_growth: terminalGrowth / 100,
        discount_rate: discountRate / 100,
        projection_years: projectionYears
      });
    
      setDcfData(response.data);
      setShowSuggestions(false);
      setUsageCount(prev => prev + 1);
    } catch (err: any) {
      console.error('DCF calculation error:', err);
      setError(err.response?.data?.detail || 'Failed to calculate DCF. Please check the ticker symbol and try again.');
    } finally {
      setLoading(false);
    }
  };
	
  const handleTickerChange = (value: string) => {
    setTicker(value);
    setPrefilledFromTA(null);
    
    // Pre-fetch hint only — real warrant detection happens after API response
    const isWarrantHint = detectWarrantHint(value);
    setIsWarrant(isWarrantHint);
    if (isWarrantHint) {
      setRelatedCommonStock(getRelatedCommonStock(value));
    } else {
      setRelatedCommonStock(null);
    }
  };

  const handleGetSuggestions = () => {
    if (ticker.trim()) {
      loadSuggestions(ticker);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('access_token');
    navigate('/');
  };

  const handleAddToWatchlist = async () => {
    const t = ticker.trim().toUpperCase() || dcfData?.ticker;
    if (!t) return;
    setAddingToWatchlist(true);
    setWatchlistMsg(null);
    try {
      const payload: any = { ticker: t };
      if (dcfData?.current_price) {
        payload.target_price = dcfData.current_price;
      }
      const parts = [];
      if (dcfData?.company_name) parts.push(dcfData.company_name);
      if (suggestions?.sector) parts.push(suggestions.sector);
      if (parts.length > 0) {
        payload.notes = parts.join(' – ');
      }
      await watchlistAPI.add(payload);
      setWatchlistMsg({ type: 'success', text: `${t} added to watchlist!` });
      setTimeout(() => setWatchlistMsg(null), 3000);
    } catch (err: any) {
      const msg = err.response?.data?.detail || 'Failed to add to watchlist';
      setWatchlistMsg({ type: 'error', text: typeof msg === 'string' ? msg : 'Failed to add to watchlist' });
      setTimeout(() => setWatchlistMsg(null), 4000);
    } finally {
      setAddingToWatchlist(false);
    }
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

  const formatCurrency = (value: number) => {
    if (Math.abs(value) >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
    if (Math.abs(value) >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
    if (Math.abs(value) >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
    if (Math.abs(value) >= 1e3) return `$${(value / 1e3).toFixed(2)}K`;
    return `$${value.toFixed(2)}`;
  };
  if (usageCount >= tierLimit) {
    return (
      <div className="min-h-screen bg-gray-100 dark:bg-gray-800 transition-colors duration-200">
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
                <Link to="/portfolio" className="text-gray-400 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">Portfolio</Link>
                <Link to="/alerts" className="text-gray-400 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">Alerts</Link>
                <Link to="/stocks" className="text-gray-400 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">Stocks</Link>
                <Link to="/technical-analysis" className="text-gray-400 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">Technical Analysis</Link>
                <Link to="/dcf-valuation" className="text-primary-400 dark:text-primary-400 font-medium border-b-2 border-primary-600 dark:border-primary-400 pb-1">DCF Valuation</Link>
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
        <UpgradeRequired
          feature="DCF Valuation"
          currentTier={user?.subscription_tier || "free"}
          limitReached={true}
          currentUsage={usageCount}
          maxUsage={tierLimit}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-800 transition-colors duration-200">
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
              <Link to="/portfolio" className="text-gray-400 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">Portfolio</Link>
              <Link to="/alerts" className="text-gray-400 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">Alerts</Link>
              <Link to="/stocks" className="text-gray-400 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">Stocks</Link>
              <Link to={`/technical-analysis${ticker ? `?ticker=${ticker}` : ''}`} className="text-gray-400 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">Technical Analysis</Link>
              <Link to={`/dcf-valuation${ticker ? `?ticker=${ticker}` : ''}`} className="text-primary-400 dark:text-primary-400 font-medium border-b-2 border-primary-600 dark:border-primary-400 pb-1">DCF Valuation</Link>
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
            </div>
            <ThemeToggle />
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Warrant Warning Box */}
        {isWarrant && (
          <div className="bg-yellow-50 dark:bg-yellow-900/30 border-2 border-yellow-500 dark:border-yellow-600 rounded-lg p-6 mb-6">
            <div className="flex items-start gap-3">
              <div className="text-3xl">⚠️</div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-yellow-900 dark:text-yellow-200 mb-2">
                  Warning: DCF Valuation Not Recommended for Warrants
                </h3>
                <div className="text-yellow-800 dark:text-yellow-300 space-y-2">
                  <p className="font-medium">
                    <strong>Important:</strong> Traditional DCF (Discounted Cash Flow) analysis is designed for common stocks and is <strong>not appropriate</strong> for warrant valuation.
                  </p>
                  <div className="space-y-1.5 text-sm">
                    <p><strong>Why DCF doesn't work for warrants:</strong></p>
                    <ul className="list-disc list-inside ml-4 space-y-1">
                      <li>Warrants don't generate cash flows - they're derivative securities</li>
                      <li>Warrant value depends on the underlying stock's volatility and time to expiration</li>
                      <li>DCF assumes stable, predictable cash flows - warrants have none</li>
                      <li>The appropriate model for warrants is Black-Scholes or similar option pricing models</li>
                    </ul>
                    
                    <div className="mt-3 p-3 bg-yellow-100 dark:bg-yellow-900/50 rounded border border-yellow-300 dark:border-yellow-700">
                      <p className="font-semibold mb-1">Recommended Action:</p>
                      <p>Analyze the <strong>underlying common stock</strong> instead:</p>
                      {relatedCommonStock && (
                        <div className="mt-2">
                          <Link
                            to={`/dcf-valuation?ticker=${relatedCommonStock}`}
                            className="inline-block px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg font-medium transition-colors"
                          >
                            Analyze {relatedCommonStock} (Common Stock) →
                          </Link>
                        </div>
                      )}
                    </div>
                    
                    <div className="mt-3 p-3 bg-blue-100 dark:bg-blue-900/30 rounded border border-blue-300 dark:border-blue-700">
                      <p className="font-semibold text-blue-900 dark:text-blue-200 mb-1">For Warrant Valuation:</p>
                      <ul className="list-disc list-inside ml-4 space-y-1 text-blue-800 dark:text-blue-300">
                        <li>Use Black-Scholes option pricing model</li>
                        <li>Consider: Strike price, time to expiration, volatility</li>
                        <li>Compare warrant price to intrinsic value (Stock Price - Strike Price)</li>
                        <li>Assess time value remaining before expiration</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Input Form */}
        <div className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 p-6 mb-6 border dark:border-gray-500">
          <form onSubmit={handleCalculate} className="space-y-6">
            {/* Ticker Input */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Stock Ticker {isWarrant && <span className="text-yellow-600 dark:text-yellow-400 text-xs ml-2">(WARRANT - Not recommended for DCF)</span>}
              </label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    type="text"
                    value={ticker}
                    onChange={(e) => handleTickerChange(e.target.value.toUpperCase())}
                    placeholder="e.g., AAPL, MSFT"
                    className="w-full px-4 py-2 pr-10 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-600 text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500"
                  />
                  {ticker && (
                    <button
                      type="button"
                      onClick={() => {
                        setTicker('');
                        setSuggestions(null);
                        setShowSuggestions(false);
                        setDcfData(null);
                        setError('');
                        setIsWarrant(false);
                        setRelatedCommonStock(null);
                        setPrefilledFromTA(null);
                      }}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
                      title="Clear search"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  onClick={handleGetSuggestions}
                  disabled={loadingSuggestions || !ticker.trim()}
                  className="px-6 py-2 bg-gray-600 hover:bg-gray-700 dark:bg-gray-500 dark:hover:bg-gray-600 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
                >
                  {loadingSuggestions ? 'Loading...' : 'Get AI Suggestions'}
                </button>
                {(dcfData || suggestions) && (
                  <button
                    type="button"
                    onClick={() => {
                      setTicker('');
                      setSuggestions(null);
                      setShowSuggestions(false);
                      setDcfData(null);
                      setError('');
                      setIsWarrant(false);
                      setRelatedCommonStock(null);
                      setPrefilledFromTA(null);
                    }}
                    className="px-4 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-600 dark:hover:bg-gray-500 text-gray-700 dark:text-gray-200 rounded-lg font-medium transition-colors text-sm whitespace-nowrap"
                  >
                    🔄 New Search
                  </button>
                )}
              </div>
            </div>

            {/* Show Suggestions */}
            {showSuggestions && suggestions && (
              <div className="bg-blue-50 dark:bg-blue-900/30 p-4 rounded-lg border border-blue-200 dark:border-blue-800">
                <h3 className="text-lg font-bold text-blue-900 dark:text-blue-200 mb-2">
                  AI-Suggested Parameters for {suggestions.company_name}
                </h3>
                <div className="text-sm text-blue-800 dark:text-blue-300 space-y-1">
                  <p><strong>Sector:</strong> {suggestions.sector} | <strong>Size:</strong> {suggestions.size_category.replace('_', ' ').toUpperCase()}</p>
                </div>

                {/* Pre-filled from Technical Analysis banner */}
                {prefilledFromTA && (
                  <div className="mt-3 bg-green-50 dark:bg-green-900/30 rounded-lg p-3 border border-green-200 dark:border-green-700">
                    <div className="flex items-start gap-2">
                      <span className="text-green-600 dark:text-green-400 text-lg leading-none">✓</span>
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-green-800 dark:text-green-200">
                          Inputs pre-filled from actual financial data
                        </p>
                        <p className="text-xs text-green-700 dark:text-green-300 mt-0.5">
                          Growth rate and discount rate were derived from SEC filings via Technical Analysis.
                          You can adjust them below before calculating.
                        </p>
                        <div className="flex flex-wrap gap-3 mt-2 text-xs">
                          {prefilledFromTA.revGrowth != null && (
                            <span className="text-green-700 dark:text-green-300">
                              <strong>Trailing Rev. Growth:</strong> {prefilledFromTA.revGrowth.toFixed(1)}%
                            </span>
                          )}
                          {prefilledFromTA.growth != null && (
                            <span className="text-green-700 dark:text-green-300">
                              <strong>→ Suggested Growth:</strong> {prefilledFromTA.growth.toFixed(1)}%
                            </span>
                          )}
                          {prefilledFromTA.wacc != null && (
                            <span className="text-green-700 dark:text-green-300">
                              <strong>Est. WACC:</strong> {prefilledFromTA.wacc.toFixed(1)}%
                            </span>
                          )}
                          {prefilledFromTA.deRatio != null && (
                            <span className="text-green-700 dark:text-green-300">
                              <strong>D/E:</strong> {prefilledFromTA.deRatio.toFixed(2)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                
                {/* Actual Financials Grid */}
                {suggestions.actuals && (
                  <div className="mt-3 pt-3 border-t border-blue-200 dark:border-blue-700">
                    <p className="text-xs font-semibold text-blue-700 dark:text-blue-300 uppercase tracking-wider mb-2">
                      📊 From SEC Filings (TTM)
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2">
                      {[
                        { label: 'Revenue', value: suggestions.actuals.revenue_ttm_fmt },
                        { label: 'Net Income', value: suggestions.actuals.net_income_ttm_fmt },
                        { label: 'Free Cash Flow', value: suggestions.actuals.fcf_ttm_fmt },
                        { label: 'Gross Margin', value: suggestions.actuals.gross_margin_pct != null ? `${suggestions.actuals.gross_margin_pct.toFixed(1)}%` : null },
                        { label: 'Op. Margin', value: suggestions.actuals.operating_margin_pct != null ? `${suggestions.actuals.operating_margin_pct.toFixed(1)}%` : null },
                        { label: 'Net Margin', value: suggestions.actuals.net_margin_pct != null ? `${suggestions.actuals.net_margin_pct.toFixed(1)}%` : null },
                        { label: 'Rev. Growth (YoY)', value: suggestions.actuals.revenue_growth_yoy_pct != null ? `${suggestions.actuals.revenue_growth_yoy_pct.toFixed(1)}%` : null },
                        { label: 'P/E Ratio', value: suggestions.actuals.pe_ratio != null ? suggestions.actuals.pe_ratio.toFixed(1) : null },
                        { label: 'EV/EBITDA', value: suggestions.actuals.ev_to_ebitda != null ? suggestions.actuals.ev_to_ebitda.toFixed(1) : null },
                        { label: 'D/E Ratio', value: suggestions.actuals.debt_to_equity != null ? suggestions.actuals.debt_to_equity.toFixed(2) : null },
                        { label: 'ROE', value: suggestions.actuals.roe != null ? `${(suggestions.actuals.roe * 100).toFixed(1)}%` : null },
                        { label: 'EPS', value: suggestions.actuals.diluted_eps != null ? `$${suggestions.actuals.diluted_eps.toFixed(2)}` : null },
                      ].filter(item => item.value != null).map((item) => (
                        <div key={item.label} className="bg-white/60 dark:bg-gray-800/60 rounded px-2 py-1.5 text-center">
                          <div className="text-[10px] text-blue-600 dark:text-blue-400 leading-tight">{item.label}</div>
                          <div className="text-sm font-bold text-blue-900 dark:text-blue-100">{item.value}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                {!suggestions.actuals && (
                  <p className="text-xs text-blue-600 dark:text-blue-400 mt-2 italic">
                    Financial data unavailable — using sector-based defaults. Company may not have SEC filings (foreign-listed, OTC, or pre-revenue).
                  </p>
                )}
                
                <p className="mt-3 italic text-sm text-blue-700 dark:text-blue-300">
                  {suggestions.actuals ? 'Parameters are based on actual company financials. ' : ''}Click "Calculate DCF" below to use these parameters!
                </p>
              </div>
            )}

            {/* Parameter Inputs */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Growth Rate (%)
                </label>
                <input
                  type="number"
                  value={growthRate}
                  onChange={(e) => setGrowthRate(parseFloat(e.target.value) || 0)}
                  step="0.1"
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-600 text-gray-900 dark:text-white"
                />
                {suggestions && (
                  <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                    💡 {suggestions.reasoning.growth_rate}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Terminal Growth (%)
                </label>
                <input
                  type="number"
                  value={terminalGrowth}
                  onChange={(e) => setTerminalGrowth(parseFloat(e.target.value) || 0)}
                  step="0.1"
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-600 text-gray-900 dark:text-white"
                />
                {suggestions && (
                  <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                    💡 {suggestions.reasoning.terminal_growth}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Discount Rate (%)
                </label>
                <input
                  type="number"
                  value={discountRate}
                  onChange={(e) => setDiscountRate(parseFloat(e.target.value) || 0)}
                  step="0.1"
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-600 text-gray-900 dark:text-white"
                />
                {suggestions && (
                  <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                    💡 {suggestions.reasoning.discount_rate}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Projection Years
                </label>
                <input
                  type="number"
                  value={projectionYears}
                  onChange={(e) => setProjectionYears(parseInt(e.target.value) || 5)}
                  min="3"
                  max="15"
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-600 text-gray-900 dark:text-white"
                />
                {suggestions && (
                  <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                    💡 {suggestions.reasoning.projection_years}
                  </p>
                )}
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full px-6 py-3 bg-purple-600 hover:bg-purple-700 dark:bg-purple-500 dark:hover:bg-purple-600 text-white rounded-lg font-semibold transition-colors disabled:opacity-50"
            >
              {loading ? 'Calculating...' : '📊 Calculate DCF Valuation'}
            </button>
          </form>
        </div>

        {/* Error Display */}
        {error && (
          <div className="bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-600 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg mb-6">
            {error}
          </div>
        )}

        {/* Results Display */}
        {dcfData && (
          <div className="space-y-6">
            {/* Summary Card */}
            <div className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 p-6 border dark:border-gray-500">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
                {dcfData.company_name} ({dcfData.ticker})
              </h2>

              {/* Quick Actions: Watchlist + Cross-page links */}
              <div className="flex flex-wrap items-center gap-3 mb-4">
                <button
                  onClick={handleAddToWatchlist}
                  disabled={addingToWatchlist}
                  className="px-4 py-2 bg-yellow-500 hover:bg-yellow-600 dark:bg-yellow-600 dark:hover:bg-yellow-700 text-white rounded-lg font-medium text-sm transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  {addingToWatchlist ? '⏳ Adding...' : '⭐ Add to Watchlist'}
                </button>
                <Link
                  to={`/stocks?ticker=${dcfData.ticker}`}
                  className="px-4 py-2 bg-primary-600 hover:bg-primary-700 dark:bg-primary-500 dark:hover:bg-primary-600 text-white rounded-lg font-medium text-sm transition-colors"
                >
                  📊 Stock Details
                </Link>
                <Link
                  to={`/technical-analysis?ticker=${dcfData.ticker}`}
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
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">Current Price</div>
                  <div className="text-2xl font-bold text-gray-900 dark:text-white">
                    ${dcfData.current_price.toFixed(2)}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">DCF Intrinsic Value</div>
                  <div className={`text-2xl font-bold ${
                    dcfData.valuation.intrinsic_value_per_share <= 0
                      ? 'text-red-600 dark:text-red-400'
                      : dcfData.valuation.intrinsic_value_per_share >= dcfData.current_price
                      ? 'text-green-600 dark:text-green-400'
                      : 'text-red-600 dark:text-red-400'
                  }`}>
                    ${dcfData.valuation.intrinsic_value_per_share.toFixed(2)}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">Margin of Safety</div>
                  <div className={`text-2xl font-bold ${
                    dcfData.valuation.margin_of_safety > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                  }`}>
                    {dcfData.valuation.margin_of_safety > 0 ? '+' : ''}{dcfData.valuation.margin_of_safety.toFixed(1)}%
                  </div>
                </div>
              </div>
            </div>

            {/* Recommendation */}
            <div className={`rounded-lg shadow-lg dark:shadow-gray-200/20 p-6 border ${
              dcfData.recommendation.color === 'green' 
                ? 'bg-green-50 dark:bg-green-900/30 border-green-500 dark:border-green-600'
                : dcfData.recommendation.color === 'yellow'
                ? 'bg-yellow-50 dark:bg-yellow-900/30 border-yellow-500 dark:border-yellow-600'
                : 'bg-red-50 dark:bg-red-900/30 border-red-500 dark:border-red-600'
            }`}>
              <div className="flex items-center gap-3 mb-2">
                <div className="text-3xl">
                  {dcfData.recommendation.color === 'green' ? '✅' : 
                   dcfData.recommendation.color === 'yellow' ? '⚠️' : '❌'}
                </div>
                <h3 className={`text-xl font-bold ${
                  dcfData.recommendation.color === 'green' 
                    ? 'text-green-900 dark:text-green-200'
                    : dcfData.recommendation.color === 'yellow'
                    ? 'text-yellow-900 dark:text-yellow-200'
                    : 'text-red-900 dark:text-red-200'
                }`}>
                  {dcfData.recommendation.rating}
                </h3>
              </div>
              <div>
                <p className="text-gray-700 dark:text-gray-300">{dcfData.recommendation.message}</p>
              </div>
            </div>

            {/* Estimated Data Confidence Disclaimer — only shown when NOT using actual financials */}
            {dcfData.assumptions.fcf_source?.startsWith('estimated') && (
              <div className="bg-orange-50 dark:bg-orange-900/20 rounded-lg p-5 border-2 border-orange-400 dark:border-orange-600">
                <div className="flex items-start gap-3">
                  <div className="text-2xl leading-none mt-0.5">⚠️</div>
                  <div className="flex-1">
                    <h4 className="text-base font-bold text-orange-900 dark:text-orange-200 mb-1">
                      Low Confidence — Estimated Data
                    </h4>
                    <p className="text-sm text-orange-800 dark:text-orange-300 mb-2">
                      This valuation is based on <strong>estimated</strong> free cash flow and shares outstanding, not actual SEC filings.
                      The company may not file with the SEC (foreign-domiciled, OTC, or pre-revenue), so the model is using a rough
                      approximation of FCF derived from market capitalization.
                    </p>
                    <div className="text-xs text-orange-700 dark:text-orange-400 space-y-1">
                      <p><strong>What this means:</strong> The intrinsic value, margin of safety, and recommendation above may be significantly
                      inaccurate. Use this output as a rough directional indicator only — not as a basis for investment decisions.</p>
                      <p><strong>For higher-confidence results:</strong> Look for stocks that display the <span className="inline-flex items-center text-green-700 dark:text-green-400 font-semibold">✓ Actual TTM FCF</span> badge
                      in the Assumptions section below, which indicates the model is using real financial data from quarterly and annual filings.</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Assumptions */}
            <div className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 p-6 border dark:border-gray-500">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Assumptions</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">Growth Rate</div>
                  <div className="text-lg font-semibold text-gray-900 dark:text-white">
                    {(dcfData.assumptions.growth_rate * 100).toFixed(1)}%
                  </div>
                </div>
                <div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">Terminal Growth</div>
                  <div className="text-lg font-semibold text-gray-900 dark:text-white">
                    {(dcfData.assumptions.terminal_growth * 100).toFixed(1)}%
                  </div>
                </div>
                <div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">Discount Rate</div>
                  <div className="text-lg font-semibold text-gray-900 dark:text-white">
                    {(dcfData.assumptions.discount_rate * 100).toFixed(1)}%
                  </div>
                </div>
                <div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">Projection Years</div>
                  <div className="text-lg font-semibold text-gray-900 dark:text-white">
                    {dcfData.assumptions.projection_years} years
                  </div>
                </div>
                <div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">Current FCF</div>
                  <div className={`text-lg font-semibold ${
                    dcfData.assumptions.current_fcf >= 0 ? 'text-gray-900 dark:text-white' : 'text-red-600 dark:text-red-400'
                  }`}>
                    {formatCurrency(dcfData.assumptions.current_fcf)}
                  </div>
                  {dcfData.assumptions.fcf_source && (
                    <div className={`text-[10px] mt-0.5 font-medium ${
                      dcfData.assumptions.fcf_source === 'actual_ttm' 
                        ? 'text-green-600 dark:text-green-400' 
                        : dcfData.assumptions.fcf_source === 'operating_cf'
                        ? 'text-yellow-600 dark:text-yellow-400'
                        : 'text-orange-600 dark:text-orange-400'
                    }`}>
                      {dcfData.assumptions.fcf_source === 'actual_ttm' && '✓ Actual TTM FCF'}
                      {dcfData.assumptions.fcf_source === 'operating_cf' && '~ Operating CF (FCF unavailable)'}
                      {dcfData.assumptions.fcf_source?.startsWith('estimated') && '⚠ Estimated (no filings)'}
                    </div>
                  )}
                </div>
                <div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">Shares Outstanding</div>
                  <div className="text-lg font-semibold text-gray-900 dark:text-white">
                    {(dcfData.assumptions.shares_outstanding / 1e6).toFixed(1)}M
                  </div>
                </div>
              </div>
            </div>

            {/* Cash Flow Projections Table */}
            <div className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 p-6 border dark:border-gray-500">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Projected Cash Flows</h3>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-600">
                  <thead className="bg-gray-800 dark:bg-gray-900">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Year</th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-300 uppercase tracking-wider">Free Cash Flow</th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-300 uppercase tracking-wider">Discount Factor</th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-300 uppercase tracking-wider">Present Value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-600">
                    {dcfData.projections.map((projection) => (
                      <tr key={projection.year}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                          Year {projection.year}
                        </td>
                        <td className={`px-6 py-4 whitespace-nowrap text-sm text-right ${
                          projection.cash_flow >= 0 ? 'text-gray-900 dark:text-white' : 'text-red-600 dark:text-red-400'
                        }`}>
                          {formatCurrency(projection.cash_flow)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-600 dark:text-gray-400">
                          {projection.discount_factor.toFixed(4)}
                        </td>
                        <td className={`px-6 py-4 whitespace-nowrap text-sm text-right font-semibold ${
                          projection.present_value >= 0 ? 'text-primary-600 dark:text-primary-400' : 'text-red-600 dark:text-red-400'
                        }`}>
                          {formatCurrency(projection.present_value)}
                        </td>
                      </tr>
                    ))}
                    <tr className="bg-gray-50 dark:bg-gray-800">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900 dark:text-white">
                        Sum of PV
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-right"></td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-right"></td>
                      <td className={`px-6 py-4 whitespace-nowrap text-sm text-right font-bold ${
                        dcfData.valuation.sum_pv_cash_flows >= 0 ? 'text-primary-600 dark:text-primary-400' : 'text-red-600 dark:text-red-400'
                      }`}>
                        {formatCurrency(dcfData.valuation.sum_pv_cash_flows)}
                      </td>
                    </tr>
                    <tr className="bg-gray-100 dark:bg-gray-700">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900 dark:text-white">
                        Terminal Value
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-600 dark:text-gray-400">
                        {formatCurrency(dcfData.terminal_value.value)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-right"></td>
                      <td className={`px-6 py-4 whitespace-nowrap text-sm text-right font-bold ${
                        dcfData.terminal_value.present_value >= 0 ? 'text-primary-600 dark:text-primary-400' : 'text-red-600 dark:text-red-400'
                      }`}>
                        {formatCurrency(dcfData.terminal_value.present_value)}
                      </td>
                    </tr>
                    <tr className="bg-primary-100 dark:bg-primary-900/30">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900 dark:text-white">
                        Enterprise Value
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-right"></td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-right"></td>
                      <td className={`px-6 py-4 whitespace-nowrap text-sm text-right font-bold ${
                        dcfData.valuation.enterprise_value >= 0 ? 'text-primary-600 dark:text-primary-400' : 'text-red-600 dark:text-red-400'
                      }`}>
                        {formatCurrency(dcfData.valuation.enterprise_value)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Educational Content (shown when no analysis) */}
        {!dcfData && !loading && (
          <div className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 p-8 border dark:border-gray-500">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">What is DCF Valuation?</h2>
            
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">💡 Overview</h3>
                <p className="text-gray-600 dark:text-gray-400">
                  Discounted Cash Flow (DCF) valuation estimates the intrinsic value of an investment by projecting its future cash flows 
                  and discounting them back to present value. It answers: "What is this company worth based on the cash it will generate?"
                </p>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">🧩 How It Works</h3>
                <ol className="list-decimal list-inside space-y-2 text-gray-600 dark:text-gray-400">
                  <li><strong>Forecast Future Cash Flows:</strong> Estimate how much cash the business will generate each year</li>
                  <li><strong>Choose a Discount Rate:</strong> Usually WACC (Weighted Average Cost of Capital) that reflects risk</li>
                  <li><strong>Calculate Present Value:</strong> Discount each future cash flow using: PV = CF / (1 + r)^t</li>
                  <li><strong>Add Terminal Value:</strong> Estimate value beyond the projection period</li>
                </ol>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">📊 What DCF Tells You</h3>
                <ul className="space-y-2 text-gray-600 dark:text-gray-400">
                  <li>✅ If DCF value {'>'} current price → Stock may be <strong className="text-green-600">undervalued</strong></li>
                  <li>❌ If DCF value {'<'} current price → Stock may be <strong className="text-red-600">overvalued</strong></li>
                  <li>📈 Margin of Safety shows how much cushion you have</li>
                </ul>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">🧠 Why DCF Matters</h3>
                <ul className="space-y-2 text-gray-600 dark:text-gray-400">
                  <li>• Forces you to think about future performance, not just current metrics</li>
                  <li>• Incorporates risk directly through the discount rate</li>
                  <li>• Widely used by professional investors and analysts</li>
                  <li>• Helps identify undervalued investment opportunities</li>
                </ul>
              </div>

              <div className="bg-primary-50 dark:bg-primary-900/20 p-4 rounded-lg border border-primary-200 dark:border-primary-800">
                <p className="text-sm text-gray-700 dark:text-gray-300">
                  <strong>💡 Tip:</strong> DCF is most reliable for mature, stable companies with predictable cash flows. 
                  For growth companies or cyclical businesses, adjust your assumptions carefully and consider multiple scenarios.
                </p>
              </div>
              
              <div className="bg-yellow-50 dark:bg-yellow-900/20 p-4 rounded-lg border border-yellow-200 dark:border-yellow-800">
                <p className="text-sm text-gray-700 dark:text-gray-300">
                  <strong>⚠️ Important:</strong> DCF analysis is <strong>NOT suitable for warrants</strong>. Warrants are derivative securities 
                  that require option pricing models (Black-Scholes) instead. Always analyze the underlying common stock when evaluating warrants.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DCFValuation;