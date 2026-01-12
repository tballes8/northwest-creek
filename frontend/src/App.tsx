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
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/dashboard" 
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          } 
        />

        <Route path="/watchlist" 
          element={
            <ProtectedRoute>
              <Watchlist />
            </ProtectedRoute>
          } 
        />

        <Route path="/portfolio" 
          element={
            <ProtectedRoute>
              <Portfolio />
            </ProtectedRoute>
          } 
        />

        <Route path="/alerts" 
          element={
            <ProtectedRoute>
              <Alerts />
            </ProtectedRoute>
          } 
        />

        <Route path="/technical-analysis" 
          element={
            <ProtectedRoute>
              <TechnicalAnalysis />
            </ProtectedRoute>
          } 
        />

        <Route path="/dcf-valuation" 
          element={
            <ProtectedRoute>
              <DCFValuation />
            </ProtectedRoute>
          } 
        />

        <Route path="/verify-email" element={<VerifyEmail />} />
      </Routes>
    </Router>
  );
}

export default App;