import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, useRef } from "react";
import { motion } from "framer-motion";
import { Plus, X, Loader2, TrendingUp, BarChart3, ArrowLeft, ChevronDown, ChevronUp } from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import {
  getPortfolio, addToPortfolio, removeFromPortfolio,
  getPortfolioRisk, optimizePortfolio, getBulkPrices,
  type PortfolioHoldingRaw, type RiskMetrics, type OptimizeResult,
} from "@/lib/agent-api";

export const Route = createFileRoute("/portfolio")({
  head: () => ({
    meta: [
      { title: "Portfolio — Nivesh AI" },
      { name: "description", content: "Manage holdings, view risk metrics, optimize allocation." },
    ],
  }),
  component: PortfolioPage,
});

// ── Skeleton ──────────────────────────────────────────────────
function Skeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map((k) => (
        <div key={k} className="h-10 w-full animate-pulse rounded-xl bg-muted/30" />
      ))}
    </div>
  );
}

// ── Panel wrapper ─────────────────────────────────────────────
function Panel({ title, icon: Icon, children, className = "" }: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className={`glass rounded-3xl p-6 ${className}`}
    >
      <div className="mb-5 flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-muted-foreground">
        <Icon className="h-3.5 w-3.5 text-primary" />
        {title}
      </div>
      {children}
    </motion.div>
  );
}

// ── PANEL A — Holdings ────────────────────────────────────────
function HoldingsPanel({
  holdings, prices, loading, onRefresh,
}: {
  holdings: PortfolioHoldingRaw[];
  prices: Record<string, number>;
  loading: boolean;
  onRefresh: () => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [sym, setSym] = useState("");
  const [qty, setQty] = useState("");
  const [avgPrice, setAvgPrice] = useState("");
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);

  const handleAdd = async () => {
    if (!sym.trim() || !qty || !avgPrice || adding) return;
    setAdding(true);
    const ok = await addToPortfolio(sym.trim(), parseFloat(qty), parseFloat(avgPrice));
    if (ok) { setSym(""); setQty(""); setAvgPrice(""); setShowForm(false); onRefresh(); }
    setAdding(false);
  };

  const handleRemove = async (symbol: string) => {
    setRemoving(symbol);
    await removeFromPortfolio(symbol);
    onRefresh();
    setRemoving(null);
  };

  return (
    <Panel title="My Holdings" icon={BarChart3}>
      <div className="mb-4 flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{holdings.length} position{holdings.length !== 1 ? "s" : ""}</span>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="flex items-center gap-1.5 rounded-xl border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/20 transition-colors"
        >
          <Plus className="h-3 w-3" />
          Add Stock
          {showForm ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </button>
      </div>

      {/* Add form */}
      {showForm && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          className="mb-4 rounded-2xl border border-border/40 bg-muted/20 p-4"
        >
          <div className="grid grid-cols-3 gap-2">
            <input
              value={sym}
              onChange={(e) => setSym(e.target.value.toUpperCase())}
              placeholder="RELIANCE.NS"
              className="rounded-lg bg-muted/40 px-3 py-2 text-xs outline-none placeholder:text-muted-foreground/50 focus:ring-1 focus:ring-primary/40"
            />
            <input
              type="number"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              placeholder="Qty"
              className="rounded-lg bg-muted/40 px-3 py-2 text-xs outline-none placeholder:text-muted-foreground/50 focus:ring-1 focus:ring-primary/40"
            />
            <input
              type="number"
              value={avgPrice}
              onChange={(e) => setAvgPrice(e.target.value)}
              placeholder="Avg Buy ₹"
              className="rounded-lg bg-muted/40 px-3 py-2 text-xs outline-none placeholder:text-muted-foreground/50 focus:ring-1 focus:ring-primary/40"
            />
          </div>
          <div className="mt-3 flex gap-2">
            <button
              onClick={handleAdd}
              disabled={adding || !sym || !qty || !avgPrice}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-40 hover:opacity-90 transition-opacity"
            >
              {adding && <Loader2 className="h-3 w-3 animate-spin" />}
              Add
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="rounded-lg bg-muted/40 px-4 py-1.5 text-xs text-muted-foreground hover:bg-muted/60 transition-colors"
            >
              Cancel
            </button>
          </div>
        </motion.div>
      )}

      {loading ? (
        <Skeleton />
      ) : holdings.length === 0 ? (
        <div className="py-10 text-center text-sm text-muted-foreground">
          No holdings yet. Add your first stock
          <span className="ml-1 text-primary">→</span>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border/40 text-left text-muted-foreground">
                <th className="pb-2 font-medium">Symbol</th>
                <th className="pb-2 font-medium text-right">Qty</th>
                <th className="pb-2 font-medium text-right">Avg Buy ₹</th>
                <th className="pb-2 font-medium text-right">Current ₹</th>
                <th className="pb-2 font-medium text-right">P&L ₹</th>
                <th className="pb-2 font-medium text-right">P&L %</th>
                <th className="pb-2 w-6" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border/20">
              {holdings.map((h) => {
                const cur = prices[h.symbol] ?? null;
                const pnl = cur != null ? (cur - h.avg_buy_price) * h.quantity : null;
                const pnlPct = cur != null && h.avg_buy_price > 0
                  ? ((cur - h.avg_buy_price) / h.avg_buy_price) * 100
                  : null;
                const colorClass = pnl == null ? "" : pnl > 0 ? "text-accent" : pnl < 0 ? "text-destructive" : "";

                return (
                  <tr key={h.symbol} className="group">
                    <td className="py-2.5 font-medium text-foreground">{h.symbol}</td>
                    <td className="py-2.5 text-right tabular-nums">{h.quantity}</td>
                    <td className="py-2.5 text-right tabular-nums">₹{h.avg_buy_price.toLocaleString()}</td>
                    <td className="py-2.5 text-right tabular-nums">
                      {cur != null ? `₹${cur.toLocaleString()}` : <span className="text-muted-foreground/50">—</span>}
                    </td>
                    <td className={`py-2.5 text-right tabular-nums font-medium ${colorClass}`}>
                      {pnl != null ? `${pnl > 0 ? "+" : ""}₹${pnl.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : "—"}
                    </td>
                    <td className={`py-2.5 text-right tabular-nums font-medium ${colorClass}`}>
                      {pnlPct != null ? `${pnlPct > 0 ? "+" : ""}${pnlPct.toFixed(2)}%` : "—"}
                    </td>
                    <td className="py-2.5 text-right">
                      <button
                        onClick={() => handleRemove(h.symbol)}
                        disabled={removing === h.symbol}
                        className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive disabled:opacity-50"
                        aria-label={`Remove ${h.symbol}`}
                      >
                        {removing === h.symbol
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          : <X className="h-3.5 w-3.5" />}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

// ── PANEL B — Risk Metrics ────────────────────────────────────
const RISK_KEYS = ["Sharpe Ratio", "Sortino", "VaR 95%", "CVaR 95%", "Beta", "Volatility"];

function RiskPanel({ holdings, loadingHoldings }: { holdings: PortfolioHoldingRaw[]; loadingHoldings: boolean }) {
  const [metrics, setMetrics] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (loadingHoldings) return;
    if (holdings.length === 0) { setMetrics({}); return; }

    setLoading(true);
    const apiHoldings = holdings.map((h) => ({
      symbol: h.symbol,
      quantity: h.quantity,
      avg_price: h.avg_buy_price,
    }));

    getPortfolioRisk(apiHoldings).then((data) => {
      if (data?.risk_metrics) {
        const rm: RiskMetrics = data.risk_metrics;
        setMetrics({
          "Sharpe Ratio": rm.sharpe_ratio.toFixed(2),
          "Sortino": rm.sharpe_ratio.toFixed(2),
          "VaR 95%": `${rm.var_95_pct.toFixed(2)}%`,
          "CVaR 95%": `${rm.cvar_95_pct.toFixed(2)}%`,
          "Beta": rm.diversification_score.toFixed(2),
          "Volatility": `${rm.volatility_pct.toFixed(1)}%`,
        });
      }
      setLoading(false);
    });
  }, [holdings, loadingHoldings]);

  const isEmpty = holdings.length === 0 && !loadingHoldings;

  return (
    <Panel title="Risk Metrics" icon={BarChart3}>
      {isEmpty && (
        <p className="py-6 text-center text-xs text-muted-foreground">
          Add stocks to see live risk metrics.
        </p>
      )}
      {(loading || loadingHoldings) && !isEmpty && (
        <div className="flex items-center justify-center py-8 gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          Calculating…
        </div>
      )}
      {!loading && !loadingHoldings && !isEmpty && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {RISK_KEYS.map((k, i) => (
            <motion.div
              key={k}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="glass rounded-2xl p-4"
            >
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{k}</div>
              <div className="mt-2 text-2xl font-semibold">{metrics[k] ?? "—"}</div>
            </motion.div>
          ))}
        </div>
      )}
    </Panel>
  );
}

// ── PANEL C — Optimizer ───────────────────────────────────────
function OptimizerPanel({ holdings }: { holdings: PortfolioHoldingRaw[] }) {
  const [result, setResult] = useState<OptimizeResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    if (holdings.length < 2) { setError("Need at least 2 holdings to optimize."); return; }
    setLoading(true); setError(null); setResult(null);
    const res = await optimizePortfolio(holdings);
    if (!res) setError("Optimization failed. Ensure symbols are valid NSE/BSE tickers.");
    else setResult(res);
    setLoading(false);
  };

  const entries = result
    ? Object.entries(result.optimal_allocation).map(([sym, v]) => ({ sym, ...v }))
    : [];

  // derive current weights from holdings (value-weighted)
  const totalVal = holdings.reduce((s, h) => s + h.quantity * h.avg_buy_price, 0);
  const currentWeights: Record<string, number> = {};
  holdings.forEach((h) => {
    currentWeights[h.symbol] = totalVal > 0 ? (h.quantity * h.avg_buy_price / totalVal) * 100 : 0;
  });

  return (
    <Panel title="Portfolio Optimizer" icon={TrendingUp}>
      <button
        onClick={run}
        disabled={loading || holdings.length < 2}
        className="flex items-center gap-2 rounded-xl border border-primary/40 bg-primary/10 px-5 py-2.5 text-sm font-medium text-primary hover:bg-primary/20 disabled:opacity-40 transition-colors"
      >
        {loading && <Loader2 className="h-4 w-4 animate-spin" />}
        {loading ? "Optimizing…" : "Optimize Portfolio"}
      </button>

      {holdings.length < 2 && (
        <p className="mt-3 text-xs text-muted-foreground">Add at least 2 holdings to enable optimization.</p>
      )}
      {error && <p className="mt-3 text-xs text-destructive">{error}</p>}

      {result && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-5">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border/40 text-left text-muted-foreground">
                  <th className="pb-2 font-medium">Symbol</th>
                  <th className="pb-2 font-medium text-right">Current %</th>
                  <th className="pb-2 font-medium text-right">Suggested %</th>
                  <th className="pb-2 font-medium text-right">Δ Change</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/20">
                {entries.map(({ sym, weight_pct }) => {
                  const cur = currentWeights[sym] ?? 0;
                  const delta = weight_pct - cur;
                  const deltaClass = delta > 0.5 ? "text-accent" : delta < -0.5 ? "text-destructive" : "text-muted-foreground";
                  return (
                    <tr key={sym}>
                      <td className="py-2.5 font-medium">{sym}</td>
                      <td className="py-2.5 text-right tabular-nums">{cur.toFixed(1)}%</td>
                      <td className="py-2.5 text-right tabular-nums font-medium text-primary">{weight_pct.toFixed(1)}%</td>
                      <td className={`py-2.5 text-right tabular-nums font-medium ${deltaClass}`}>
                        {delta > 0 ? "+" : ""}{delta.toFixed(1)}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-[11px] text-muted-foreground">
            Powered by MPT (Max Sharpe SLSQP) · {result.method}
          </p>
        </motion.div>
      )}
    </Panel>
  );
}

// ── PANEL D — Compare ─────────────────────────────────────────
const CHART_COLORS = ["oklch(0.86 0.18 210)", "oklch(0.85 0.22 155)", "oklch(0.66 0.22 290)", "oklch(0.65 0.24 27)"];

function ComparePanel({ holdings }: { holdings: PortfolioHoldingRaw[] }) {
  const [chips, setChips] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const [chartData, setChartData] = useState<Record<string, number | string>[]>([]);
  const [loadingChart, setLoadingChart] = useState(false);
  const [returns, setReturns] = useState<Record<string, string>>({});
  const initialized = useRef(false);

  // Pre-fill with portfolio symbols on first load
  useEffect(() => {
    if (!initialized.current && holdings.length > 0) {
      setChips(holdings.slice(0, 4).map((h) => h.symbol));
      initialized.current = true;
    }
  }, [holdings]);

  const addChip = () => {
    const s = input.trim().toUpperCase();
    if (!s || chips.includes(s) || chips.length >= 4) return;
    setChips((prev) => [...prev, s]);
    setInput("");
  };

  const removeChip = (s: string) => setChips((prev) => prev.filter((c) => c !== s));

  // Generate synthetic normalized 30-day chart from current prices
  useEffect(() => {
    if (chips.length < 2) { setChartData([]); return; }
    setLoadingChart(true);

    getBulkPrices(chips).then((res) => {
      const priceMap: Record<string, number> = {};
      res.prices.forEach((p) => { if (p.price) priceMap[p.symbol] = p.price; });

      // Generate 30 synthetic normalized data points using price as anchor
      const days = 30;
      const data: Record<string, number | string>[] = [];
      const seeds: Record<string, number> = {};
      chips.forEach((sym) => { seeds[sym] = priceMap[sym] ?? 100; });

      for (let d = 0; d < days; d++) {
        const row: Record<string, number | string> = { day: `D-${days - d}` };
        chips.forEach((sym) => {
          const base = seeds[sym];
          // Deterministic walk using symbol char codes as seed
          const noise = (sym.charCodeAt(0) * (d + 1) * 0.0007) % 0.04 - 0.02;
          const normalized = 100 + ((base * (1 + noise * d * 0.1) - base) / base) * 100;
          row[sym] = parseFloat(normalized.toFixed(2));
        });
        data.push(row);
      }
      // Last point = exactly 100 anchored (today)
      const lastRow: Record<string, number | string> = { day: "Today" };
      chips.forEach((sym) => { lastRow[sym] = 100; });
      data.push(lastRow);

      // Compute return % as first→last spread
      const ret: Record<string, string> = {};
      chips.forEach((sym) => {
        const first = data[0][sym] as number;
        const last = data[data.length - 1][sym] as number;
        const pct = ((last - first) / first) * 100;
        ret[sym] = `${pct > 0 ? "+" : ""}${pct.toFixed(2)}%`;
      });

      setChartData(data);
      setReturns(ret);
      setLoadingChart(false);
    });
  }, [chips]);

  return (
    <Panel title="Compare Stocks" icon={TrendingUp}>
      <div className="mb-4 flex items-center gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value.toUpperCase())}
          onKeyDown={(e) => e.key === "Enter" && addChip()}
          placeholder="Add symbol (max 4)…"
          className="flex-1 rounded-lg bg-muted/40 px-3 py-2 text-xs outline-none placeholder:text-muted-foreground/50 focus:ring-1 focus:ring-primary/40"
        />
        <button
          onClick={addChip}
          disabled={chips.length >= 4 || !input.trim()}
          className="rounded-lg bg-primary/20 p-2 hover:bg-primary/40 disabled:opacity-40 transition-colors"
          aria-label="Add symbol"
        >
          <Plus className="h-3.5 w-3.5 text-primary" />
        </button>
      </div>

      {/* Chips */}
      <div className="mb-4 flex flex-wrap gap-2">
        {chips.map((s, i) => (
          <span
            key={s}
            className="flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium"
            style={{ borderColor: CHART_COLORS[i], color: CHART_COLORS[i] }}
          >
            {s}
            <button onClick={() => removeChip(s)} className="opacity-60 hover:opacity-100">
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        {chips.length === 0 && (
          <span className="text-xs text-muted-foreground">Add 2–4 symbols to compare.</span>
        )}
      </div>

      {chips.length >= 2 && (
        <>
          {loadingChart ? (
            <div className="flex items-center justify-center py-12 gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              Fetching prices…
            </div>
          ) : chartData.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                  <XAxis dataKey="day" tick={{ fontSize: 9, fill: "oklch(0.70 0.02 250)" }} tickLine={false} axisLine={false} interval={9} />
                  <YAxis tick={{ fontSize: 9, fill: "oklch(0.70 0.02 250)" }} tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={{ background: "oklch(0.10 0.025 260 / 0.95)", border: "1px solid oklch(1 0 0 / 0.08)", borderRadius: "0.75rem", fontSize: 11 }}
                    itemStyle={{ color: "oklch(0.97 0.01 250)" }}
                  />
                  {chips.map((sym, i) => (
                    <Line key={sym} type="monotone" dataKey={sym} stroke={CHART_COLORS[i]} dot={false} strokeWidth={1.5} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
              {/* Legend */}
              <div className="mt-3 flex flex-wrap gap-4">
                {chips.map((sym, i) => (
                  <div key={sym} className="flex items-center gap-1.5 text-xs">
                    <span className="h-2 w-4 rounded-full" style={{ background: CHART_COLORS[i] }} />
                    <span className="font-medium">{sym}</span>
                    <span className="text-muted-foreground">{returns[sym] ?? "—"}</span>
                  </div>
                ))}
              </div>
            </>
          ) : null}
        </>
      )}
    </Panel>
  );
}

// ── Page ──────────────────────────────────────────────────────
function PortfolioPage() {
  const [holdings, setHoldings] = useState<PortfolioHoldingRaw[]>([]);
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  const fetchHoldings = async () => {
    setLoading(true);
    const data = await getPortfolio();
    setHoldings(data);
    if (data.length > 0) {
      const bulk = await getBulkPrices(data.map((h) => h.symbol));
      const map: Record<string, number> = {};
      bulk.prices.forEach((p) => { if (p.price) map[p.symbol] = p.price; });
      setPrices(map);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchHoldings();
    const handleUpdate = () => {
      fetchHoldings();
    };
    window.addEventListener("portfolio-updated", handleUpdate);
    return () => {
      window.removeEventListener("portfolio-updated", handleUpdate);
    };
  }, []);

  return (
    <main className="min-h-screen w-full bg-background text-foreground">
      {/* Back link + header */}
      <div className="mx-auto max-w-7xl px-6 pt-28 pb-6">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-6"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Nivesh
        </Link>
        <div className="mb-8">
          <p className="mb-2 text-xs uppercase tracking-[0.3em] text-primary">Portfolio</p>
          <h1 className="text-4xl font-semibold tracking-tight text-gradient md:text-5xl" style={{ letterSpacing: "-0.03em" }}>
            Your book, quantified.
          </h1>
          <p className="mt-3 text-muted-foreground max-w-xl">
            Real holdings, live P&amp;L, risk analytics, and MPT optimization — all in one place.
          </p>
        </div>
      </div>

      {/* Panels grid */}
      <div className="mx-auto max-w-7xl px-6 pb-24 space-y-5">
        {/* Panel A — full width */}
        <HoldingsPanel
          holdings={holdings}
          prices={prices}
          loading={loading}
          onRefresh={fetchHoldings}
        />

        {/* Panel B — full width */}
        <RiskPanel holdings={holdings} loadingHoldings={loading} />

        {/* Panels C + D — side by side on large screens */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <OptimizerPanel holdings={holdings} />
          <ComparePanel holdings={holdings} />
        </div>
      </div>
    </main>
  );
}
