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
var axios_1 = require("axios");
var DCFValuation = function () {
    var navigate = (0, react_router_dom_1.useNavigate)();
    var searchParams = (0, react_router_dom_1.useSearchParams)()[0];
    var urlTicker = searchParams.get('ticker') || '';
    var _a = (0, react_1.useState)(false), showSuggestions = _a[0], setShowSuggestions = _a[1];
    var _b = (0, react_1.useState)(null), user = _b[0], setUser = _b[1];
    var _c = (0, react_1.useState)(urlTicker), ticker = _c[0], setTicker = _c[1];
    var _d = (0, react_1.useState)(5), growthRate = _d[0], setGrowthRate = _d[1];
    var _e = (0, react_1.useState)(2.5), terminalGrowth = _e[0], setTerminalGrowth = _e[1];
    var _f = (0, react_1.useState)(10), discountRate = _f[0], setDiscountRate = _f[1];
    var _g = (0, react_1.useState)(5), projectionYears = _g[0], setProjectionYears = _g[1];
    var _h = (0, react_1.useState)(false), loading = _h[0], setLoading = _h[1];
    var _j = (0, react_1.useState)(null), dcfData = _j[0], setDcfData = _j[1];
    var _k = (0, react_1.useState)(null), suggestions = _k[0], setSuggestions = _k[1];
    var _l = (0, react_1.useState)(''), error = _l[0], setError = _l[1];
    react_1.default.useEffect(function () {
        loadUser();
        if (urlTicker) {
            setTicker(urlTicker);
            loadSuggestions(urlTicker);
        }
    }, [urlTicker]);
    var loadUser = function () { return __awaiter(void 0, void 0, void 0, function () {
        var response, error_1;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, api_1.authAPI.getCurrentUser()];
                case 1:
                    response = _b.sent();
                    setUser(response.data);
                    return [3 /*break*/, 3];
                case 2:
                    error_1 = _b.sent();
                    console.error('Failed to load user:', error_1);
                    if (((_a = error_1.response) === null || _a === void 0 ? void 0 : _a.status) === 401) {
                        localStorage.removeItem('access_token');
                        navigate('/login');
                    }
                    return [3 /*break*/, 3];
                case 3: return [2 /*return*/];
            }
        });
    }); };
    var loadSuggestions = function (symbol) { return __awaiter(void 0, void 0, void 0, function () {
        var token, response, err_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (!symbol.trim())
                        return [2 /*return*/];
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 3, , 4]);
                    token = localStorage.getItem('access_token');
                    return [4 /*yield*/, axios_1.default.get("http://localhost:8000/api/v1/dcf/suggestions/".concat(symbol.toUpperCase()), { headers: { Authorization: "Bearer ".concat(token) } })];
                case 2:
                    response = _a.sent();
                    setSuggestions(response.data);
                    // Auto-fill with suggestions
                    setGrowthRate(response.data.suggestions.growth_rate * 100);
                    setTerminalGrowth(response.data.suggestions.terminal_growth * 100);
                    setDiscountRate(response.data.suggestions.discount_rate * 100);
                    setProjectionYears(response.data.suggestions.projection_years);
                    setShowSuggestions(true);
                    return [3 /*break*/, 4];
                case 3:
                    err_1 = _a.sent();
                    console.error('Failed to load suggestions:', err_1);
                    return [3 /*break*/, 4];
                case 4: return [2 /*return*/];
            }
        });
    }); };
    var handleCalculate = function (e) { return __awaiter(void 0, void 0, void 0, function () {
        var token, response, err_2;
        var _a, _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    e.preventDefault();
                    if (!ticker.trim()) {
                        setError('Please enter a ticker symbol');
                        return [2 /*return*/];
                    }
                    setLoading(true);
                    setError('');
                    setDcfData(null);
                    _c.label = 1;
                case 1:
                    _c.trys.push([1, 3, 4, 5]);
                    token = localStorage.getItem('access_token');
                    return [4 /*yield*/, axios_1.default.get("http://localhost:8000/api/v1/dcf/calculate/".concat(ticker.toUpperCase()), {
                            params: {
                                growth_rate: growthRate / 100,
                                terminal_growth: terminalGrowth / 100,
                                discount_rate: discountRate / 100,
                                projection_years: projectionYears
                            },
                            headers: { Authorization: "Bearer ".concat(token) }
                        })];
                case 2:
                    response = _c.sent();
                    setDcfData(response.data);
                    setShowSuggestions(false);
                    return [3 /*break*/, 5];
                case 3:
                    err_2 = _c.sent();
                    console.error('DCF calculation error:', err_2);
                    setError(((_b = (_a = err_2.response) === null || _a === void 0 ? void 0 : _a.data) === null || _b === void 0 ? void 0 : _b.detail) || 'Failed to calculate DCF. Please check the ticker symbol and try again.');
                    return [3 /*break*/, 5];
                case 4:
                    setLoading(false);
                    return [7 /*endfinally*/];
                case 5: return [2 /*return*/];
            }
        });
    }); };
    var handleTickerChange = function (value) { return __awaiter(void 0, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    setTicker(value);
                    if (!(value.length >= 1)) return [3 /*break*/, 2];
                    return [4 /*yield*/, loadSuggestions(value)];
                case 1:
                    _a.sent();
                    _a.label = 2;
                case 2: return [2 /*return*/];
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
    var formatCurrency = function (value) {
        if (value >= 1e9)
            return "$".concat((value / 1e9).toFixed(2), "B");
        if (value >= 1e6)
            return "$".concat((value / 1e6).toFixed(2), "M");
        if (value >= 1e3)
            return "$".concat((value / 1e3).toFixed(2), "K");
        return "$".concat(value.toFixed(2));
    };
    return (<div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Navigation */}
      <nav className="bg-gray-800 dark:bg-gray-900 shadow-sm border-b border-gray-700 dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <img src="/images/logo.png" alt="Northwest Creek" className="h-10 w-10 mr-3"/>
              <span className="text-xl font-bold text-primary-400">Northwest Creek</span>
            </div>
            
            <div className="hidden md:flex items-center space-x-8">
              <react_router_dom_1.Link to="/dashboard" className="text-gray-400 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">Dashboard</react_router_dom_1.Link>
              <react_router_dom_1.Link to="/watchlist" className="text-gray-400 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">Watchlist</react_router_dom_1.Link>
              <react_router_dom_1.Link to="/portfolio" className="text-gray-400 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">Portfolio</react_router_dom_1.Link>
              <react_router_dom_1.Link to="/alerts" className="text-gray-400 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">Alerts</react_router_dom_1.Link>
              <react_router_dom_1.Link to="/stocks" className="text-gray-400 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">Stocks</react_router_dom_1.Link>
              <react_router_dom_1.Link to="/technical-analysis" className="text-gray-400 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">Technical Analysis</react_router_dom_1.Link>
              <react_router_dom_1.Link to="/dcf-valuation" className="text-primary-400 dark:text-primary-400 font-medium border-b-2 border-primary-600 dark:border-primary-400 pb-1">DCF Valuation</react_router_dom_1.Link>
            </div>

            <div className="flex items-center space-x-4">
              <ThemeToggle_1.default />
              <span className="text-sm text-gray-300">{user === null || user === void 0 ? void 0 : user.email}</span>
              {user && getTierBadge(user.subscription_tier)}
              <button onClick={handleLogout} className="text-gray-300 hover:text-white text-sm font-medium">
                Logout
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center mb-2">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">DCF Valuation</h1>
          </div>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Discounted Cash Flow analysis - Estimate intrinsic value based on projected future cash flows
          </p>
        </div>

        {/* Input Form */}
        <div className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 p-6 border dark:border-gray-500 mb-8">
          <form onSubmit={handleCalculate}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              {/* Ticker */}
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Ticker Symbol
                </label>
                <input type="text" value={ticker} onChange={function (e) { return setTicker(e.target.value.toUpperCase()); }} placeholder="e.g., AAPL" className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500" maxLength={10}/>
              </div>

              {/* Growth Rate */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Growth Rate (%)
                </label>
                <input type="number" value={growthRate} onChange={function (e) { return setGrowthRate(parseFloat(e.target.value)); }} step="0.1" min="-50" max="100" className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500"/>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Expected annual FCF growth</p>
              </div>

              {/* Terminal Growth */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Terminal Growth (%)
                </label>
                <input type="number" value={terminalGrowth} onChange={function (e) { return setTerminalGrowth(parseFloat(e.target.value)); }} step="0.1" min="0" max="10" className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500"/>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Perpetual growth rate</p>
              </div>

              {/* Discount Rate */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Discount Rate / WACC (%)
                </label>
                <input type="number" value={discountRate} onChange={function (e) { return setDiscountRate(parseFloat(e.target.value)); }} step="0.1" min="1" max="30" className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500"/>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Required rate of return</p>
              </div>

              {/* Projection Years */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Projection Years
                </label>
                <select value={projectionYears} onChange={function (e) { return setProjectionYears(parseInt(e.target.value)); }} className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500">
                  <option value={3}>3 Years</option>
                  <option value={5}>5 Years</option>
                  <option value={7}>7 Years</option>
                  <option value={10}>10 Years</option>
                </select>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Forecast horizon</p>
              </div>
            </div>

            <button type="submit" disabled={loading} className="w-full px-8 py-3 bg-primary-600 hover:bg-primary-700 dark:bg-primary-500 dark:hover:bg-primary-600 text-white rounded-lg font-medium transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed">
              {loading ? 'Calculating...' : 'Calculate DCF Valuation'}
            </button>
          </form>

          {error && (<div className="mt-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 text-red-600 dark:text-red-400 px-4 py-3 rounded-lg">
              {error}
            </div>)}
        </div>

        {/* DCF Results */}
        {dcfData && (<div className="space-y-8">
            {/* Company Header */}
            <div className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 p-6 border dark:border-gray-500">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-white">{dcfData.ticker}</h2>
                  <p className="text-gray-600 dark:text-gray-400 mt-1">{dcfData.company_name}</p>
                </div>
                <div className="text-right">
                  <div className="text-sm text-gray-600 dark:text-gray-400">Current Price</div>
                  <div className="text-3xl font-bold text-gray-900 dark:text-white">
                    ${dcfData.current_price.toFixed(2)}
                  </div>
                </div>
              </div>

              {/* Recommendation */}
              <div className={"p-4 rounded-lg border-2 ".concat(dcfData.recommendation.color === 'green'
                ? 'bg-green-50 dark:bg-green-900/20 border-green-500'
                : dcfData.recommendation.color === 'red'
                    ? 'bg-red-50 dark:bg-red-900/20 border-red-500'
                    : 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-500')}>
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                      Recommendation: {dcfData.recommendation.rating}
                    </h3>
                    <p className="text-gray-600 dark:text-gray-400 mt-1">{dcfData.recommendation.message}</p>
                  </div>
                  <div className="text-right">
                    <div className="text-sm text-gray-600 dark:text-gray-400">Margin of Safety</div>
                    <div className={"text-2xl font-bold ".concat(dcfData.valuation.margin_of_safety > 0 ? 'text-green-600' : 'text-red-600')}>
                      {dcfData.valuation.margin_of_safety > 0 ? '+' : ''}{dcfData.valuation.margin_of_safety.toFixed(1)}%
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Valuation Summary */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 p-6 border dark:border-gray-500">
                <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">Intrinsic Value</h3>
                <div className="text-3xl font-bold text-primary-600 dark:text-primary-400">
                  ${dcfData.valuation.intrinsic_value_per_share.toFixed(2)}
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">Per Share</p>
              </div>

              <div className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 p-6 border dark:border-gray-500">
                <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">Enterprise Value</h3>
                <div className="text-3xl font-bold text-gray-900 dark:text-white">
                  {formatCurrency(dcfData.valuation.enterprise_value)}
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">Total Value</p>
              </div>

              <div className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 p-6 border dark:border-gray-500">
                <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">Terminal Value</h3>
                <div className="text-3xl font-bold text-gray-900 dark:text-white">
                  {formatCurrency(dcfData.terminal_value.present_value)}
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">Present Value</p>
              </div>
            </div>

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
                  <div className="text-lg font-semibold text-gray-900 dark:text-white">
                    {formatCurrency(dcfData.assumptions.current_fcf)}
                  </div>
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
                    {dcfData.projections.map(function (projection) { return (<tr key={projection.year}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                          Year {projection.year}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900 dark:text-white">
                          {formatCurrency(projection.cash_flow)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-600 dark:text-gray-400">
                          {projection.discount_factor.toFixed(4)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-semibold text-primary-600 dark:text-primary-400">
                          {formatCurrency(projection.present_value)}
                        </td>
                      </tr>); })}
                    <tr className="bg-gray-50 dark:bg-gray-800">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900 dark:text-white">
                        Sum of PV
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-right"></td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-right"></td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-bold text-primary-600 dark:text-primary-400">
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
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-bold text-primary-600 dark:text-primary-400">
                        {formatCurrency(dcfData.terminal_value.present_value)}
                      </td>
                    </tr>
                    <tr className="bg-primary-100 dark:bg-primary-900/30">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900 dark:text-white">
                        Enterprise Value
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-right"></td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-right"></td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-bold text-primary-600 dark:text-primary-400">
                        {formatCurrency(dcfData.valuation.enterprise_value)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>)}

        {/* Educational Content (shown when no analysis) */}
        {!dcfData && !loading && (<div className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 p-8 border dark:border-gray-500">
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
            </div>
          </div>)}
      </div>
    </div>);
};
exports.default = DCFValuation;
