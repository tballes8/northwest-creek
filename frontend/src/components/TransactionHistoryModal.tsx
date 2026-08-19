import React, { useEffect, useMemo, useState } from 'react';
import {
  portfolioAPI,
  PortfolioTransaction,
  TransactionType,
} from '../services/api';

interface TransactionHistoryModalProps {
  onClose: () => void;
  /** Called after a successful void so the parent can refresh holdings. */
  onVoided?: () => void;
  totalRealizedPL: number;
}

// Teal for buys, amber for sales, gray for bookkeeping rows. Deliberately not
// green/red: those are reserved for the sign of a P&L figure on this page, and a
// red SELL pill sitting beside a green gain reads as a contradiction.
const TYPE_PILL: Record<TransactionType, string> = {
  BUY: 'bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-400',
  SELL: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400',
  ADJUST: 'bg-gray-100 dark:bg-gray-600 text-gray-700 dark:text-gray-300',
  REVERSAL: 'bg-gray-100 dark:bg-gray-600 text-gray-700 dark:text-gray-300',
};

const TransactionHistoryModal: React.FC<TransactionHistoryModalProps> = ({
  onClose,
  onVoided,
  totalRealizedPL,
}) => {
  const [transactions, setTransactions] = useState<PortfolioTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tickerFilter, setTickerFilter] = useState('');
  const [voidingId, setVoidingId] = useState<string | null>(null);

  const load = async () => {
    try {
      const response = await portfolioAPI.getTransactions({ limit: 200 });
      setTransactions(response.data.transactions || []);
      setError('');
    } catch (err) {
      console.error('Failed to load transactions:', err);
      setError('Could not load your transaction history.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tickers = useMemo(
    () => Array.from(new Set(transactions.map(t => t.ticker))).sort(),
    [transactions]
  );

  // Client-side: a retail ledger is tens of rows, so a server round trip per
  // filter change would be pure latency.
  const visible = useMemo(
    () => (tickerFilter ? transactions.filter(t => t.ticker === tickerFilter) : transactions),
    [transactions, tickerFilter]
  );

  const handleVoid = async (txn: PortfolioTransaction) => {
    if (
      !window.confirm(
        `Void this sale of ${txn.quantity} ${txn.ticker}? The shares are restored and the ` +
          `realized P&L is reversed. Nothing is deleted — a reversal entry is added to your history.`
      )
    ) {
      return;
    }
    setVoidingId(txn.id);
    try {
      await portfolioAPI.voidTransaction(txn.id);
      await load();
      onVoided?.();
    } catch (err: any) {
      console.error('Void error:', err.response?.data);
      setError(err.response?.data?.detail || 'Failed to void this sale.');
    } finally {
      setVoidingId(null);
    }
  };

  const gainClass = (value: number) =>
    value >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-white dark:bg-gray-800 rounded-xl shadow-2xl border dark:border-gray-600 w-full max-w-5xl max-h-[85vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b dark:border-gray-700">
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">Transaction History</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Lifetime realized P&amp;L:{' '}
              <span className={`font-semibold ${gainClass(totalRealizedPL)}`}>
                {totalRealizedPL >= 0 ? '+' : ''}${totalRealizedPL.toFixed(2)}
              </span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            {tickers.length > 1 && (
              <select
                value={tickerFilter}
                onChange={(e) => setTickerFilter(e.target.value)}
                className="px-3 py-1.5 text-xs rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
              >
                <option value="">All tickers</option>
                {tickers.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            )}
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="overflow-y-auto px-6 py-4 flex-1">
          {error && (
            <div className="mb-4 p-4 bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-700 rounded-lg">
              <p className="text-red-700 dark:text-red-400">{error}</p>
            </div>
          )}

          {loading ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600 mx-auto"></div>
              <p className="mt-4 text-gray-600 dark:text-gray-400">Loading history...</p>
            </div>
          ) : visible.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-4xl mb-3">📭</div>
              <p className="text-gray-600 dark:text-gray-400">
                No transactions recorded yet.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    <th className="text-left py-2 pr-4">Date</th>
                    <th className="text-left py-2 pr-4">Ticker</th>
                    <th className="text-left py-2 pr-4">Type</th>
                    <th className="text-right py-2 pr-4">Shares</th>
                    <th className="text-right py-2 pr-4">Price</th>
                    <th className="text-right py-2 pr-4">Amount</th>
                    <th className="text-right py-2 pr-4">Realized P&amp;L</th>
                    <th className="text-left py-2 pr-4">Notes</th>
                    <th className="text-right py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y dark:divide-gray-700">
                  {visible.map(txn => (
                    <tr
                      key={txn.id}
                      className={`hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors ${
                        txn.is_voided ? 'line-through opacity-60' : ''
                      }`}
                    >
                      <td className="py-2 pr-4 text-gray-900 dark:text-white whitespace-nowrap">
                        {txn.transaction_date}
                      </td>
                      <td className="py-2 pr-4 font-medium text-gray-900 dark:text-white">
                        {txn.ticker}
                      </td>
                      <td className="py-2 pr-4">
                        <span
                          className={`inline-flex items-center px-1.5 py-0.5 rounded text-[0.65rem] font-semibold uppercase leading-none ${TYPE_PILL[txn.transaction_type]}`}
                        >
                          {txn.transaction_type}
                        </span>
                      </td>
                      <td className="py-2 pr-4 text-right text-gray-900 dark:text-white">
                        {txn.quantity}
                      </td>
                      <td className="py-2 pr-4 text-right text-gray-900 dark:text-white">
                        ${txn.price.toFixed(2)}
                      </td>
                      <td className="py-2 pr-4 text-right text-gray-900 dark:text-white">
                        ${txn.amount.toFixed(2)}
                      </td>
                      <td className="py-2 pr-4 text-right">
                        {txn.realized_pl == null ? (
                          <span className="text-gray-400 dark:text-gray-500">—</span>
                        ) : (
                          <span className={`font-medium ${gainClass(txn.realized_pl)}`}>
                            {txn.realized_pl >= 0 ? '+' : ''}${txn.realized_pl.toFixed(2)}
                          </span>
                        )}
                      </td>
                      <td className="py-2 pr-4 text-gray-500 dark:text-gray-400 max-w-xs truncate">
                        {txn.notes || '—'}
                      </td>
                      <td className="py-2 text-right whitespace-nowrap">
                        {txn.transaction_type === 'SELL' && !txn.is_voided && (
                          <button
                            onClick={() => handleVoid(txn)}
                            disabled={voidingId === txn.id}
                            className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300 disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            {voidingId === txn.id ? 'Voiding…' : 'Void'}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TransactionHistoryModal;
