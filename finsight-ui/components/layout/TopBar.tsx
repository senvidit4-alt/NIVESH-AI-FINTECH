"use client";
import { useEffect, useState } from "react";
import { ConnectionStatus } from "./ConnectionStatus";

function ISTClock() {
  const [time, setTime] = useState("");
  useEffect(() => {
    const tick = () => {
      setTime(new Date().toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour12: false }));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return <span className="mono text-xs text-slate-500">{time} IST</span>;
}

export function TopBar({ title }: { title: string }) {
  return (
    <div className="h-14 border-b border-slate-800/50 flex items-center justify-between px-6 bg-slate-950/40 backdrop-blur-sm">
      <h1 className="text-sm font-semibold text-slate-200">{title}</h1>
      <div className="flex items-center gap-4">
        <ConnectionStatus />
        <ISTClock />
      </div>
    </div>
  );
}
