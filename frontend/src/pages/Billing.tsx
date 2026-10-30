/**
 * Billing — where a user fixes a failed payment or manages their card.
 *
 * The route guard sends past_due / unpaid subscriptions here (never to /payment,
 * which would start a second subscription), and the payment-failed and
 * trial-ending emails link here. Not wrapped in SubscriptionGuard: it has to
 * work for exactly the accounts the guard turns away.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { stripeAPI } from '../services/api';

interface BillingStatus {
  subscription_status: 'active' | 'trialing' | 'past_due' | 'unpaid' | null;
  cancel_at_period_end: boolean;
  current_period_end: number | null;
  open_invoice_url: string | null;
}

const formatDate = (unix: number | null) =>
  unix ? new Date(unix * 1000).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : null;

const Billing: React.FC = () => {
  const navigate = useNavigate();
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cancelled, setCancelled] = useState(false);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const res = await stripeAPI.getSubscriptionStatus();
      setStatus(res.data);
    } catch (err: any) {
      if (err.response?.status === 401) {
        navigate('/login');
        return;
      }
      setLoadError("We couldn't load your billing status. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    if (!localStorage.getItem('access_token')) {
      navigate('/login');
      return;
    }
    loadStatus();
  }, [navigate, loadStatus]);

  const openPortal = async () => {
    setBusy(true);
    setActionError('');
    try {
      const res = await stripeAPI.openBillingPortal('billing');
      window.location.href = res.data.url;
    } catch (err: any) {
      setActionError(err.response?.data?.detail || 'Could not open billing management. Please try again.');
      setBusy(false);
    }
  };

  const cancelSubscription = async () => {
    setBusy(true);
    setActionError('');
    try {
      await stripeAPI.cancelSubscriptionImmediate();
      setCancelled(true);
    } catch (err: any) {
      setActionError(err.response?.data?.detail || 'Could not cancel. Please try again.');
    } finally {
      setBusy(false);
      setConfirmCancel(false);
    }
  };

  const subStatus = status?.subscription_status ?? null;
  const paymentFailed = subStatus === 'past_due' || subStatus === 'unpaid';
  const hasAccess = subStatus === 'active' || subStatus === 'trialing';

  const primaryBtn = 'block w-full py-3 px-4 bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-lg transition-colors text-center disabled:opacity-50';
  const secondaryBtn = 'block w-full py-3 px-4 border border-gray-600 hover:border-gray-500 text-gray-200 font-semibold rounded-lg transition-colors text-center disabled:opacity-50';

  let body: React.ReactNode;
  if (loading) {
    body = <p className="text-gray-400 text-center py-6">Loading your billing status…</p>;
  } else if (loadError) {
    body = (
      <div className="text-center py-4">
        <p className="text-red-400 mb-4">{loadError}</p>
        <button onClick={loadStatus} className="text-primary-400 hover:text-primary-300 text-sm">Try again</button>
      </div>
    );
  } else if (cancelled) {
    body = (
      <>
        <h1 className="text-2xl font-bold text-white mb-2">Subscription cancelled</h1>
        <p className="text-gray-400 mb-6">Your data is preserved. You can resubscribe anytime to regain access.</p>
        <Link to="/pricing" className={primaryBtn}>Choose a plan</Link>
      </>
    );
  } else if (paymentFailed) {
    body = (
      <>
        <h1 className="text-2xl font-bold text-white mb-2">Your last payment didn't go through</h1>
        <p className="text-gray-400 mb-6">
          This usually means a card expired or was declined. Pay the outstanding invoice to restore access now.
          You can also update the card we'll charge in future.
        </p>
        <div className="space-y-3">
          {status?.open_invoice_url && (
            <a href={status.open_invoice_url} className={primaryBtn}>Pay outstanding invoice</a>
          )}
          <button onClick={openPortal} disabled={busy} className={status?.open_invoice_url ? secondaryBtn : primaryBtn}>
            Update payment method
          </button>
          <button onClick={loadStatus} disabled={busy} className="w-full text-sm text-primary-400 hover:text-primary-300 pt-1">
            I've paid — check again
          </button>
        </div>
        <div className="mt-8 pt-4 border-t border-gray-700 text-center">
          {confirmCancel ? (
            <div>
              <p className="text-sm text-gray-300 mb-3">Cancel your subscription instead? Your account will be paused until you resubscribe.</p>
              <div className="flex gap-3 justify-center">
                <button onClick={cancelSubscription} disabled={busy} className="text-sm text-red-400 hover:text-red-300">Yes, cancel</button>
                <button onClick={() => setConfirmCancel(false)} disabled={busy} className="text-sm text-gray-400 hover:text-gray-300">Keep it</button>
              </div>
            </div>
          ) : (
            <button onClick={() => setConfirmCancel(true)} className="text-sm text-gray-500 hover:text-gray-400">
              Cancel subscription instead
            </button>
          )}
        </div>
      </>
    );
  } else if (hasAccess) {
    const periodEnd = formatDate(status?.current_period_end ?? null);
    body = (
      <>
        <h1 className="text-2xl font-bold text-white mb-2">
          {subStatus === 'trialing' ? 'Your free trial is active' : 'Your subscription is active'}
        </h1>
        <p className="text-gray-400 mb-6">
          {status?.cancel_at_period_end && periodEnd
            ? `It's set to end on ${periodEnd}.`
            : 'Manage your payment method and download invoices below.'}
        </p>
        <div className="space-y-3">
          <button onClick={openPortal} disabled={busy} className={primaryBtn}>
            Manage payment method &amp; invoices
          </button>
          <Link to="/dashboard" className={secondaryBtn}>Go to dashboard</Link>
        </div>
      </>
    );
  } else {
    body = (
      <>
        <h1 className="text-2xl font-bold text-white mb-2">No active subscription</h1>
        <p className="text-gray-400 mb-6">Choose a plan to get started. Your saved data is still here.</p>
        <Link to="/pricing" className={primaryBtn}>Choose a plan</Link>
      </>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col justify-center py-12 px-4">
      <title>Billing — NWC-Analytics</title>
      <meta name="robots" content="noindex" />
      <div className="max-w-md mx-auto w-full">
        <div className="text-center mb-8">
          <Link to="/" className="inline-block">
            <img src="/images/logo.png" alt="NWC-Analytics" className="h-12 w-12 mx-auto" />
          </Link>
        </div>
        <div className="bg-gray-800 border border-gray-700 rounded-2xl p-8">
          {actionError && (
            <div className="bg-red-900/30 border border-red-700 text-red-400 px-4 py-3 rounded-lg text-sm mb-6">
              {actionError}
            </div>
          )}
          {body}
        </div>
        <p className="text-center text-xs text-gray-500 mt-6">
          Questions? <a href="mailto:support@nwc-analytics.com" className="text-primary-400 hover:text-primary-300">support@nwc-analytics.com</a>
        </p>
      </div>
    </div>
  );
};

export default Billing;
