"use client";
import { RiskMetrics as RiskMetricsType } from "@/types";
import { Badge } from "@/components/ui/Badge";
import clsx from "clsx";

function riskVariant(level: string) {
  if (/low/i.test(level)) return "success";
  if (/medium/i.test(level)) return "warning";
  return "danger";
}

export function RiskMetrics({ metrics }: { metrics: RiskMetricsType }) {
  return (
    <div className="glass p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-300">Risk Metrics</h3>
        <Badge label={metrics.risk_level.replace(/[🟢🟡🔴⚪]/g, "").trim()} variant={riskVariant(metrics.risk_level)} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: "Volatility", value: `${metrics.volatility_pct.toFixed(2)}%` },
          { label: "Sharpe Ratio", value: metrics.sharpe_ratio.toFixed(2) },
          { label: "Ann. Return", value: `${metrics.annualized_return_pct.toFixed(2)}%` },
          { label: "Diversification", value: `${metrics.diversification_score} stocks` },
          ...(metrics.var_95_pct !== undefined ? [{ label: "VaR (95%)", value: `${metrics.var_95_pct.toFixed(2)}%` }] : []),
          ...(metrics.cvar_95_pct !== undefined ? [{ label: "CVaR (95%)", value: `${metrics.cvar_95_pct.toFixed(2)}%` }] : []),
        ].map(({ label, value }) => (
          <div key={label} className="bg-slate-900/40 rounded-lg p-3">
            <div className="text-xs text-slate-500 mb-1">{label}</div>
            <div className={clsx("mono text-sm font-semibold",
              label.includes("Return") ? (parseFloat(value) >= 0 ? "text-emerald-400" : "text-red-400") : "text-slate-200"
            )}>{value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
