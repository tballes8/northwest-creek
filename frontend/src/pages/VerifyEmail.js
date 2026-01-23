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
var axios_1 = require("axios");
var VerifyEmail = function () {
    var searchParams = (0, react_router_dom_1.useSearchParams)()[0];
    var navigate = (0, react_router_dom_1.useNavigate)();
    var _a = (0, react_1.useState)('verifying'), status = _a[0], setStatus = _a[1];
    var _b = (0, react_1.useState)(''), message = _b[0], setMessage = _b[1];
    (0, react_1.useEffect)(function () {
        var verifyEmail = function () { return __awaiter(void 0, void 0, void 0, function () {
            var token, response, err_1;
            var _a, _b;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        token = searchParams.get('token');
                        if (!token) {
                            setStatus('error');
                            setMessage('Invalid verification link');
                            return [2 /*return*/];
                        }
                        _c.label = 1;
                    case 1:
                        _c.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, axios_1.default.get("http://localhost:8000/api/v1/auth/verify-email?token=".concat(token))];
                    case 2:
                        response = _c.sent();
                        setStatus('success');
                        setMessage(response.data.message);
                        // Redirect to login after 3 seconds
                        setTimeout(function () {
                            navigate('/login');
                        }, 3000);
                        return [3 /*break*/, 4];
                    case 3:
                        err_1 = _c.sent();
                        setStatus('error');
                        setMessage(((_b = (_a = err_1.response) === null || _a === void 0 ? void 0 : _a.data) === null || _b === void 0 ? void 0 : _b.detail) || 'Verification failed. Please try again.');
                        return [3 /*break*/, 4];
                    case 4: return [2 /*return*/];
                }
            });
        }); };
        verifyEmail();
    }, [searchParams, navigate]);
    return (<div className="min-h-screen bg-gradient-to-br from-teal-50 via-white to-emerald-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <react_router_dom_1.Link to="/" className="flex justify-center">
          <img src="/images/logo.png" alt="Northwest Creek" className="h-50 w-50"/>
        </react_router_dom_1.Link>
        
        <div className="mt-8 bg-white dark:bg-gray-700 py-8 px-4 shadow-xl dark:shadow-gray-200/20 sm:rounded-lg sm:px-10 border dark:border-gray-500">
          <div className="text-center">
            {status === 'verifying' && (<>
                <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-primary-100 dark:bg-primary-900/50">
                  <svg className="animate-spin h-6 w-6 text-primary-600 dark:text-primary-400" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                </div>
                <h3 className="mt-4 text-lg font-medium text-gray-900 dark:text-white">Verifying your email...</h3>
                <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">Please wait</p>
              </>)}
            
            {status === 'success' && (<>
                <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100 dark:bg-green-900/50">
                  <svg className="h-6 w-6 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
                  </svg>
                </div>
                <h3 className="mt-4 text-lg font-medium text-gray-900 dark:text-white">Email Verified!</h3>
                <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">{message}</p>
                <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Redirecting to login...</p>
                <div className="mt-6">
                  <react_router_dom_1.Link to="/login" className="text-primary-600 dark:text-primary-400 hover:text-primary-500 dark:hover:text-primary-300 font-medium">
                    Go to Login Now
                  </react_router_dom_1.Link>
                </div>
              </>)}
            
            {status === 'error' && (<>
                <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100 dark:bg-red-900/50">
                  <svg className="h-6 w-6 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                  </svg>
                </div>
                <h3 className="mt-4 text-lg font-medium text-gray-900 dark:text-white">Verification Failed</h3>
                <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">{message}</p>
                <div className="mt-6 space-y-3">
                  <react_router_dom_1.Link to="/register" className="block text-primary-600 dark:text-primary-400 hover:text-primary-500 dark:hover:text-primary-300 font-medium">
                    Register Again
                  </react_router_dom_1.Link>
                  <react_router_dom_1.Link to="/login" className="block text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white">
                    Back to Login
                  </react_router_dom_1.Link>
                </div>
              </>)}
          </div>
        </div>
      </div>
    </div>);
};
exports.default = VerifyEmail;
