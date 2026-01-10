import axios from 'axios';

const API_BASE_URL = 'http://localhost:8000/api/v1';

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
};

// Watchlist API
// export const watchlistAPI = {
//   getAll: () =>
//     axiosInstance.get('/watchlist'),
  
//   add: (data: { ticker: string; notes?: string; target_price?: number }) =>
//     axiosInstance.post('/watchlist', data),
  
//   remove: (id: number) =>
//     axiosInstance.delete(`/watchlist/${id}`),
  
//   update: (id: number, data: { notes?: string; target_price?: number }) =>
//     axiosInstance.put(`/watchlist/${id}`, data),
// };
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
  
  add: (data: any) =>
    axiosInstance.post('/portfolio/positions', data),
  
  remove: (id: number) =>
    axiosInstance.delete(`/portfolio/positions/${id}`),
  
  update: (id: number, data: any) =>
    axiosInstance.put(`/portfolio/positions/${id}`, data),
};

// Alerts API
export const alertsAPI = {
  getAll: () =>
    axiosInstance.get('/alerts'),
  
  create: (data: any) =>
    axiosInstance.post('/alerts', data),
  
  delete: (id: number) =>
    axiosInstance.delete(`/alerts/${id}`),
  
  update: (id: number, data: any) =>
    axiosInstance.put(`/alerts/${id}`, data),
};

// Stocks API
export const stocksAPI = {
  getQuote: (ticker: string) =>
    axiosInstance.get(`/stocks/quote/${ticker}`),
  
  getCompanyInfo: (ticker: string) =>
    axiosInstance.get(`/stocks/company/${ticker}`),
  
  getHistoricalPrices: (ticker: string, days: number = 30) =>
    axiosInstance.get(`/stocks/historical/${ticker}`, { params: { days } }),
};

export default axiosInstance;