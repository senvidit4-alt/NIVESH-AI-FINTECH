"use client";
import clsx from "clsx";

interface InputProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  type?: string;
  disabled?: boolean;
}

export function Input({ value, onChange, placeholder, className, onKeyDown, type = "text", disabled }: InputProps) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={onKeyDown}
      placeholder={placeholder}
      disabled={disabled}
      className={clsx(
        "w-full bg-slate-900/60 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200",
        "placeholder:text-slate-600 focus:outline-none focus:border-blue-500/60 focus:ring-1 focus:ring-blue-500/20",
        "transition-all duration-200 disabled:opacity-50",
        className
      )}
      suppressHydrationWarning
    />
  );
}
