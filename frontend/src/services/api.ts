import axios from 'axios';

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
      console.log('Sending token:', token.substring(0, 20) + '...');  // ← Add logging
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
};

// Watchlist API
export const watchlistAPI = {
  getAll: () =>
    axiosInstance.get('/watchlist'),
  
  add: (data: { ticker: string; notes?: string; target_price?: number }) =>
    axiosInstance.post('/watchlist', data),
  
  remove: (id: string) =>  // ← Changed from number to string
    axiosInstance.delete(`/watchlist/${id}`),
  
  update: (id: string, data: { notes?: string; target_price?: number }) =>  // ← Changed from number to string
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
    axiosInstance.get('/alerts/'),  // ← Added trailing slash
  
  create: (data: { ticker: string; condition: 'above' | 'below'; target_price: number; notes?: string }) =>
    axiosInstance.post('/alerts/', data),  // ← Added trailing slash
  
  delete: (id: string) =>
    axiosInstance.delete(`/alerts/${id}/`),  // ← Fixed syntax + added trailing slash
  
  update: (id: string, data: { is_active?: boolean; notes?: string }) =>
    axiosInstance.put(`/alerts/${id}/`, data),  // ← Fixed syntax + added trailing slash
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

  getDailySnapshot: (limit: number = 10) =>
    axiosInstance.get(`/stocks/daily-snapshot`, { params: { limit } }),
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
export default axiosInstance;

// Intraday API (ADD THIS SECTION)
export const intradayAPI = {
  // Get snapshot data for a ticker
  getSnapshot: (ticker: string) =>
    axiosInstance.get(`/intraday/${ticker}`),
  
  // Get 15-minute bars with 50-day and 200-day moving averages
  getBarsWithMA: (ticker: string) =>
    axiosInstance.get(`/intraday/${ticker}/bars-with-ma`),
  
  // Get batch data for multiple tickers
  getBatch: (tickers: string[]) =>
    axiosInstance.get(`/intraday/batch`, {
      params: { tickers: tickers.join(',') }
    }),
};