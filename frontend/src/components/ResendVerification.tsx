import React, { useState } from 'react';
import { authAPI } from '../services/api';

interface ResendVerificationProps {
  /** Pre-fill the address. When omitted the user is asked for it (e.g. after an
   *  expired token, where we no longer know who they are). */
  email?: string;
  /** Carried through so the post-verification redirect still lands on payment. */
  selectedTier?: string;
  className?: string;
}

/**
 * Recovery path for a user whose verification email never arrived.
 *
 * Without this they are stranded: login returns 403, re-registering returns
 * "Email already registered", and a password reset does not verify them.
 */
const ResendVerification: React.FC<ResendVerificationProps> = ({
  email,
  selectedTier,
  className = '',
}) => {
  const [address, setAddress] = useState(email ?? '');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const handleResend = async () => {
    if (!address.trim()) {
      setStatus('error');
      setMessage('Enter your email address first.');
      return;
    }

    setStatus('sending');
    setMessage('');

    try {
      const res = await authAPI.resendVerification({ email: address.trim() }, selectedTier);
      setStatus('sent');
      setMessage(res.data?.message || 'Verification email sent! Check your inbox and spam folder.');
    } catch (err: any) {
      setStatus('error');
      setMessage(
        err.response?.data?.detail ||
          "We couldn't send the verification email. Please try again shortly."
      );
    }
  };

  return (
    <div className={className}>
      {!email && status !== 'sent' && (
        <input
          type="email"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="you@example.com"
          className="w-full mb-3 px-3 py-2 border border-gray-300 dark:border-gray-500 rounded-md shadow-sm bg-white dark:bg-gray-600 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-primary-500 focus:border-primary-500"
        />
      )}

      {status !== 'sent' && (
        <button
          type="button"
          onClick={handleResend}
          disabled={status === 'sending'}
          className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
        >
          {status === 'sending' ? 'Sending…' : 'Resend verification email'}
        </button>
      )}

      {message && (
        <p
          className={`mt-3 text-sm ${
            status === 'sent'
              ? 'text-green-600 dark:text-green-400'
              : 'text-red-600 dark:text-red-400'
          }`}
        >
          {message}
        </p>
      )}
    </div>
  );
};

export default ResendVerification;
