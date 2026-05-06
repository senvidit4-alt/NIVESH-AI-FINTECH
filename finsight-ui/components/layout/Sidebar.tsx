"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  LayoutDashboard, Search, BriefcaseBusiness, Star,
  MessageSquare, ShieldAlert, TrendingUp, TrendingDown,
} from "lucide-react";
import clsx from "clsx";
import api from "@/lib/api";

const NAV = [
  { href: "/",          label: "Dashboard",    icon: LayoutDashboard },
  { href: "/analyze",   label: "Analyze",      icon: Search },
  { href: "/portfolio", label: "Portfolio",    icon: BriefcaseBusiness },
  { href: "/watchlist", label: "Watchlist",    icon: Star },
  { href: "/chat",      label: "AI Chat",      icon: MessageSquare },
  { href: "/risk",      label: "Risk Center",  icon: ShieldAlert },
];

function NiftyLive() {
  const [data, setData] = useState<{ price: number; dir: "up" | "down" } | null>(null);

  useEffect(() => {
    const fetch = async () => {
      try {
        const res = await api.get("/market-summary");
        const nifty = res.data.indices?.find((i: { name: string; price: number; direction: string }) => i.name === "NIFTY 50");
        if (nifty) setData({ price: nifty.price, dir: nifty.direction });
      } catch {}
    };
    fetch();
    const id = setInterval(fetch, 10000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="p-4 border-t border-slate-800/50">
      <div className="flex items-center gap-2">
        <span className={clsx("w-2 h-2 rounded-full pulse-dot", data?.dir === "up" ? "bg-emerald-400" : "bg-red-400")} />
        <span className="text-xs text-slate-500">NIFTY 50</span>
        {data ? (
          <span className={clsx("mono text-xs ml-auto", data.dir === "up" ? "text-emerald-400" : "text-red-400")}>
            {data.price.toLocaleString("en-IN")}
            {data.dir === "up" ? <TrendingUp size={10} className="inline ml-1" /> : <TrendingDown size={10} className="inline ml-1" />}
          </span>
        ) : (
          <span className="mono text-xs ml-auto text-slate-600">—</span>
        )}
      </div>
    </div>
  );
}

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-60 fixed left-0 top-0 bottom-0 flex flex-col bg-slate-950/80 border-r border-slate-800/50 backdrop-blur-xl z-40">
      {/* Logo */}
      <div className="h-14 flex items-center px-5 border-b border-slate-800/50">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center">
            <TrendingUp size={14} className="text-white" />
          </div>
          <span className="font-bold text-slate-100 text-sm tracking-wide">FinSight AI</span>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={clsx(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
                active
                  ? "bg-blue-500/10 text-blue-400 border-l-2 border-blue-500 pl-[10px]"
                  : "text-slate-500 hover:text-slate-300 hover:bg-slate-800/50 border-l-2 border-transparent"
              )}
            >
              <Icon size={16} />
              {label}
            </Link>
          );
        })}
      </nav>

      <NiftyLive />
    </aside>
  );
}
