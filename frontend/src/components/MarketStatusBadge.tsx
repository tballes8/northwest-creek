import React, { useState, useEffect } from 'react';
import '../styles/livePrice.css';

interface MarketStatusBadgeProps {
  isConnected: boolean;
  className?: string;
}

/**
 * Returns true if the US stock market is currently open.
 * Market hours: 9:30 AM – 4:00 PM Eastern Time, Mon–Fri.
 * Does NOT account for holidays.
 */
const isMarketOpen = (): boolean => {
  // Get current time in US Eastern
  const now = new Date();
  const eastern = new Date(
    now.toLocaleString('en-US', { timeZone: 'America/New_York' })
  );

  const day = eastern.getDay(); // 0 = Sun, 6 = Sat
  if (day === 0 || day === 6) return false;

  const hours = eastern.getHours();
  const minutes = eastern.getMinutes();
  const totalMinutes = hours * 60 + minutes;

  const marketOpen = 9 * 60 + 30;  // 9:30 AM
  const marketClose = 16 * 60;      // 4:00 PM

  return totalMinutes >= marketOpen && totalMinutes < marketClose;
};

const MarketStatusBadge: React.FC<MarketStatusBadgeProps> = ({ isConnected, className = '' }) => {
  const [marketOpen, setMarketOpen] = useState<boolean>(isMarketOpen());

  // Re-check market status every 30 seconds
  useEffect(() => {
    setMarketOpen(isMarketOpen());
    const interval = setInterval(() => {
      setMarketOpen(isMarketOpen());
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  if (!isConnected) return null;

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium ${className}`}>
      <span
        className={`inline-block w-2 h-2 rounded-full ${
          marketOpen
            ? 'bg-green-500 live-badge-pulse'
            : 'bg-gray-400 dark:bg-gray-500'
        }`}
      />
      <span
        className={
          marketOpen
            ? 'text-green-600 dark:text-green-400'
            : 'text-gray-500 dark:text-gray-400'
        }
      >
        {marketOpen ? 'Market Open' : 'Market Closed'}
      </span>
    </span>
  );
};

export default MarketStatusBadge;