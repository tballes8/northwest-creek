import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
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
import Payment from './pages/Payment';
import AccountSettings from './pages/AccountSettings';
import Tutorials from './pages/Tutorials';
import BlogList from './pages/BlogList';
import BlogPost from './pages/BlogPost';
import AdminContent from './pages/AdminContent';
import ResetPassword from './pages/ResetPassword';


// Protected Route Component
const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const token = localStorage.getItem('access_token');
  
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  
  return <>{children}</>;
};

function App() {
  return (
    <Router>
      <LivePriceProvider>
        <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/pricing" element={<Pricing />} />
        <Route path="/verify-email" element={<VerifyEmail />} />
        <Route path="/payment-success" element={<PaymentSuccess />} />
        <Route path="/registerwithpayment" element={<RegisterWithPayment />} />
        <Route path="/stocks" element={<ProtectedRoute><Stocks /></ProtectedRoute>} />
        <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/payment" element={<Payment />} />
        <Route path="/account" element={<AccountSettings />} />          
        <Route path="/watchlist" element={<ProtectedRoute><Watchlist /></ProtectedRoute>} />
        <Route path="/portfolio" element={<ProtectedRoute><Portfolio /></ProtectedRoute>} />
        <Route path="/alerts" element={<ProtectedRoute><Alerts /></ProtectedRoute>} />
        <Route path="/technical-analysis" element={<ProtectedRoute><TechnicalAnalysis /></ProtectedRoute>} />
        <Route path="/dcf-valuation" element={<ProtectedRoute><DCFValuation /></ProtectedRoute>} />
        <Route path="/tutorials" element={<Tutorials />} />
        <Route path="/blogs" element={<BlogList />} />
        <Route path="/blogs/:slug" element={<BlogPost />} />
        <Route path="/admin" element={<AdminContent />} />
        <Route path="/reset-password" element={<ResetPassword />} />
      </Routes>
      </LivePriceProvider>
    </Router>
  );
}

export default App;