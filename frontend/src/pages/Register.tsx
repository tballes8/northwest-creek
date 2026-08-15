import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { authAPI } from '../services/api';
import ResendVerification from '../components/ResendVerification';

const Register: React.FC = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    email: '',
    confirmEmail: '',
    password: '',
    confirmPassword: '',
    full_name: '',
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  // The account is created even when the verification email fails to send, so
  // track delivery separately — telling the user to check an inbox that will
  // never receive anything strands them with no idea what went wrong.
  const [emailSent, setEmailSent] = useState(true);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Validate emails match
    if (formData.email !== formData.confirmEmail) {
      setError('Email addresses do not match');
      return;
    }

    // Validate passwords match
    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    // Validate password length
    if (formData.password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    setLoading(true);

    try {
      const res = await authAPI.register({
        email: formData.email,
        password: formData.password,
        full_name: formData.full_name,
      });

      // Older responses omit the flag; treat only an explicit false as a failure
      setEmailSent(res.data?.email_sent !== false);
      setSuccess(true);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-teal-50 via-white to-emerald-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
        <div className="sm:mx-auto sm:w-full sm:max-w-md">
          <div className="bg-white dark:bg-gray-700 py-8 px-4 shadow-xl dark:shadow-gray-200/20 sm:rounded-lg sm:px-10 border dark:border-gray-500">
            {emailSent ? (
              <div className="text-center">
                <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100 dark:bg-green-900/50">
                  <svg className="h-6 w-6 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
                  </svg>
                </div>
                <h3 className="mt-4 text-lg font-medium text-gray-900 dark:text-white">Check Your Email!</h3>
                <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                  We've sent a verification link to <strong>{formData.email}</strong>
                </p>
                <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                  Click the link in the email to verify your account and start using NWC-Analytics.
                </p>
                <div className="mt-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 rounded-lg p-3">
                  <p className="text-sm text-yellow-800 dark:text-yellow-200">
                    <strong>📧 Can't find it?</strong> Check your <strong>spam or junk folder</strong> — verification emails sometimes end up there.
                  </p>
                </div>
                <div className="mt-6">
                  <Link
                    to="/login"
                    className="text-primary-600 dark:text-primary-400 hover:text-primary-500 dark:hover:text-primary-300 font-medium"
                  >
                    Go to Login
                  </Link>
                </div>
              </div>
            ) : (
              <div className="text-center">
                <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-yellow-100 dark:bg-yellow-900/50">
                  <svg className="h-6 w-6 text-yellow-600 dark:text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"></path>
                  </svg>
                </div>
                <h3 className="mt-4 text-lg font-medium text-gray-900 dark:text-white">
                  Account created — but the email didn't send
                </h3>
                <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                  Your account for <strong>{formData.email}</strong> exists, but we couldn't
                  deliver the verification link. You won't be able to log in until it's verified.
                </p>
                <ResendVerification email={formData.email} className="mt-6 text-left" />
                <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
                  Still stuck? Email{' '}
                  <a
                    href="mailto:support@nwc-analytics.com"
                    className="text-primary-600 dark:text-primary-400 hover:underline"
                  >
                    support@nwc-analytics.com
                  </a>
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 via-white to-emerald-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      {/* SEO — React 19 hoists to <head> */}
      <title>Create Account — NWC-Analytics</title>
      <meta name="description" content="Create your NWC-Analytics account and start analyzing stocks with real-time data, technical indicators, DCF valuation models, and price alerts." />
      <link rel="canonical" href="https://nwc-analytics.com/register" />
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <Link to="/" className="flex justify-center">
          <img 
            src="/images/logo.png" 
            alt="NWC-Analytics" 
            className="h-50 w-50"
          />
        </Link>
        <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900 dark:text-white">
          Create your account
        </h2>
        <p className="mt-2 text-center text-sm text-gray-600 dark:text-gray-400">
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-primary-600 dark:text-primary-400 hover:text-primary-500 dark:hover:text-primary-300">
            Sign in
          </Link>
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white dark:bg-gray-700 py-8 px-4 shadow-xl dark:shadow-gray-200/20 sm:rounded-lg sm:px-10 border dark:border-gray-500">
          <form className="space-y-6" onSubmit={handleSubmit}>
            {error && (
              <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 text-red-600 dark:text-red-400 px-4 py-3 rounded-lg">
                {error}
              </div>
            )}

            <div>
              <label htmlFor="full_name" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Full name
              </label>
              <div className="mt-1">
                <input
                  id="full_name"
                  name="full_name"
                  type="text"
                  autoComplete="name"
                  value={formData.full_name}
                  onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                  className="appearance-none block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm placeholder-gray-400 dark:placeholder-gray-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                />
              </div>
            </div>

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Email address
              </label>
              <div className="mt-1">
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="appearance-none block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm placeholder-gray-400 dark:placeholder-gray-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                />
              </div>
            </div>

            <div>
              <label htmlFor="confirmEmail" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Confirm email address
              </label>
              <div className="mt-1">
                <input
                  id="confirmEmail"
                  name="confirmEmail"
                  type="email"
                  autoComplete="email"
                  required
                  value={formData.confirmEmail}
                  onChange={(e) => setFormData({ ...formData, confirmEmail: e.target.value })}
                  onPaste={(e) => e.preventDefault()}
                  className="appearance-none block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm placeholder-gray-400 dark:placeholder-gray-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Password
              </label>
              <div className="mt-1">
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="appearance-none block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm placeholder-gray-400 dark:placeholder-gray-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                />
              </div>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Must be at least 8 characters</p>
            </div>

            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Confirm password
              </label>
              <div className="mt-1">
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={formData.confirmPassword}
                  onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                  className="appearance-none block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm placeholder-gray-400 dark:placeholder-gray-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                />
              </div>
            </div>

            <div>
              <button
                type="submit"
                disabled={loading}
                className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 dark:bg-primary-500 dark:hover:bg-primary-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Creating account...' : 'Create account'}
              </button>
            </div>
          </form>

          <div className="mt-6">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300 dark:border-gray-600" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white dark:bg-gray-700 text-gray-500 dark:text-gray-400">Start with Free tier</span>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-3 gap-3">
              <div className="text-center">
                <p className="text-xs text-gray-500 dark:text-gray-400">✓ 5 stocks reviews</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-gray-500 dark:text-gray-400">✓ 5 watchlist entries</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-gray-500 dark:text-gray-400">✓ 5 portfolio entries</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Register;