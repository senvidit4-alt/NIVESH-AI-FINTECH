"use client";
import { useEffect, useState } from "react";
import { formatPct } from "@/lib/formatters";
import api from "@/lib/api";
import { MarketIndex } from "@/types";

export function Ticker() {
  const [indices, setIndices] = useState<MarketIndex[]>([]);

  useEffect(() => {
    const fetch = async () => {
      try {
        const res = await api.get("/market-summary");
        setIndices(res.data.indices || []);
      } catch {}
    };
    fetch();
    const id = setInterval(fetch, 15000);
    return () => clearInterval(id);
  }, []);

  if (!indices.length) return null;

  const items = [...indices, ...indices]; // duplicate for seamless loop

  return (
    <div className="h-8 bg-slate-950/80 border-b border-slate-800/50 overflow-hidden flex items-center">
      <div className="ticker-track">
        {items.map((idx, i) => (
          <span key={i} className="flex items-center gap-2 px-6 text-xs whitespace-nowrap">
            <span className="text-slate-500 font-medium">{idx.name}</span>
            <span className="mono text-slate-200">{idx.price.toLocaleString("en-IN")}</span>
            <span className={idx.direction === "up" ? "text-emerald-400" : "text-red-400"}>
              {formatPct(idx.change_pct)}
            </span>
            <span className="text-slate-700">|</span>
          </span>
        ))}
      </div>
    </div>
  );
}
