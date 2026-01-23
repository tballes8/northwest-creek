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
var Watchlist = function () {
    var navigate = (0, react_router_dom_1.useNavigate)();
    var _a = (0, react_1.useState)(null), user = _a[0], setUser = _a[1];
    var _b = (0, react_1.useState)([]), watchlist = _b[0], setWatchlist = _b[1];
    var _c = (0, react_1.useState)(true), loading = _c[0], setLoading = _c[1];
    var _d = (0, react_1.useState)(false), addingStock = _d[0], setAddingStock = _d[1];
    var _e = (0, react_1.useState)(''), newTicker = _e[0], setNewTicker = _e[1];
    var _f = (0, react_1.useState)(''), newNotes = _f[0], setNewNotes = _f[1];
    var _g = (0, react_1.useState)(''), newTargetPrice = _g[0], setNewTargetPrice = _g[1];
    var _h = (0, react_1.useState)(''), error = _h[0], setError = _h[1];
    var _j = (0, react_1.useState)(false), refreshing = _j[0], setRefreshing = _j[1];
    (0, react_1.useEffect)(function () {
        loadData();
    }, []);
    var loadData = function () { return __awaiter(void 0, void 0, void 0, function () {
        var userResponse, watchlistResponse, error_1;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 3, 4, 5]);
                    return [4 /*yield*/, api_1.authAPI.getCurrentUser()];
                case 1:
                    userResponse = _b.sent();
                    setUser(userResponse.data);
                    return [4 /*yield*/, api_1.watchlistAPI.getAll()];
                case 2:
                    watchlistResponse = _b.sent();
                    setWatchlist(watchlistResponse.data.items || []);
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
    var handleAddStock = function (e) { return __awaiter(void 0, void 0, void 0, function () {
        var limits, limit, payload, err_1;
        var _a, _b, _c;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0:
                    e.preventDefault();
                    setError('');
                    if (!newTicker.trim()) {
                        setError('Please enter a ticker symbol');
                        return [2 /*return*/];
                    }
                    limits = {
                        free: 5,
                        pro: 50,
                        enterprise: Infinity
                    };
                    limit = limits[user === null || user === void 0 ? void 0 : user.subscription_tier] || 5;
                    if (watchlist.length >= limit) {
                        setError("You've reached your ".concat(user === null || user === void 0 ? void 0 : user.subscription_tier, " tier limit of ").concat(limit, " stocks"));
                        return [2 /*return*/];
                    }
                    _d.label = 1;
                case 1:
                    _d.trys.push([1, 4, , 5]);
                    payload = {
                        ticker: newTicker.toUpperCase().trim(),
                    };
                    if (newNotes.trim()) {
                        payload.notes = newNotes.trim();
                    }
                    if (newTargetPrice && parseFloat(newTargetPrice) > 0) {
                        payload.target_price = parseFloat(newTargetPrice);
                    }
                    return [4 /*yield*/, api_1.watchlistAPI.add(payload)];
                case 2:
                    _d.sent();
                    return [4 /*yield*/, loadData()];
                case 3:
                    _d.sent();
                    setNewTicker('');
                    setNewNotes('');
                    setNewTargetPrice('');
                    setAddingStock(false);
                    return [3 /*break*/, 5];
                case 4:
                    err_1 = _d.sent();
                    console.error('Add stock error:', (_a = err_1.response) === null || _a === void 0 ? void 0 : _a.data);
                    setError(((_c = (_b = err_1.response) === null || _b === void 0 ? void 0 : _b.data) === null || _c === void 0 ? void 0 : _c.detail) || 'Failed to add stock. Please check the ticker symbol.');
                    return [3 /*break*/, 5];
                case 5: return [2 /*return*/];
            }
        });
    }); };
    var handleRemoveStock = function (id) { return __awaiter(void 0, void 0, void 0, function () {
        var err_2;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (!window.confirm('Remove this stock from your watchlist?')) {
                        return [2 /*return*/];
                    }
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 3, , 5]);
                    return [4 /*yield*/, api_1.watchlistAPI.remove(id)];
                case 2:
                    _a.sent();
                    // Immediately update local state to remove the item
                    setWatchlist(function (prevList) { return prevList.filter(function (stock) { return stock.id !== id; }); });
                    return [3 /*break*/, 5];
                case 3:
                    err_2 = _a.sent();
                    console.error('Failed to remove stock:', err_2);
                    setError('Failed to remove stock');
                    // Reload data in case of error
                    return [4 /*yield*/, loadData()];
                case 4:
                    // Reload data in case of error
                    _a.sent();
                    return [3 /*break*/, 5];
                case 5: return [2 /*return*/];
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
        return (<div className="min-h-screen bg-gray-50 dark:bg-gray-800 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
          <p className="mt-4 text-gray-600 dark:text-gray-400">Loading watchlist...</p>
        </div>
      </div>);
    }
    return (<div className="min-h-screen bg-gray-50 dark:bg-gray-800">
      {/* Navigation - Same as before */}
      <nav className="bg-gray-900 dark:bg-gray-900 shadow-sm border-b border-gray-700 dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <img src="/images/logo.png" alt="Northwest Creek" className="h-10 w-10 mr-3"/>
              <span className="text-xl font-bold text-primary-400 dark:text-primary-400">Northwest Creek</span>
            </div>
            <div className="hidden md:flex items-center space-x-8">
              <react_router_dom_1.Link to="/dashboard" className="text-gray-400 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">Dashboard</react_router_dom_1.Link>
              <react_router_dom_1.Link to="/watchlist" className="text-primary-400 dark:text-primary-400 font-medium border-b-2 border-primary-600 dark:border-primary-400 pb-1">Watchlist</react_router_dom_1.Link>
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
        <div className="mb-8">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Watchlist</h1>
              <p className="text-gray-600 dark:text-gray-400 mt-1">
                {watchlist.length} of {getTierLimit()} stocks
              </p>
            </div>
            <button onClick={function () { return setAddingStock(!addingStock); }} className="px-6 py-3 bg-primary-600 hover:bg-primary-700 dark:bg-primary-500 dark:hover:bg-primary-600 text-white rounded-lg font-medium transition-colors flex items-center">
              <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/>
              </svg>
              Add Stock
            </button>
          </div>
        </div>

        {/* Add Stock Form */}
        {addingStock && (<div className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 p-6 border dark:border-gray-500 mb-8">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Add Stock to Watchlist</h2>
            
            {error && (<div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 text-red-600 dark:text-red-400 px-4 py-3 rounded-lg mb-4">
                {error}
              </div>)}

            <form onSubmit={handleAddStock} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Ticker Symbol *
                  </label>
                  <input type="text" value={newTicker} onChange={function (e) { return setNewTicker(e.target.value.toUpperCase()); }} placeholder="AAPL" maxLength={10} className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500" required/>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Started watching when price was
                  </label>
                  <input type="number" value={newTargetPrice} onChange={function (e) { return setNewTargetPrice(e.target.value); }} placeholder="150.00" step="0.01" min="0" className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500"/>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Notes (optional)
                </label>
                <textarea value={newNotes} onChange={function (e) { return setNewNotes(e.target.value); }} placeholder="Why are you watching this stock?" rows={3} className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500"/>
              </div>

              <div className="flex gap-3">
                <button type="submit" className="px-6 py-2 bg-primary-600 hover:bg-primary-700 dark:bg-primary-500 dark:hover:bg-primary-600 text-white rounded-lg font-medium transition-colors">
                  Add to Watchlist
                </button>
                <button type="button" onClick={function () {
                setAddingStock(false);
                setNewTicker('');
                setNewNotes('');
                setNewTargetPrice('');
                setError('');
            }} className="px-6 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-600 dark:hover:bg-gray-500 text-gray-900 dark:text-white rounded-lg font-medium transition-colors">
                  Cancel
                </button>
              </div>
            </form>
          </div>)}

        {/* Watchlist Table */}
        {watchlist.length === 0 ? (<div className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 p-12 border dark:border-gray-500 text-center">
            <div className="bg-gray-100 dark:bg-gray-600 rounded-full w-24 h-24 flex items-center justify-center mx-auto mb-6">
              <svg className="w-12 h-12 text-gray-400 dark:text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"/>
              </svg>
            </div>
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">No Stocks Yet</h3>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              Add your first stock to start tracking prices and performance
            </p>
            <button onClick={function () { return setAddingStock(true); }} className="px-6 py-3 bg-primary-600 hover:bg-primary-700 dark:bg-primary-500 dark:hover:bg-primary-600 text-white rounded-lg font-medium transition-colors">
              Add Your First Stock
            </button>
          </div>) : (<div className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 border dark:border-gray-500 overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-600">
              <thead className="bg-gray-50 dark:bg-gray-900">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Ticker</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Current Price</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Day Change</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Started At</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">vs Start</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Notes</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-700 divide-y divide-gray-200 dark:divide-gray-600">
                {watchlist.map(function (stock) {
                var _a;
                return (<tr key={stock.id} className="hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-bold text-gray-900 dark:text-white">{stock.ticker}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <div className="text-sm font-semibold text-gray-900 dark:text-white">
                        {stock.price ? "$".concat(stock.price.toFixed(2)) : '-'}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <div className={"text-sm font-semibold ".concat(stock.change && stock.change >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400')}>
                        {stock.change ? "".concat(stock.change >= 0 ? '+' : '', "$").concat(stock.change.toFixed(2), " (").concat((_a = stock.change_percent) === null || _a === void 0 ? void 0 : _a.toFixed(2), "%)") : '-'}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <div className="text-sm text-gray-600 dark:text-gray-400">
                        {stock.target_price ? "$".concat(stock.target_price.toFixed(2)) : '-'}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      {stock.price_vs_target !== undefined && stock.price_vs_target !== null && stock.target_price ? (<div className={"text-sm font-semibold ".concat(stock.price_vs_target >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400')}>
                          {stock.price_vs_target >= 0 ? '+' : ''}${stock.price_vs_target.toFixed(2)}
                          {stock.price_vs_target_percent !== undefined && stock.price_vs_target_percent !== null && (<div className="text-xs">
                              ({stock.price_vs_target_percent >= 0 ? '+' : ''}{stock.price_vs_target_percent.toFixed(2)}%)
                            </div>)}
                        </div>) : (<div className="text-sm text-gray-600 dark:text-gray-400">-</div>)}
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-600 dark:text-gray-400 max-w-xs truncate">
                        {stock.notes || '-'}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <button onClick={function () { return handleRemoveStock(stock.id); }} className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300">
                        Remove
                      </button>
                    </td>
                  </tr>);
            })}
              </tbody>
            </table>
          </div>)}
      </div>
    </div>);
};
exports.default = Watchlist;
