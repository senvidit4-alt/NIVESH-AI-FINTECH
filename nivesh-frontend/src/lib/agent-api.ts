/**
 * agent-api.ts
 * Complete API client for the FinSight AI FastAPI backend.
 * Set VITE_AGENT_API_URL and VITE_API_TOKEN in your .env file.
 */
const BASE = import.meta.env.VITE_AGENT_API_URL 
  ?? "http://localhost:8000";
const TOKEN = (import.meta.env.VITE_API_TOKEN as string | undefined) ?? "";

function authHeaders(): HeadersInit {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (TOKEN) h["Authorization"] = `Bearer ${TOKEN}`;
  return h;
}

function url(path: string): string {
  return `${BASE.replace(/\/$/, "")}${path}`;
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface AnalyzeResponse {
  status: string;
  symbol: string;
  analysis: string;
  time_taken: string;
  disclaimer: string;
  error?: string;
  // legacy compat
  answer?: string;
}

export interface MarketIndex {
  name: string;
  symbol: string;
  price: number;
  change: number;
  change_pct: number;
  direction: "up" | "down";
}

export interface MarketSummaryResponse {
  status: string;
  market: string;
  indices: MarketIndex[];
}

export interface BulkPriceItem {
  symbol: string;
  price: number | null;
  source: string;
  from_cache: boolean;
}

export interface BulkPricesResponse {
  status: string;
  count: number;
  fetch_time: string;
  prices: BulkPriceItem[];
}

export interface WatchlistItem {
  id: number;
  symbol: string;
  added_at: string;
}

export interface WatchlistResponse {
  status: string;
  watchlist: WatchlistItem[];
}

export interface AlertItem {
  id: number;
  symbol: string;
  target_price: number;
  direction: "above" | "below";
  triggered: boolean;
  created_at: string;
}

export interface GlobalAlertItem {
  id: number;
  symbol: string;
  name: string;
  change_pct: number;
  price: number;
  alert_type: string;
  created_at: string;
}

export interface AlertsResponse {
  status: string;
  alerts: AlertItem[];
}

export interface GlobalAlertsResponse {
  status: string;
  alerts: GlobalAlertItem[];
}

export interface CreateAlertPayload {
  symbol: string;
  target_price: number;
  direction: "above" | "below";
}

export interface PortfolioHolding {
  symbol: string;
  quantity: number;
  avg_price: number;
}

export interface RiskMetrics {
  risk_level: string;
  volatility_pct: number;
  sharpe_ratio: number;
  annualized_return_pct: number;
  diversification_score: number;
  var_95_pct: number;
  cvar_95_pct: number;
}

export interface PortfolioRiskResponse {
  status: string;
  total_value: number;
  holdings: object[];
  risk_metrics: RiskMetrics;
  sector_breakdown: object;
  disclaimer: string;
}

export interface NewsArticle {
  title: string;
  publisher?: string;
  link?: string;
  published?: string;
  summary?: string;
}

export interface NewsResponse {
  status: string;
  symbol: string;
  articles?: NewsArticle[];
  news?: NewsArticle[];
}

// ── API Functions ─────────────────────────────────────────────────────────────

/** POST /analyze-stock — LangGraph stock analysis */
export async function analyzeStock(query: string): Promise<AnalyzeResponse> {
  try {
    // Derive a symbol from the first word of the query as best-effort
    const symbol = query.split(" ")[0].toUpperCase();
    const res = await fetch(url("/analyze-stock"), {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ symbol, query }),
    });
    if (!res.ok) return { status: "error", symbol, analysis: "", time_taken: "0s", disclaimer: "", error: `HTTP ${res.status}` };
    return (await res.json()) as AnalyzeResponse;
  } catch {
    return { status: "error", symbol: "", analysis: "", time_taken: "0s", disclaimer: "", error: "Network error" };
  }
}

/** Legacy compat used by Chat.tsx before migration — delegates to streamChat */
export async function analyzeQuery(query: string): Promise<{ answer: string; error?: string }> {
  const res = await analyzeStock(query);
  return { answer: res.analysis || res.answer || "", error: res.error };
}

/** GET /market-summary — live NSE/BSE index data */
export async function getMarketSummary(): Promise<MarketSummaryResponse> {
  try {
    const res = await fetch(url("/market-summary"), { headers: authHeaders() });
    if (!res.ok) return { status: "error", market: "", indices: [] };
    return (await res.json()) as MarketSummaryResponse;
  } catch {
    return { status: "error", market: "", indices: [] };
  }
}

/** POST /prices-bulk — bulk stock prices (body is a JSON array of symbol strings) */
export async function getBulkPrices(symbols: string[]): Promise<BulkPricesResponse> {
  try {
    const res = await fetch(url("/prices-bulk"), {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(symbols),
    });
    if (!res.ok) return { status: "error", count: 0, fetch_time: "0s", prices: [] };
    return (await res.json()) as BulkPricesResponse;
  } catch {
    return { status: "error", count: 0, fetch_time: "0s", prices: [] };
  }
}

/**
 * POST /chat — SSE streaming AI chat.
 * Calls onChunk for each token, onDone when stream ends.
 */
export async function streamChat(
  query: string,
  history: { role: string; content: string }[],
  onChunk: (token: string) => void,
  onDone: (fullText: string) => void,
  onNode?: (nodeName: string) => void
): Promise<void> {
  try {
    const cleanUrl = `${BASE.replace(/\/$/, "")}/chat`;
    const res = await fetch(cleanUrl, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ message: query, history }),
    });
    if (!res.ok || !res.body) {
      onDone(`Error: HTTP ${res.status}`);
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let full = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        const raw = line.slice(5).trim();
        if (!raw) continue;
        try {
          const parsed = JSON.parse(raw) as { token?: string; done?: boolean; full?: string; error?: string; node?: string };
          if (parsed.error) {
            onDone(parsed.error);
            return;
          }
          if (parsed.node) {
            onNode?.(parsed.node);
          }
          if (parsed.token) {
            full += parsed.token;
            onChunk(parsed.token);
          }
          if (parsed.done) {
            if ((parsed as any).portfolio_updated) {
              window.dispatchEvent(new CustomEvent("portfolio-updated"));
            }
            onDone(parsed.full ?? full);
            return;
          }
        } catch {
          // non-JSON SSE line — skip
        }
      }
    }
    onDone(full);
  } catch (e) {
    onDone(e instanceof Error ? e.message : "Stream error");
  }
}

/** GET /watchlist */
export async function getWatchlist(): Promise<WatchlistItem[]> {
  try {
    const res = await fetch(url("/watchlist"), { headers: authHeaders() });
    if (!res.ok) return [];
    const data = (await res.json()) as WatchlistResponse;
    return data.watchlist ?? [];
  } catch {
    return [];
  }
}

/** POST /watchlist/add */
export async function addToWatchlist(symbol: string): Promise<boolean> {
  try {
    const res = await fetch(url("/watchlist/add"), {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ symbol: symbol.toUpperCase() }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** DELETE /watchlist/{symbol} */
export async function removeFromWatchlist(symbol: string): Promise<boolean> {
  try {
    const res = await fetch(url(`/watchlist/${encodeURIComponent(symbol.toUpperCase())}`), {
      method: "DELETE",
      headers: authHeaders(),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** GET /alerts */
export async function getAlerts(): Promise<AlertItem[]> {
  try {
    const res = await fetch(url("/alerts"), { headers: authHeaders() });
    if (!res.ok) return [];
    const data = (await res.json()) as AlertsResponse;
    return data.alerts ?? [];
  } catch {
    return [];
  }
}

/** GET /alerts/global */
export async function getGlobalAlerts(): Promise<GlobalAlertItem[]> {
  try {
    const res = await fetch(url("/alerts/global"), { headers: authHeaders() });
    if (!res.ok) return [];
    const data = (await res.json()) as GlobalAlertsResponse;
    return data.alerts ?? [];
  } catch {
    return [];
  }
}

/** POST /alerts */
export async function createAlert(data: CreateAlertPayload): Promise<boolean> {
  try {
    const res = await fetch(url("/alerts"), {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(data),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** GET /portfolio — returns real holdings from DB */
export interface PortfolioHoldingRaw {
  symbol: string;
  quantity: number;
  avg_buy_price: number;
}

export interface PortfolioResponse {
  status: string;
  holdings: PortfolioHoldingRaw[];
}

export async function getPortfolio(): Promise<PortfolioHoldingRaw[]> {
  try {
    const res = await fetch(url("/portfolio"), { headers: authHeaders() });
    if (!res.ok) return [];
    const data = (await res.json()) as PortfolioResponse;
    return data.holdings ?? [];
  } catch {
    return [];
  }
}

/** POST /portfolio — add or update a holding */
export async function addToPortfolio(
  symbol: string,
  quantity: number,
  avgBuyPrice: number
): Promise<boolean> {
  try {
    const res = await fetch(url("/portfolio"), {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ symbol: symbol.toUpperCase(), quantity, avg_buy_price: avgBuyPrice }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** DELETE /portfolio/{symbol} — remove a holding */
export async function removeFromPortfolio(symbol: string): Promise<boolean> {
  try {
    const res = await fetch(
      url(`/portfolio/${encodeURIComponent(symbol.toUpperCase())}`),
      { method: "DELETE", headers: authHeaders() }
    );
    return res.ok;
  } catch {
    return false;
  }
}

export interface OptimizeResult {
  status: string;
  optimal_allocation: Record<string, { weight_pct: number; amount_inr: number }>;
  portfolio_metrics: { annual_return: number; annual_volatility: number; sharpe_ratio: number } | null;
  method: string;
  disclaimer: string;
}

/** POST /optimize-portfolio — MPT Sharpe SLSQP optimizer */
export async function optimizePortfolio(
  holdings: PortfolioHoldingRaw[],
  riskTolerance: "low" | "medium" | "high" = "medium"
): Promise<OptimizeResult | null> {
  try {
    const symbols = holdings.map((h) => h.symbol);
    if (symbols.length < 2) return null;
    const res = await fetch(url("/optimize-portfolio"), {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ symbols, risk_tolerance: riskTolerance, investment_amount: 100000 }),
    });
    if (!res.ok) return null;
    return (await res.json()) as OptimizeResult;
  } catch {
    return null;
  }
}

/**
 * POST /get-portfolio-risk — VaR, CVaR, Sharpe, Sortino, Beta.
 * Accepts real holdings from the user's portfolio.
 */
export async function getPortfolioRisk(
  holdings: PortfolioHolding[]
): Promise<PortfolioRiskResponse | null> {
  try {
    const res = await fetch(url("/get-portfolio-risk"), {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ holdings }),
    });
    if (!res.ok) return null;
    return (await res.json()) as PortfolioRiskResponse;
  } catch {
    return null;
  }
}

/**
 * GET /news/{symbol} — Fetch news from yfinance for a symbol.
 */
export async function getNews(symbol: string): Promise<NewsArticle[]> {
  try {
    const res = await fetch(url(`/news/${encodeURIComponent(symbol)}`), {
      headers: authHeaders(),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as NewsResponse;
    return data.news ?? data.articles ?? [];
  } catch {
    return [];
  }
}


/** GET /economic-indicators */
export async function getEconomicIndicators(): Promise<object | null> {
  try {
    const res = await fetch(url("/economic-indicators"), { headers: authHeaders() });
    if (!res.ok) return null;
    return (await res.json()) as object;
  } catch {
    return null;
  }
}

export async function testConnection(): Promise<boolean> {
  try {
    const res = await fetch(url("/health"));
    return res.ok;
  } catch {
    return false;
  }
}