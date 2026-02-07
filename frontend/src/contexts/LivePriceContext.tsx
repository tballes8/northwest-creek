/**
 * LivePriceContext
 * Provides a single shared WebSocket connection for live prices across all pages.
 * Wrap your app (or router layout) with <LivePriceProvider> so the connection
 * persists when navigating between Portfolio, Watchlist, etc.
 */
import React, { createContext, useContext } from 'react';
import { useLivePrices } from '../hooks/useLivePrices';

interface LivePrice {
  ticker: string;
  price: number;
  size?: number;
  timestamp?: number;
  updated_at: string;
}

interface LivePriceContextType {
  prices: Map<string, LivePrice>;
  isConnected: boolean;
  subscribe: (tickers: string[]) => void;
  unsubscribe: (tickers: string[]) => void;
  error: string | null;
}

const LivePriceContext = createContext<LivePriceContextType>({
  prices: new Map(),
  isConnected: false,
  subscribe: () => {},
  unsubscribe: () => {},
  error: null,
});

export const LivePriceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const livePrices = useLivePrices();

  return (
    <LivePriceContext.Provider value={livePrices}>
      {children}
    </LivePriceContext.Provider>
  );
};

export const useLivePriceContext = (): LivePriceContextType => {
  return useContext(LivePriceContext);
};

export default LivePriceContext;