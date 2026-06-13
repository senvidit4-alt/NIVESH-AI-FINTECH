import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import ScrollVideo from "@/components/ScrollVideo";
import { videos } from "@/lib/videos";
import { Activity, Brain, Database, ShieldAlert, TrendingUp } from "lucide-react";

const NODES = [
  { id: "research", label: "Research", icon: Brain, desc: "Web + filings sweep" },
  { id: "data", label: "Data Fetch", icon: Database, desc: "OHLCV, indicators" },
  { id: "sentiment", label: "Sentiment", icon: Activity, desc: "FinBERT scoring" },
  { id: "risk", label: "Risk", icon: ShieldAlert, desc: "VaR · CVaR · β" },
  { id: "decision", label: "Decision", icon: TrendingUp, desc: "Final thesis" },
];

export function AgentPipeline({ activeId, compact = false }: { activeId?: string | null; compact?: boolean }) {
  return (
    <div className={`flex ${compact ? "flex-row gap-2" : "flex-col gap-4 md:flex-row md:gap-3"} items-stretch`}>
      {NODES.map((n, i) => {
        const Icon = n.icon;
        const active = activeId === n.id;
        return (
          <div key={n.id} className="flex flex-1 items-center gap-3">
            <motion.div
              animate={
                active
                  ? { scale: [1, 1.05, 1], boxShadow: ["0 0 0 0 rgba(0,245,255,0)", "0 0 40px 6px rgba(0,245,255,0.45)", "0 0 0 0 rgba(0,245,255,0)"] }
                  : { scale: 1, boxShadow: "0 0 0 0 rgba(0,245,255,0)" }
              }
              transition={{ duration: 1.4, repeat: active ? Infinity : 0 }}
              className={`glass relative flex flex-1 flex-col items-start gap-2 rounded-2xl p-4 ${active ? "border-primary/60" : ""}`}
            >
              <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                <Icon className="h-4 w-4" />
              </div>
              <div className="text-sm font-medium">{n.label}</div>
              {!compact && <div className="text-[11px] text-muted-foreground">{n.desc}</div>}
              {active && (
                <div className="absolute right-3 top-3 flex items-center gap-1 text-[10px] text-accent">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" /> live
                </div>
              )}
            </motion.div>
            {i < NODES.length - 1 && (
              <div className="hidden h-px w-6 flex-shrink-0 bg-gradient-to-r from-primary/60 to-transparent md:block" />
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function AgentIntel() {
  const [active, setActive] = useState<string>("research");
  useEffect(() => {
    const ids = NODES.map((n) => n.id);
    let i = 0;
    const t = setInterval(() => {
      i = (i + 1) % ids.length;
      setActive(ids[i]);
    }, 1600);
    return () => clearInterval(t);
  }, []);

  return (
    <section className="relative">
      <ScrollVideo
        src={videos.tradingEcosystem}
        mode="scrub"
        scrubLength={2}
        className="h-screen w-full"
        overlayClassName="bg-gradient-to-b from-background via-background/30 to-background"
      />
      <div className="pointer-events-none absolute inset-0 z-10 flex items-center">
        <div className="mx-auto w-full max-w-6xl px-6">
          <p className="mb-3 text-xs uppercase tracking-[0.3em] text-secondary">03 · Agent Intelligence</p>
          <h2 className="max-w-3xl text-4xl font-semibold tracking-tight md:text-6xl" style={{ letterSpacing: "-0.03em" }}>
            A <span className="text-gradient">LangGraph</span> of specialists, reasoning in lockstep.
          </h2>
          <p className="mt-5 max-w-2xl text-muted-foreground">
            Each node owns a discipline. Together they produce one auditable answer — not a guess.
          </p>
          <div className="pointer-events-auto mt-10">
            <AgentPipeline activeId={active} />
          </div>
        </div>
      </div>
    </section>
  );
}