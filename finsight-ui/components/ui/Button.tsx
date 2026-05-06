"use client";
import clsx from "clsx";
import { ReactNode } from "react";

interface ButtonProps {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
  loading?: boolean;
  className?: string;
  type?: "button" | "submit";
}

const variants = {
  primary:   "bg-blue-600 hover:bg-blue-500 text-white border border-blue-500/50",
  secondary: "bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700",
  danger:    "bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-500/30",
  ghost:     "bg-transparent hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-transparent",
};
const sizes = {
  sm: "px-3 py-1.5 text-xs",
  md: "px-4 py-2 text-sm",
  lg: "px-6 py-3 text-base",
};

export function Button({ children, onClick, variant = "primary", size = "md", disabled, loading, className, type = "button" }: ButtonProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className={clsx(
        "inline-flex items-center gap-2 rounded-lg font-medium transition-all duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed",
        variants[variant], sizes[size], className
      )}
    >
      {loading && (
        <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
      )}
      {children}
    </button>
  );
}
