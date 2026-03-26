import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import ThemeToggle from './ThemeToggle';
import { User } from '../types';

type PageKey =
  | 'dashboard'
  | 'watchlist'
  | 'portfolio'
  | 'alerts'
  | 'stocks'
  | 'technical-analysis'
  | 'dcf-valuation'
  | 'options-calculator'
  | 'tutorials'
  | 'blogs'
  | 'account'
  | 'admin';

interface NavBarProps {
  currentPage: PageKey;
  user: User | null;
  onLogout: () => void;
}

const NAV_LINKS: { to: string; key: PageKey; label: string }[] = [
  { to: '/dashboard', key: 'dashboard', label: 'Dashboard' },
  { to: '/watchlist', key: 'watchlist', label: 'Watchlist' },
  { to: '/portfolio', key: 'portfolio', label: 'Portfolio' },
  { to: '/alerts', key: 'alerts', label: 'Alerts' },
  { to: '/stocks', key: 'stocks', label: 'Stocks' },
  { to: '/technical-analysis', key: 'technical-analysis', label: 'Technical Analysis' },
  { to: '/dcf-valuation', key: 'dcf-valuation', label: 'DCF Valuation' },
  { to: '/options-calculator', key: 'options-calculator', label: 'Options Calc' },
];

const getTierBadge = (tier: string) => {
  const badges: Record<string, { bg: string; text: string; label: string }> = {
    beginner: { bg: 'bg-gray-100 dark:bg-gray-600', text: 'text-gray-800 dark:text-gray-200', label: 'Beginner' },
    casual: { bg: 'bg-primary-100 dark:bg-primary-900/50', text: 'text-primary-800 dark:text-primary-200', label: 'Casual' },
    active: { bg: 'bg-purple-100 dark:bg-purple-900/50', text: 'text-purple-800 dark:text-purple-200', label: 'Active' },
    professional: { bg: 'bg-yellow-100 dark:bg-yellow-900/50', text: 'text-yellow-800 dark:text-yellow-200', label: 'Professional' },
  };
  const badge = badges[tier] || badges.beginner;
  return (
    <span className={`px-3 py-1 rounded-full text-sm font-semibold ${badge.bg} ${badge.text}`}>
      {badge.label}
    </span>
  );
};

const NavBar: React.FC<NavBarProps> = ({ currentPage, user, onLogout }) => {
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  // Close menu on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <nav className="bg-gray-900 dark:bg-gray-900 shadow-sm border-b border-gray-700 dark:border-gray-700">
      <div className="flex items-center h-16">
        {/* Logo — outside the constrained container */}
        <Link to="/dashboard" className="flex items-center pl-4 sm:pl-6 lg:pl-8 pr-6 shrink-0">
          <img src="/images/logo.png" alt="NWC-Analytics" className="h-10 w-10 mr-3" />
          <span
            className="text-xl font-bold text-primary-400 dark:text-primary-400 hidden lg:inline"
            style={{ fontFamily: "'Viner Hand ITC', 'Caveat', cursive", fontSize: '1.8rem', fontStyle: 'italic' }}
          >
            NWC-Analytics
          </span>
        </Link>

        {/* Nav links + user menu fill remaining space */}
        <div className="flex-1 flex items-center justify-between pr-4 sm:pr-6 lg:pr-8 min-w-0">
          <div className="hidden md:flex items-center space-x-5 lg:space-x-6">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.key}
                to={link.to}
                className={
                  currentPage === link.key
                    ? 'text-primary-400 dark:text-primary-400 font-medium border-b-2 border-primary-600 dark:border-primary-400 pb-1 whitespace-nowrap'
                    : 'text-gray-300 hover:text-white whitespace-nowrap'
                }
              >
                {link.label}
              </Link>
            ))}
          </div>

          <div className="flex items-center space-x-4 ml-auto">
            <div className="relative" ref={userMenuRef}>
              <button
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                className="flex items-center gap-2 text-sm text-gray-300 hover:text-teal-400 transition-colors focus:outline-none"
              >
                <span className="hidden lg:inline">{user?.email}</span>
                <span className="lg:hidden">{user?.email?.split('@')[0]}</span>
                {user && getTierBadge(user.subscription_tier)}
                <svg className={`w-4 h-4 transition-transform ${userMenuOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {userMenuOpen && (
                <div className="absolute right-0 mt-2 w-56 bg-gray-800 border border-gray-600 rounded-lg shadow-xl z-50 py-1 animate-in fade-in duration-150">
                  <div className="px-4 py-2 border-b border-gray-700">
                    <p className="text-sm font-medium text-white truncate">{user?.full_name || user?.email}</p>
                    <p className="text-xs text-gray-400 truncate">{user?.email}</p>
                  </div>

                  <Link
                    to="/account"
                    onClick={() => setUserMenuOpen(false)}
                    className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                    Account Settings
                  </Link>
                  <Link
                    to="/tutorials"
                    onClick={() => setUserMenuOpen(false)}
                    className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    Tutorials
                  </Link>
                  <Link
                    to="/blogs"
                    onClick={() => setUserMenuOpen(false)}
                    className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" /></svg>
                    Blog
                  </Link>

                  {user?.is_admin && (
                    <>
                      <div className="border-t border-gray-700 my-1"></div>
                      <Link
                        to="/admin"
                        onClick={() => setUserMenuOpen(false)}
                        className="flex items-center gap-3 px-4 py-2.5 text-sm text-amber-400 hover:bg-gray-700 hover:text-amber-300 transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                        Admin Panel
                      </Link>
                    </>
                  )}

                  <div className="border-t border-gray-700 my-1"></div>
                  <button
                    onClick={() => { setUserMenuOpen(false); onLogout(); }}
                    className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-red-400 hover:bg-gray-700 hover:text-red-300 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                    Logout
                  </button>
                </div>
              )}
            </div>
            <ThemeToggle />
          </div>
        </div>
      </div>
    </nav>
  );
};

export { getTierBadge };
export default NavBar;
