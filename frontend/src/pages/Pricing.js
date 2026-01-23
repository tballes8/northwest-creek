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
var Pricing = function () {
    var navigate = (0, react_router_dom_1.useNavigate)();
    var _a = (0, react_1.useState)(null), user = _a[0], setUser = _a[1];
    var _b = (0, react_1.useState)(true), loading = _b[0], setLoading = _b[1];
    var _c = (0, react_1.useState)(null), stripeConfig = _c[0], setStripeConfig = _c[1];
    (0, react_1.useEffect)(function () {
        loadUser();
        loadStripeConfig();
    }, []);
    var loadUser = function () { return __awaiter(void 0, void 0, void 0, function () {
        var response, error_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, 3, 4]);
                    return [4 /*yield*/, api_1.authAPI.getCurrentUser()];
                case 1:
                    response = _a.sent();
                    setUser(response.data);
                    return [3 /*break*/, 4];
                case 2:
                    error_1 = _a.sent();
                    console.error('Failed to load user:', error_1);
                    return [3 /*break*/, 4];
                case 3:
                    setLoading(false);
                    return [7 /*endfinally*/];
                case 4: return [2 /*return*/];
            }
        });
    }); };
    var loadStripeConfig = function () { return __awaiter(void 0, void 0, void 0, function () {
        var response, error_2;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, axios_1.default.get('http://localhost:8000/api/v1/stripe/config')];
                case 1:
                    response = _a.sent();
                    setStripeConfig(response.data);
                    return [3 /*break*/, 3];
                case 2:
                    error_2 = _a.sent();
                    console.error('Failed to load Stripe config:', error_2);
                    return [3 /*break*/, 3];
                case 3: return [2 /*return*/];
            }
        });
    }); };
    var handleUpgrade = function (tier, priceId) { return __awaiter(void 0, void 0, void 0, function () {
        var token, response, error_3;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    token = localStorage.getItem('access_token');
                    if (!token) {
                        navigate('/login');
                        return [2 /*return*/];
                    }
                    return [4 /*yield*/, axios_1.default.post('http://localhost:8000/api/v1/stripe/create-checkout-session', { price_id: priceId }, { headers: { Authorization: "Bearer ".concat(token) } })];
                case 1:
                    response = _a.sent();
                    // Redirect to Stripe Checkout
                    window.location.href = response.data.checkout_url;
                    return [3 /*break*/, 3];
                case 2:
                    error_3 = _a.sent();
                    console.error('Failed to create checkout session:', error_3);
                    alert('Failed to start checkout. Please try again.');
                    return [3 /*break*/, 3];
                case 3: return [2 /*return*/];
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
    var pricingTiers = [
        {
            name: 'Free',
            tierSlug: 'free',
            price: '$0',
            period: 'forever',
            description: 'Perfect for getting started with stock tracking',
            features: [
                { text: '5 watchlist stocks', included: true },
                { text: '5 portfolio entries', included: true },
                { text: '5 stock reviews', included: true },
                { text: 'Real-time market data', included: true },
                { text: 'Basic stock search', included: true },
                { text: 'Technical Analysis', included: false },
                { text: 'DCF Valuation', included: false },
                { text: 'Advanced charts', included: false },
            ],
            buttonText: 'Get Started',
            buttonLink: '/register',
            priceId: '',
            current: (user === null || user === void 0 ? void 0 : user.subscription_tier) === 'free',
            highlight: false,
        },
        {
            name: 'Casual Retail Investor',
            tierSlug: 'casual',
            price: '$20',
            period: 'per month',
            description: 'For investors tracking a moderate portfolio',
            features: [
                { text: '20 watchlist stocks', included: true },
                { text: '20 portfolio entries', included: true },
                { text: '5 stock reviews per week', included: true },
                { text: '5 DCF valuations per week', included: true },
                { text: 'Real-time market data', included: true },
                { text: 'Technical Analysis', included: true },
                { text: 'Advanced charts', included: true },
                { text: 'Email support', included: true },
                { text: 'Export to Excel/CSV', included: true },
            ],
            buttonText: (user === null || user === void 0 ? void 0 : user.subscription_tier) === 'casual' ? 'Current Plan' : 'Upgrade to Casual',
            buttonLink: '/registerwithpayments',
            priceId: 'casual',
            current: (user === null || user === void 0 ? void 0 : user.subscription_tier) === 'casual',
            highlight: true,
        },
        {
            name: 'Active Retail Investor',
            tierSlug: 'active',
            price: '$40',
            period: 'per month',
            description: 'For active traders with larger portfolios',
            features: [
                { text: '45 watchlist stocks', included: true },
                { text: '45 portfolio entries', included: true },
                { text: '5 stock reviews daily', included: true },
                { text: '5 DCF valuations daily', included: true },
                { text: 'Real-time market data', included: true },
                { text: 'Advanced Technical Analysis', included: true },
                { text: 'Premium charting tools', included: true },
                { text: 'Historical data (5 years)', included: true },
                { text: 'Priority email support', included: true },
                { text: 'Custom alerts', included: true },
            ],
            buttonText: (user === null || user === void 0 ? void 0 : user.subscription_tier) === 'active' ? 'Current Plan' : 'Upgrade to Active',
            buttonLink: '/registerwithpayments',
            priceId: 'active',
            current: (user === null || user === void 0 ? void 0 : user.subscription_tier) === 'active',
            highlight: false,
        },
        {
            name: 'Unlimited Investor',
            tierSlug: 'unlimited',
            price: '$100',
            period: 'per month',
            description: 'Ultimate tools for professional traders',
            features: [
                { text: 'Unlimited watchlist stocks', included: true },
                { text: 'Unlimited portfolio entries', included: true },
                { text: 'Unlimited stock reviews', included: true },
                { text: 'Unlimited DCF valuations', included: true },
                { text: 'Real-time market data', included: true },
                { text: 'Advanced Technical Analysis', included: true },
                { text: 'Professional charting suite', included: true },
                { text: 'Historical data (unlimited)', included: true },
                { text: 'API access', included: true },
                { text: 'Priority chat support', included: true },
                { text: 'Custom integrations', included: true },
                { text: 'White-glove onboarding', included: true },
            ],
            buttonText: (user === null || user === void 0 ? void 0 : user.subscription_tier) === 'unlimited' ? 'Current Plan' : 'Upgrade to Unlimited',
            buttonLink: '/registerwithpayments',
            priceId: 'unlimited',
            current: (user === null || user === void 0 ? void 0 : user.subscription_tier) === 'unlimited',
            highlight: false,
        },
    ];
    return (<div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      {/* Navigation */}
      <nav className="bg-gray-800 dark:bg-gray-900 shadow-sm border-b border-gray-700 dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <react_router_dom_1.Link to="/" className="flex items-center">
                <img src="/images/logo.png" alt="Northwest Creek" className="h-10 w-10 mr-3"/>
                <span className="text-xl font-bold text-primary-400">Northwest Creek</span>
              </react_router_dom_1.Link>
            </div>
            
            <div className="flex items-center space-x-4">
              <ThemeToggle_1.default />
              {user ? (<>
                  <react_router_dom_1.Link to="/dashboard" className="text-gray-300 hover:text-white text-sm font-medium">
                    Dashboard
                  </react_router_dom_1.Link>
                  <span className="text-sm text-gray-300">{user.email}</span>
                  {getTierBadge(user.subscription_tier)}
                  <button onClick={handleLogout} className="text-gray-300 hover:text-white text-sm font-medium">
                    Logout
                  </button>
                </>) : (<>
                  <react_router_dom_1.Link to="/login" className="text-gray-300 hover:text-white text-sm font-medium">
                    Login
                  </react_router_dom_1.Link>
                  <react_router_dom_1.Link to="/register" className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg text-sm font-medium">
                    Sign Up
                  </react_router_dom_1.Link>
                </>)}
            </div>
          </div>
        </div>
      </nav>

      {/* Header */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center">
        <h1 className="text-5xl font-extrabold text-gray-900 dark:text-white mb-4">
          Choose Your Plan
        </h1>
        <p className="text-xl text-gray-600 dark:text-gray-400 max-w-3xl mx-auto">
          Start with our free tier and upgrade anytime as your needs grow. All plans include real-time market data.
        </p>
        {user && (<div className="mt-4 inline-flex items-center px-4 py-2 bg-primary-50 dark:bg-primary-900/30 rounded-lg border border-primary-200 dark:border-primary-800">
            <span className="text-primary-900 dark:text-primary-200 font-medium">
              Your current plan: {getTierBadge(user.subscription_tier)}
            </span>
          </div>)}
      </div>

      {/* Pricing Cards */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {pricingTiers.map(function (tier) { return (<div key={tier.tierSlug} className={"relative bg-white dark:bg-gray-700 rounded-xl shadow-xl dark:shadow-gray-200/20 overflow-hidden transition-transform hover:scale-105 ".concat(tier.highlight ? 'ring-4 ring-primary-500 dark:ring-primary-400' : 'border dark:border-gray-500')}>
              {tier.highlight && (<div className="absolute top-0 right-0 bg-primary-600 text-white px-4 py-1 rounded-bl-lg text-sm font-semibold">
                  POPULAR
                </div>)}
              
              {tier.current && (<div className="absolute top-0 left-0 bg-green-600 text-white px-4 py-1 rounded-br-lg text-sm font-semibold">
                  CURRENT
                </div>)}

              <div className="p-6">
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                  {tier.name}
                </h3>
                <div className="mb-4">
                  <span className="text-4xl font-extrabold text-gray-900 dark:text-white">
                    {tier.price}
                  </span>
                  {tier.period && (<span className="text-gray-600 dark:text-gray-400 ml-2 text-sm">
                      {tier.period}
                    </span>)}
                </div>
                <p className="text-gray-600 dark:text-gray-400 text-sm mb-6">
                  {tier.description}
                </p>

                {/* Features List */}
                <ul className="space-y-2 mb-6">
                  {tier.features.map(function (feature, index) { return (<li key={index} className="flex items-start text-sm">
                      {feature.included ? (<svg className="h-5 w-5 text-green-500 mr-2 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"/>
                        </svg>) : (<svg className="h-5 w-5 text-gray-400 mr-2 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/>
                        </svg>)}
                      <span className={feature.included ? 'text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-500'}>
                        {feature.text}
                      </span>
                    </li>); })}
                </ul>

                {/* CTA Button */}
                {tier.current ? (<button disabled className="w-full px-6 py-3 bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-400 font-semibold rounded-lg cursor-not-allowed">
                    Current Plan
                </button>) : tier.priceId ? (<button onClick={function () { return handleUpgrade(tier.name, tier.priceId === 'pro' ? stripeConfig === null || stripeConfig === void 0 ? void 0 : stripeConfig.pro_price_id : stripeConfig === null || stripeConfig === void 0 ? void 0 : stripeConfig.enterprise_price_id); }} className={"w-full px-6 py-3 font-semibold rounded-lg transition-colors ".concat(tier.highlight
                    ? 'bg-primary-600 hover:bg-primary-700 text-white'
                    : 'bg-gray-900 hover:bg-gray-800 dark:bg-gray-600 dark:hover:bg-gray-500 text-white')}>
                    {tier.buttonText}
                </button>) : (<react_router_dom_1.Link to="/register" className="block w-full px-6 py-3 text-center bg-gray-900 hover:bg-gray-800 dark:bg-gray-600 dark:hover:bg-gray-500 text-white font-semibold rounded-lg transition-colors">
                    Get Started
                </react_router_dom_1.Link>)}
              </div>
            </div>); })}
        </div>
      </div>

      {/* Feature Comparison Table */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-16">
        <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-8 text-center">
          Compare Plans
        </h2>
        <div className="bg-white dark:bg-gray-700 rounded-xl shadow-xl dark:shadow-gray-200/20 overflow-hidden border dark:border-gray-500">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-600">
              <thead className="bg-gray-50 dark:bg-gray-800">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Feature
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Free
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Casual
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Active
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Unlimited
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-700 divide-y divide-gray-200 dark:divide-gray-600">
                <tr>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white font-medium">
                    Watchlist Stocks
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-center text-gray-600 dark:text-gray-400">5</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-center text-gray-600 dark:text-gray-400">20</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-center text-gray-600 dark:text-gray-400">45</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-center text-green-600 dark:text-green-400 font-semibold">Unlimited</td>
                </tr>
                <tr className="bg-gray-50 dark:bg-gray-800">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white font-medium">
                    Portfolio Entries
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-center text-gray-600 dark:text-gray-400">5</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-center text-gray-600 dark:text-gray-400">20</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-center text-gray-600 dark:text-gray-400">45</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-center text-green-600 dark:text-green-400 font-semibold">Unlimited</td>
                </tr>
                <tr>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white font-medium">
                    Stock Reviews
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-center text-gray-600 dark:text-gray-400">5 total</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-center text-gray-600 dark:text-gray-400">5/week</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-center text-gray-600 dark:text-gray-400">5/day</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-center text-green-600 dark:text-green-400 font-semibold">Unlimited</td>
                </tr>
                <tr className="bg-gray-50 dark:bg-gray-800">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white font-medium">
                    DCF Valuations
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-center">
                    <span className="text-gray-400">—</span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-center text-gray-600 dark:text-gray-400">5/week</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-center text-gray-600 dark:text-gray-400">5/day</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-center text-green-600 dark:text-green-400 font-semibold">Unlimited</td>
                </tr>
                <tr>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white font-medium">
                    Technical Analysis
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-center">
                    <span className="text-gray-400">—</span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-center">
                    <span className="text-green-500">✓</span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-center">
                    <span className="text-green-500">✓</span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-center">
                    <span className="text-green-500">✓</span>
                  </td>
                </tr>
                <tr className="bg-gray-50 dark:bg-gray-800">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white font-medium">
                    API Access
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-center">
                    <span className="text-gray-400">—</span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-center">
                    <span className="text-gray-400">—</span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-center">
                    <span className="text-gray-400">—</span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-center">
                    <span className="text-green-500">✓</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* FAQ Section */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pb-16">
        <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-8 text-center">
          Frequently Asked Questions
        </h2>
        <div className="space-y-6">
          <div className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 p-6 border dark:border-gray-500">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              Can I switch plans anytime?
            </h3>
            <p className="text-gray-600 dark:text-gray-400">
              Yes! You can upgrade or downgrade your plan at any time. Changes take effect immediately, and we'll prorate any charges.
            </p>
          </div>

          <div className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 p-6 border dark:border-gray-500">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              What payment methods do you accept?
            </h3>
            <p className="text-gray-600 dark:text-gray-400">
              We accept all major credit cards and debit cards through our secure Stripe payment processing.
            </p>
          </div>

          <div className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 p-6 border dark:border-gray-500">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              What happens when I reach my limits?
            </h3>
            <p className="text-gray-600 dark:text-gray-400">
              You'll receive a notification when you're approaching your plan limits. You can upgrade anytime to increase your limits.
            </p>
          </div>

          <div className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 p-6 border dark:border-gray-500">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              Do you offer annual subscriptions?
            </h3>
            <p className="text-gray-600 dark:text-gray-400">
              Yes! Save 20% when you choose annual billing. Contact us at <a href="mailto:support@northwestcreek.com" className="text-primary-600 dark:text-primary-400 hover:underline">support@northwestcreek.com</a> for details.
            </p>
          </div>
        </div>
      </div>

      {/* Contact Section */}
      <div className="bg-gradient-to-r from-primary-600 to-purple-600 py-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl font-bold text-white mb-4">
            Need Help Choosing a Plan?
          </h2>
          <p className="text-primary-100 mb-8 text-lg">
            Our team is here to help you find the perfect plan for your needs.
          </p>
          <div className="flex flex-col sm:flex-row justify-center gap-4">
            
              href="mailto:support@northwestcreek.com"
              className="px-8 py-3 bg-white text-primary-600 font-semibold rounded-lg hover:bg-gray-100 transition-colors"
            <a>
              Email Us
            </a>
            <react_router_dom_1.Link to="/dashboard" className="px-8 py-3 bg-transparent border-2 border-white text-white font-semibold rounded-lg hover:bg-white hover:text-primary-600 transition-colors">
              Back to Dashboard
            </react_router_dom_1.Link>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-gray-800 dark:bg-gray-900 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <p className="text-gray-400">
            © 2026 Northwest Creek. All rights reserved.
          </p>
          <div className="mt-4 space-x-6">
            <a href="#" className="text-gray-400 hover:text-white text-sm">Terms of Service</a>
            <a href="#" className="text-gray-400 hover:text-white text-sm">Privacy Policy</a>
            <a href="mailto:support@northwestcreek.com" className="text-gray-400 hover:text-white text-sm">Support</a>
          </div>
        </div>
      </footer>
    </div>);
};
exports.default = Pricing;
