import axios from 'axios';

const rawBaseUrl = process.env.REACT_APP_API_URL 
  ? `${process.env.REACT_APP_API_URL}/api/v1`
  : 'http://localhost:8000/api/v1';

// Force HTTPS in production to prevent mixed-content blocks
const API_BASE_URL = process.env.NODE_ENV === 'production'
  ? rawBaseUrl.replace(/^http:\/\//, 'https://')
  : rawBaseUrl;

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

// Portfolio API
export const portfolioAPI = {
  getAll: () =>
    axiosInstance.get('/portfolio'),
  
  add: (data: { ticker: string; quantity: number; buy_price: number; buy_date: string; notes?: string }) =>
    axiosInstance.post('/portfolio/positions', data),
  
  remove: (id: string) =>
    axiosInstance.delete(`/portfolio/positions/${id}`),
  
  update: (id: string, data: any) =>
    axiosInstance.put(`/portfolio/positions/${id}`, data),
};

// Alerts API
export const alertsAPI = {
  getAll: () =>
    axiosInstance.get('/alerts/'),
  
  create: (data: { ticker: string; condition: 'above' | 'below'; target_price: number; notes?: string }) =>
    axiosInstance.post('/alerts/', data),
  
  delete: (id: string) =>
    axiosInstance.delete(`/alerts/${id}`),
  
  update: (id: string, data: { is_active?: boolean; notes?: string }) =>
    axiosInstance.patch(`/alerts/${id}`, data),
};

// Stocks API
export const stocksAPI = {
  getQuote: (ticker: string) =>
    axiosInstance.get(`/stocks/quote/${ticker}`),
  
  getCompany: (ticker: string) =>
    axiosInstance.get(`/stocks/company/${ticker}`),
  
  getHistorical: (ticker: string, days: number = 30) =>
    axiosInstance.get(`/stocks/historical/${ticker}`, { params: { days } }),

  getNews: (ticker: string, limit: number = 3) =>
    axiosInstance.get(`/stocks/news/${ticker}`, { params: { limit }}),

  getTopGainers: (limit: number = 10) =>
    axiosInstance.get(`/stocks/top-gainers`, {params: {limit}}),

  getDailySnapshot: (limit: number = 10, tickers?: string[]) => {
    const params: any = { limit };
    if (tickers && tickers.length > 0) {
      params.tickers = tickers.join(',');
    }
    return axiosInstance.get(`/stocks/daily-snapshot`, { params });
  },
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

// Technical Analysis API
export const technicalAPI = {
  analyze: (ticker: string) =>
    axiosInstance.get(`/technical-analysis/analyze/${ticker}`),
};

// Financials API
export const financialsAPI = {
  get: (ticker: string) =>
    axiosInstance.get(`/financials/${ticker}`),
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