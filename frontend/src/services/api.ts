import axios from 'axios';

const API_BASE_URL = 'http://localhost:8000/api/v1';

// Create axios instance
const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add token to requests
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('access_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Auth API
export const authAPI = {
  register: (data: { email: string; password: string; full_name?: string }) =>
    api.post('/auth/register', data),
  
  login: (data: { email: string; password: string }) =>
    api.post('/auth/login', data),
  
  getCurrentUser: () =>
    api.get('/auth/me'),
};

// Stocks API
export const stocksAPI = {
  getQuote: (ticker: string) =>
    api.get(`/stocks/${ticker}/quote`),
  
  getCompany: (ticker: string) =>
    api.get(`/stocks/${ticker}/company`),
  
  getAnalysis: (ticker: string) =>
    api.get(`/indicators/${ticker}/analysis`),
};

// Watchlist API
export const watchlistAPI = {
  getAll: () =>
    api.get('/watchlist/'),
  
  add: (data: { ticker: string; notes?: string }) =>
    api.post('/watchlist/', data),
  
  remove: (ticker: string) =>
    api.delete(`/watchlist/${ticker}`),
};

// Portfolio API
export const portfolioAPI = {
  getAll: () =>
    api.get('/portfolio/'),
  
  add: (data: { 
    ticker: string; 
    quantity: number; 
    buy_price: number; 
    buy_date: string;
    notes?: string;
  }) => api.post('/portfolio/', data),
  
  remove: (id: string) =>
    api.delete(`/portfolio/${id}`),
};

// Alerts API
export const alertsAPI = {
  getAll: () =>
    api.get('/alerts/'),
  
  create: (data: {
    ticker: string;
    target_price: number;
    condition: 'above' | 'below';
    notes?: string;
  }) => api.post('/alerts/', data),
  
  remove: (id: string) =>
    api.delete(`/alerts/${id}`),
};

export default api;