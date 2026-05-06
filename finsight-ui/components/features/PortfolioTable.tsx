"use client";
import { Holding } from "@/types";
import { formatINR, formatPct, pctColor } from "@/lib/formatters";
import { Trash2 } from "lucide-react";
import clsx from "clsx";

interface Props {
  holdings: Holding[];
  onRemove?: (symbol: string) => void;
}

const COLS = ["Symbol", "Qty", "Avg Price", "Current", "Value", "P&L", "P&L %", "Source", ""];

export function PortfolioTable({ holdings, onRemove }: Props) {
  if (!holdings.length) {
    return <div className="glass p-8 text-center text-slate-600 text-sm">No holdings yet. Add some above.</div>;
  }

  return (
    <div className="glass overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-800">
              {COLS.map((c) => (
                <th key={c} className="px-4 py-3 text-left text-xs text-slate-500 font-medium uppercase tracking-wider">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {holdings.map((h) => (
              <tr key={h.symbol} className="border-b border-slate-800/50 hover:bg-slate-800/20 transition-colors">
                <td className="px-4 py-3 mono font-semibold text-slate-200">{h.symbol}</td>
                <td className="px-4 py-3 mono text-slate-400">{h.quantity}</td>
                <td className="px-4 py-3 mono text-slate-400">{formatINR(h.avg_price)}</td>
                <td className="px-4 py-3 mono text-slate-200">{formatINR(h.current_price)}</td>
                <td className="px-4 py-3 mono text-slate-200">{formatINR(h.current_value)}</td>
                <td className={clsx("px-4 py-3 mono font-medium", pctColor(h.pnl))}>{formatINR(h.pnl)}</td>
                <td className={clsx("px-4 py-3 mono font-medium", pctColor(h.pnl_pct))}>{formatPct(h.pnl_pct)}</td>
                <td className="px-4 py-3 text-xs text-slate-600">{h.source}</td>
                <td className="px-4 py-3">
                  {onRemove && (
                    <button onClick={() => onRemove(h.symbol)}
                      className="text-slate-600 hover:text-red-400 transition-colors">
                      <Trash2 size={14} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
