"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
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
var chart_js_1 = require("chart.js");
var react_chartjs_2_1 = require("react-chartjs-2");
// Register Chart.js components
chart_js_1.Chart.register(chart_js_1.CategoryScale, chart_js_1.LinearScale, chart_js_1.PointElement, chart_js_1.LineElement, chart_js_1.BarElement, chart_js_1.Title, chart_js_1.Tooltip, chart_js_1.Legend, chart_js_1.Filler);
var TechnicalAnalysis = function () {
    var _a, _b, _c, _d;
    var navigate = (0, react_router_dom_1.useNavigate)();
    var _e = (0, react_1.useState)(null), user = _e[0], setUser = _e[1];
    var _f = (0, react_1.useState)(''), ticker = _f[0], setTicker = _f[1];
    var _g = (0, react_1.useState)(false), loading = _g[0], setLoading = _g[1];
    var _h = (0, react_1.useState)(null), analysisData = _h[0], setAnalysisData = _h[1];
    var _j = (0, react_1.useState)(''), error = _j[0], setError = _j[1];
    react_1.default.useEffect(function () {
        loadUser();
    }, []);
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
    var handleAnalyze = function (e) { return __awaiter(void 0, void 0, void 0, function () {
        var token, response, err_1;
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
                    setAnalysisData(null);
                    _c.label = 1;
                case 1:
                    _c.trys.push([1, 3, 4, 5]);
                    token = localStorage.getItem('access_token');
                    return [4 /*yield*/, axios_1.default.get("http://localhost:8000/api/v1/technical-analysis/analyze/".concat(ticker.toUpperCase()), {
                            headers: { Authorization: "Bearer ".concat(token) }
                        })];
                case 2:
                    response = _c.sent();
                    setAnalysisData(response.data);
                    return [3 /*break*/, 5];
                case 3:
                    err_1 = _c.sent();
                    console.error('Analysis error:', err_1);
                    setError(((_b = (_a = err_1.response) === null || _a === void 0 ? void 0 : _a.data) === null || _b === void 0 ? void 0 : _b.detail) || 'Failed to analyze stock. Please check the ticker symbol.');
                    return [3 /*break*/, 5];
                case 4:
                    setLoading(false);
                    return [7 /*endfinally*/];
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
    // Chart configurations
    var getPriceChartData = function () {
        if (!analysisData)
            return null;
        var dates = analysisData.chart_data.map(function (d) { return d.date; });
        var prices = analysisData.chart_data.map(function (d) { return d.close; });
        var volumes = analysisData.chart_data.map(function (d) { return d.volume; });
        var sma20 = analysisData.chart_data.map(function (d) { return d.sma_20; });
        var sma50 = analysisData.chart_data.map(function (d) { return d.sma_50; });
        var bbUpper = analysisData.chart_data.map(function (d) { return d.bb_upper; });
        var bbLower = analysisData.chart_data.map(function (d) { return d.bb_lower; });
        return {
            labels: dates,
            datasets: [
                {
                    label: 'Close Price',
                    data: prices,
                    borderColor: 'rgb(59, 130, 246)',
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    fill: false,
                    tension: 0.1,
                    pointRadius: 0,
                    borderWidth: 2,
                    yAxisID: 'y',
                },
                {
                    label: 'SMA 20',
                    data: sma20,
                    borderColor: 'rgba(234, 179, 8, 0.8)',
                    fill: false,
                    pointRadius: 0,
                    borderWidth: 2,
                    yAxisID: 'y',
                    spanGaps: true,
                },
                {
                    label: 'SMA 50',
                    data: sma50,
                    borderColor: 'rgba(168, 85, 247, 0.8)',
                    fill: false,
                    pointRadius: 0,
                    borderWidth: 2,
                    yAxisID: 'y',
                    spanGaps: true,
                },
                {
                    label: 'BB Upper',
                    data: bbUpper,
                    borderColor: 'rgba(239, 68, 68, 0.87)',
                    borderDash: [5, 5],
                    fill: false,
                    pointRadius: 0,
                    borderWidth: 1,
                    yAxisID: 'y',
                    spanGaps: true,
                },
                {
                    label: 'BB Lower',
                    data: bbLower,
                    borderColor: 'rgba(24, 228, 58, 0.78)',
                    borderDash: [5, 5],
                    fill: '+1',
                    backgroundColor: 'rgba(156, 163, 175, 0.1)',
                    pointRadius: 0,
                    borderWidth: 1,
                    yAxisID: 'y',
                    spanGaps: true,
                },
                {
                    type: 'bar',
                    label: 'Volume',
                    data: volumes,
                    backgroundColor: 'rgba(156, 163, 175, 0.3)',
                    borderColor: 'rgba(156, 163, 175, 0.5)',
                    borderWidth: 1,
                    yAxisID: 'y1',
                }
            ]
        };
    };
    var getVolumeChartData = function () {
        if (!analysisData)
            return null;
        var dates = analysisData.chart_data.map(function (d) { return d.date; });
        var volumes = analysisData.chart_data.map(function (d) { return d.volume; });
        return {
            labels: dates,
            datasets: [
                {
                    label: 'Volume',
                    data: volumes,
                    backgroundColor: 'rgba(99, 102, 241, 0.5)',
                    borderColor: 'rgba(99, 102, 241, 0.8)',
                    borderWidth: 1,
                }
            ]
        };
    };
    var getRSIChartData = function () {
        if (!(analysisData === null || analysisData === void 0 ? void 0 : analysisData.indicators.rsi))
            return null;
        var dates = analysisData.chart_data.map(function (d) { return d.date; });
        var rsiValues = analysisData.chart_data.map(function (d) { return d.rsi; });
        // Debug logging
        console.log('RSI values:', rsiValues.filter(function (v) { return v !== null; }).length, 'non-null values');
        return {
            labels: dates,
            datasets: [
                {
                    label: 'RSI',
                    data: rsiValues,
                    borderColor: 'rgb(99, 102, 241)',
                    backgroundColor: 'rgba(99, 102, 241, 0.1)',
                    fill: true,
                    pointRadius: 0,
                    borderWidth: 2,
                    spanGaps: true,
                },
                {
                    label: 'Overbought (70)',
                    data: Array(dates.length).fill(70),
                    borderColor: 'rgba(239, 108, 68, 0.99)',
                    borderDash: [5, 5],
                    fill: false,
                    pointRadius: 0,
                    borderWidth: 1,
                },
                {
                    label: 'Oversold (30)',
                    data: Array(dates.length).fill(30),
                    borderColor: 'rgb(171, 236, 18)',
                    borderDash: [5, 5],
                    fill: false,
                    pointRadius: 0,
                    borderWidth: 1,
                }
            ]
        };
    };
    var getMACDChartData = function () {
        if (!(analysisData === null || analysisData === void 0 ? void 0 : analysisData.indicators.macd))
            return null;
        var dates = analysisData.chart_data.map(function (d) { return d.date; });
        var macdLine = analysisData.chart_data.map(function (d) { return d.macd_line; });
        var signalLine = analysisData.chart_data.map(function (d) { return d.macd_signal; });
        var histogram = analysisData.chart_data.map(function (d) { return d.macd_histogram; });
        // Debug logging
        console.log('MACD Line values:', macdLine.filter(function (v) { return v !== null; }).length, 'non-null values');
        console.log('Signal Line values:', signalLine.filter(function (v) { return v !== null; }).length, 'non-null values');
        console.log('Histogram values:', histogram.filter(function (v) { return v !== null; }).length, 'non-null values');
        // Color histogram bars based on positive/negative
        var histogramColors = histogram.map(function (val) {
            return val && val > 0 ? 'rgba(34, 197, 94, 0.5)' : 'rgba(239, 68, 68, 0.5)';
        });
        return {
            labels: dates,
            datasets: [
                {
                    type: 'line',
                    label: 'MACD Line',
                    data: macdLine,
                    borderColor: 'rgb(59, 130, 246)',
                    backgroundColor: 'transparent',
                    fill: false,
                    pointRadius: 0,
                    borderWidth: 2,
                    spanGaps: true,
                },
                {
                    type: 'line',
                    label: 'Signal Line',
                    data: signalLine,
                    borderColor: 'rgb(239, 68, 68)',
                    backgroundColor: 'transparent',
                    fill: false,
                    pointRadius: 0,
                    borderWidth: 2,
                    spanGaps: true,
                },
                {
                    type: 'bar',
                    label: 'Histogram',
                    data: histogram,
                    backgroundColor: histogramColors,
                    borderWidth: 0,
                }
            ]
        };
    };
    var priceChartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
            mode: 'index',
            intersect: false,
        },
        plugins: {
            legend: {
                position: 'top',
                labels: {
                    color: '#9CA3AF',
                    usePointStyle: true,
                    boxWidth: 6,
                }
            },
            tooltip: {
                mode: 'index',
                intersect: false,
            }
        },
        scales: {
            x: {
                ticks: {
                    color: '#9CA3AF',
                    maxTicksLimit: 10,
                },
                grid: {
                    color: 'rgba(156, 163, 175, 0.1)',
                }
            },
            y: {
                type: 'linear',
                display: true,
                position: 'left',
                title: {
                    display: true,
                    text: 'Price ($)',
                    color: '#9CA3AF',
                },
                ticks: {
                    color: '#9CA3AF',
                },
                grid: {
                    color: 'rgba(156, 163, 175, 0.1)',
                }
            },
            y1: {
                type: 'linear',
                display: true,
                position: 'right',
                title: {
                    display: true,
                    text: 'Volume',
                    color: '#9CA3AF',
                },
                ticks: {
                    color: '#9CA3AF',
                },
                grid: {
                    drawOnChartArea: false,
                }
            }
        }
    };
    var chartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                position: 'top',
                labels: {
                    color: '#9CA3AF',
                }
            },
        },
        scales: {
            x: {
                ticks: {
                    color: '#9CA3AF',
                    maxTicksLimit: 10,
                },
                grid: {
                    color: 'rgba(156, 163, 175, 0.1)',
                }
            },
            y: {
                ticks: {
                    color: '#9CA3AF',
                },
                grid: {
                    color: 'rgba(156, 163, 175, 0.1)',
                }
            }
        }
    };
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
              <react_router_dom_1.Link to="/alerts" className="text-gray-400 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">Alerts</react_router_dom_1.Link>
              <react_router_dom_1.Link to="/stocks" className="text-gray-400 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">Stocks</react_router_dom_1.Link>
              <react_router_dom_1.Link to="/technical-analysis" className="text-primary-400 dark:text-primary-400 font-medium border-b-2 border-primary-600 dark:border-primary-400 pb-1">Technical Analysis</react_router_dom_1.Link>
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
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Technical Analysis</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Analyze stocks with RSI, MACD, Moving Averages, and Bollinger Bands
          </p>
        </div>

        {/* Search Form */}
        <div className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 p-6 border dark:border-gray-500 mb-8">
          <form onSubmit={handleAnalyze} className="flex gap-4">
            <div className="flex-1">
              <input type="text" value={ticker} onChange={function (e) { return setTicker(e.target.value.toUpperCase()); }} placeholder="Enter ticker symbol (e.g., AAPL)" className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500" maxLength={10}/>
            </div>
            <button type="submit" disabled={loading} className="px-8 py-3 bg-primary-600 hover:bg-primary-700 dark:bg-primary-500 dark:hover:bg-primary-600 text-white rounded-lg font-medium transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed">
              {loading ? 'Analyzing...' : 'Analyze'}
            </button>
          </form>

          {error && (<div className="mt-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 text-red-600 dark:text-red-400 px-4 py-3 rounded-lg">
              {error}
            </div>)}
        </div>

        {/* Analysis Results */}
        {analysisData && (<div className="space-y-8">
            {/* Company Header */}
            <div className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 p-6 border dark:border-gray-500">
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-white">{analysisData.ticker}</h2>
                  <p className="text-gray-600 dark:text-gray-400 mt-1">{analysisData.company_name}</p>
                </div>
                <div className="text-right">
                  <div className="text-3xl font-bold text-gray-900 dark:text-white">
                    ${analysisData.current_price.toFixed(2)}
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    As of {analysisData.analysis_date}
                  </div>
                </div>
              </div>

              {/* Overall Summary */}
              <div className={"mt-6 p-4 rounded-lg border-2 ".concat(analysisData.summary.outlook === 'bullish'
                ? 'bg-green-50 dark:bg-green-900/20 border-green-500'
                : analysisData.summary.outlook === 'bearish'
                    ? 'bg-red-50 dark:bg-red-900/20 border-red-500'
                    : 'bg-gray-50 dark:bg-gray-800 border-gray-500')}>
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                      Overall Outlook: <span className="capitalize">{analysisData.summary.outlook}</span>
                    </h3>
                    <p className="text-gray-600 dark:text-gray-400 mt-1">{analysisData.summary.message}</p>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold text-gray-900 dark:text-white">
                      {analysisData.summary.strength}/4
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">Signal Strength</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Trading Signals */}
            {analysisData.signals.length > 0 && (<div className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 p-6 border dark:border-gray-500">
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Trading Signals</h3>
                <div className="space-y-3">
                  {analysisData.signals.map(function (signal, index) { return (<div key={index} className={"p-4 rounded-lg border ".concat(signal.type === 'buy'
                        ? 'bg-green-50 dark:bg-green-900/20 border-green-500'
                        : 'bg-red-50 dark:bg-red-900/20 border-red-500')}>
                      <div className="flex items-center">
                        <span className={"px-3 py-1 rounded-full text-sm font-semibold mr-3 ".concat(signal.type === 'buy'
                        ? 'bg-green-500 text-white'
                        : 'bg-red-500 text-white')}>
                          {signal.type.toUpperCase()}
                        </span>
                        <div>
                          <div className="font-semibold text-gray-900 dark:text-white">{signal.indicator}</div>
                          <div className="text-sm text-gray-600 dark:text-gray-400">{signal.message}</div>
                        </div>
                      </div>
                    </div>); })}
                </div>
              </div>)}

            {/* Price Chart with Bollinger Bands, Moving Averages, and Volume */}
            <div className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 p-6 border dark:border-gray-500">
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Price Chart with Indicators</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                    📊 <strong>How to read:</strong> Green dashed line = Lower Bollinger Band (potential buy zone), 
                    Red dashed line = Upper Bollinger Band (potential sell zone), 
                    Yellow line = 20-day MA (short-term trend), Purple line = 50-day MA (medium-term trend). 
                    Volume bars on right axis show trading activity.
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                    <strong>Situations to Look For:</strong> Breakout likely: BB squeeze + expanding volume
                </p>
                <div style={{ height: '500px' }}>
                    {getPriceChartData() && (<react_chartjs_2_1.Chart type="line" data={getPriceChartData()} options={priceChartOptions}/>)}
                </div>
            </div>        

            {/* RSI Chart */}
            <div className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 p-6 border dark:border-gray-500">
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">RSI (Relative Strength Index)</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                    Current RSI: <strong className={analysisData.indicators.rsi.value && analysisData.indicators.rsi.value < 30 ? 'text-green-500' : analysisData.indicators.rsi.value && analysisData.indicators.rsi.value > 70 ? 'text-red-500' : 'text-gray-900 dark:text-white'}>
                    {((_a = analysisData.indicators.rsi.value) === null || _a === void 0 ? void 0 : _a.toFixed(2)) || 'N/A'}
                    </strong> - {analysisData.indicators.rsi.description}
                </p>
                <div style={{ height: '300px' }}>
                    {getRSIChartData() && (<react_chartjs_2_1.Line data={getRSIChartData()} options={__assign(__assign({}, chartOptions), { scales: __assign(__assign({}, chartOptions.scales), { y: {
                            min: 0,
                            max: 100,
                            ticks: { color: '#9CA3AF' },
                            grid: { color: 'rgba(156, 163, 175, 0.1)' }
                        } }) })}/>)}
                </div>
            </div>

            {/* MACD Chart */}
            <div className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 p-6 border dark:border-gray-500">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">MACD (Moving Average Convergence Divergence)</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                Current Trend: <strong className={analysisData.indicators.macd.trend === 'bullish' ? 'text-green-500' : 'text-red-500'}>
                  {analysisData.indicators.macd.trend}
                </strong> - {analysisData.indicators.macd.description}
              </p>
              <div style={{ height: '300px' }}>
                {getMACDChartData() && (<react_chartjs_2_1.Chart type="bar" data={getMACDChartData()} options={chartOptions}/>)}
              </div>
            </div>

            {/* Indicator Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Moving Averages */}
              <div className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 p-6 border dark:border-gray-500">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Moving Averages</h3>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600 dark:text-gray-400">20-day SMA:</span>
                    <span className="font-semibold text-gray-900 dark:text-white">
                      ${((_b = analysisData.indicators.moving_averages.sma_20) === null || _b === void 0 ? void 0 : _b.toFixed(2)) || 'N/A'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600 dark:text-gray-400">50-day SMA:</span>
                    <span className="font-semibold text-gray-900 dark:text-white">
                      ${((_c = analysisData.indicators.moving_averages.sma_50) === null || _c === void 0 ? void 0 : _c.toFixed(2)) || 'N/A'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600 dark:text-gray-400">200-day SMA:</span>
                    <span className="font-semibold text-gray-900 dark:text-white">
                      ${((_d = analysisData.indicators.moving_averages.sma_200) === null || _d === void 0 ? void 0 : _d.toFixed(2)) || 'N/A'}
                    </span>
                  </div>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-4">
                  {analysisData.indicators.moving_averages.description}
                </p>
              </div>

              {/* Bollinger Bands */}
              <div className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 p-6 border dark:border-gray-500">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Bollinger Bands</h3>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600 dark:text-gray-400">Upper Band:</span>
                    <span className="font-semibold text-red-500">
                      ${analysisData.indicators.bollinger_bands.upper_band.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600 dark:text-gray-400">Middle Band:</span>
                    <span className="font-semibold text-gray-900 dark:text-white">
                      ${analysisData.indicators.bollinger_bands.middle_band.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600 dark:text-gray-400">Lower Band:</span>
                    <span className="font-semibold text-green-500">
                      ${analysisData.indicators.bollinger_bands.lower_band.toFixed(2)}
                    </span>
                  </div>
                  <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                    <div className="text-sm">
                      <span className="text-gray-600 dark:text-gray-400">Position: </span>
                      <span className="font-semibold text-gray-900 dark:text-white capitalize">
                        {analysisData.indicators.bollinger_bands.position.replace('_', ' ')}
                      </span>
                    </div>
                  </div>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-4">
                  {analysisData.indicators.bollinger_bands.description}
                </p>
              </div>
            </div>
          </div>)}

        {/* Educational Content (shown when no analysis) */}
        {!analysisData && !loading && (<div className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 p-8 border dark:border-gray-500">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">How to Use Technical Analysis</h2>
            
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">📊 RSI (Relative Strength Index)</h3>
                <p className="text-gray-600 dark:text-gray-400">
                  Measures momentum on a scale of 0-100. Below 30 = oversold (potential buy), Above 70 = overbought (potential sell).
                </p>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">📈 MACD (Moving Average Convergence Divergence)</h3>
                <p className="text-gray-600 dark:text-gray-400">
                  Shows trend direction and momentum. Bullish = upward momentum, Bearish = downward momentum. When MACD line crosses above signal line = buy signal.
                </p>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">📉 Moving Averages</h3>
                <p className="text-gray-600 dark:text-gray-400">
                  Average price over time. Price above MA = uptrend, Price below MA = downtrend. 20-day shows short-term trend, 50-day shows medium-term trend.
                </p>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">🎯 Bollinger Bands</h3>
                <p className="text-gray-600 dark:text-gray-400">
                  Show volatility. When price touches lower band = potential bounce opportunity. When price touches upper band = potential reversal down.
                </p>
              </div>
            </div>
          </div>)}
      </div>
    </div>);
};
exports.default = TechnicalAnalysis;
