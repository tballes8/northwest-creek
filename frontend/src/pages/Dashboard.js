"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
var react_1 = require("react");
var react_router_dom_1 = require("react-router-dom");
var api_1 = require("../services/api");
var ThemeToggle_1 = require("../components/ThemeToggle");
var Dashboard = function () {
    var navigate = (0, react_router_dom_1.useNavigate)();
    var _a = (0, react_1.useState)(null), user = _a[0], setUser = _a[1];
    var _b = (0, react_1.useState)(true), loading = _b[0], setLoading = _b[1];
    var _c = (0, react_1.useState)({
        watchlistCount: 0,
        portfolioCount: 0,
        alertsCount: 0,
        portfolioValue: 0,
        portfolioPL: 0,
        portfolioPLPercent: 0,
    }), stats = _c[0], setStats = _c[1];
    (0, react_1.useEffect)(function () {
        loadDashboardData();
    }, []);
    var loadDashboardData = function () { return __awaiter(void 0, void 0, void 0, function () {
        var userResponse, watchlistResponse, watchlistCount, portfolioResponse, portfolioData, portfolioCount, portfolioValue, portfolioPL, portfolioPLPercent, alertsResponse, alertsCount, error_1;
        var _a, _b, _c, _d;
        return __generator(this, function (_e) {
            switch (_e.label) {
                case 0:
                    _e.trys.push([0, 5, 6, 7]);
                    return [4 /*yield*/, api_1.authAPI.getCurrentUser()];
                case 1:
                    userResponse = _e.sent();
                    setUser(userResponse.data);
                    return [4 /*yield*/, api_1.watchlistAPI.getAll()];
                case 2:
                    watchlistResponse = _e.sent();
                    watchlistCount = ((_a = watchlistResponse.data.items) === null || _a === void 0 ? void 0 : _a.length) || 0;
                    return [4 /*yield*/, api_1.portfolioAPI.getAll()];
                case 3:
                    portfolioResponse = _e.sent();
                    portfolioData = portfolioResponse.data;
                    portfolioCount = ((_b = portfolioData.positions) === null || _b === void 0 ? void 0 : _b.length) || 0;
                    portfolioValue = portfolioData.total_current_value || 0;
                    portfolioPL = portfolioData.total_profit_loss || 0;
                    portfolioPLPercent = portfolioData.total_profit_loss_percent || 0;
                    return [4 /*yield*/, api_1.alertsAPI.getAll()];
                case 4:
                    alertsResponse = _e.sent();
                    alertsCount = ((_c = alertsResponse.data.alerts) === null || _c === void 0 ? void 0 : _c.filter(function (a) { return a.is_active; }).length) || 0;
                    setStats({
                        watchlistCount: watchlistCount,
                        portfolioCount: portfolioCount,
                        alertsCount: alertsCount,
                        portfolioValue: portfolioValue,
                        portfolioPL: portfolioPL,
                        portfolioPLPercent: portfolioPLPercent,
                    });
                    return [3 /*break*/, 7];
                case 5:
                    error_1 = _e.sent();
                    console.error('Failed to load dashboard data:', error_1);
                    // If unauthorized, redirect to login
                    if (((_d = error_1.response) === null || _d === void 0 ? void 0 : _d.status) === 401) {
                        localStorage.removeItem('access_token');
                        navigate('/login');
                    }
                    return [3 /*break*/, 7];
                case 6:
                    setLoading(false);
                    return [7 /*endfinally*/];
                case 7: return [2 /*return*/];
            }
        });
    }); };
    var handleLogout = function () {
        localStorage.removeItem('access_token');
        navigate('/');
    };
    var getTierBadge = function (tier) {
        var badges = {
            free: { bg: 'bg-gray-100 dark:bg-gray-600', text: 'text-gray-800 dark:text-gray-200', label: 'Free' },
            casual: { bg: 'bg-primary-100 dark:bg-primary-900/50', text: 'text-primary-800 dark:text-primary-200', label: 'Casual' },
            active: { bg: 'bg-purple-100 dark:bg-purple-900/50', text: 'text-purple-800 dark:text-purple-200', label: 'Active' },
            unlimited: { bg: 'bg-yellow-100 dark:bg-yellow-900/50', text: 'text-yellow-800 dark:text-yellow-200', label: 'Unlimited' },
        };
        var badge = badges[tier] || badges.free;
        return (<span className={"px-3 py-1 rounded-full text-sm font-semibold ".concat(badge.bg, " ").concat(badge.text)}>
        {badge.label}
      </span>);
    };
    var getTierLimit = function () {
        var limits = {
            free: 5,
            casual: 20,
            active: 45,
            unlimited: 'Unlimited'
        };
        return limits[user === null || user === void 0 ? void 0 : user.subscription_tier] || 5;
    };
    if (loading) {
        return (<div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading dashboard...</p>
        </div>
      </div>);
    }
    return (<div className="min-h-screen bg-gray-50 dark:bg-gray-800">
      {/* Navigation */}
      <nav className="bg-gray-900 dark:bg-gray-900 shadow-sm border-b border-gray-700 dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <img src="/images/logo.png" alt="Northwest Creek" className="h-10 w-10 mr-3"/>
              <span className="text-xl font-bold text-primary-400 dark:text-primary-400">Northwest Creek</span>
            </div>
            
            <div className="hidden md:flex items-center space-x-8">
              <react_router_dom_1.Link to="/dashboard" className="text-primary-400 dark:text-primary-400 font-medium border-b-2 border-primary-600 dark:border-primary-400 pb-1">Dashboard</react_router_dom_1.Link>
              <react_router_dom_1.Link to="/watchlist" className="text-gray-400 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">Watchlist</react_router_dom_1.Link>
              <react_router_dom_1.Link to="/portfolio" className="text-gray-400 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">Portfolio</react_router_dom_1.Link>
              <react_router_dom_1.Link to="/alerts" className="text-gray-400 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">Alerts</react_router_dom_1.Link>
              <react_router_dom_1.Link to="/stocks" className="text-gray-400 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">Stocks</react_router_dom_1.Link>
              <react_router_dom_1.Link to="/technical-analysis" className="text-gray-400 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">Technical Analysis</react_router_dom_1.Link>
              <react_router_dom_1.Link to="/dcf-valuation" className="text-gray-400 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">DCF Valuation</react_router_dom_1.Link>
            </div>

            <div className="flex items-center space-x-4">
              <ThemeToggle_1.default />
              <span className="text-sm text-gray-600 dark:text-gray-300">{user === null || user === void 0 ? void 0 : user.email}</span>
              {user && getTierBadge(user.subscription_tier)}
              <button onClick={handleLogout} className="text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white text-sm font-medium">
                Logout
              </button>
            </div>
          </div>
        </div>
      </nav>

    {/* Main Content */}
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Welcome Section */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
          Welcome back, {(user === null || user === void 0 ? void 0 : user.full_name) || 'Investor'}! {/*👋 */}
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mt-1">Here's your portfolio overview</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {/* Portfolio Value */}
        <div className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 hover:shadow-xl dark:hover:shadow-gray-200/30 transition-shadow p-6 border dark:border-gray-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Portfolio Value</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white mt-2">
                ${stats.portfolioValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
            <div className="bg-primary-100 dark:bg-primary-900/30 rounded-full p-3">
              <svg className="w-6 h-6 text-primary-600 dark:text-primary-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
              </svg>
            </div>
          </div>
        </div>

        {/* P&L */}
        <div className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 hover:shadow-xl dark:hover:shadow-gray-200/30 transition-shadow p-6 border dark:border-gray-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Total P&L</p>
              <p className={"text-2xl font-bold mt-2 ".concat(stats.portfolioPL >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400')}>
                {stats.portfolioPL >= 0 ? '+' : ''}${Math.abs(stats.portfolioPL).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              <p className={"text-sm mt-1 ".concat(stats.portfolioPL >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400')}>
                {stats.portfolioPL >= 0 ? '+' : ''}{stats.portfolioPLPercent.toFixed(2)}%
              </p>
            </div>
            <div className={"".concat(stats.portfolioPL >= 0 ? 'bg-green-100 dark:bg-green-900/30' : 'bg-red-100 dark:bg-red-900/30', " rounded-full p-3")}>
              <svg className={"w-6 h-6 ".concat(stats.portfolioPL >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400')} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                {stats.portfolioPL >= 0 ? (<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"/>) : (<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6"/>)}
              </svg>
            </div>
          </div>
        </div>

        {/* Watchlist */}
        <div className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 hover:shadow-xl dark:hover:shadow-gray-200/30 transition-shadow p-6 border dark:border-gray-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Watchlist</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white mt-2">{stats.watchlistCount} stocks</p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                {(user === null || user === void 0 ? void 0 : user.subscription_tier) === 'free' ? '5 max' : (user === null || user === void 0 ? void 0 : user.subscription_tier) === 'active' ? '45 max' : 'Unlimited'}
              </p>
            </div>
            <div className="bg-yellow-100 dark:bg-yellow-900/30 rounded-full p-3">
              <svg className="w-6 h-6 text-yellow-600 dark:text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"/>
              </svg>
            </div>
          </div>
        </div>

        {/* Alerts */}
        <div className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 hover:shadow-xl dark:hover:shadow-gray-200/30 transition-shadow p-6 border dark:border-gray-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Active Alerts</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white mt-2">{stats.alertsCount} alerts</p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Monitoring prices</p>
            </div>
            <div className="bg-purple-100 dark:bg-purple-900/30 rounded-full p-3">
              <svg className="w-6 h-6 text-purple-600 dark:text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/>
              </svg>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-white dark:bg-gray-700 rounded-lg shadow-lg p-6 border dark:border-gray-500">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <react_router_dom_1.Link to="/watchlist" className="flex items-center p-4 border-2 border-gray-200 dark:border-gray-700 rounded-lg hover:border-primary-500 dark:hover:border-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors">
            <div className="bg-primary-100 dark:bg-primary-900/30 rounded-lg p-2 mr-3">
              <svg className="w-5 h-5 text-primary-600 dark:text-primary-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/>
              </svg>
            </div>
            <span className="font-medium text-gray-700 dark:text-gray-300">Add to Watchlist</span>
          </react_router_dom_1.Link>

          <react_router_dom_1.Link to="/portfolio" className="flex items-center p-4 border-2 border-gray-200 dark:border-gray-700 rounded-lg hover:border-green-500 dark:hover:border-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors">
            <div className="bg-green-100 dark:bg-green-900/30 rounded-lg p-2 mr-3">
              <svg className="w-5 h-5 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/>
              </svg>
            </div>
            <span className="font-medium text-gray-700 dark:text-gray-300">Add Position</span>
          </react_router_dom_1.Link>

          <react_router_dom_1.Link to="/alerts" className="flex items-center p-4 border-2 border-gray-200 dark:border-gray-700 rounded-lg hover:border-purple-500 dark:hover:border-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors">
            <div className="bg-purple-100 dark:bg-purple-900/30 rounded-lg p-2 mr-3">
              <svg className="w-5 h-5 text-purple-600 dark:text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/>
              </svg>
            </div>
            <span className="font-medium text-gray-700 dark:text-gray-300">Create Alert</span>
          </react_router_dom_1.Link>

          <react_router_dom_1.Link to="/stocks" className="flex items-center p-4 border-2 border-gray-200 dark:border-gray-700 rounded-lg hover:border-blue-500 dark:hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors">
            <div className="bg-blue-100 dark:bg-blue-900/30 rounded-lg p-2 mr-3">
              <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
              </svg>
            </div>
            <span className="font-medium text-gray-700 dark:text-gray-300">Search Stocks</span>
          </react_router_dom_1.Link>
        </div>
      </div>

      {/* Recent Activity / Empty State */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-8">
        {/* Portfolio Summary */}
        <div className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 p-6 border dark:border-gray-500">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Portfolio Overview</h2>
            <react_router_dom_1.Link to="/portfolio" className="text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 font-medium">
              View all →
            </react_router_dom_1.Link>
          </div>
          {stats.portfolioCount > 0 ? (<div className="space-y-3">
              <p className="text-sm text-gray-600 dark:text-gray-400">{stats.portfolioCount} position(s) tracked</p>
              <div className="border-t dark:border-gray-700 pt-3">
                <react_router_dom_1.Link to="/portfolio" className="text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 text-sm font-medium">
                  Manage your positions →
                </react_router_dom_1.Link>
              </div>
            </div>) : (<div className="text-center py-8">
              <div className="bg-gray-100 dark:bg-gray-700 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-gray-400 dark:text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/>
                </svg>
              </div>
              <p className="text-gray-600 dark:text-gray-400 mb-4">No portfolio positions yet</p>
              <react_router_dom_1.Link to="/portfolio" className="inline-block bg-primary-600 hover:bg-primary-700 dark:bg-primary-500 dark:hover:bg-primary-600 text-white px-4 py-2 rounded-lg font-medium transition-colors">
                Add Your First Position
              </react_router_dom_1.Link>
            </div>)}
        </div>

        {/* Watchlist Summary */}
        <div className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 p-6 border dark:border-gray-500">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Watchlist</h2>
            <react_router_dom_1.Link to="/watchlist" className="text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 font-medium">
              View all →
            </react_router_dom_1.Link>
          </div>
          {stats.watchlistCount > 0 ? (<div className="space-y-3">
              <p className="text-sm text-gray-600 dark:text-gray-400">{stats.watchlistCount} stock(s) watched</p>
              <div className="border-t dark:border-gray-700 pt-3">
                <react_router_dom_1.Link to="/watchlist" className="text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 text-sm font-medium">
                  View your watchlist →
                </react_router_dom_1.Link>
              </div>
            </div>) : (<div className="text-center py-8">
              <div className="bg-gray-100 dark:bg-gray-700 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-gray-400 dark:text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"/>
                </svg>
              </div>
              <p className="text-gray-600 dark:text-gray-400 mb-4">No stocks in watchlist</p>
              <react_router_dom_1.Link to="/watchlist" className="inline-block bg-primary-600 hover:bg-primary-700 dark:bg-primary-500 dark:hover:bg-primary-600 text-white px-4 py-2 rounded-lg font-medium transition-colors">
                Add Your First Stock
              </react_router_dom_1.Link>
            </div>)}
        </div>
      </div>

      {/* Upgrade CTA (for Free users) */}
      {(user === null || user === void 0 ? void 0 : user.subscription_tier) === 'free' && (<div className="mt-8 bg-gradient-to-r from-primary-600 to-primary-700 dark:from-primary-700 dark:to-primary-800 rounded-lg shadow-lg p-8 text-center">
          <h3 className="text-2xl font-bold text-white mb-2">
            Upgrade to Casual Investor to unlock more features
          </h3>
          <p className="text-primary-100 dark:text-primary-200 mb-6">
            Track 20 stocks, 20 positions, and 5 alerts. Only $20/month.
          </p>
          <button className="bg-white text-primary-600 px-8 py-3 rounded-lg font-semibold hover:bg-gray-100 transition-colors">
            Upgrade to Casual Investor
          </button>
        </div>)}
    </div>
  </div>);
};
exports.default = Dashboard;
