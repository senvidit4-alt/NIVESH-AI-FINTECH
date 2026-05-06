"use client";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { formatINR, formatPct } from "@/lib/formatters";
import api from "@/lib/api";
import clsx from "clsx";

interface OptResult {
  optimal_allocation: Record<string, { weight_pct: number; amount_inr: number }>;
  portfolio_metrics: { annual_return: number; annual_volatility: number; sharpe_ratio: number } | null;
}

export function MPTOptimizer({ symbols }: { symbols: string[] }) {
  const [risk, setRisk] = useState<"low" | "medium" | "high">("medium");
  const [amount, setAmount] = useState("100000");
  const [result, setResult] = useState<OptResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const optimize = async () => {
    if (symbols.length < 2) { setError("Need at least 2 symbols"); return; }
    setLoading(true); setError("");
    try {
      const res = await api.post("/optimize-portfolio", {
        symbols, risk_tolerance: risk, investment_amount: parseFloat(amount) || 100000,
      });
      setResult(res.data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Optimization failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="glass p-5 space-y-4">
      <h3 className="text-sm font-semibold text-slate-300">MPT Optimizer</h3>

      <div className="flex gap-2">
        {(["low", "medium", "high"] as const).map((r) => (
          <button key={r} onClick={() => setRisk(r)}
            className={clsx("flex-1 py-1.5 rounded-lg text-xs font-medium capitalize transition-all",
              risk === r ? "bg-blue-600 text-white" : "bg-slate-800 text-slate-400 hover:text-slate-200"
            )}>
            {r}
          </button>
        ))}
      </div>

      <Input value={amount} onChange={setAmount} placeholder="Investment amount (INR)" />

      <Button onClick={optimize} loading={loading} className="w-full justify-center">
        Optimize Portfolio
      </Button>

      {error && <p className="text-xs text-red-400">{error}</p>}

      {result && (
        <div className="space-y-3">
          {Object.entries(result.optimal_allocation).map(([sym, alloc]) => (
            <div key={sym}>
              <div className="flex justify-between text-xs mb-1">
                <span className="mono text-slate-300">{sym}</span>
                <span className="text-slate-400">{alloc.weight_pct.toFixed(1)}% · {formatINR(alloc.amount_inr)}</span>
              </div>
              <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full bg-blue-500 rounded-full transition-all duration-500"
                  style={{ width: `${alloc.weight_pct}%` }} />
              </div>
            </div>
          ))}
          {result.portfolio_metrics && (
            <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-800">
              {[
                { label: "Return", value: formatPct(result.portfolio_metrics.annual_return) },
                { label: "Volatility", value: formatPct(result.portfolio_metrics.annual_volatility) },
                { label: "Sharpe", value: result.portfolio_metrics.sharpe_ratio.toFixed(2) },
              ].map(({ label, value }) => (
                <div key={label} className="text-center">
                  <div className="text-xs text-slate-500">{label}</div>
                  <div className="mono text-xs font-semibold text-slate-200">{value}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
