import React, { useEffect, useState, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { authAPI, alertsAPI, phoneAPI } from '../services/api';
import { User } from '../types';
import ThemeToggle from '../components/ThemeToggle';

interface Alert {
  id: string;
  ticker: string;
  condition: 'above' | 'below';
  target_price: number;
  is_active: boolean;
  sms_enabled: boolean;
  triggered_at?: string;
  notes?: string;
  created_at: string;
}

interface PhoneStatus {
  has_phone: boolean;
  phone_verified: boolean;
  phone_last_four: string | null;
  message: string;
}

const SMS_TIERS = ['active', 'professional'];

const Alerts: React.FC = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [addingAlert, setAddingAlert] = useState(false);
  const [newTicker, setNewTicker] = useState('');
  const [newCondition, setNewCondition] = useState<'above' | 'below'>('above');
  const [newTargetPrice, setNewTargetPrice] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [newSmsEnabled, setNewSmsEnabled] = useState(false);
  const [error, setError] = useState('');

  // Phone verification state
  const [phoneStatus, setPhoneStatus] = useState<PhoneStatus | null>(null);
  const [showPhoneVerify, setShowPhoneVerify] = useState(false);
  const [phoneInput, setPhoneInput] = useState('');
  const [otpInput, setOtpInput] = useState('');
  const [phoneStep, setPhoneStep] = useState<'input' | 'verify'>('input');
  const [phoneLoading, setPhoneLoading] = useState(false);
  const [phoneError, setPhoneError] = useState('');
  const [phoneSuccess, setPhoneSuccess] = useState('');

  // Which alert row is being toggled for SMS (inline verify trigger)
  const [smsToggleAlertId, setSmsToggleAlertId] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const userResponse = await authAPI.getCurrentUser();
      setUser(userResponse.data);

      const alertsResponse = await alertsAPI.getAll();
      setAlerts(alertsResponse.data.alerts || []);

      // Load phone status if tier supports SMS
      if (SMS_TIERS.includes(userResponse.data.subscription_tier)) {
        try {
          const phoneResp = await phoneAPI.getStatus();
          setPhoneStatus(phoneResp.data);
        } catch {
          // Non-fatal — phone endpoint might 403 for lower tiers
        }
      }
    } catch (error) {
      console.error('Failed to load data:', error);
      if ((error as any).response?.status === 401) {
        localStorage.removeItem('access_token');
        navigate('/login');
      }
    } finally {
      setLoading(false);
    }
  };

  const canUseSms = () => SMS_TIERS.includes(user?.subscription_tier || '');
  const hasVerifiedPhone = () => phoneStatus?.phone_verified === true;

  // ── Phone verification handlers ──────────────────────────────

  const handleSubmitPhone = async () => {
    setPhoneError('');
    setPhoneSuccess('');
    if (!phoneInput.trim()) {
      setPhoneError('Please enter your phone number.');
      return;
    }
    setPhoneLoading(true);
    try {
      const resp = await phoneAPI.submitPhone({ phone_number: phoneInput.trim() });
      setPhoneStatus(resp.data);
      setPhoneStep('verify');
      setPhoneSuccess(resp.data.message);
    } catch (err: any) {
      setPhoneError(err.response?.data?.detail || 'Failed to send code.');
    } finally {
      setPhoneLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    setPhoneError('');
    setPhoneSuccess('');
    if (otpInput.length !== 6) {
      setPhoneError('Enter the 6-digit code from your text.');
      return;
    }
    setPhoneLoading(true);
    try {
      const resp = await phoneAPI.verifyCode({ code: otpInput });
      setPhoneStatus(resp.data);
      setPhoneSuccess(resp.data.message);
      setShowPhoneVerify(false);
      setPhoneStep('input');
      setPhoneInput('');
      setOtpInput('');

      // If triggered from a table row toggle, enable SMS on that alert
      if (smsToggleAlertId) {
        await alertsAPI.update(smsToggleAlertId, { sms_enabled: true });
        setSmsToggleAlertId(null);
        await loadData();
      }
    } catch (err: any) {
      setPhoneError(err.response?.data?.detail || 'Invalid or expired code.');
    } finally {
      setPhoneLoading(false);
    }
  };

  const openPhoneVerify = (fromAlertId?: string) => {
    setPhoneError('');
    setPhoneSuccess('');
    setPhoneStep('input');
    setPhoneInput('');
    setOtpInput('');
    setShowPhoneVerify(true);
    setSmsToggleAlertId(fromAlertId || null);
  };

  // ── Alert CRUD handlers ──────────────────────────────────────

  const handleAddAlert = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!newTicker.trim() || !newTargetPrice) {
      setError('Please fill in all required fields');
      return;
    }

    if (parseFloat(newTargetPrice) <= 0) {
      setError('Target price must be greater than 0');
      return;
    }

    // Check tier limits
    const limits = {
      free: 0,
      casual: 5,
      active: 20,
      professional: 50
    };
    const limit = limits[user?.subscription_tier as keyof typeof limits] || 5;

    if (alerts.length >= limit) {
      setError(`You've reached your ${user?.subscription_tier} tier limit of ${limit} alerts`);
      return;
    }

    try {
      await alertsAPI.create({
        ticker: newTicker.toUpperCase().trim(),
        condition: newCondition,
        target_price: parseFloat(newTargetPrice),
        notes: newNotes.trim() || undefined,
        sms_enabled: newSmsEnabled && hasVerifiedPhone(),
      });

      await loadData();

      setNewTicker('');
      setNewCondition('above');
      setNewTargetPrice('');
      setNewNotes('');
      setNewSmsEnabled(false);
      setAddingAlert(false);
    } catch (err: any) {
      console.error('Add alert error:', err.response?.data);
      setError(err.response?.data?.detail || 'Failed to create alert. Please try again.');
    }
  };

  const handleDeleteAlert = async (id: string) => {
    if (!window.confirm('Delete this alert?')) {
      return;
    }

    try {
      await alertsAPI.delete(id);
      setAlerts(prevList => prevList.filter(alert => alert.id !== id));
    } catch (err) {
      console.error('Failed to delete alert:', err);
      setError('Failed to delete alert');
      await loadData();
    }
  };

  const handleToggleAlert = async (id: string, currentStatus: boolean) => {
    try {
      await alertsAPI.update(id, { is_active: !currentStatus });
      await loadData();
    } catch (err) {
      console.error('Failed to toggle alert:', err);
      setError('Failed to update alert');
    }
  };

  const handleToggleSms = async (alertId: string, currentSms: boolean) => {
    if (!currentSms) {
      // Turning ON — need verified phone
      if (!hasVerifiedPhone()) {
        openPhoneVerify(alertId);
        return;
      }
    }
    try {
      await alertsAPI.update(alertId, { sms_enabled: !currentSms });
      await loadData();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to update SMS setting');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('access_token');
    navigate('/');
  };

  // User dropdown menu
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  const getTierBadge = (tier: string) => {
    const badges = {
      free: { bg: 'bg-gray-100 dark:bg-gray-600', text: 'text-gray-800 dark:text-gray-200', label: 'Free' },
      casual: { bg: 'bg-primary-100 dark:bg-primary-900/50', text: 'text-primary-800 dark:text-primary-200', label: 'Casual' },
      active: { bg: 'bg-purple-100 dark:bg-purple-900/50', text: 'text-purple-800 dark:text-purple-200', label: 'Active' },
      professional: { bg: 'bg-yellow-100 dark:bg-yellow-900/50', text: 'text-yellow-800 dark:text-yellow-200', label: 'Professional' },
    };
    const badge = badges[tier as keyof typeof badges] || badges.free;
    return (
      <span className={`px-3 py-1 rounded-full text-sm font-semibold ${badge.bg} ${badge.text}`}>
        {badge.label}
      </span>
    );
  };

  const getTierLimit = () => {
    const limits = {
      free: 0,
      casual: 5,
      active: 20,
      professional: 50
    };
    return limits[user?.subscription_tier as keyof typeof limits] || 0;
  };

  const getActiveAlertsCount = () => {
    return alerts.filter(alert => alert.is_active && !alert.triggered_at).length;
  };

  const getTriggeredAlertsCount = () => {
    return alerts.filter(alert => alert.triggered_at).length;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
          <p className="mt-4 text-gray-600 dark:text-gray-400">Loading alerts...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-800">
      {/* Navigation */}
      <nav className="bg-gray-900 dark:bg-gray-900 shadow-sm border-b border-gray-700 dark:border-gray-700">
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <img src="/images/logo.png" alt="Northwest Creek" className="h-10 w-10 mr-3" />
              <span className="text-xl font-bold text-primary-400 dark:text-primary-400" style={{ fontFamily: "'Viner Hand ITC', 'Caveat', cursive", fontSize: '1.8rem', fontStyle: 'italic' }}>Northwest Creek</span>
            </div>
            
            <div className="hidden md:flex items-center space-x-8">
              <Link to="/dashboard" className="text-gray-400 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">Dashboard</Link>
              <Link to="/watchlist" className="text-gray-400 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">Watchlist</Link>
              <Link to="/portfolio" className="text-gray-400 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">Portfolio</Link>
              <Link to="/alerts" className="text-primary-400 dark:text-primary-400 font-medium border-b-2 border-primary-600 dark:border-primary-400 pb-1">Alerts</Link>
              <Link to="/stocks" className="text-gray-400 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">Stocks</Link>
              <Link to="/technical-analysis" className="text-gray-400 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">Technical Analysis</Link>
              <Link to="/dcf-valuation" className="text-gray-400 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">DCF Valuation</Link>
            </div>

            <div className="flex items-center space-x-4">
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
                      onClick={() => { setUserMenuOpen(false); handleLogout(); }}
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

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header with Summary */}
        <div className="mb-8">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Price Alerts</h1>
              <p className="text-gray-600 dark:text-gray-400 mt-1">
                {alerts.length} of {getTierLimit()} alerts
              </p>
            </div>
            <button
              onClick={() => setAddingAlert(!addingAlert)}
              className="px-6 py-3 bg-primary-600 hover:bg-primary-700 dark:bg-primary-500 dark:hover:bg-primary-600 text-white rounded-lg font-medium transition-colors flex items-center"
            >
              <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              Create Alert
            </button>
          </div>

          {/* Alert Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 hover:shadow-xl dark:hover:shadow-gray-200/30 transition-shadow p-6 border dark:border-gray-500">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Active Alerts</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
                    {getActiveAlertsCount()}
                  </p>
                </div>
                <div className="bg-green-100 dark:bg-green-900/30 p-3 rounded-full">
                  <svg className="w-6 h-6 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                  </svg>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 hover:shadow-xl dark:hover:shadow-gray-200/30 transition-shadow p-6 border dark:border-gray-500">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Triggered</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
                    {getTriggeredAlertsCount()}
                  </p>
                </div>
                <div className="bg-purple-100 dark:bg-purple-900/30 p-3 rounded-full">
                  <svg className="w-6 h-6 text-purple-600 dark:text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 hover:shadow-xl dark:hover:shadow-gray-200/30 transition-shadow p-6 border dark:border-gray-500">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Total Alerts</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
                    {alerts.length}
                  </p>
                </div>
                <div className="bg-primary-100 dark:bg-primary-900/30 p-3 rounded-full">
                  <svg className="w-6 h-6 text-primary-600 dark:text-primary-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Add Alert Form */}
        {addingAlert && (
          <div className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 p-6 border dark:border-gray-500 mb-8">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Create Price Alert</h2>
            
            {error && (
              <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 text-red-600 dark:text-red-400 px-4 py-3 rounded-lg mb-4">
                {error}
              </div>
            )}

            <form onSubmit={handleAddAlert} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Ticker Symbol *
                  </label>
                  <input
                    type="text"
                    value={newTicker}
                    onChange={(e) => setNewTicker(e.target.value.toUpperCase())}
                    placeholder="AAPL"
                    maxLength={10}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Condition *
                  </label>
                  <select
                    value={newCondition}
                    onChange={(e) => setNewCondition(e.target.value as 'above' | 'below')}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  >
                    <option value="above">Above</option>
                    <option value="below">Below</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Target Price *
                  </label>
                  <input
                    type="number"
                    value={newTargetPrice}
                    onChange={(e) => setNewTargetPrice(e.target.value)}
                    placeholder="150.00"
                    step="0.01"
                    min="0"
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Notes (optional)
                </label>
                <input
                  type="text"
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  placeholder="Why are you setting this alert?"
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                />
              </div>

              {/* SMS Text Alert Section */}
              {canUseSms() && (
                <div className="border border-gray-200 dark:border-gray-600 rounded-lg p-4 bg-gray-50 dark:bg-gray-800">
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      id="sms-create-toggle"
                      checked={newSmsEnabled}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        if (checked && !hasVerifiedPhone()) {
                          openPhoneVerify();
                        }
                        setNewSmsEnabled(checked);
                      }}
                      className="mt-1 h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 dark:border-gray-600 rounded"
                    />
                    <div className="flex-1">
                      <label htmlFor="sms-create-toggle" className="text-sm font-medium text-gray-900 dark:text-white cursor-pointer flex items-center gap-2">
                        <svg className="w-4 h-4 text-primary-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                        </svg>
                        Send me a text when this alert triggers
                      </label>
                      {hasVerifiedPhone() ? (
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          Texts will go to &bull;&bull;&bull;-{phoneStatus?.phone_last_four}.{' '}
                          <button
                            type="button"
                            onClick={() => openPhoneVerify()}
                            className="text-primary-500 hover:text-primary-400 underline"
                          >
                            Change number
                          </button>
                        </p>
                      ) : (
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          You'll need to verify your phone number first.
                        </p>
                      )}
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                        You will ONLY receive a text for this specific alert. We will never text you for any other reason. Standard rates apply. Text STOP to opt out anytime.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Upgrade prompt for lower tiers */}
              {!canUseSms() && user?.subscription_tier !== 'free' && (
                <div className="border border-gray-200 dark:border-gray-600 rounded-lg p-4 bg-gray-50 dark:bg-gray-800">
                  <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                    </svg>
                    Text alerts available on Active ($40/mo) and Professional ($100/mo) plans.{' '}
                    <Link to="/pricing" className="text-primary-500 hover:text-primary-400 underline">Upgrade</Link>
                  </div>
                </div>
              )}

              <div className="flex gap-3">
                <button
                  type="submit"
                  className="px-6 py-2 bg-primary-600 hover:bg-primary-700 dark:bg-primary-500 dark:hover:bg-primary-600 text-white rounded-lg font-medium transition-colors"
                >
                  Create Alert
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAddingAlert(false);
                    setNewTicker('');
                    setNewCondition('above');
                    setNewTargetPrice('');
                    setNewNotes('');
                    setNewSmsEnabled(false);
                    setError('');
                  }}
                  className="px-6 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-600 dark:hover:bg-gray-500 text-gray-900 dark:text-white rounded-lg font-medium transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Alerts Table */}
        {alerts.length === 0 ? (
          <div className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 p-12 border dark:border-gray-500 text-center">
            <div className="bg-gray-100 dark:bg-gray-600 rounded-full w-24 h-24 flex items-center justify-center mx-auto mb-6">
              <svg className="w-12 h-12 text-gray-400 dark:text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
            </div>
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">No Alerts Yet</h3>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              Create your first price alert to get notified when stocks hit your target
            </p>
            <button
              onClick={() => setAddingAlert(true)}
              className="px-6 py-3 bg-primary-600 hover:bg-primary-700 dark:bg-primary-500 dark:hover:bg-primary-600 text-white rounded-lg font-medium transition-colors"
            >
              Create Your First Alert
            </button>
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 border dark:border-gray-500 overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-600">
              <thead className="bg-gray-50 dark:bg-gray-900">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Ticker</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Condition</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Target Price</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Status</th>
                  {canUseSms() && (
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">SMS</th>
                  )}
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Notes</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-700 divide-y divide-gray-200 dark:divide-gray-600">
                {alerts.map((alert) => (
                  <tr key={alert.id} className="hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-bold text-gray-900 dark:text-white">{alert.ticker}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {new Date(alert.created_at).toLocaleDateString()}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        {alert.condition === 'above' ? (
                          <>
                            <svg className="w-4 h-4 text-green-600 dark:text-green-400 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                            </svg>
                            <span className="text-sm text-green-600 dark:text-green-400 font-medium">Above</span>
                          </>
                        ) : (
                          <>
                            <svg className="w-4 h-4 text-red-600 dark:text-red-400 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                            <span className="text-sm text-red-600 dark:text-red-400 font-medium">Below</span>
                          </>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <div className="text-sm font-semibold text-gray-900 dark:text-white">
                        ${alert.target_price.toFixed(2)}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {alert.triggered_at ? (
                        <span className="px-2 py-1 text-xs font-semibold rounded-full bg-purple-100 dark:bg-purple-900/50 text-purple-800 dark:text-purple-200">
                          Triggered
                        </span>
                      ) : alert.is_active ? (
                        <span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 dark:bg-green-900/50 text-green-800 dark:text-green-200">
                          Active
                        </span>
                      ) : (
                        <span className="px-2 py-1 text-xs font-semibold rounded-full bg-gray-100 dark:bg-gray-600 text-gray-800 dark:text-gray-200">
                          Paused
                        </span>
                      )}
                    </td>
                    {canUseSms() && (
                      <td className="px-4 py-4 whitespace-nowrap text-center">
                        {!alert.triggered_at ? (
                          <button
                            onClick={() => handleToggleSms(alert.id, alert.sms_enabled)}
                            className="group relative"
                            title={alert.sms_enabled ? 'SMS enabled — click to disable' : 'Click to enable SMS'}
                          >
                            {alert.sms_enabled ? (
                              <svg className="w-5 h-5 text-primary-500" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" fill="none" />
                                <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            ) : (
                              <svg className="w-5 h-5 text-gray-400 dark:text-gray-500 group-hover:text-primary-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                              </svg>
                            )}
                          </button>
                        ) : (
                          <span className="text-gray-300 dark:text-gray-600">—</span>
                        )}
                      </td>
                    )}
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-600 dark:text-gray-400 max-w-xs truncate">
                        {alert.notes || '-'}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                      {!alert.triggered_at && (
                        <button
                          onClick={() => handleToggleAlert(alert.id, alert.is_active)}
                          className="text-primary-600 hover:text-primary-900 dark:text-primary-400 dark:hover:text-primary-300"
                        >
                          {alert.is_active ? 'Pause' : 'Resume'}
                        </button>
                      )}
                      <button
                        onClick={() => handleDeleteAlert(alert.id)}
                        className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ─── Phone Verification Modal ─────────────────────────── */}
      {showPhoneVerify && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full mx-4 overflow-hidden">
            <div className="bg-primary-50 dark:bg-primary-900/30 px-6 py-5 border-b dark:border-gray-700 flex items-center justify-between">
              <h3 className="text-lg font-bold text-primary-700 dark:text-primary-300 flex items-center gap-2">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
                Verify Your Phone
              </h3>
              <button
                onClick={() => { setShowPhoneVerify(false); setSmsToggleAlertId(null); }}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              {phoneError && (
                <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 text-red-600 dark:text-red-400 px-4 py-3 rounded-lg text-sm">
                  {phoneError}
                </div>
              )}
              {phoneSuccess && (
                <div className="bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-700 text-green-600 dark:text-green-400 px-4 py-3 rounded-lg text-sm">
                  {phoneSuccess}
                </div>
              )}

              {phoneStep === 'input' ? (
                <>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Enter your phone number and we'll text you a verification code.
                  </p>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Phone Number</label>
                    <input
                      type="tel"
                      value={phoneInput}
                      onChange={(e) => setPhoneInput(e.target.value)}
                      placeholder="(208) 555-1234"
                      className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    />
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={handleSubmitPhone}
                      disabled={phoneLoading}
                      className="flex-1 px-4 py-2.5 bg-primary-600 hover:bg-primary-700 dark:bg-primary-500 dark:hover:bg-primary-600 text-white rounded-lg font-semibold transition-colors disabled:opacity-50"
                    >
                      {phoneLoading ? 'Sending...' : 'Send Code'}
                    </button>
                    <button
                      onClick={() => { setShowPhoneVerify(false); setSmsToggleAlertId(null); }}
                      className="px-4 py-2.5 bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 text-gray-900 dark:text-white rounded-lg font-semibold transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                  <p className="text-xs text-gray-400 dark:text-gray-500">
                    We will ONLY text you for alerts you opt into. Standard rates apply. Text STOP to opt out anytime.
                  </p>
                </>
              ) : (
                <>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    We sent a 6-digit code to &bull;&bull;&bull;-{phoneStatus?.phone_last_four}. Enter it below.
                  </p>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Verification Code</label>
                    <input
                      type="text"
                      value={otpInput}
                      onChange={(e) => setOtpInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="123456"
                      maxLength={6}
                      className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-center text-xl tracking-widest font-mono"
                    />
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={handleVerifyOtp}
                      disabled={phoneLoading}
                      className="flex-1 px-4 py-2.5 bg-primary-600 hover:bg-primary-700 dark:bg-primary-500 dark:hover:bg-primary-600 text-white rounded-lg font-semibold transition-colors disabled:opacity-50"
                    >
                      {phoneLoading ? 'Verifying...' : 'Verify'}
                    </button>
                    <button
                      onClick={() => setPhoneStep('input')}
                      className="px-4 py-2.5 bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 text-gray-900 dark:text-white rounded-lg font-semibold transition-colors"
                    >
                      Back
                    </button>
                  </div>
                  <button
                    onClick={handleSubmitPhone}
                    disabled={phoneLoading}
                    className="text-sm text-primary-500 hover:text-primary-400 underline disabled:opacity-50"
                  >
                    Resend code
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Alerts;