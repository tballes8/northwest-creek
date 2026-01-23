"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.stocksAPI = exports.alertsAPI = exports.portfolioAPI = exports.watchlistAPI = exports.authAPI = void 0;
var axios_1 = require("axios");
var API_BASE_URL = 'http://localhost:8000/api/v1';
// Create axios instance with interceptor for auth token
var axiosInstance = axios_1.default.create({
    baseURL: API_BASE_URL,
});
// Add token to all requests
axiosInstance.interceptors.request.use(function (config) {
    var token = localStorage.getItem('access_token');
    if (token) {
        config.headers.Authorization = "Bearer ".concat(token);
        console.log('Sending token:', token.substring(0, 20) + '...'); // ← Add logging
    }
    return config;
}, function (error) {
    return Promise.reject(error);
});
// Auth API
exports.authAPI = {
    register: function (data) {
        return axiosInstance.post('/auth/register', data);
    },
    login: function (data) {
        return axiosInstance.post('/auth/login', data);
    },
    getCurrentUser: function () {
        return axiosInstance.get('/auth/me');
    },
};
exports.watchlistAPI = {
    getAll: function () {
        return axiosInstance.get('/watchlist');
    },
    add: function (data) {
        return axiosInstance.post('/watchlist', data);
    },
    remove: function (id) {
        return axiosInstance.delete("/watchlist/".concat(id));
    },
    update: function (id, data) {
        return axiosInstance.put("/watchlist/".concat(id), data);
    },
};
// Portfolio API
exports.portfolioAPI = {
    getAll: function () {
        return axiosInstance.get('/portfolio');
    },
    add: function (data) {
        return axiosInstance.post('/portfolio/positions', data);
    },
    remove: function (id) {
        return axiosInstance.delete("/portfolio/positions/".concat(id));
    },
    update: function (id, data) {
        return axiosInstance.put("/portfolio/positions/".concat(id), data);
    },
};
// Alerts API
exports.alertsAPI = {
    getAll: function () {
        return axiosInstance.get('/alerts');
    },
    create: function (data) {
        return axiosInstance.post('/alerts', data);
    },
    delete: function (id) {
        return axiosInstance.delete("/alerts/".concat(id));
    },
    update: function (id, data) {
        return axiosInstance.put("/alerts/".concat(id), data);
    },
};
// Stocks API
exports.stocksAPI = {
    getQuote: function (ticker) {
        return axiosInstance.get("/stocks/quote/".concat(ticker));
    },
    getCompanyInfo: function (ticker) {
        return axiosInstance.get("/stocks/company/".concat(ticker));
    },
    getHistoricalPrices: function (ticker, days) {
        if (days === void 0) { days = 30; }
        return axiosInstance.get("/stocks/historical/".concat(ticker), { params: { days: days } });
    },
};
exports.default = axiosInstance;
