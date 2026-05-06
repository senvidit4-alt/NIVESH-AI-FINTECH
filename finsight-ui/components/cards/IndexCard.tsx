"use client";
import { useEffect, useState } from "react";
import { TrendingUp, TrendingDown } from "lucide-react";
import clsx from "clsx";
import { MarketIndex } from "@/types";
import { MiniSparkline } from "@/components/ui/MiniSparkline";
import { formatPct } from "@/lib/formatters";

function generateSparkData(base: number, n = 20): number[] {
  const data = [base];
  for (let i = 1; i < n; i++) {
    data.push(data[i - 1] * (1 + (Math.random() - 0.5) * 0.004));
  }
  return data;
}

export function IndexCard({ index }: { index: MarketIndex }) {
  const [spark, setSpark] = useState<number[]>([]);
  const up = index.direction === "up";

  useEffect(() => {
    setSpark(generateSparkData(index.price));
  }, [index.price]);

  return (
    <div className={clsx("glass p-4 cursor-default", up ? "glow-green" : "glow-red")}>
      <div className="flex items-start justify-between mb-2">
        <span className="text-xs text-slate-500 font-medium">{index.name}</span>
        {up ? <TrendingUp size={14} className="text-emerald-400" /> : <TrendingDown size={14} className="text-red-400" />}
      </div>
      <div className="mono text-xl font-semibold text-slate-100 mb-1">
        {index.price.toLocaleString("en-IN")}
      </div>
      <div className="flex items-center justify-between">
        <span className={clsx("text-xs font-medium", up ? "text-emerald-400" : "text-red-400")}>
          {formatPct(index.change_pct)}
        </span>
        <MiniSparkline data={spark} color={up ? "#10b981" : "#ef4444"} />
      </div>
    </div>
  );
}
