import React, { Suspense, useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import Landing from './pages/Landing';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Watchlist from './pages/Watchlist';
import Portfolio from './pages/Portfolio';
import Alerts from './pages/Alerts';
import TechnicalAnalysis from './pages/TechnicalAnalysis';
import DCFValuation from './pages/DCFValuation';
import VerifyEmail from './pages/VerifyEmail';
import Pricing from './pages/Pricing';
import RegisterWithPayment from './pages/RegisterWithPayment';
import Stocks from './pages/Stocks';
import { LivePriceProvider } from './contexts/LivePriceContext';
import AccountSettings from './pages/AccountSettings';
import Tutorials from './pages/Tutorials';
import BlogList from './pages/BlogList';
import BlogPost from './pages/BlogPost';
import AdminContent from './pages/AdminContent';
import ResetPassword from './pages/ResetPassword';
import PrivacyPolicy from './pages/PrivacyPolicy';
import TermsConditions from './pages/TermsConditions';
import FAQ from './pages/FAQ';
import OptionsCalculator from './pages/OptionsCalculator';
import SectorHeatmap from './pages/SectorHeatmap';
import Billing from './pages/Billing';
import NotFound from './pages/NotFound';
import { stripeAPI } from './services/api';


const Payment = React.lazy(() => import('./pages/Payment'));

// One-time credentials (reset / verify ?token=) must never reach analytics or ad pixels
const withoutToken = (search: string) => {
  const params = new URLSearchParams(search);
  params.delete('token');
  const rest = params.toString();
  return rest ? `?${rest}` : '';
};

const PageviewTracker: React.FC = () => {
  const location = useLocation();
  useEffect(() => {
    const gtag = (window as any).gtag;
    if (typeof gtag === 'function') {
      const safePath = location.pathname + withoutToken(location.search);
      gtag('config', 'G-69YY52Z36D', {
        page_path: safePath,
        page_location: window.location.origin + safePath,  // GA4 would otherwise send the full URL
      });
    }
  }, [location]);
  return null;
};

// Subscription Guard - routes by subscription state: active/trialing → the page,
// past_due/unpaid → /billing, none → /payment. Navigation only: the server enforces
// the subscription on every API call (api/dependencies.get_current_user), so
// failing open on an error here exposes nothing.
const SubscriptionGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const token = localStorage.getItem('access_token');
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!token) {
      navigate('/login', { replace: true });
      return;
    }

    stripeAPI.getSubscriptionStatus().then(res => {
      const { subscription_status, subscription_tier } = res.data;
      if (subscription_status === 'active' || subscription_status === 'trialing') {
        setReady(true);
      } else if (subscription_status === 'past_due' || subscription_status === 'unpaid') {
        // A payment failed: fix it, never start a second subscription
        navigate('/billing', { replace: true });
      } else {
        // No live subscription (new, cancelled or lapsed): (re)subscribe
        navigate(`/payment?tier=${subscription_tier || 'beginner'}`, { replace: true });
      }
    }).catch(() => {
      setReady(true); // fail open — the API itself still refuses without a subscription
    });
  }, [token, navigate]);

  if (!ready) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }

  return <>{children}</>;
};

function App() {
  return (
    <Router>
      <PageviewTracker />
      <LivePriceProvider>
        <Suspense fallback={<div className="min-h-screen bg-gray-900 flex items-center justify-center"><div className="text-gray-400">Loading...</div></div>}>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<Login />} />
            {/* One sign-up page: without ?tier= it opens on the plan picker */}
            <Route path="/register" element={<RegisterWithPayment />} />
            <Route path="/pricing" element={<Pricing />} />
            <Route path="/verify-email" element={<VerifyEmail />} />
            <Route path="/registerwithpayment" element={<RegisterWithPayment />} />
            <Route path="/stocks" element={<SubscriptionGuard><Stocks /></SubscriptionGuard>} />
            <Route path="/dashboard" element={<SubscriptionGuard><Dashboard /></SubscriptionGuard>} />
            <Route path="/account" element={<SubscriptionGuard><AccountSettings /></SubscriptionGuard>} />
            <Route path="/watchlist" element={<SubscriptionGuard><Watchlist /></SubscriptionGuard>} />
            <Route path="/portfolio" element={<SubscriptionGuard><Portfolio /></SubscriptionGuard>} />
            <Route path="/alerts" element={<SubscriptionGuard><Alerts /></SubscriptionGuard>} />
            <Route path="/technical-analysis" element={<SubscriptionGuard><TechnicalAnalysis /></SubscriptionGuard>} />
            <Route path="/dcf-valuation" element={<SubscriptionGuard><DCFValuation /></SubscriptionGuard>} />
            <Route path="/tutorials" element={<Tutorials />} />
            <Route path="/blogs" element={<BlogList />} />
            <Route path="/blogs/:slug" element={<BlogPost />} />
            <Route path="/admin" element={<AdminContent />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/payment" element={<Payment />} />
            <Route path="/billing" element={<Billing />} />
            <Route path="/privacy" element={<PrivacyPolicy />} />
            <Route path="/terms" element={<TermsConditions />} />
            <Route path="/faq" element={<FAQ />} />
            <Route path="/options-calculator" element={<SubscriptionGuard><OptionsCalculator /></SubscriptionGuard>} />
            <Route path="/sector-heatmap" element={<SubscriptionGuard><SectorHeatmap /></SubscriptionGuard>} />
            {/* Last: any other URL. Retired URLs still linked from outside are 301s in server.js. */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </LivePriceProvider>
    </Router>
  );
}

export default App;