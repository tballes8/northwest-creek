import React from 'react';
import { Link, useLocation } from 'react-router-dom';

// Catch-all for any URL the app has no page for (App.tsx's last route). server.js
// answers every path with the app shell, so this renders with HTTP 200; noindex
// keeps mistyped and stale URLs out of search results.
const NotFound: React.FC = () => {
  const { pathname } = useLocation();
  const primaryBtn = 'block w-full py-3 px-4 bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-lg transition-colors text-center';
  const secondaryBtn = 'block w-full py-3 px-4 border border-gray-600 hover:border-gray-500 text-gray-200 font-semibold rounded-lg transition-colors text-center';

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col justify-center py-12 px-4">
      <title>Page not found — NWC-Analytics</title>
      <meta name="robots" content="noindex" />
      <div className="max-w-md mx-auto w-full">
        <div className="text-center mb-8">
          <Link to="/" className="inline-block">
            <img src="/images/logo.png" alt="NWC-Analytics" className="h-12 w-12 mx-auto" />
          </Link>
        </div>
        <div className="bg-gray-800 border border-gray-700 rounded-2xl p-8">
          <p className="text-sm font-semibold text-primary-400 mb-2">404</p>
          <h1 className="text-2xl font-bold text-white mb-2">Page not found</h1>
          <p className="text-gray-400 mb-6 break-words">
            There's no page at <span className="text-gray-200">{pathname}</span>. The link may be out of date or mistyped.
          </p>
          <div className="space-y-3">
            <Link to="/" className={primaryBtn}>Go to the home page</Link>
            <Link to="/pricing" className={secondaryBtn}>See plans and pricing</Link>
          </div>
        </div>
        <p className="text-center text-xs text-gray-500 mt-6">
          Looking for something specific? <a href="mailto:support@nwc-analytics.com" className="text-primary-400 hover:text-primary-300">support@nwc-analytics.com</a>
        </p>
      </div>
    </div>
  );
};

export default NotFound;
