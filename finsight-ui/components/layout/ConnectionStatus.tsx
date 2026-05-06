"use client";
import { useEffect, useState } from "react";
import api from "@/lib/api";

export function ConnectionStatus() {
  const [status, setStatus] = useState<"live" | "polling" | "offline">("polling");

  useEffect(() => {
    const check = async () => {
      try {
        await api.get("/");
        setStatus("live");
      } catch {
        setStatus("offline");
      }
    };
    check();
    const id = setInterval(check, 30000);
    return () => clearInterval(id);
  }, []);

  const colors = { live: "bg-emerald-400", polling: "bg-amber-400", offline: "bg-red-400" };
  const labels = { live: "LIVE", polling: "POLLING", offline: "OFFLINE" };

  return (
    <div className="flex items-center gap-1.5">
      <span className={`w-2 h-2 rounded-full pulse-dot ${colors[status]}`} />
      <span className="text-xs text-slate-500 font-medium">{labels[status]}</span>
    </div>
  );
}
