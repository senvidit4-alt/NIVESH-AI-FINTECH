"use client";
import { useEffect, useState, ReactNode } from "react";
import clsx from "clsx";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

function useCountUp(target: number, duration = 800) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!target) return;
    const start = Date.now();
    const tick = () => {
      const elapsed = Date.now() - start;
      const progress = Math.min(elapsed / duration, 1);
      setVal(target * progress);
      if (progress < 1) requestAnimationFrame(tick);
      else setVal(target);
    };
    requestAnimationFrame(tick);
  }, [target, duration]);
  return val;
}

interface KPICardProps {
  title: string;
  value: string;
  subtitle?: string;
  icon?: ReactNode;
  trend?: "up" | "down" | "neutral";
  trendValue?: string;
  glowColor?: "blue" | "green" | "red" | "amber";
  rawValue?: number;
}

const glowMap = { blue: "glow-blue", green: "glow-green", red: "glow-red", amber: "glow-amber" };

export function KPICard({ title, value, subtitle, icon, trend, trendValue, glowColor, rawValue }: KPICardProps) {
  const counted = useCountUp(rawValue ?? 0);
  const displayValue = rawValue !== undefined
    ? value.replace(/[\d,]+/, Math.round(counted).toLocaleString("en-IN"))
    : value;

  return (
    <div className={clsx("glass p-5 cursor-default", glowColor && glowMap[glowColor])}>
      <div className="flex items-start justify-between mb-3">
        <span className="text-xs text-slate-500 font-medium uppercase tracking-wider">{title}</span>
        {icon && <span className="text-slate-600">{icon}</span>}
      </div>
      <div className="mono text-2xl font-semibold text-slate-100 count-up mb-1">{displayValue}</div>
      <div className="flex items-center gap-2">
        {trend && trendValue && (
          <span className={clsx("flex items-center gap-1 text-xs font-medium",
            trend === "up" ? "text-emerald-400" : trend === "down" ? "text-red-400" : "text-slate-500"
          )}>
            {trend === "up" ? <TrendingUp size={12} /> : trend === "down" ? <TrendingDown size={12} /> : <Minus size={12} />}
            {trendValue}
          </span>
        )}
        {subtitle && <span className="text-xs text-slate-600">{subtitle}</span>}
      </div>
    </div>
  );
}
