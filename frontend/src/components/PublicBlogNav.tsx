import React from 'react';
import { Link } from 'react-router-dom';

const PublicBlogNav: React.FC = () => {
  return (
    <nav className="bg-gray-900 shadow-sm border-b border-gray-700">
      <div className="flex items-center justify-between h-16 px-4 sm:px-6 lg:px-8">
        {/* Logo */}
        <Link to="/" className="flex items-center shrink-0">
          <img src="/images/logo.png" alt="NWC-Analytics" className="h-10 w-10 mr-3" />
          <span
            className="text-xl font-bold text-primary-400 hidden sm:inline"
            style={{ fontFamily: "'Viner Hand ITC', 'Caveat', cursive", fontSize: '1.8rem', fontStyle: 'italic' }}
          >
            NWC-Analytics
          </span>
        </Link>

        {/* Tagline */}
        <span className="hidden md:inline text-sm text-gray-400 font-medium"
              style={{ fontFamily: "'Viner Hand ITC', 'Caveat', cursive", fontSize: '1.5rem', fontStyle: 'italic' }}
        >
          Professional Stock Analysis for Retail Investors
        </span>

        {/* CTA buttons */}
        <div className="flex items-center gap-3">
          <Link to="/pricing"
            className="px-4 py-2 text-sm font-medium text-primary-400 border border-primary-500 rounded-lg hover:bg-primary-500/10 transition-colors whitespace-nowrap"
          >
            
            Choose a Plan
          </Link>
          <Link
            to="/login"
            className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors whitespace-nowrap"
          >
            Sign In
          </Link>
        </div>
      </div>
    </nav>
  );
};

export default PublicBlogNav;
