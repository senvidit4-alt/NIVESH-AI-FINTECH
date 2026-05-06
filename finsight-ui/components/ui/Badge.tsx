"use client";
import clsx from "clsx";

type Variant = "success" | "danger" | "warning" | "info" | "neutral";

const variants: Record<Variant, string> = {
  success: "bg-emerald-400/10 text-emerald-400 border border-emerald-400/20",
  danger:  "bg-red-400/10 text-red-400 border border-red-400/20",
  warning: "bg-amber-400/10 text-amber-400 border border-amber-400/20",
  info:    "bg-blue-400/10 text-blue-400 border border-blue-400/20",
  neutral: "bg-slate-400/10 text-slate-400 border border-slate-400/20",
};

export function Badge({ label, variant = "neutral" }: { label: string; variant?: Variant }) {
  return (
    <span className={clsx("inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium", variants[variant])}>
      {label}
    </span>
  );
}
