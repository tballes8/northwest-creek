import React, { useCallback, useEffect, useState } from 'react';
import {
  portfolioAPI,
  PortfolioTransaction,
  TransactionType,
} from '../services/api';
import { downloadCSV } from '../utils/csv';

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

// The ledger is append-only and never pruned, so it outgrows any single fetch.
// One screenful per request, and the export walks the whole thing at the
// endpoint's ceiling rather than shipping whatever happens to be on screen.
const PAGE_SIZE = 50;
const EXPORT_PAGE_SIZE = 200;

const TransactionHistoryModal: React.FC<TransactionHistoryModalProps> = ({
  onClose,
  onVoided,
  totalRealizedPL,
}) => {
  const [transactions, setTransactions] = useState<PortfolioTransaction[]>([]);
  const [total, setTotal] = useState(0);
  const [tickers, setTickers] = useState<string[]>([]);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const [tickerFilter, setTickerFilter] = useState('');
  const [voidingId, setVoidingId] = useState<string | null>(null);

  // Paging and filtering are both the server's job now. A page-local filter
  // would search only the rows already fetched, which on a long ledger means
  // "no AAPL trades" when the AAPL trades are simply on page four.
  const load = useCallback(async (pageOffset: number, ticker: string) => {
    setLoading(true);
    try {
      const response = await portfolioAPI.getTransactions({
        limit: PAGE_SIZE,
        offset: pageOffset,
        ticker: ticker || undefined,
      });
      const data = response.data;
      setTransactions(data.transactions || []);
      setTotal(data.total || 0);
      setTickers(data.tickers || []);
      setError('');
      // Rows are only ever appended, so an offset can outrun the ledger only if
      // it was stale to begin with. Fall back to the first page rather than
      // show an empty table above a non-zero count.
      if (pageOffset > 0 && (data.transactions || []).length === 0 && (data.total || 0) > 0) {
        setOffset(0);
      }
    } catch (err) {
      console.error('Failed to load transactions:', err);
      setError('Could not load your transaction history.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(offset, tickerFilter);
  }, [load, offset, tickerFilter]);

  const handleTickerFilter = (value: string) => {
    setTickerFilter(value);
    setOffset(0);
  };

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
      await load(offset, tickerFilter);
      onVoided?.();
    } catch (err: any) {
      console.error('Void error:', err.response?.data);
      setError(err.response?.data?.detail || 'Failed to void this sale.');
    } finally {
      setVoidingId(null);
    }
  };

  // Exports the whole filtered history, not the visible page — a CSV that
  // stopped at the page boundary would reconcile against a broker statement and
  // appear to be missing trades. Voided rows are kept with a flag rather than
  // dropped: they are struck through here, not deleted, and a reconciliation
  // needs to see them.
  const exportCSV = async () => {
    setExporting(true);
    try {
      const all: PortfolioTransaction[] = [];
      let ledgerTotal = Infinity;
      for (let page = 0; all.length < ledgerTotal; page += 1) {
        const response = await portfolioAPI.getTransactions({
          limit: EXPORT_PAGE_SIZE,
          offset: page * EXPORT_PAGE_SIZE,
          ticker: tickerFilter || undefined,
        });
        ledgerTotal = response.data.total || 0;
        const batch = response.data.transactions || [];
        if (batch.length === 0) break;
        all.push(...batch);
      }

      const header = [
        'Date', 'Ticker', 'Type', 'Shares', 'Price', 'Amount',
        'Cost Basis Per Share', 'Realized P&L', 'Realized P&L %', 'Voided', 'Notes',
      ];
      const rows = all.map(txn => [
        txn.transaction_date,
        txn.ticker,
        txn.transaction_type,
        txn.quantity,
        txn.price.toFixed(2),
        txn.amount.toFixed(2),
        txn.cost_basis_per_share == null ? '' : txn.cost_basis_per_share.toFixed(4),
        txn.realized_pl == null ? '' : txn.realized_pl.toFixed(2),
        txn.realized_pl_percent == null ? '' : txn.realized_pl_percent.toFixed(2),
        txn.is_voided ? 'Yes' : 'No',
        txn.notes || '',
      ]);
      const scope = tickerFilter ? `${tickerFilter}_` : '';
      downloadCSV(
        `transaction_history_${scope}${new Date().toISOString().slice(0, 10)}.csv`,
        header,
        rows
      );
    } catch (err) {
      console.error('Export error:', err);
      setError('Could not export your transaction history.');
    } finally {
      setExporting(false);
    }
  };

  const gainClass = (value: number) =>
    value >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400';

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;
  const rangeStart = total === 0 ? 0 : offset + 1;
  // While a page is in flight `transactions` still holds the previous page, so
  // the range is projected from the offset rather than read off stale rows.
  const rangeEnd = loading
    ? Math.min(offset + PAGE_SIZE, total)
    : offset + transactions.length;
  const pagerButton =
    'px-2.5 py-1 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 ' +
    'dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors ' +
    'disabled:opacity-40 disabled:cursor-not-allowed';

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
            <button
              onClick={exportCSV}
              disabled={total === 0 || exporting}
              title={total ? 'Download full transaction history as CSV' : 'No transactions to export'}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-teal-500/50 text-teal-600 dark:text-teal-400 hover:bg-teal-500/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M7 1v8m-3-3l3 3 3-3M1 11h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              {exporting ? 'Exporting…' : 'Export CSV'}
            </button>
            {(tickers.length > 1 || tickerFilter) && (
              <select
                value={tickerFilter}
                onChange={(e) => handleTickerFilter(e.target.value)}
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
          ) : transactions.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-4xl mb-3">📭</div>
              <p className="text-gray-600 dark:text-gray-400">
                {tickerFilter
                  ? `No ${tickerFilter} transactions recorded.`
                  : 'No transactions recorded yet.'}
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
                  {transactions.map(txn => (
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

        {/* Pager — the count shows even on a single page, so the ledger and its
            export are never quietly narrower than they look. */}
        {total > 0 && (
          <div className="flex items-center justify-between gap-3 px-6 py-3 border-t dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400">
            <span>
              Showing {rangeStart}–{rangeEnd} of {total}
              {tickerFilter ? ` ${tickerFilter}` : ''} transaction{total === 1 ? '' : 's'}
            </span>
            {pageCount > 1 && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                  disabled={loading || offset === 0}
                  className={pagerButton}
                >
                  Previous
                </button>
                <span className="whitespace-nowrap">
                  Page {currentPage} of {pageCount}
                </span>
                <button
                  onClick={() => setOffset(offset + PAGE_SIZE)}
                  disabled={loading || offset + PAGE_SIZE >= total}
                  className={pagerButton}
                >
                  Next
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default TransactionHistoryModal;
