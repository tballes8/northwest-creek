import React, { useState } from 'react';
import { portfolioAPI, SellPositionResponse } from '../services/api';
import { PortfolioPosition } from '../types';

interface SellPositionModalProps {
  /** Live row from the parent's portfolio state, not a snapshot — the parent
   *  re-derives it by id so price ticks keep the preview accurate. */
  position: PortfolioPosition;
  livePrice?: number;
  onClose: () => void;
  onSold: (result: SellPositionResponse) => void;
}

const todayISO = () => new Date().toISOString().split('T')[0];

const SellPositionModal: React.FC<SellPositionModalProps> = ({
  position,
  livePrice,
  onClose,
  onSold,
}) => {
  // Initialized once per open — the parent mounts this conditionally, so there
  // is no need for an effect to resync when a different row is selected.
  const [sellQuantity, setSellQuantity] = useState(String(position.quantity));
  const [sellPrice, setSellPrice] = useState(
    String(livePrice ?? position.current_price ?? position.buy_price)
  );
  const [sellDate, setSellDate] = useState(todayISO());
  const [sellNotes, setSellNotes] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const today = todayISO();

  // Derived on every render rather than held in state, so the preview tracks
  // both what the user types and any live price update to the underlying row.
  const qty = parseInt(sellQuantity, 10) || 0;
  const px = parseFloat(sellPrice) || 0;
  const proceeds = px * qty;
  const costRemoved = position.buy_price * qty;
  const realized = proceeds - costRemoved;
  const realizedPct =
    position.buy_price > 0 ? ((px - position.buy_price) / position.buy_price) * 100 : 0;
  const remaining = position.quantity - qty;
  const isFullExit = qty > 0 && remaining === 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!sellQuantity || !sellPrice || !sellDate) {
      setError('Please fill in all required fields');
      return;
    }
    if (isNaN(qty) || qty <= 0) {
      setError('Quantity must be a whole number greater than 0');
      return;
    }
    if (qty > position.quantity) {
      setError(`You only hold ${position.quantity} shares of ${position.ticker}`);
      return;
    }
    if (px <= 0) {
      setError('Sell price must be greater than 0');
      return;
    }
    if (sellDate > today) {
      setError('Sell date cannot be in the future');
      return;
    }
    if (position.buy_date && sellDate < position.buy_date) {
      setError(`Sell date cannot be before the purchase date (${position.buy_date})`);
      return;
    }

    setSubmitting(true);
    try {
      const response = await portfolioAPI.sell(position.id, {
        quantity: qty,
        sell_price: px,
        sell_date: sellDate,
        notes: sellNotes.trim() || undefined,
      });
      onSold(response.data);
    } catch (err: any) {
      console.error('Sell position error:', err.response?.data);
      setError(err.response?.data?.detail || 'Failed to record the sale. Please try again.');
      setSubmitting(false);
    }
  };

  const gainClass = (value: number) =>
    value >= 0
      ? 'text-green-600 dark:text-green-400'
      : 'text-red-600 dark:text-red-400';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-white dark:bg-gray-800 rounded-xl shadow-2xl border dark:border-gray-600 w-full max-w-lg max-h-[85vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b dark:border-gray-700">
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">
              Sell {position.ticker}
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Holding {position.quantity} shares at ${position.buy_price.toFixed(2)} average cost
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto px-6 py-4 flex-1">
          {error && (
            <div className="mb-4 p-4 bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-700 rounded-lg">
              <p className="text-red-700 dark:text-red-400">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Quantity *
                </label>
                <input
                  type="number"
                  value={sellQuantity}
                  onChange={(e) => setSellQuantity(e.target.value)}
                  step="1"
                  min="1"
                  max={position.quantity}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  required
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Max {position.quantity}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Sell Price *
                </label>
                <input
                  type="number"
                  value={sellPrice}
                  onChange={(e) => setSellPrice(e.target.value)}
                  step="0.0001"
                  min="0"
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  required
                />
                {livePrice != null && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Current:{' '}
                    <span className="text-gray-900 dark:text-white font-medium">
                      ${livePrice.toFixed(2)}
                    </span>
                  </p>
                )}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Sell Date *
              </label>
              <input
                type="date"
                value={sellDate}
                onChange={(e) => setSellDate(e.target.value)}
                max={today}
                min={position.buy_date}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Notes (optional)
              </label>
              <input
                type="text"
                value={sellNotes}
                onChange={(e) => setSellNotes(e.target.value)}
                placeholder="Took profit"
                maxLength={500}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
            </div>

            {/* Live preview. Cost basis per share is unchanged by a sale, so
                this is simply (sell price - basis) x shares. */}
            <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-4 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-400">Proceeds</span>
                <span className="text-gray-900 dark:text-white font-medium">
                  ${proceeds.toFixed(2)}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-400">Cost basis sold</span>
                <span className="text-gray-900 dark:text-white font-medium">
                  ${costRemoved.toFixed(2)}
                </span>
              </div>
              <div className="flex items-center justify-between pt-2 border-t dark:border-gray-700">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Realized P&amp;L
                </span>
                <div className="text-right">
                  <div className={`text-xl font-bold ${gainClass(realized)}`}>
                    {realized >= 0 ? '+' : ''}${realized.toFixed(2)}
                  </div>
                  <div className={`text-xs ${gainClass(realizedPct)}`}>
                    ({realizedPct >= 0 ? '+' : ''}{realizedPct.toFixed(2)}%)
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-400">Shares remaining</span>
                <span className="text-gray-900 dark:text-white font-medium">
                  {remaining >= 0 ? remaining : 0}
                </span>
              </div>
            </div>

            {isFullExit && (
              <div className="bg-yellow-50 dark:bg-yellow-900/20 p-3 rounded-lg border border-yellow-200 dark:border-yellow-800">
                <p className="text-sm text-gray-700 dark:text-gray-300">
                  <strong>Heads up:</strong> this closes your entire {position.ticker} position, so
                  the row will be removed from your holdings. The trade itself stays in your
                  transaction history.
                </p>
              </div>
            )}

            <div className="flex gap-3">
              <button
                type="submit"
                disabled={submitting}
                className="px-6 py-2 bg-primary-600 hover:bg-primary-700 dark:bg-primary-500 dark:hover:bg-primary-600 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? 'Recording…' : 'Confirm Sell'}
              </button>
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="px-6 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-600 dark:hover:bg-gray-500 text-gray-900 dark:text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default SellPositionModal;
