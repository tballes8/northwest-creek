import React, { useState, useEffect } from 'react';
import '../styles/livePrice.css';

interface MarketStatusBadgeProps {
  isConnected: boolean;
  className?: string;
}

/** Easter Sunday date for a given year (Anonymous Gregorian algorithm). */
const easterSunday = (year: number): Date => {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3 = March, 4 = April
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
};

/**
 * Returns the set of NYSE market holidays for a given year as "YYYY-MM-DD" strings.
 * Covers: New Year's Day, MLK Day, Presidents' Day, Good Friday, Memorial Day,
 * Juneteenth, Independence Day, Labor Day, Thanksgiving, Christmas.
 * Weekend holidays are moved to the observed weekday (Friday before or Monday after).
 */
const nyseHolidays = (year: number): Set<string> => {
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  // Move a fixed-date holiday to observed weekday if it falls on a weekend
  const observed = (month: number, day: number): Date => {
    const d = new Date(year, month - 1, day);
    if (d.getDay() === 6) { d.setDate(d.getDate() - 1); } // Sat → Fri
    if (d.getDay() === 0) { d.setDate(d.getDate() + 1); } // Sun → Mon
    return d;
  };

  // Nth weekday of a month (e.g. 3rd Monday = nthWeekday(year, 1, 1, 3))
  const nthWeekday = (month: number, weekday: number, n: number): Date => {
    const d = new Date(year, month - 1, 1);
    const offset = (weekday - d.getDay() + 7) % 7;
    d.setDate(1 + offset + (n - 1) * 7);
    return d;
  };

  // Last weekday of a month (e.g. last Monday of May)
  const lastWeekday = (month: number, weekday: number): Date => {
    const d = new Date(year, month, 0); // last day of month
    const offset = (d.getDay() - weekday + 7) % 7;
    d.setDate(d.getDate() - offset);
    return d;
  };

  // Good Friday = 2 days before Easter Sunday
  const easter = easterSunday(year);
  const goodFriday = new Date(easter);
  goodFriday.setDate(easter.getDate() - 2);

  const holidays = [
    observed(1, 1),               // New Year's Day
    nthWeekday(1, 1, 3),          // MLK Day (3rd Monday in Jan)
    nthWeekday(2, 1, 3),          // Presidents' Day (3rd Monday in Feb)
    goodFriday,                   // Good Friday
    lastWeekday(5, 1),            // Memorial Day (last Monday in May)
    observed(6, 19),              // Juneteenth
    observed(7, 4),               // Independence Day
    nthWeekday(9, 1, 1),          // Labor Day (1st Monday in Sep)
    nthWeekday(11, 4, 4),         // Thanksgiving (4th Thursday in Nov)
    observed(12, 25),             // Christmas Day
  ];

  return new Set(holidays.map(fmt));
};

/**
 * Returns true if the US stock market is currently open.
 * Market hours: 9:30 AM – 4:00 PM Eastern Time, Mon–Fri, excluding NYSE holidays.
 */
const isMarketOpen = (): boolean => {
  const now = new Date();
  const eastern = new Date(
    now.toLocaleString('en-US', { timeZone: 'America/New_York' })
  );

  const day = eastern.getDay(); // 0 = Sun, 6 = Sat
  if (day === 0 || day === 6) return false;

  const year = eastern.getFullYear();
  const dateStr = `${year}-${String(eastern.getMonth() + 1).padStart(2, '0')}-${String(eastern.getDate()).padStart(2, '0')}`;
  if (nyseHolidays(year).has(dateStr)) return false;

  const totalMinutes = eastern.getHours() * 60 + eastern.getMinutes();
  return totalMinutes >= 9 * 60 + 30 && totalMinutes < 16 * 60;
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