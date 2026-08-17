/**
 * TypeScript type definitions
 */

export interface User {
  id: string;
  email: string;
  full_name: string | null;
  is_active: boolean;
  is_verified: boolean;
  subscription_tier: 'beginner' | 'casual' | 'active' | 'professional';
  created_at: string;
  updated_at: string | null;
  is_admin?: boolean;
  phone_verified?: boolean;
  phone_last_four?: string | null;
}

export interface WatchlistItem {
  id: string;
  ticker: string;
  notes?: string;
  target_price?: number;
  price?: number;
  previous_close?: number;  // ← ADDED for day change calculation
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
  buy_price: number;  // ← FIXED: matches backend (not average_cost)
  buy_date: string;   // ← ADDED: matches backend
  current_price?: number;
  total_value?: number;
  profit_loss?: number;
  profit_loss_percent?: number;
  notes?: string;
  created_at: string;
}

export interface DividendRecord {
  cash_amount: number | null;
  currency: string;
  declaration_date: string | null;
  ex_dividend_date: string | null;
  pay_date: string | null;
  record_date: string | null;
  frequency: number | null;
  distribution_type: string | null;
}

// "suspended" = latest payment is too old to still be in effect (no figures);
// "unknown" = history that can't be annualized. High yields are not filtered —
// option-income ETFs legitimately run past 100%.
export type DividendStatus = 'active' | 'suspended' | 'unknown' | 'none';

export interface DividendInfo {
  ticker: string;
  has_dividends: boolean;
  dividends: DividendRecord[];
  annual_dividend: number | null;
  annual_yield: number | null;
  frequency_label: string | null;
  dividend_status: DividendStatus;
  last_ex_date: string | null;
}

export interface Alert {
  id: string;
  ticker: string;
  condition: 'above' | 'below';
  target_price: number;
  is_active: boolean;
  sms_enabled: boolean;
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