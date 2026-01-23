"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var react_1 = require("react");
var react_router_dom_1 = require("react-router-dom");
var Landing_1 = require("./pages/Landing");
var Login_1 = require("./pages/Login");
var Register_1 = require("./pages/Register");
var Dashboard_1 = require("./pages/Dashboard");
var Watchlist_1 = require("./pages/Watchlist");
var Portfolio_1 = require("./pages/Portfolio");
var Alerts_1 = require("./pages/Alerts");
var TechnicalAnalysis_1 = require("./pages/TechnicalAnalysis");
var DCFValuation_1 = require("./pages/DCFValuation");
var VerifyEmail_1 = require("./pages/VerifyEmail");
var Pricing_1 = require("./pages/Pricing");
var PaymentSuccess_1 = require("./pages/PaymentSuccess");
var RegisterWithPayment_1 = require("./pages/RegisterWithPayment");
var Stocks_1 = require("./pages/Stocks");
// Protected Route Component
var ProtectedRoute = function (_a) {
    var children = _a.children;
    var token = localStorage.getItem('access_token');
    if (!token) {
        return <react_router_dom_1.Navigate to="/login" replace/>;
    }
    return <>{children}</>;
};
function App() {
    return (<react_router_dom_1.BrowserRouter>
      <react_router_dom_1.Routes>
        <react_router_dom_1.Route path="/" element={<Landing_1.default />}/>
        <react_router_dom_1.Route path="/login" element={<Login_1.default />}/>
        <react_router_dom_1.Route path="/register" element={<Register_1.default />}/>
        <react_router_dom_1.Route path="/pricing" element={<Pricing_1.default />}/>
        <react_router_dom_1.Route path="/verify-email" element={<VerifyEmail_1.default />}/>
        <react_router_dom_1.Route path="/payment-success" element={<PaymentSuccess_1.default />}/>
        <react_router_dom_1.Route path="/registerwithpayment" element={<RegisterWithPayment_1.default />}/>
        <react_router_dom_1.Route path="/stocks" element={<ProtectedRoute><Stocks_1.default /></ProtectedRoute>}/>
        <react_router_dom_1.Route path="/dashboard" element={<ProtectedRoute><Dashboard_1.default /></ProtectedRoute>}/>
        <react_router_dom_1.Route path="/watchlist" element={<ProtectedRoute><Watchlist_1.default /></ProtectedRoute>}/>

        <react_router_dom_1.Route path="/portfolio" element={<ProtectedRoute>
              <Portfolio_1.default />
            </ProtectedRoute>}/>

        <react_router_dom_1.Route path="/alerts" element={<ProtectedRoute>
              <Alerts_1.default />
            </ProtectedRoute>}/>

        <react_router_dom_1.Route path="/technical-analysis" element={<ProtectedRoute>
              <TechnicalAnalysis_1.default />
            </ProtectedRoute>}/>

        <react_router_dom_1.Route path="/dcf-valuation" element={<ProtectedRoute>
              <DCFValuation_1.default />
            </ProtectedRoute>}/>
      </react_router_dom_1.Routes>
    </react_router_dom_1.BrowserRouter>);
}
exports.default = App;
