import React, { Suspense, useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import Landing from './pages/Landing';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Watchlist from './pages/Watchlist';
import Portfolio from './pages/Portfolio';
import Alerts from './pages/Alerts';
import TechnicalAnalysis from './pages/TechnicalAnalysis';
import DCFValuation from './pages/DCFValuation';
import VerifyEmail from './pages/VerifyEmail';
import Pricing from './pages/Pricing';
import PaymentSuccess from './pages/PaymentSuccess';
import RegisterWithPayment from './pages/RegisterWithPayment';
import Stocks from './pages/Stocks';
import { LivePriceProvider } from './contexts/LivePriceContext';
import AccountSettings from './pages/AccountSettings';
import Tutorials from './pages/Tutorials';
import BlogList from './pages/BlogList';
import BlogPost from './pages/BlogPost';
import AdminContent from './pages/AdminContent';
import ResetPassword from './pages/ResetPassword';
import WaitlistLanding from './pages/WaitlistLanding';
import PrivacyPolicy from './pages/PrivacyPolicy';
import TermsConditions from './pages/TermsConditions';
import FAQ from './pages/FAQ';
import OptionsCalculator from './pages/OptionsCalculator';
import SectorHeatmap from './pages/SectorHeatmap';


const Payment = React.lazy(() => import('./pages/Payment'));

const PageviewTracker: React.FC = () => {
  const location = useLocation();
  useEffect(() => {
    const gtag = (window as any).gtag;
    if (typeof gtag === 'function') {
      gtag('config', 'G-69YY52Z36D', { page_path: location.pathname + location.search });
    }
  }, [location]);
  return null;
};

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

// Subscription Guard - checks auth token AND active/trialing Stripe subscription
const SubscriptionGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const token = localStorage.getItem('access_token');
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!token) {
      navigate('/login', { replace: true });
      return;
    }

    axios.get(`${API_URL}/api/v1/stripe/subscription-status`, {
      headers: { Authorization: `Bearer ${token}` }
    }).then(res => {
      const { subscription_status, subscription_tier } = res.data;
      if (!subscription_status) {
        navigate(`/payment?tier=${subscription_tier || 'beginner'}`, { replace: true });
      } else {
        setReady(true);
      }
    }).catch(() => {
      setReady(true); // fail open — don't block on API error
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
            <Route path="/waitlist" element={<WaitlistLanding />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/pricing" element={<Pricing />} />
            <Route path="/verify-email" element={<VerifyEmail />} />
            <Route path="/payment-success" element={<PaymentSuccess />} />
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
            <Route path="/privacy" element={<PrivacyPolicy />} />
            <Route path="/terms" element={<TermsConditions />} />
            <Route path="/faq" element={<FAQ />} />
            <Route path="/options-calculator" element={<SubscriptionGuard><OptionsCalculator /></SubscriptionGuard>} />
            <Route path="/sector-heatmap" element={<SubscriptionGuard><SectorHeatmap /></SubscriptionGuard>} />
          </Routes>
        </Suspense>
      </LivePriceProvider>
    </Router>
  );
}

export default App;