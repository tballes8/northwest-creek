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
var axios_1 = require("axios");
var RegisterWithPayment = function () {
    var navigate = (0, react_router_dom_1.useNavigate)();
    var _a = (0, react_1.useState)('account'), step = _a[0], setStep = _a[1];
    var _b = (0, react_1.useState)('free'), selectedTier = _b[0], setSelectedTier = _b[1];
    var _c = (0, react_1.useState)(null), stripeConfig = _c[0], setStripeConfig = _c[1];
    var _d = (0, react_1.useState)({
        email: '',
        password: '',
        confirmPassword: '',
        full_name: '',
    }), formData = _d[0], setFormData = _d[1];
    var _e = (0, react_1.useState)(''), error = _e[0], setError = _e[1];
    var _f = (0, react_1.useState)(false), loading = _f[0], setLoading = _f[1];
    (0, react_1.useEffect)(function () {
        loadStripeConfig();
    }, []);
    var loadStripeConfig = function () { return __awaiter(void 0, void 0, void 0, function () {
        var response, error_1;
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
                    error_1 = _a.sent();
                    console.error('Failed to load Stripe config:', error_1);
                    return [3 /*break*/, 3];
                case 3: return [2 /*return*/];
            }
        });
    }); };
    var handleAccountSubmit = function (e) { return __awaiter(void 0, void 0, void 0, function () {
        return __generator(this, function (_a) {
            e.preventDefault();
            setError('');
            if (formData.password !== formData.confirmPassword) {
                setError('Passwords do not match');
                return [2 /*return*/];
            }
            if (formData.password.length < 8) {
                setError('Password must be at least 8 characters');
                return [2 /*return*/];
            }
            setStep('plan');
            return [2 /*return*/];
        });
    }); };
    var handlePlanSelection = function (tier) { return __awaiter(void 0, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    setSelectedTier(tier);
                    if (!(tier === 'free')) return [3 /*break*/, 2];
                    // Register with free tier
                    return [4 /*yield*/, registerUser('free')];
                case 1:
                    // Register with free tier
                    _a.sent();
                    return [3 /*break*/, 4];
                case 2:
                    // Show payment confirmation
                    setLoading(true);
                    return [4 /*yield*/, registerUser(tier)];
                case 3:
                    _a.sent();
                    _a.label = 4;
                case 4: return [2 /*return*/];
            }
        });
    }); };
    var registerUser = function (tier) { return __awaiter(void 0, void 0, void 0, function () {
        var loginResponse, priceId, checkoutResponse, err_1;
        var _a, _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    setLoading(true);
                    _c.label = 1;
                case 1:
                    _c.trys.push([1, 7, , 8]);
                    // Create account
                    return [4 /*yield*/, api_1.authAPI.register({
                            email: formData.email,
                            password: formData.password,
                            full_name: formData.full_name,
                        })];
                case 2:
                    // Create account
                    _c.sent();
                    if (!(tier === 'free')) return [3 /*break*/, 3];
                    // Free tier - show success
                    setStep('success');
                    return [3 /*break*/, 6];
                case 3: return [4 /*yield*/, api_1.authAPI.login({
                        email: formData.email,
                        password: formData.password,
                    })];
                case 4:
                    loginResponse = _c.sent();
                    localStorage.setItem('access_token', loginResponse.data.access_token);
                    priceId = tier === 'casual'
                        ? stripeConfig === null || stripeConfig === void 0 ? void 0 : stripeConfig.casual_price_id
                        : tier === 'active'
                            ? stripeConfig === null || stripeConfig === void 0 ? void 0 : stripeConfig.active_price_id
                            : stripeConfig === null || stripeConfig === void 0 ? void 0 : stripeConfig.unlimited_price_id;
                    return [4 /*yield*/, axios_1.default.post('http://localhost:8000/api/v1/stripe/create-checkout-session', { price_id: priceId }, {
                            headers: {
                                Authorization: "Bearer ".concat(loginResponse.data.access_token)
                            }
                        })];
                case 5:
                    checkoutResponse = _c.sent();
                    // Redirect to Stripe
                    window.location.href = checkoutResponse.data.checkout_url;
                    _c.label = 6;
                case 6: return [3 /*break*/, 8];
                case 7:
                    err_1 = _c.sent();
                    setError(((_b = (_a = err_1.response) === null || _a === void 0 ? void 0 : _a.data) === null || _b === void 0 ? void 0 : _b.detail) || 'Registration failed. Please try again.');
                    setLoading(false);
                    return [3 /*break*/, 8];
                case 8: return [2 /*return*/];
            }
        });
    }); };
    var pricingTiers = [
        {
            name: 'Free',
            tier: 'free',
            price: '$0',
            period: 'forever',
            features: [
                '5 watchlist stocks',
                '5 portfolio entries',
                '5 stock reviews',
                'Real-time market data',
            ],
            highlight: false,
        },
        {
            name: 'Casual Retail Investor',
            tier: 'casual',
            price: '$20',
            period: '/month',
            features: [
                '20 watchlist stocks',
                '20 portfolio entries',
                '5 stock reviews/week',
                '5 DCF valuations/week',
                'Technical Analysis',
            ],
            highlight: true,
        },
        {
            name: 'Active Retail Investor',
            tier: 'active',
            price: '$40',
            period: '/month',
            features: [
                '45 watchlist stocks',
                '45 portfolio entries',
                '5 stock reviews/day',
                '5 DCF valuations/day',
                'Advanced Technical Analysis',
            ],
            highlight: false,
        },
        {
            name: 'Unlimited Investor',
            tier: 'unlimited',
            price: '$100',
            period: '/month',
            features: [
                'Unlimited watchlist stocks',
                'Unlimited portfolio entries',
                'Unlimited stock reviews',
                'Unlimited DCF valuations',
                'API access',
            ],
            highlight: false,
        },
    ];
    return (<div className="min-h-screen bg-gradient-to-br from-teal-50 via-white to-emerald-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto">
        {/* Progress Steps */}
        <div className="mb-8">
          <div className="flex items-center justify-center">
            <div className={"flex items-center ".concat(step === 'account' ? 'text-primary-600' : 'text-gray-400')}>
              <div className={"w-10 h-10 rounded-full flex items-center justify-center border-2 ".concat(step === 'account' ? 'border-primary-600 bg-primary-600 text-white' : 'border-gray-300')}>
                1
              </div>
              <span className="ml-2 font-medium">Create Account</span>
            </div>
            
            <div className="w-16 h-1 mx-4 bg-gray-300"></div>
            
            <div className={"flex items-center ".concat(step === 'plan' ? 'text-primary-600' : 'text-gray-400')}>
              <div className={"w-10 h-10 rounded-full flex items-center justify-center border-2 ".concat(step === 'plan' ? 'border-primary-600 bg-primary-600 text-white' : 'border-gray-300')}>
                2
              </div>
              <span className="ml-2 font-medium">Choose Plan</span>
            </div>
            
            <div className="w-16 h-1 mx-4 bg-gray-300"></div>
            
            <div className={"flex items-center ".concat(step === 'success' ? 'text-primary-600' : 'text-gray-400')}>
              <div className={"w-10 h-10 rounded-full flex items-center justify-center border-2 ".concat(step === 'success' ? 'border-primary-600 bg-primary-600 text-white' : 'border-gray-300')}>
                3
              </div>
              <span className="ml-2 font-medium">Complete</span>
            </div>
          </div>
        </div>

        {/* Step 1: Account Creation */}
        {step === 'account' && (<div className="max-w-md mx-auto">
            <div className="text-center mb-6">
              <react_router_dom_1.Link to="/">
                <img src="/images/logo.png" alt="Northwest Creek" className="h-16 w-16 mx-auto"/>
              </react_router_dom_1.Link>
              <h2 className="mt-4 text-3xl font-extrabold text-gray-900 dark:text-white">
                Create your account
              </h2>
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                Already have an account?{' '}
                <react_router_dom_1.Link to="/login" className="font-medium text-primary-600 dark:text-primary-400 hover:underline">
                  Sign in
                </react_router_dom_1.Link>
              </p>
            </div>

            <div className="bg-white dark:bg-gray-700 py-8 px-6 shadow-xl rounded-lg border dark:border-gray-500">
              <form onSubmit={handleAccountSubmit} className="space-y-6">
                {error && (<div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 text-red-600 dark:text-red-400 px-4 py-3 rounded-lg">
                    {error}
                  </div>)}

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Full name
                  </label>
                  <input type="text" value={formData.full_name} onChange={function (e) { return setFormData(__assign(__assign({}, formData), { full_name: e.target.value })); }} className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white"/>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Email address
                  </label>
                  <input type="email" required value={formData.email} onChange={function (e) { return setFormData(__assign(__assign({}, formData), { email: e.target.value })); }} className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white"/>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Password
                  </label>
                  <input type="password" required value={formData.password} onChange={function (e) { return setFormData(__assign(__assign({}, formData), { password: e.target.value })); }} className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white"/>
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    Must be at least 8 characters
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Confirm password
                  </label>
                  <input type="password" required value={formData.confirmPassword} onChange={function (e) { return setFormData(__assign(__assign({}, formData), { confirmPassword: e.target.value })); }} className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white"/>
                </div>

                <button type="submit" className="w-full py-3 px-4 bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-lg transition-colors">
                  Continue to Plan Selection
                </button>
              </form>
            </div>
          </div>)}

        {/* Step 2: Plan Selection */}
        {step === 'plan' && (<div>
            <div className="text-center mb-8">
              <h2 className="text-3xl font-extrabold text-gray-900 dark:text-white">
                Choose Your Plan
              </h2>
              <p className="mt-2 text-gray-600 dark:text-gray-400">
                Start with our free tier or upgrade for advanced features
              </p>
            </div>

            {error && (<div className="max-w-2xl mx-auto mb-6 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 text-red-600 dark:text-red-400 px-4 py-3 rounded-lg">
                {error}
              </div>)}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {pricingTiers.map(function (tier) { return (<div key={tier.tier} className={"bg-white dark:bg-gray-700 rounded-xl shadow-lg border p-6 ".concat(tier.highlight ? 'ring-2 ring-primary-500' : 'dark:border-gray-500')}>
                  {tier.highlight && (<div className="text-center mb-2">
                      <span className="bg-primary-600 text-white px-3 py-1 rounded-full text-xs font-semibold">
                        POPULAR
                      </span>
                    </div>)}
                  
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                    {tier.name}
                  </h3>
                  
                  <div className="mb-4">
                    <span className="text-3xl font-extrabold text-gray-900 dark:text-white">
                      {tier.price}
                    </span>
                    {tier.period && (<span className="text-gray-600 dark:text-gray-400 text-sm">
                        {tier.period}
                      </span>)}
                  </div>

                  <ul className="space-y-2 mb-6">
                    {tier.features.map(function (feature, idx) { return (<li key={idx} className="flex items-start text-sm">
                        <svg className="h-5 w-5 text-green-500 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"/>
                        </svg>
                        <span className="text-gray-900 dark:text-white">{feature}</span>
                      </li>); })}
                  </ul>

                  <button onClick={function () { return handlePlanSelection(tier.tier); }} disabled={loading} className={"w-full py-3 px-4 rounded-lg font-semibold transition-colors ".concat(tier.highlight
                    ? 'bg-primary-600 hover:bg-primary-700 text-white'
                    : 'bg-gray-900 hover:bg-gray-800 dark:bg-gray-600 dark:hover:bg-gray-500 text-white', " disabled:opacity-50 disabled:cursor-not-allowed")}>
                    {loading && selectedTier === tier.tier
                    ? 'Processing...'
                    : tier.tier === 'free'
                        ? 'Start Free'
                        : "Choose ".concat(tier.name)}
                  </button>
                </div>); })}
            </div>

            <div className="mt-6 text-center">
              <button onClick={function () { return setStep('account'); }} className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white">
                ← Back to Account Details
              </button>
            </div>
          </div>)}

        {/* Step 3: Success */}
        {step === 'success' && (<div className="max-w-md mx-auto">
            <div className="bg-white dark:bg-gray-700 py-8 px-6 shadow-xl rounded-lg border dark:border-gray-500 text-center">
              <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-green-100 dark:bg-green-900/50 mb-4">
                <svg className="h-10 w-10 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
                </svg>
              </div>
              
              <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                Check Your Email!
              </h3>
              
              <p className="text-gray-600 dark:text-gray-400 mb-4">
                We've sent a verification link to <strong>{formData.email}</strong>
              </p>
              
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
                Click the link in the email to verify your account and start using Northwest Creek.
              </p>
              
              <react_router_dom_1.Link to="/login" className="inline-block px-6 py-3 bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-lg transition-colors">
                Go to Login
              </react_router_dom_1.Link>
            </div>
          </div>)}
      </div>
    </div>);
};
exports.default = RegisterWithPayment;
