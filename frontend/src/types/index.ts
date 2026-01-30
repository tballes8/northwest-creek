/**
 * TypeScript type definitions
 */

export interface User {
  id: string;
  email: string;
  full_name: string | null;
  is_active: boolean;
  is_verified: boolean;
  subscription_tier: 'free' | 'casual' | 'active' | 'professional';
  created_at: string;
  updated_at: string | null;
}

export interface WatchlistItem {
  id: string;
  ticker: string;
  notes?: string;
  target_price?: number;
  price?: number;
  change?: number;
  change_percent?: number;
  price_vs_target?: number;
  price_vs_target_percent?: number;
  created_at: string;
}

export interface PortfolioPosition {
  id: string;
  ticker: string;
  quantity: number;
  average_cost: number;
  current_price?: number;
  total_value?: number;
  profit_loss?: number;
  profit_loss_percent?: number;
  notes?: string;
  created_at: string;
}

export interface Alert {
  id: string;
  ticker: string;
  condition: 'above' | 'below';
  target_price: number;
  is_active: boolean;
  triggered_at?: string;
  created_at: string;
}

export interface StockQuote {
  ticker: string;
  price: number;
  change: number;
  change_percent: number;
  volume: number;
  high: number;
  low: number;
  open: number;
  previous_close: number;
  timestamp: string;
}

export interface CompanyInfo {
  ticker: string;
  name: string;
  description: string;
  sector: string;
  industry: string;
  website: string;
  exchange: string;
  market_cap?: number;
  phone?: string;
  employees?: number;
  country: string;
}