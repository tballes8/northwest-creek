import axios from 'axios';
import { PortfolioPosition } from '../types';

const API_BASE_URL = process.env.REACT_APP_API_URL 
  ? `${process.env.REACT_APP_API_URL}/api/v1`
  : 'http://localhost:8000/api/v1';

// Create axios instance with interceptor for auth token
const axiosInstance = axios.create({
  baseURL: API_BASE_URL,
});

// Add token to all requests
axiosInstance.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('access_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
      console.log('Sending token:', token.substring(0, 20) + '...');
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Auth API
export const authAPI = {
  register: (data: { email: string; password: string; full_name: string }) =>
    axiosInstance.post('/auth/register', data),
  
  login: (data: { email: string; password: string }) =>
    axiosInstance.post('/auth/login', data),
  
  getCurrentUser: () =>
    axiosInstance.get('/auth/me'),

  verifyEmail: (token: string) =>
    axiosInstance.get(`/auth/verify-email?token=${token}`),

  resendVerification: (data: { email: string }, selectedTier?: string) =>
    axiosInstance.post(
      `/auth/resend-verification${selectedTier ? `?selected_tier=${selectedTier}` : ''}`,
      data
    ),

  forgotPassword: (data: { email: string }) =>
    axiosInstance.post('/auth/forgot-password', data),

  resetPassword: (data: { token: string; new_password: string }) =>
    axiosInstance.post('/auth/reset-password', data),

  changePassword: (data: { current_password: string; new_password: string }) =>
    axiosInstance.post('/auth/change-password', data),
};

// Watchlist API
export const watchlistAPI = {
  getAll: () =>
    axiosInstance.get('/watchlist'),
  
  add: (data: { ticker: string; notes?: string; target_price?: number }) =>
    axiosInstance.post('/watchlist', data),
  
  remove: (id: string) =>
    axiosInstance.delete(`/watchlist/${id}`),
  
  update: (id: string, data: { notes?: string; target_price?: number }) =>
    axiosInstance.put(`/watchlist/${id}`, data),
};

// Entity identity verdict — attached to /financials, /dcf/*, /relval/inputs.
//
// A ticker is a mutable label, so a vendor can serve one company's filings
// under another company's symbol. The backend resolves identity through SEC
// EDGAR upstream of the data fetch and returns one verdict, which is the ONLY
// thing any page should gate on. Do not re-derive it per component: doing so is
// what previously let a "wrong entity" warning render beside green
// "actual data" badges vouching for the same numbers.
//
//   match          -> proceed normally, trust badges allowed
//   contradiction  -> hard block: no figures, no pre-filled params, no badges
//   cannot_resolve -> NOT a block. Funds/ETFs are absent from EDGAR's company
//                     file and new registrants lag it. Proceed as before.
export type EntityTrustVerdict = 'match' | 'contradiction' | 'cannot_resolve';

export interface EntityTrust {
  verdict: EntityTrustVerdict;
  edgar_cik: number | null;
  edgar_company_name: string | null;
  fmp_filing_cik: number | null;
  fmp_profile_cik: number | null;
  basis: 'edgar_vs_filing' | 'fmp_internal' | 'unresolved';
  message: string | null;
}

// The single test every surface uses. Only a positive contradiction blocks.
export const isEntityContradicted = (t?: EntityTrust | null): boolean =>
  t?.verdict === 'contradiction';

// Portfolio API
export type TransactionType = 'BUY' | 'SELL' | 'ADJUST' | 'REVERSAL';

export interface SellPositionPayload {
  quantity: number;
  sell_price: number;
  sell_date: string;          // YYYY-MM-DD
  notes?: string;
}

export interface SellPositionResponse {
  transaction_id: string;
  ticker: string;
  quantity_sold: number;
  sell_price: number;
  sell_date: string;
  cost_basis_per_share: number;
  realized_pl: number;
  realized_pl_percent: number;
  proceeds: number;
  remaining_quantity: number;
  position_closed: boolean;
  // Null when the sale closed the position and its holdings row was removed.
  position: PortfolioPosition | null;
}

export interface VoidTransactionResponse {
  reversal_transaction_id: string;
  voided_transaction_id: string;
  ticker: string;
  quantity_restored: number;
  realized_pl_removed: number;
  position_reopened: boolean;
  position: PortfolioPosition | null;
}

export interface PortfolioTransaction {
  id: string;
  ticker: string;
  transaction_type: TransactionType;
  quantity: number;
  price: number;
  transaction_date: string;   // YYYY-MM-DD
  amount: number;
  cost_basis_per_share: number | null;
  realized_pl: number | null;         // null on buys and adjustments
  realized_pl_percent: number | null;
  reverses_transaction_id: string | null;
  is_voided: boolean;
  notes?: string;
  created_at: string;
}

export interface PortfolioTransactionsResponse {
  transactions: PortfolioTransaction[];
  total: number;
  limit: number;
  offset: number;
}

export const portfolioAPI = {
  getAll: () =>
    axiosInstance.get('/portfolio'),

  add: (data: { ticker: string; quantity: number; buy_price: number; buy_date: string; notes?: string }) =>
    axiosInstance.post('/portfolio/positions', data),

  remove: (id: string) =>
    axiosInstance.delete(`/portfolio/positions/${id}`),

  update: (id: string, data: { quantity?: number; buy_price?: number; buy_date?: string; notes?: string }) =>
    axiosInstance.put(`/portfolio/positions/${id}`, data),

  sell: (id: string, data: SellPositionPayload) =>
    axiosInstance.post<SellPositionResponse>(`/portfolio/positions/${id}/sell`, data),

  voidTransaction: (transactionId: string) =>
    axiosInstance.post<VoidTransactionResponse>(`/portfolio/transactions/${transactionId}/void`),

  getTransactions: (params?: { ticker?: string; transaction_type?: TransactionType; limit?: number; offset?: number }) =>
    axiosInstance.get<PortfolioTransactionsResponse>('/portfolio/transactions', { params }),

  analyze: () =>
    axiosInstance.post('/portfolio/analyze'),
};

// Alerts API
export const alertsAPI = {
  getAll: () =>
    axiosInstance.get('/alerts/'),
  
  create: (data: { ticker: string; condition: 'above' | 'below'; target_price: number; notes?: string; sms_enabled?: boolean }) =>
    axiosInstance.post('/alerts/', data),
  
  delete: (id: string) =>
    axiosInstance.delete(`/alerts/${id}`),
  
  update: (id: string, data: { is_active?: boolean; notes?: string; sms_enabled?: boolean }) =>
    axiosInstance.patch(`/alerts/${id}`, data),
};

// Technical Alerts API
export const technicalAlertsAPI = {
  getAll: () =>
    axiosInstance.get('/technical-alerts/'),

  create: (data: {
    ticker: string;
    alert_type: string;
    config: Record<string, any>;
    notes?: string;
    sms_enabled?: boolean;
  }) =>
    axiosInstance.post('/technical-alerts/', data),

  delete: (id: string) =>
    axiosInstance.delete(`/technical-alerts/${id}`),

  update: (id: string, data: { is_active?: boolean; notes?: string; sms_enabled?: boolean }) =>
    axiosInstance.patch(`/technical-alerts/${id}`, data),
};

// Phone / SMS Verification API
export const phoneAPI = {
  getStatus: () =>
    axiosInstance.get('/phone/status'),

  submitPhone: (data: { phone_number: string }) =>
    axiosInstance.post('/phone/submit', data),

  verifyCode: (data: { code: string }) =>
    axiosInstance.post('/phone/verify', data),

  removePhone: () =>
    axiosInstance.delete('/phone/'),
};

// Stocks API
export const stocksAPI = {
  getQuote: (ticker: string) =>
    axiosInstance.get(`/stocks/quote/${ticker}`),
  
  getCompany: (ticker: string) =>
    axiosInstance.get(`/stocks/company/${ticker}`),

  // Bulk ticker -> sector lookup. Backed by stock_snapshots, so it agrees with the
  // sector shown in Company Details. Max 250 tickers per call.
  getSectors: (tickers: string[]) =>
    axiosInstance.get<{ sectors: Record<string, string> }>(`/stocks/sectors`, {
      params: { tickers: tickers.join(',') },
    }),

  getHistorical: (ticker: string, days: number = 30) =>
    axiosInstance.get(`/stocks/historical/${ticker}`, { params: { days } }),

  getNews: (ticker: string, limit: number = 3) =>
    axiosInstance.get(`/stocks/news/${ticker}`, { params: { limit }}),

  getMarketNews: (limit: number = 3) =>
    axiosInstance.get(`/stocks/news-market/latest`, { params: { limit }}),

  getTopGainers: (limit: number = 10) =>
    axiosInstance.get(`/stocks/top-gainers`, {params: {limit}}),

  getDailySnapshot: (limit: number = 10, tickers?: string[], asset_type?: string) => {
    const params: any = { limit };
    if (tickers && tickers.length > 0) {
      params.tickers = tickers.join(',');
    }
    if (asset_type) {
      params.asset_type = asset_type;
    }
    return axiosInstance.get(`/stocks/daily-snapshot`, { params });
  },

  getDividends: (ticker: string) =>
    axiosInstance.get(`/stocks/dividends/${ticker}`),

  getOwnership: (ticker: string) =>
    axiosInstance.get(`/stocks/ownership/${ticker}`),

  getImpliedVolatility: (ticker: string, lookback_days: number = 30) =>
    axiosInstance.get(`/stocks/${ticker}/implied-volatility`, { params: { lookback_days } }),

  getTreasuryRates: () =>
    axiosInstance.get(`/stocks/treasury-rates`),

  // Search endpoints
  search: (query: string) =>
    axiosInstance.get(`/stocks/search`, { params: { q: query } }),

  searchByKeywords: (keywords: string, limit: number = 20) =>
    axiosInstance.get(`/stocks/search-by-keywords`, { params: { keywords, limit } }),
};

// DCF API
export const dcfAPI = {
  getSuggestions: (ticker: string) =>
    axiosInstance.get(`/dcf/suggestions/${ticker}`),
  
  calculate: (ticker: string, params: {
    growth_rate: number;
    terminal_growth: number;
    discount_rate: number;
    projection_years: number;
  }) =>
    axiosInstance.get(`/dcf/calculate/${ticker}`, { params }),
};

// Relative Valuation API
export const relvalAPI = {
  getInputs: (ticker: string) =>
    axiosInstance.get(`/relval/inputs/${ticker}`),

  getPeerRatios: (tickers: string[]) =>
    axiosInstance.post('/relval/peer-ratios', { tickers }),

  calculate: (payload: {
    fwd_eps: number;
    fwd_revenue_b: number;
    fwd_ebitda_b: number;
    net_debt_b: number;
    diluted_shares_m: number;
    current_price?: number | null;
    median_pe: number;
    median_ps: number;
    median_ev_ebitda: number;
    trailing_pe?: number | null;
  }) =>
    axiosInstance.post('/relval/calculate', payload),
};

// Technical Analysis API
export const technicalAPI = {
  analyze: (ticker: string) =>
    axiosInstance.get(`/technical-analysis/analyze/${ticker}`),
  aiAnalysis: (ticker: string) =>
    axiosInstance.get(`/stocks/${ticker}/ai-analysis`),
  priceForecast: (ticker: string) =>
    axiosInstance.get(`/stocks/${ticker}/price-forecast`),
};

// Sector Rotation API
export const sectorRotationAPI = {
  getHeatmap: (params?: { window?: string; end_date?: string }) =>
    axiosInstance.get(`/sector-rotation/heatmap`, { params }),

  getTimelapse: (params?: { window?: string; end_date?: string; step_days?: number }) =>
    axiosInstance.get(`/sector-rotation/timelapse`, { params }),

  getCyclePhase: () =>
    axiosInstance.get(`/sector-rotation/cycle-phase`),
};

// Financials API
export const financialsAPI = {
  get: (ticker: string) =>
    axiosInstance.get(`/financials/${ticker}`),
  getAnalystEstimates: (ticker: string) =>
    axiosInstance.get(`/stocks/analyst-estimates/${ticker}`),
  // AI read of the financial statements. Route lives under /stocks/ but this is
  // financials data, so it groups with financialsAPI.get that the panel already calls.
  // `refresh` bypasses the backend's 24h per-ticker cache and always spends a use.
  aiFinancials: (ticker: string, refresh = false) =>
    axiosInstance.get(
      `/stocks/${ticker}/ai-financials`,
      refresh ? { params: { refresh: true } } : undefined
    ),
};

// Stripe / Subscription API
export const stripeAPI = {
  getConfig: () =>
    axiosInstance.get('/stripe/config'),
  
  getSubscriptionStatus: () =>
    axiosInstance.get('/stripe/subscription-status'),
  
  createSubscription: (tier: string) =>
    axiosInstance.post('/stripe/create-subscription', { tier }),
  
  cancelSubscription: () =>
    axiosInstance.post('/stripe/cancel-subscription'),
  
  cancelSubscriptionImmediate: () =>
    axiosInstance.post('/stripe/cancel-subscription-immediate'),
};

export default axiosInstance;

// Intraday API
export const intradayAPI = {
  getSnapshot: (ticker: string) =>
    axiosInstance.get(`/intraday/${ticker}`),

  getBarsWithMA: (ticker: string) =>
    axiosInstance.get(`/intraday/${ticker}/bars-with-ma`),

  getBatch: (tickers: string[]) =>
    axiosInstance.get(`/intraday/batch`, {
      params: { tickers: tickers.join(',') }
    }),
};

export const screenerAPI = {
  runScreen: (criteria: object) =>
    axiosInstance.post('/screener/run', criteria),
  getPresets: () =>
    axiosInstance.get('/screener/presets'),
  getFilterOptions: () =>
    axiosInstance.get('/screener/filter-options'),
  // kind: 'screener' = screener filter payload, 'search' = Stock Search keyword query.
  // Both share the saved_screens table and the single saved_screens tier limit.
  getSavedScreens: (kind: 'screener' | 'search' = 'screener') =>
    axiosInstance.get('/screener/saved', { params: { kind } }),
  saveScreen: (data: { name: string; criteria: object; kind?: 'screener' | 'search' }) =>
    axiosInstance.post('/screener/saved', data),
  deleteSavedScreen: (id: string) =>
    axiosInstance.delete(`/screener/saved/${id}`),
};

export const marketAPI = {
  getTickerTape: () => axiosInstance.get('/market/ticker-tape'),
  getScreensTickerTape: () => axiosInstance.get('/market/ticker-tape/screens'),
};