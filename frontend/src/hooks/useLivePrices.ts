/**
 * useLivePrices Hook
 * Connects to backend WebSocket for real-time price updates
 */
import { useState, useEffect, useRef, useCallback } from 'react';

interface LivePrice {
  ticker: string;
  price: number;
  size?: number;
  timestamp?: number;
  updated_at: string;
}

interface UseLivePricesReturn {
  prices: Map<string, LivePrice>;
  isConnected: boolean;
  subscribe: (tickers: string[]) => void;
  unsubscribe: (tickers: string[]) => void;
  error: string | null;
}

const WS_URL = process.env.REACT_APP_API_URL
  ? `${process.env.REACT_APP_API_URL.replace('http', 'ws')}/api/v1/live-prices/ws`
  : 'ws://localhost:8000/api/v1/live-prices/ws';

export function useLivePrices(): UseLivePricesReturn {
  const [prices, setPrices] = useState<Map<string, LivePrice>>(new Map());
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const subscribedTickersRef = useRef<Set<string>>(new Set());
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttempts = 5;

  const connect = useCallback(() => {
    try {
      console.log('🔌 Connecting to live prices WebSocket...');
      
      const ws = new WebSocket(WS_URL);
      
      ws.onopen = () => {
        console.log('✅ WebSocket connected');
        setIsConnected(true);
        setError(null);
        reconnectAttemptsRef.current = 0;
        
        // Resubscribe to all tracked tickers on (re)connect
        if (subscribedTickersRef.current.size > 0) {
          const tickers = Array.from(subscribedTickersRef.current);
          ws.send(JSON.stringify({
            action: 'subscribe',
            tickers: tickers
          }));
          console.log('🔄 Resubscribed to:', tickers);
        }
      };
      
      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          
          if (message.type === 'price_update') {
            // Single price update
            const priceData = message.data as LivePrice;
            setPrices((prev) => {
              const newPrices = new Map(prev);
              newPrices.set(priceData.ticker, priceData);
              return newPrices;
            });
          } else if (message.type === 'price_cache') {
            // Batch price updates (initial cache)
            const priceArray = message.data as LivePrice[];
            setPrices((prev) => {
              const newPrices = new Map(prev);
              priceArray.forEach((priceData) => {
                newPrices.set(priceData.ticker, priceData);
              });
              return newPrices;
            });
          } else if (message.type === 'pong') {
            // Heartbeat response
            console.log('💓 Pong received');
          }
        } catch (err) {
          console.error('Error parsing WebSocket message:', err);
        }
      };
      
      ws.onerror = (event) => {
        console.error('❌ WebSocket error:', event);
        setError('WebSocket connection error');
      };
      
      ws.onclose = (event) => {
        console.log('🔌 WebSocket disconnected:', event.code, event.reason);
        setIsConnected(false);
        
        // Attempt to reconnect
        if (reconnectAttemptsRef.current < maxReconnectAttempts) {
          reconnectAttemptsRef.current += 1;
          const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000);
          
          console.log(`🔄 Reconnecting in ${delay}ms (attempt ${reconnectAttemptsRef.current}/${maxReconnectAttempts})...`);
          
          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, delay);
        } else {
          setError('Failed to connect after multiple attempts');
        }
      };
      
      wsRef.current = ws;
      
    } catch (err) {
      console.error('Failed to create WebSocket:', err);
      setError('Failed to create WebSocket connection');
    }
  }, []);

  const subscribe = useCallback((tickers: string[]) => {
    const upperTickers = tickers.map(t => t.toUpperCase());
    
    // Always track tickers, even if not connected yet.
    // onopen will resubscribe from subscribedTickersRef.
    upperTickers.forEach(ticker => subscribedTickersRef.current.add(ticker));
    
    // Send subscribe if connected
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        action: 'subscribe',
        tickers: upperTickers
      }));
    }
    
    console.log('📊 Subscribed to:', upperTickers);
  }, []);

  const unsubscribe = useCallback((tickers: string[]) => {
    const upperTickers = tickers.map(t => t.toUpperCase());
    
    // Remove from tracked tickers
    upperTickers.forEach(ticker => subscribedTickersRef.current.delete(ticker));
    
    // Send unsubscribe if connected
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        action: 'unsubscribe',
        tickers: upperTickers
      }));
    }
    
    console.log('📊 Unsubscribed from:', upperTickers);
  }, []);

  // Connect on mount
  useEffect(() => {
    connect();
    
    // Heartbeat to keep connection alive
    const heartbeatInterval = setInterval(() => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ action: 'ping' }));
      }
    }, 30000); // Every 30 seconds
    
    // Cleanup on unmount
    return () => {
      clearInterval(heartbeatInterval);
      
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connect]);

  return {
    prices,
    isConnected,
    subscribe,
    unsubscribe,
    error
  };
}