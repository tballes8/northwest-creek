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
var Alerts = function () {
    var navigate = (0, react_router_dom_1.useNavigate)();
    var _a = (0, react_1.useState)(null), user = _a[0], setUser = _a[1];
    var _b = (0, react_1.useState)([]), alerts = _b[0], setAlerts = _b[1];
    var _c = (0, react_1.useState)(true), loading = _c[0], setLoading = _c[1];
    var _d = (0, react_1.useState)(false), addingAlert = _d[0], setAddingAlert = _d[1];
    var _e = (0, react_1.useState)(''), newTicker = _e[0], setNewTicker = _e[1];
    var _f = (0, react_1.useState)('above'), newCondition = _f[0], setNewCondition = _f[1];
    var _g = (0, react_1.useState)(''), newTargetPrice = _g[0], setNewTargetPrice = _g[1];
    var _h = (0, react_1.useState)(''), newNotes = _h[0], setNewNotes = _h[1];
    var _j = (0, react_1.useState)(''), error = _j[0], setError = _j[1];
    (0, react_1.useEffect)(function () {
        loadData();
    }, []);
    var loadData = function () { return __awaiter(void 0, void 0, void 0, function () {
        var userResponse, alertsResponse, error_1;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 3, 4, 5]);
                    return [4 /*yield*/, api_1.authAPI.getCurrentUser()];
                case 1:
                    userResponse = _b.sent();
                    setUser(userResponse.data);
                    return [4 /*yield*/, api_1.alertsAPI.getAll()];
                case 2:
                    alertsResponse = _b.sent();
                    setAlerts(alertsResponse.data.alerts || []);
                    return [3 /*break*/, 5];
                case 3:
                    error_1 = _b.sent();
                    console.error('Failed to load data:', error_1);
                    if (((_a = error_1.response) === null || _a === void 0 ? void 0 : _a.status) === 401) {
                        localStorage.removeItem('access_token');
                        navigate('/login');
                    }
                    return [3 /*break*/, 5];
                case 4:
                    setLoading(false);
                    return [7 /*endfinally*/];
                case 5: return [2 /*return*/];
            }
        });
    }); };
    var handleAddAlert = function (e) { return __awaiter(void 0, void 0, void 0, function () {
        var limits, limit, err_1;
        var _a, _b, _c;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0:
                    e.preventDefault();
                    setError('');
                    if (!newTicker.trim() || !newTargetPrice) {
                        setError('Please fill in all required fields');
                        return [2 /*return*/];
                    }
                    if (parseFloat(newTargetPrice) <= 0) {
                        setError('Target price must be greater than 0');
                        return [2 /*return*/];
                    }
                    limits = {
                        free: 0,
                        casual: 20,
                        active: 45,
                        unlimited: Infinity
                    };
                    limit = limits[user === null || user === void 0 ? void 0 : user.subscription_tier] || 5;
                    if (alerts.length >= limit) {
                        setError("You've reached your ".concat(user === null || user === void 0 ? void 0 : user.subscription_tier, " tier limit of ").concat(limit, " alerts"));
                        return [2 /*return*/];
                    }
                    _d.label = 1;
                case 1:
                    _d.trys.push([1, 4, , 5]);
                    return [4 /*yield*/, api_1.alertsAPI.create({
                            ticker: newTicker.toUpperCase().trim(),
                            condition: newCondition,
                            target_price: parseFloat(newTargetPrice),
                            notes: newNotes.trim() || undefined
                        })];
                case 2:
                    _d.sent();
                    return [4 /*yield*/, loadData()];
                case 3:
                    _d.sent();
                    setNewTicker('');
                    setNewCondition('above');
                    setNewTargetPrice('');
                    setNewNotes('');
                    setAddingAlert(false);
                    return [3 /*break*/, 5];
                case 4:
                    err_1 = _d.sent();
                    console.error('Add alert error:', (_a = err_1.response) === null || _a === void 0 ? void 0 : _a.data);
                    setError(((_c = (_b = err_1.response) === null || _b === void 0 ? void 0 : _b.data) === null || _c === void 0 ? void 0 : _c.detail) || 'Failed to create alert. Please try again.');
                    return [3 /*break*/, 5];
                case 5: return [2 /*return*/];
            }
        });
    }); };
    var handleDeleteAlert = function (id) { return __awaiter(void 0, void 0, void 0, function () {
        var err_2;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (!window.confirm('Delete this alert?')) {
                        return [2 /*return*/];
                    }
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 3, , 5]);
                    return [4 /*yield*/, api_1.alertsAPI.delete(id)];
                case 2:
                    _a.sent();
                    setAlerts(function (prevList) { return prevList.filter(function (alert) { return alert.id !== id; }); });
                    return [3 /*break*/, 5];
                case 3:
                    err_2 = _a.sent();
                    console.error('Failed to delete alert:', err_2);
                    setError('Failed to delete alert');
                    return [4 /*yield*/, loadData()];
                case 4:
                    _a.sent();
                    return [3 /*break*/, 5];
                case 5: return [2 /*return*/];
            }
        });
    }); };
    var handleToggleAlert = function (id, currentStatus) { return __awaiter(void 0, void 0, void 0, function () {
        var err_3;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 3, , 4]);
                    return [4 /*yield*/, api_1.alertsAPI.update(id, { is_active: !currentStatus })];
                case 1:
                    _a.sent();
                    return [4 /*yield*/, loadData()];
                case 2:
                    _a.sent();
                    return [3 /*break*/, 4];
                case 3:
                    err_3 = _a.sent();
                    console.error('Failed to toggle alert:', err_3);
                    setError('Failed to update alert');
                    return [3 /*break*/, 4];
                case 4: return [2 /*return*/];
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
            free: 0,
            casual: 20,
            active: 45,
            unlimited: 'Unlimited'
        };
        return limits[user === null || user === void 0 ? void 0 : user.subscription_tier] || 0;
    };
    var getActiveAlertsCount = function () {
        return alerts.filter(function (alert) { return alert.is_active && !alert.triggered_at; }).length;
    };
    var getTriggeredAlertsCount = function () {
        return alerts.filter(function (alert) { return alert.triggered_at; }).length;
    };
    if (loading) {
        return (<div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
          <p className="mt-4 text-gray-600 dark:text-gray-400">Loading alerts...</p>
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
              <react_router_dom_1.Link to="/dashboard" className="text-gray-400 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">Dashboard</react_router_dom_1.Link>
              <react_router_dom_1.Link to="/watchlist" className="text-gray-400 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">Watchlist</react_router_dom_1.Link>
              <react_router_dom_1.Link to="/portfolio" className="text-gray-400 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">Portfolio</react_router_dom_1.Link>
              <react_router_dom_1.Link to="/alerts" className="text-primary-400 dark:text-primary-400 font-medium border-b-2 border-primary-600 dark:border-primary-400 pb-1">Alerts</react_router_dom_1.Link>
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
        {/* Header with Summary */}
        <div className="mb-8">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Price Alerts</h1>
              <p className="text-gray-600 dark:text-gray-400 mt-1">
                {alerts.length} of {getTierLimit()} alerts
              </p>
            </div>
            <button onClick={function () { return setAddingAlert(!addingAlert); }} className="px-6 py-3 bg-primary-600 hover:bg-primary-700 dark:bg-primary-500 dark:hover:bg-primary-600 text-white rounded-lg font-medium transition-colors flex items-center">
              <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/>
              </svg>
              Create Alert
            </button>
          </div>

          {/* Alert Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 hover:shadow-xl dark:hover:shadow-gray-200/30 transition-shadow p-6 border dark:border-gray-500">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Active Alerts</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
                    {getActiveAlertsCount()}
                  </p>
                </div>
                <div className="bg-green-100 dark:bg-green-900/30 p-3 rounded-full">
                  <svg className="w-6 h-6 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/>
                  </svg>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 hover:shadow-xl dark:hover:shadow-gray-200/30 transition-shadow p-6 border dark:border-gray-500">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Triggered</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
                    {getTriggeredAlertsCount()}
                  </p>
                </div>
                <div className="bg-purple-100 dark:bg-purple-900/30 p-3 rounded-full">
                  <svg className="w-6 h-6 text-purple-600 dark:text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                  </svg>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 hover:shadow-xl dark:hover:shadow-gray-200/30 transition-shadow p-6 border dark:border-gray-500">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Total Alerts</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
                    {alerts.length}
                  </p>
                </div>
                <div className="bg-primary-100 dark:bg-primary-900/30 p-3 rounded-full">
                  <svg className="w-6 h-6 text-primary-600 dark:text-primary-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
                  </svg>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Add Alert Form */}
        {addingAlert && (<div className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 p-6 border dark:border-gray-500 mb-8">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Create Price Alert</h2>
            
            {error && (<div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 text-red-600 dark:text-red-400 px-4 py-3 rounded-lg mb-4">
                {error}
              </div>)}

            <form onSubmit={handleAddAlert} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Ticker Symbol *
                  </label>
                  <input type="text" value={newTicker} onChange={function (e) { return setNewTicker(e.target.value.toUpperCase()); }} placeholder="AAPL" maxLength={10} className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500" required/>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Condition *
                  </label>
                  <select value={newCondition} onChange={function (e) { return setNewCondition(e.target.value); }} className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500">
                    <option value="above">Above</option>
                    <option value="below">Below</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Target Price *
                  </label>
                  <input type="number" value={newTargetPrice} onChange={function (e) { return setNewTargetPrice(e.target.value); }} placeholder="150.00" step="0.01" min="0" className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500" required/>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Notes (optional)
                </label>
                <input type="text" value={newNotes} onChange={function (e) { return setNewNotes(e.target.value); }} placeholder="Why are you setting this alert?" className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500"/>
              </div>

              <div className="flex gap-3">
                <button type="submit" className="px-6 py-2 bg-primary-600 hover:bg-primary-700 dark:bg-primary-500 dark:hover:bg-primary-600 text-white rounded-lg font-medium transition-colors">
                  Create Alert
                </button>
                <button type="button" onClick={function () {
                setAddingAlert(false);
                setNewTicker('');
                setNewCondition('above');
                setNewTargetPrice('');
                setNewNotes('');
                setError('');
            }} className="px-6 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-600 dark:hover:bg-gray-500 text-gray-900 dark:text-white rounded-lg font-medium transition-colors">
                  Cancel
                </button>
              </div>
            </form>
          </div>)}

        {/* Alerts Table */}
        {alerts.length === 0 ? (<div className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 p-12 border dark:border-gray-500 text-center">
            <div className="bg-gray-100 dark:bg-gray-600 rounded-full w-24 h-24 flex items-center justify-center mx-auto mb-6">
              <svg className="w-12 h-12 text-gray-400 dark:text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/>
              </svg>
            </div>
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">No Alerts Yet</h3>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              Create your first price alert to get notified when stocks hit your target
            </p>
            <button onClick={function () { return setAddingAlert(true); }} className="px-6 py-3 bg-primary-600 hover:bg-primary-700 dark:bg-primary-500 dark:hover:bg-primary-600 text-white rounded-lg font-medium transition-colors">
              Create Your First Alert
            </button>
          </div>) : (<div className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 border dark:border-gray-500 overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-600">
              <thead className="bg-gray-50 dark:bg-gray-900">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Ticker</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Condition</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Target Price</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Notes</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-700 divide-y divide-gray-200 dark:divide-gray-600">
                {alerts.map(function (alert) { return (<tr key={alert.id} className="hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-bold text-gray-900 dark:text-white">{alert.ticker}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {new Date(alert.created_at).toLocaleDateString()}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        {alert.condition === 'above' ? (<>
                            <svg className="w-4 h-4 text-green-600 dark:text-green-400 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7"/>
                            </svg>
                            <span className="text-sm text-green-600 dark:text-green-400 font-medium">Above</span>
                          </>) : (<>
                            <svg className="w-4 h-4 text-red-600 dark:text-red-400 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/>
                            </svg>
                            <span className="text-sm text-red-600 dark:text-red-400 font-medium">Below</span>
                          </>)}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <div className="text-sm font-semibold text-gray-900 dark:text-white">
                        ${alert.target_price.toFixed(2)}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {alert.triggered_at ? (<span className="px-2 py-1 text-xs font-semibold rounded-full bg-purple-100 dark:bg-purple-900/50 text-purple-800 dark:text-purple-200">
                          Triggered
                        </span>) : alert.is_active ? (<span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 dark:bg-green-900/50 text-green-800 dark:text-green-200">
                          Active
                        </span>) : (<span className="px-2 py-1 text-xs font-semibold rounded-full bg-gray-100 dark:bg-gray-600 text-gray-800 dark:text-gray-200">
                          Paused
                        </span>)}
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-600 dark:text-gray-400 max-w-xs truncate">
                        {alert.notes || '-'}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                      {!alert.triggered_at && (<button onClick={function () { return handleToggleAlert(alert.id, alert.is_active); }} className="text-primary-600 hover:text-primary-900 dark:text-primary-400 dark:hover:text-primary-300">
                          {alert.is_active ? 'Pause' : 'Resume'}
                        </button>)}
                      <button onClick={function () { return handleDeleteAlert(alert.id); }} className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300">
                        Delete
                      </button>
                    </td>
                  </tr>); })}
              </tbody>
            </table>
          </div>)}
      </div>
    </div>);
};
exports.default = Alerts;
