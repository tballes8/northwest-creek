/**
 * AccountSettings — Manage account and subscription
 * Includes subscription cancellation, plan details, and account info
 */
import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { authAPI, phoneAPI } from '../services/api';
import { User } from '../types';
import ThemeToggle from '../components/ThemeToggle';
import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

const TIER_DETAILS: Record<string, {
  name: string;
  price: string;
  color: string;
  bgClass: string;
  features: string[];
}> = {
  free: {
    name: 'Free',
    price: '$0/mo',
    color: 'text-gray-400',
    bgClass: 'bg-gray-600',
    features: ['5 watchlist stocks', '5 portfolio entries', '5 stock reviews', '5 technical analyses', '5 DCF valuations'],
  },
  casual: {
    name: 'Casual Retail Investor',
    price: '$20/mo',
    color: 'text-teal-400',
    bgClass: 'bg-teal-500',
    features: ['20 watchlist stocks', '20 portfolio entries', '5 reviews/week', '5 TA/week', '5 DCF/week', '5 alerts'],
  },
  active: {
    name: 'Active Retail Investor',
    price: '$40/mo',
    color: 'text-blue-400',
    bgClass: 'bg-blue-500',
    features: ['45 watchlist stocks', '45 portfolio entries', '5 reviews/day', '5 TA/day', '5 DCF/day', '20 alerts', 'SMS text alerts'],
  },
  professional: {
    name: 'Professional Investor',
    price: '$100/mo',
    color: 'text-purple-400',
    bgClass: 'bg-purple-500',
    features: ['75 watchlist stocks', '75 portfolio entries', '20 reviews/day', '20 TA/day', '20 DCF/day', '50 alerts', 'SMS text alerts', 'Ad-free'],
  },
};

const AccountSettings: React.FC = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [cancelSuccess, setCancelSuccess] = useState<string | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);

  // Change password state
  const [passwordData, setPasswordData] = useState({
    current_password: '',
    new_password: '',
    confirm_password: '',
  });
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  // Phone / SMS state
  const [phoneStatus, setPhoneStatus] = useState<{ has_phone: boolean; phone_verified: boolean; phone_last_four: string | null; message: string } | null>(null);
  const [phoneInput, setPhoneInput] = useState('');
  const [otpInput, setOtpInput] = useState('');
  const [phoneStep, setPhoneStep] = useState<'view' | 'input' | 'verify'>('view');
  const [phoneLoading, setPhoneLoading] = useState(false);
  const [phoneMessage, setPhoneMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    try {
      const response = await authAPI.getCurrentUser();
      setUser(response.data);

      // Load phone status if tier supports SMS
      const smsTiers = ['active', 'professional'];
      if (smsTiers.includes(response.data.subscription_tier)) {
        try {
          const phoneResp = await phoneAPI.getStatus();
          setPhoneStatus(phoneResp.data);
        } catch {
          // Non-fatal
        }
      }
    } catch (error) {
      console.error('Failed to load user:', error);
      if ((error as any).response?.status === 401) {
        localStorage.removeItem('access_token');
        navigate('/login');
      }
    } finally {
      setLoading(false);
    }
  };

  const canUseSms = () => ['active', 'professional'].includes(user?.subscription_tier || '');

  const handlePhoneSubmit = async () => {
    setPhoneMessage(null);
    if (!phoneInput.trim()) {
      setPhoneMessage({ type: 'error', text: 'Please enter your phone number.' });
      return;
    }
    setPhoneLoading(true);
    try {
      const resp = await phoneAPI.submitPhone({ phone_number: phoneInput.trim() });
      setPhoneStatus(resp.data);
      setPhoneStep('verify');
      setPhoneMessage({ type: 'success', text: resp.data.message });
    } catch (err: any) {
      setPhoneMessage({ type: 'error', text: err.response?.data?.detail || 'Failed to send code.' });
    } finally {
      setPhoneLoading(false);
    }
  };

  const handlePhoneVerify = async () => {
    setPhoneMessage(null);
    if (otpInput.length !== 6) {
      setPhoneMessage({ type: 'error', text: 'Enter the 6-digit code from your text.' });
      return;
    }
    setPhoneLoading(true);
    try {
      const resp = await phoneAPI.verifyCode({ code: otpInput });
      setPhoneStatus(resp.data);
      setPhoneStep('view');
      setPhoneInput('');
      setOtpInput('');
      setPhoneMessage({ type: 'success', text: resp.data.message });
    } catch (err: any) {
      setPhoneMessage({ type: 'error', text: err.response?.data?.detail || 'Invalid or expired code.' });
    } finally {
      setPhoneLoading(false);
    }
  };

  const handlePhoneRemove = async () => {
    if (!window.confirm('Remove your phone number? This will disable all SMS alerts.')) return;
    setPhoneLoading(true);
    setPhoneMessage(null);
    try {
      const resp = await phoneAPI.removePhone();
      setPhoneStatus(resp.data);
      setPhoneStep('view');
      setPhoneMessage({ type: 'success', text: 'Phone removed. All SMS alerts disabled.' });
    } catch (err: any) {
      setPhoneMessage({ type: 'error', text: err.response?.data?.detail || 'Failed to remove phone.' });
    } finally {
      setPhoneLoading(false);
    }
  };

  const handleCancelSubscription = async (immediate: boolean = false) => {
    setCancelling(true);
    setCancelError(null);
    
    try {
      const token = localStorage.getItem('access_token');
      const endpoint = immediate ? 'cancel-subscription-immediate' : 'cancel-subscription';
      const response = await axios.post(
        `${API_URL}/api/v1/stripe/${endpoint}`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      setCancelSuccess(response.data.message);
      setShowCancelConfirm(false);
      
      // Reload user to get updated tier
      if (immediate) {
        await loadUser();
      }
    } catch (err: any) {
      setCancelError(err.response?.data?.detail || 'Failed to cancel subscription. Please try again.');
    } finally {
      setCancelling(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('access_token');
    navigate('/login');
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordSuccess(null);
    setPasswordError(null);

    if (passwordData.new_password !== passwordData.confirm_password) {
      setPasswordError('New passwords do not match.');
      return;
    }

    if (passwordData.new_password.length < 8) {
      setPasswordError('New password must be at least 8 characters.');
      return;
    }

    setPasswordLoading(true);

    try {
      const response = await authAPI.changePassword({
        current_password: passwordData.current_password,
        new_password: passwordData.new_password,
      });
      setPasswordSuccess(response.data.message);
      setPasswordData({ current_password: '', new_password: '', confirm_password: '' });
    } catch (err: any) {
      setPasswordError(err.response?.data?.detail || 'Failed to change password. Please try again.');
    } finally {
      setPasswordLoading(false);
    }
  };

  const tierInfo = TIER_DETAILS[user?.subscription_tier || 'free'] || TIER_DETAILS.free;

  const getTierBadge = (tier: string) => {
    const badges: Record<string, { bg: string; text: string; label: string }> = {
      free: { bg: 'bg-gray-100 dark:bg-gray-600', text: 'text-gray-800 dark:text-gray-200', label: 'Free' },
      casual: { bg: 'bg-primary-100 dark:bg-primary-900/50', text: 'text-primary-800 dark:text-primary-200', label: 'Casual' },
      active: { bg: 'bg-purple-100 dark:bg-purple-900/50', text: 'text-purple-800 dark:text-purple-200', label: 'Active' },
      professional: { bg: 'bg-yellow-100 dark:bg-yellow-900/50', text: 'text-yellow-800 dark:text-yellow-200', label: 'Professional' },
    };
    const badge = badges[tier] || badges.free;
    return (
      <span className={`px-3 py-1 rounded-full text-sm font-semibold ${badge.bg} ${badge.text}`}>
        {badge.label}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
          <p className="mt-4 text-gray-600 dark:text-gray-400">Loading account...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-800">
      {/* Navigation */}
      <nav className="bg-gray-900 dark:bg-gray-900 shadow-sm border-b border-gray-700 dark:border-gray-700">
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <img src="/images/logo.png" alt="Northwest Creek" className="h-10 w-10 mr-3" />
              <span className="text-xl font-bold text-primary-400 dark:text-primary-400" style={{ fontFamily: "'Viner Hand ITC', 'Caveat', cursive", fontSize: '1.8rem', fontStyle: 'italic' }}>Northwest Creek</span>
            </div>
            <div className="hidden md:flex items-center space-x-8">
              <Link to="/dashboard" className="text-gray-400 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">Dashboard</Link>
              <Link to="/watchlist" className="text-gray-400 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">Watchlist</Link>
              <Link to="/portfolio" className="text-gray-400 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">Portfolio</Link>
              <Link to="/alerts" className="text-gray-400 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">Alerts</Link>
              <Link to="/stocks" className="text-gray-400 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">Stocks</Link>
              <Link to="/technical-analysis" className="text-gray-400 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">Technical Analysis</Link>
              <Link to="/dcf-valuation" className="text-gray-400 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">DCF Valuation</Link>
            </div>
            <div className="flex items-center space-x-4">
              <Link to="/account" className="text-sm text-gray-300 hover:text-teal-400 transition-colors">{user?.email}</Link>
              {user && getTierBadge(user.subscription_tier)}
              <button
                onClick={handleLogout}
                className="text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white text-sm font-medium"
              >
                Logout
              </button>
              <ThemeToggle />
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-8">Account Settings</h1>

        {/* Account Info */}
        <div className="bg-white dark:bg-gray-700 rounded-xl shadow-lg border dark:border-gray-500 p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Account Information</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-gray-500 dark:text-gray-400">Name</label>
              <p className="text-gray-900 dark:text-white font-medium">{user?.full_name || '—'}</p>
            </div>
            <div>
              <label className="text-sm text-gray-500 dark:text-gray-400">Email</label>
              <p className="text-gray-900 dark:text-white font-medium">{user?.email || '—'}</p>
            </div>
            <div>
              <label className="text-sm text-gray-500 dark:text-gray-400">Email Verified</label>
              <p className={`font-medium ${user?.is_verified ? 'text-green-500' : 'text-red-500'}`}>
                {user?.is_verified ? '✓ Verified' : '✗ Not verified'}
              </p>
            </div>
            <div>
              <label className="text-sm text-gray-500 dark:text-gray-400">Member Since</label>
              <p className="text-gray-900 dark:text-white font-medium">
                {user?.created_at ? new Date(user.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '—'}
              </p>
            </div>
          </div>
        </div>

        {/* Change Password */}
        <div className="bg-white dark:bg-gray-700 rounded-xl shadow-lg border dark:border-gray-500 p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Change Password</h2>

          {passwordSuccess && (
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4 mb-4">
              <div className="flex items-start gap-3">
                <span className="text-green-500 text-xl">✓</span>
                <p className="text-green-700 dark:text-green-300">{passwordSuccess}</p>
              </div>
            </div>
          )}

          {passwordError && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-4">
              <div className="flex items-start gap-3">
                <span className="text-red-500 text-xl">✗</span>
                <p className="text-red-700 dark:text-red-300">{passwordError}</p>
              </div>
            </div>
          )}

          <form onSubmit={handleChangePassword} className="space-y-4 max-w-md">
            <div>
              <label htmlFor="current-password" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Current Password
              </label>
              <input
                id="current-password"
                type="password"
                autoComplete="current-password"
                required
                value={passwordData.current_password}
                onChange={(e) => setPasswordData({ ...passwordData, current_password: e.target.value })}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm placeholder-gray-400 dark:placeholder-gray-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-primary-500 focus:border-primary-500"
              />
            </div>

            <div>
              <label htmlFor="new-password" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                New Password
              </label>
              <input
                id="new-password"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={passwordData.new_password}
                onChange={(e) => setPasswordData({ ...passwordData, new_password: e.target.value })}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm placeholder-gray-400 dark:placeholder-gray-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-primary-500 focus:border-primary-500"
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Minimum 8 characters</p>
            </div>

            <div>
              <label htmlFor="confirm-new-password" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Confirm New Password
              </label>
              <input
                id="confirm-new-password"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={passwordData.confirm_password}
                onChange={(e) => setPasswordData({ ...passwordData, confirm_password: e.target.value })}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm placeholder-gray-400 dark:placeholder-gray-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-primary-500 focus:border-primary-500"
              />
            </div>

            <div>
              <button
                type="submit"
                disabled={passwordLoading}
                className="px-6 py-2.5 bg-primary-600 hover:bg-primary-700 dark:bg-primary-500 dark:hover:bg-primary-600 text-white rounded-lg font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {passwordLoading ? 'Updating...' : 'Update Password'}
              </button>
            </div>
          </form>
        </div>

        {/* Subscription */}
        <div className="bg-white dark:bg-gray-700 rounded-xl shadow-lg border dark:border-gray-500 p-6 mb-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Subscription</h2>
            {getTierBadge(user?.subscription_tier || 'free')}
          </div>

          <div className="bg-gray-50 dark:bg-gray-750 rounded-lg p-5 mb-6 border dark:border-gray-600">
            <div className="flex items-center justify-between mb-3">
              <span className={`text-xl font-bold ${tierInfo.color}`}>{tierInfo.name}</span>
              <span className="text-2xl font-bold text-gray-900 dark:text-white">{tierInfo.price}</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {tierInfo.features.map((feat, i) => (
                <div key={i} className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-300">
                  <span className="text-teal-500">✓</span> {feat}
                </div>
              ))}
            </div>
          </div>

          {/* Success message */}
          {cancelSuccess && (
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4 mb-6">
              <div className="flex items-start gap-3">
                <span className="text-green-500 text-xl">✓</span>
                <p className="text-green-700 dark:text-green-300">{cancelSuccess}</p>
              </div>
            </div>
          )}

          {/* Error message */}
          {cancelError && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-6">
              <div className="flex items-start gap-3">
                <span className="text-red-500 text-xl">✗</span>
                <p className="text-red-700 dark:text-red-300">{cancelError}</p>
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex flex-wrap gap-3">
            {user?.subscription_tier === 'free' ? (
              <Link
                to="/pricing"
                className="px-6 py-2.5 bg-gradient-to-r from-teal-600 to-teal-500 hover:from-teal-700 hover:to-teal-600 text-white rounded-lg font-semibold transition-all shadow"
              >
                Upgrade Your Plan
              </Link>
            ) : (
              <>
                <Link
                  to="/pricing"
                  className="px-6 py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-semibold transition-colors"
                >
                  Change Plan
                </Link>
                {!cancelSuccess && (
                  <button
                    onClick={() => setShowCancelConfirm(true)}
                    className="px-6 py-2.5 border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg font-medium transition-colors"
                  >
                    Cancel Subscription
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Cancel Confirmation Modal */}
        {showCancelConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full mx-4 overflow-hidden">
              <div className="bg-red-50 dark:bg-red-900/30 px-6 py-5 border-b dark:border-gray-700">
                <h3 className="text-xl font-bold text-red-700 dark:text-red-400">Cancel Subscription?</h3>
              </div>
              
              <div className="px-6 py-5">
                <p className="text-gray-700 dark:text-gray-300 mb-4">
                  Are you sure you want to cancel your <strong>{tierInfo.name}</strong> subscription?
                </p>
                
                <div className="bg-gray-50 dark:bg-gray-750 rounded-lg p-4 mb-4 border dark:border-gray-600">
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-2"><strong>What happens when you cancel:</strong></p>
                  <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1.5">
                    <li className="flex items-start gap-2">
                      <span className="text-yellow-500 mt-0.5">•</span>
                      You'll keep access until the end of your current billing period
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-yellow-500 mt-0.5">•</span>
                      After that, your account will be downgraded to the Free plan
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-yellow-500 mt-0.5">•</span>
                      Items exceeding Free tier limits will be preserved but read-only
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-green-500 mt-0.5">•</span>
                      You can resubscribe anytime to regain full access
                    </li>
                  </ul>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => handleCancelSubscription(false)}
                    disabled={cancelling}
                    className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white rounded-lg font-semibold transition-colors"
                  >
                    {cancelling ? (
                      <span className="flex items-center justify-center gap-2">
                        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        Cancelling...
                      </span>
                    ) : (
                      'Yes, Cancel at Period End'
                    )}
                  </button>
                  <button
                    onClick={() => setShowCancelConfirm(false)}
                    disabled={cancelling}
                    className="flex-1 px-4 py-2.5 bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 text-gray-900 dark:text-white rounded-lg font-semibold transition-colors"
                  >
                    Keep My Plan
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Text Notifications / Phone Management */}
        {canUseSms() && (
          <div className="bg-white dark:bg-gray-700 rounded-xl shadow-lg border dark:border-gray-500 p-6 mb-6">
            <div className="flex items-center gap-2 mb-4">
              <svg className="w-5 h-5 text-primary-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Text Notifications</h2>
            </div>

            {phoneMessage && (
              <div className={`${phoneMessage.type === 'success' ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-700 dark:text-green-300' : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300'} border rounded-lg p-3 mb-4 text-sm`}>
                {phoneMessage.text}
              </div>
            )}

            {phoneStep === 'view' && (
              <>
                {phoneStatus?.phone_verified ? (
                  <div className="bg-gray-50 dark:bg-gray-750 rounded-lg p-4 border dark:border-gray-600">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-900 dark:text-white">
                          Phone verified
                        </p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          Texts go to &bull;&bull;&bull;-{phoneStatus.phone_last_four}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => { setPhoneStep('input'); setPhoneMessage(null); }}
                          className="px-4 py-2 text-sm bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 text-gray-900 dark:text-white rounded-lg font-medium transition-colors"
                        >
                          Change
                        </button>
                        <button
                          onClick={handlePhoneRemove}
                          disabled={phoneLoading}
                          className="px-4 py-2 text-sm border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg font-medium transition-colors disabled:opacity-50"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-3">
                      Manage which alerts send texts on the <Link to="/alerts" className="text-primary-500 hover:text-primary-400 underline">Alerts page</Link>. Text STOP to opt out anytime.
                    </p>
                  </div>
                ) : (
                  <div className="bg-gray-50 dark:bg-gray-750 rounded-lg p-4 border dark:border-gray-600">
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                      Add your phone number to receive text messages when your price alerts trigger.
                    </p>
                    <button
                      onClick={() => { setPhoneStep('input'); setPhoneMessage(null); }}
                      className="px-5 py-2.5 bg-primary-600 hover:bg-primary-700 dark:bg-primary-500 dark:hover:bg-primary-600 text-white rounded-lg font-medium transition-colors text-sm"
                    >
                      Add Phone Number
                    </button>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-3">
                      We will ONLY text you for alerts you opt into. We will never text you for any other reason.
                    </p>
                  </div>
                )}
              </>
            )}

            {phoneStep === 'input' && (
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Phone Number</label>
                  <input
                    type="tel"
                    value={phoneInput}
                    onChange={(e) => setPhoneInput(e.target.value)}
                    placeholder="(208) 555-1234"
                    className="w-full max-w-xs px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  />
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={handlePhoneSubmit}
                    disabled={phoneLoading}
                    className="px-5 py-2.5 bg-primary-600 hover:bg-primary-700 dark:bg-primary-500 dark:hover:bg-primary-600 text-white rounded-lg font-medium transition-colors text-sm disabled:opacity-50"
                  >
                    {phoneLoading ? 'Sending...' : 'Send Verification Code'}
                  </button>
                  <button
                    onClick={() => { setPhoneStep('view'); setPhoneMessage(null); }}
                    className="px-5 py-2.5 bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 text-gray-900 dark:text-white rounded-lg font-medium transition-colors text-sm"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {phoneStep === 'verify' && (
              <div className="space-y-3">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Enter the 6-digit code we sent to &bull;&bull;&bull;-{phoneStatus?.phone_last_four}.
                </p>
                <div>
                  <input
                    type="text"
                    value={otpInput}
                    onChange={(e) => setOtpInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="123456"
                    maxLength={6}
                    className="w-full max-w-[200px] px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-center text-xl tracking-widest font-mono"
                  />
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={handlePhoneVerify}
                    disabled={phoneLoading}
                    className="px-5 py-2.5 bg-primary-600 hover:bg-primary-700 dark:bg-primary-500 dark:hover:bg-primary-600 text-white rounded-lg font-medium transition-colors text-sm disabled:opacity-50"
                  >
                    {phoneLoading ? 'Verifying...' : 'Verify Code'}
                  </button>
                  <button
                    onClick={handlePhoneSubmit}
                    disabled={phoneLoading}
                    className="px-5 py-2.5 text-primary-500 hover:text-primary-400 text-sm font-medium disabled:opacity-50"
                  >
                    Resend
                  </button>
                  <button
                    onClick={() => { setPhoneStep('view'); setPhoneMessage(null); }}
                    className="px-5 py-2.5 bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 text-gray-900 dark:text-white rounded-lg font-medium transition-colors text-sm"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Quick Links */}
        <div className="bg-white dark:bg-gray-700 rounded-xl shadow-lg border dark:border-gray-500 p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Quick Links</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Link to="/dashboard" className="text-center p-3 rounded-lg bg-gray-50 dark:bg-gray-750 hover:bg-gray-100 dark:hover:bg-gray-600 border dark:border-gray-600 transition-colors">
              <span className="block text-2xl mb-1">📊</span>
              <span className="text-sm text-gray-700 dark:text-gray-300">Dashboard</span>
            </Link>
            <Link to="/portfolio" className="text-center p-3 rounded-lg bg-gray-50 dark:bg-gray-750 hover:bg-gray-100 dark:hover:bg-gray-600 border dark:border-gray-600 transition-colors">
              <span className="block text-2xl mb-1">💼</span>
              <span className="text-sm text-gray-700 dark:text-gray-300">Portfolio</span>
            </Link>
            <Link to="/pricing" className="text-center p-3 rounded-lg bg-gray-50 dark:bg-gray-750 hover:bg-gray-100 dark:hover:bg-gray-600 border dark:border-gray-600 transition-colors">
              <span className="block text-2xl mb-1">💎</span>
              <span className="text-sm text-gray-700 dark:text-gray-300">Plans</span>
            </Link>
            <a href="mailto:support@northwestcreekllc.com" className="text-center p-3 rounded-lg bg-gray-50 dark:bg-gray-750 hover:bg-gray-100 dark:hover:bg-gray-600 border dark:border-gray-600 transition-colors">
              <span className="block text-2xl mb-1">📧</span>
              <span className="text-sm text-gray-700 dark:text-gray-300">Support</span>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AccountSettings;