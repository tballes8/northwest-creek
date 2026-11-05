// The ticker the user is working on, carried from page to page (Screener,
// Technical Analysis, DCF / Relative Valuation, Options Calculator).
//
// One per browser tab (sessionStorage, like the Screener's active sector), so
// two tabs can follow two different companies. A page records a ticker only
// once it has actually loaded (a quote, an analysis, DCF inputs), so a typo or
// a failed lookup never becomes the sticky ticker. NavBar is the reader: it
// adds the ticker as ?ticker= to the links of the ticker pages, and each page
// keeps reading ?ticker= from its URL as before.
import { useSyncExternalStore } from 'react';

const KEY = 'nwc_active_ticker';

// Symbols only: letters, digits and the separators real tickers use (BRK.B, BF-B).
const VALID = /^[A-Z0-9][A-Z0-9.-]{0,11}$/;

const listeners = new Set<() => void>();

// In-memory copy so the ticker still travels within the app when storage is
// blocked (private windows, strict site-data settings).
let current = (() => {
  try {
    return sessionStorage.getItem(KEY) || '';
  } catch {
    return '';
  }
})();

export function getActiveTicker(): string {
  return current;
}

export function setActiveTicker(ticker: string | null | undefined): void {
  const t = (ticker || '').trim().toUpperCase();
  if (!VALID.test(t) || t === current) return;
  current = t;
  try {
    sessionStorage.setItem(KEY, t);
  } catch {
    /* storage blocked: the in-memory copy still carries it */
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Re-renders the caller whenever a page records a new active ticker. */
export function useActiveTicker(): string {
  return useSyncExternalStore(subscribe, getActiveTicker, () => '');
}
