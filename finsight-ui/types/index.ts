export interface MarketIndex {
  name: string;
  symbol: string;
  price: number;
  change: number;
  change_pct: number;
  direction: "up" | "down";
}

export interface StockPrice {
  symbol: string;
  price: number;
  source: string;
  currency: string;
  from_cache?: boolean;
}

export interface Holding {
  symbol: string;
  quantity: number;
  avg_price: number;
  current_price: number;
  current_value: number;
  pnl: number;
  pnl_pct: number;
  source: string;
}

export interface RiskMetrics {
  risk_level: string;
  volatility_pct: number;
  sharpe_ratio: number;
  annualized_return_pct: number;
  diversification_score: number;
  var_95_pct?: number;
  cvar_95_pct?: number;
}

export interface PortfolioResponse {
  status: string;
  total_value: number;
  holdings: Holding[];
  risk_metrics: RiskMetrics;
  sector_breakdown?: Record<string, string[]>;
}

export interface OptimizeResult {
  symbol: string;
  weight_pct: number;
  amount_inr: number;
}

export interface WatchlistItem {
  id: number;
  symbol: string;
  added_at: string;
  price?: number;
  change_pct?: number;
}

export interface Alert {
  id: number;
  symbol: string;
  target_price: number;
  direction: "above" | "below";
  triggered: boolean;
  created_at: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

export interface EfficientFrontierPoint {
  annual_return: number;
  annual_volatility: number;
  sharpe_ratio: number;
  weights: Record<string, number>;
}

export interface SharpResult {
  symbol: string;
  sharpe_ratio: number;
  annual_return_pct: number;
  annual_volatility_pct: number;
  risk_free_rate_pct: number;
}

export interface EconomicIndicators {
  repo_rate: number | null;
  cpi_inflation: number | null;
  source: string;
}

export interface PortfolioHolding {
  symbol: string;
  quantity: number;
  avg_price: number;
}
