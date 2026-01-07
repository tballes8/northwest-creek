import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Landing from './pages/Landing';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';

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
        <Route 
          path="/dashboard" 
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          } 
        />
        {/* Placeholder routes for future pages */}
        <Route path="/watchlist" element={<ProtectedRoute><div className="p-8">Watchlist page coming soon!</div></ProtectedRoute>} />
        <Route path="/portfolio" element={<ProtectedRoute><div className="p-8">Portfolio page coming soon!</div></ProtectedRoute>} />
        <Route path="/alerts" element={<ProtectedRoute><div className="p-8">Alerts page coming soon!</div></ProtectedRoute>} />
      </Routes>
    </Router>
  );
}

export default App;