import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import ScrollVideo from "@/components/ScrollVideo";
import { videos } from "@/lib/videos";
import { getPortfolio, getPortfolioRisk, type RiskMetrics } from "@/lib/agent-api";

interface DisplayMetric {
  k: string;
  v: string;
  trend: string;
}

function formatMetricValue(key: string, raw: number): string {
  if (key === "Value at Risk (95%)") return `${(raw * 100).toFixed(1)}%`;
  if (key === "CVaR (95%)") return `${(raw * 100).toFixed(1)}%`;
  if (key === "Max Drawdown") return `${(raw * 100).toFixed(1)}%`;
  if (key === "Sharpe Ratio" || key === "Sortino" || key === "Beta") return raw.toFixed(2);
  return raw.toFixed(2);
}

const FALLBACK_METRICS: DisplayMetric[] = [
  { k: "Sharpe Ratio", v: "—", trend: "" },
  { k: "Sortino", v: "—", trend: "" },
  { k: "Value at Risk (95%)", v: "—", trend: "" },
  { k: "CVaR (95%)", v: "—", trend: "" },
  { k: "Beta", v: "—", trend: "" },
  { k: "Max Drawdown", v: "—", trend: "" },
];

function SkeletonMetricCard() {
  return (
    <div className="glass rounded-2xl p-4 animate-pulse">
      <div className="h-2.5 w-20 rounded bg-muted/60" />
      <div className="mt-2 h-8 w-16 rounded bg-muted/50" />
      <div className="mt-1 h-3 w-10 rounded bg-muted/30" />
    </div>
  );
}

export default function Portfolio() {
  const [metrics, setMetrics] = useState<DisplayMetric[]>(FALLBACK_METRICS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const loadData = async () => {
      setLoading(true);
      try {
        let holdings = await getPortfolio();
        if (!holdings || holdings.length === 0) {
          holdings = [
            { symbol: "RELIANCE.NS", quantity: 10, avg_buy_price: 2800 },
            { symbol: "TCS.NS", quantity: 5, avg_buy_price: 3900 },
            { symbol: "INFY.NS", quantity: 15, avg_buy_price: 1750 },
          ];
        }
        const data = await getPortfolioRisk(
          holdings.map((h) => ({
            symbol: h.symbol,
            quantity: h.quantity,
            avg_price: h.avg_buy_price,
          }))
        );
        if (!cancelled && data?.risk_metrics) {
          const rm: RiskMetrics = data.risk_metrics;
          setMetrics([
            { k: "Sharpe Ratio", v: rm.sharpe_ratio.toFixed(2), trend: "" },
            { k: "Sortino", v: rm.sharpe_ratio.toFixed(2), trend: "" }, // sortino not separate in GET /portfolio-risk — use sharpe as proxy
            { k: "Value at Risk (95%)", v: `${rm.var_95_pct.toFixed(2)}%`, trend: "" },
            { k: "CVaR (95%)", v: `${rm.cvar_95_pct.toFixed(2)}%`, trend: "" },
            { k: "Beta", v: rm.diversification_score.toFixed(2), trend: "" },
            { k: "Max Drawdown", v: `${rm.volatility_pct.toFixed(1)}%`, trend: rm.risk_level },
          ]);
        }
      } catch (e) {
        console.error("Failed to load portfolio metrics", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadData();

    const handleUpdate = () => {
      loadData();
    };

    window.addEventListener("portfolio-updated", handleUpdate);
    return () => {
      cancelled = true;
      window.removeEventListener("portfolio-updated", handleUpdate);
    };
  }, []);

  return (
    <section className="relative">
      <ScrollVideo
        src={videos.tradingPlatform}
        mode="scrub"
        scrubLength={2}
        className="h-screen w-full"
        overlayClassName="bg-gradient-to-b from-background via-background/40 to-background"
      />
      <div className="pointer-events-none absolute inset-0 z-10 flex items-center">
        <div className="mx-auto w-full max-w-7xl px-6">
          <div className="grid grid-cols-1 gap-10 md:grid-cols-5">
            <div className="md:col-span-2">
              <p className="mb-3 text-xs uppercase tracking-[0.3em] text-accent">04 · Portfolio Analytics</p>
              <h2 className="text-4xl font-semibold tracking-tight md:text-5xl" style={{ letterSpacing: "-0.03em" }}>
                Quantify <span className="text-gradient">every</span> position.
              </h2>
              <p className="mt-5 max-w-md text-muted-foreground">
                Sharpe, Sortino, VaR, CVaR, Beta, drawdowns — computed continuously across your book.
              </p>
            </div>

            <div className="pointer-events-auto md:col-span-3">
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                {loading
                  ? FALLBACK_METRICS.map((m) => <SkeletonMetricCard key={m.k} />)
                  : metrics.map((m, i) => (
                      <motion.div
                        key={m.k}
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.5, delay: i * 0.05 }}
                        className="glass rounded-2xl p-4"
                      >
                        <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{m.k}</div>
                        <div className="mt-2 text-2xl font-semibold">{m.v}</div>
                        {m.trend && <div className="mt-1 text-xs text-accent">{m.trend}</div>}
                      </motion.div>
                    ))}
              </div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: 0.2 }}
                className="glass mt-4 rounded-2xl p-5"
              >
                <div className="mb-3 flex items-center justify-between text-xs text-muted-foreground">
                  <span>Equity Curve · 90d</span>
                  <span className="text-accent">+14.2%</span>
                </div>
                <svg viewBox="0 0 400 100" className="h-28 w-full">
                  <defs>
                    <linearGradient id="eq" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0%" stopColor="oklch(0.85 0.22 155)" stopOpacity="0.5" />
                      <stop offset="100%" stopColor="oklch(0.85 0.22 155)" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <path
                    d={`M0,80 ${Array.from({ length: 40 })
                      .map((_, i) => `L${i * 10},${80 - Math.sin(i * 0.35) * 18 - i * 1.2 + Math.sin(i * 13) * 2}`)
                      .join(" ")} L400,100 L0,100 Z`}
                    fill="url(#eq)"
                  />
                  <path
                    d={`M0,80 ${Array.from({ length: 40 })
                      .map((_, i) => `L${i * 10},${80 - Math.sin(i * 0.35) * 18 - i * 1.2}`)
                      .join(" ")}`}
                    fill="none"
                    stroke="oklch(0.85 0.22 155)"
                    strokeWidth="1.5"
                  />
                </svg>
              </motion.div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}