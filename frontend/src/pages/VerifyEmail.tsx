import React, { useEffect, useState } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

const VerifyEmail: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<'verifying' | 'success' | 'redirecting' | 'error'>('verifying');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const verifyAndRedirect = async () => {
      const token = searchParams.get('token');
      const tier = searchParams.get('tier'); // Will be 'casual', 'active', or 'professional' for paid tiers
      
      if (!token) {
        setStatus('error');
        setMessage('Invalid verification link');
        return;
      }

      try {
        // Step 1: Verify email — backend returns access_token for auto-login
        const response = await axios.get(
          `${API_URL}/api/v1/auth/verify-email?token=${token}`
        );
        
        const accessToken = response.data.access_token;
        
        if (accessToken) {
          // Auto-login: store the token
          localStorage.setItem('access_token', accessToken);
        }

        // Step 2: If paid tier, redirect to Stripe checkout
        if (tier && tier !== 'free' && accessToken) {
          setStatus('redirecting');
          setMessage('Email verified! Redirecting to payment...');
          
          try {
            // Get Stripe config to get the price ID
            const configResponse = await axios.get(`${API_URL}/api/v1/stripe/config`);
            const stripeConfig = configResponse.data;
            
            let priceId = '';
            if (tier === 'casual') priceId = stripeConfig.casual_price_id;
            else if (tier === 'active') priceId = stripeConfig.active_price_id;
            else if (tier === 'professional') priceId = stripeConfig.professional_price_id;
            
            if (priceId) {
              // Create Stripe checkout session
              const checkoutResponse = await axios.post(
                `${API_URL}/api/v1/stripe/create-checkout-session`,
                { price_id: priceId },
                { headers: { Authorization: `Bearer ${accessToken}` } }
              );
              
              // Redirect to Stripe Checkout
              window.location.href = checkoutResponse.data.checkout_url;
              return; // Don't update state further — page is redirecting
            }
          } catch (stripeErr: any) {
            console.error('Stripe checkout error:', stripeErr);
            // Stripe failed, but email is verified — fall through to success
            setStatus('success');
            setMessage('Email verified! There was an issue setting up payment. Please go to Pricing to complete your subscription.');
            setTimeout(() => navigate('/pricing'), 5000);
            return;
          }
        }

        // Step 3: Free tier or no tier — show success and redirect
        setStatus('success');
        setMessage(response.data.message);
        
        if (accessToken) {
          // Auto-logged in — go to dashboard
          setTimeout(() => navigate('/dashboard'), 3000);
        } else {
          // Fallback — go to login
          setTimeout(() => navigate('/login'), 3000);
        }
        
      } catch (err: any) {
        setStatus('error');
        setMessage(err.response?.data?.detail || 'Verification failed. Please try again.');
      }
    };

    verifyAndRedirect();
  }, [searchParams, navigate]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 via-white to-emerald-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <Link to="/" className="flex justify-center">
          <img 
            src="/images/logo.png" 
            alt="Northwest Creek" 
            className="h-50 w-50"
          />
        </Link>
        
        <div className="mt-8 bg-white dark:bg-gray-700 py-8 px-4 shadow-xl dark:shadow-gray-200/20 sm:rounded-lg sm:px-10 border dark:border-gray-500">
          <div className="text-center">
            {/* Verifying */}
            {status === 'verifying' && (
              <>
                <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-primary-100 dark:bg-primary-900/50">
                  <svg className="animate-spin h-6 w-6 text-primary-600 dark:text-primary-400" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                </div>
                <h3 className="mt-4 text-lg font-medium text-gray-900 dark:text-white">Verifying your email...</h3>
                <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">Please wait</p>
              </>
            )}

            {/* Redirecting to Stripe */}
            {status === 'redirecting' && (
              <>
                <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100 dark:bg-green-900/50">
                  <svg className="animate-spin h-6 w-6 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                </div>
                <h3 className="mt-4 text-lg font-medium text-gray-900 dark:text-white">Email Verified!</h3>
                <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">{message}</p>
                <div className="mt-4 bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-700 rounded-lg p-3">
                  <p className="text-sm text-primary-800 dark:text-primary-200">
                    Setting up your subscription payment — you'll be redirected to our secure checkout momentarily.
                  </p>
                </div>
              </>
            )}
            
            {/* Success */}
            {status === 'success' && (
              <>
                <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100 dark:bg-green-900/50">
                  <svg className="h-6 w-6 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
                  </svg>
                </div>
                <h3 className="mt-4 text-lg font-medium text-gray-900 dark:text-white">Email Verified!</h3>
                <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">{message}</p>
                <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Redirecting...</p>
                <div className="mt-6">
                  <Link
                    to="/dashboard"
                    className="text-primary-600 dark:text-primary-400 hover:text-primary-500 dark:hover:text-primary-300 font-medium"
                  >
                    Go to Dashboard Now
                  </Link>
                </div>
              </>
            )}
            
            {/* Error */}
            {status === 'error' && (
              <>
                <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100 dark:bg-red-900/50">
                  <svg className="h-6 w-6 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                  </svg>
                </div>
                <h3 className="mt-4 text-lg font-medium text-gray-900 dark:text-white">Verification Failed</h3>
                <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">{message}</p>
                <div className="mt-6 space-y-3">
                  <Link
                    to="/register"
                    className="block text-primary-600 dark:text-primary-400 hover:text-primary-500 dark:hover:text-primary-300 font-medium"
                  >
                    Register Again
                  </Link>
                  <Link
                    to="/login"
                    className="block text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                  >
                    Back to Login
                  </Link>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default VerifyEmail;
