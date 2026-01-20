import React, { useEffect } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';

const PaymentSuccess: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const sessionId = searchParams.get('session_id');

  useEffect(() => {
    // Redirect to verify email page or dashboard
    const timer = setTimeout(() => {
      navigate('/dashboard');
    }, 5000);

    return () => clearTimeout(timer);
  }, [navigate]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-emerald-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white dark:bg-gray-700 py-8 px-4 shadow-xl dark:shadow-gray-200/20 sm:rounded-lg sm:px-10 border dark:border-gray-500">
          <div className="text-center">
            <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-green-100 dark:bg-green-900/50 mb-4">
              <svg className="h-10 w-10 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
              </svg>
            </div>
            
            <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
              Payment Successful! 🎉
            </h3>
            
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              Your subscription has been activated successfully.
            </p>

            <div className="bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-700 rounded-lg p-4 mb-6">
              <p className="text-sm text-yellow-800 dark:text-yellow-200">
                <strong>Important:</strong> Please check your email and verify your account to start using all features.
              </p>
            </div>
            
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
              You now have access to all premium features!
            </p>
            
            <div className="space-y-3">
              <Link
                to="/dashboard"
                className="block w-full px-6 py-3 bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-lg transition-colors"
              >
                Go to Dashboard
              </Link>
              
              <Link
                to="/technical-analysis"
                className="block w-full px-6 py-3 bg-gray-200 dark:bg-gray-600 text-gray-900 dark:text-white font-semibold rounded-lg hover:bg-gray-300 dark:hover:bg-gray-500 transition-colors"
              >
                Try Technical Analysis
              </Link>
            </div>
            
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-6">
              Redirecting to dashboard in 5 seconds...
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PaymentSuccess;