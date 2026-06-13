import { motion } from "framer-motion";
import { useEffect, useState, useRef } from "react";
import { videos } from "@/lib/videos";
import { Bell, Eye, Newspaper, BarChart3, Plus, X } from "lucide-react";
import {
  getWatchlist,
  getAlerts,
  getGlobalAlerts,
  getNews,
  addToWatchlist,
  removeFromWatchlist,
  createAlert,
  type WatchlistItem,
  type AlertItem,
  type GlobalAlertItem,
  type NewsArticle,
} from "@/lib/agent-api";
import { useWebSocket } from "@/hooks/useWebSocket";

interface UnifiedAlert {
  id: number;
  isGlobal: boolean;
  symbol: string;
  name?: string;
  change_pct?: number;
  price?: number;
  alert_type?: string;
  target_price?: number;
  direction?: string;
  triggered?: boolean;
  created_at: string;
}

function Panel({
  title,
  icon: Icon,
  children,
  delay = 0,
  className = "",
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.6, delay }}
      className={`glass rounded-3xl p-5 ${className}`}
    >
      <div className="mb-4 flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-muted-foreground">
        <Icon className="h-3.5 w-3.5 text-primary" />
        {title}
      </div>
      {children}
    </motion.div>
  );
}

function PanelSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map((k) => (
        <div key={k} className="h-9 w-full animate-pulse rounded-xl bg-muted/30" />
      ))}
    </div>
  );
}

export default function CommandCenter() {
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [alerts, setAlerts] = useState<UnifiedAlert[]>([]);
  const [news, setNews] = useState<NewsArticle[]>([]);
  const [loadingW, setLoadingW] = useState(true);
  const [loadingA, setLoadingA] = useState(true);
  const [loadingN, setLoadingN] = useState(true);
  const [newSymbol, setNewSymbol] = useState("");
  const [addingSymbol, setAddingSymbol] = useState(false);
  const [alertSymbol, setAlertSymbol] = useState("");
  const [alertPrice, setAlertPrice] = useState("");
  const [alertDirection, setAlertDirection] = useState<"above" | "below">("above");
  const [creatingAlert, setCreatingAlert] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Hook into WebSocket for real-time alert events
  const { prices: _prices, connected: _connected, lastEvent } = useWebSocket();

  const loadAlerts = async () => {
    try {
      const [customData, globalData] = await Promise.all([
        getAlerts(),
        getGlobalAlerts()
      ]);
      
      const unified: UnifiedAlert[] = [
        ...customData.map(a => ({
          id: a.id,
          isGlobal: false,
          symbol: a.symbol,
          target_price: a.target_price,
          direction: a.direction,
          triggered: a.triggered,
          created_at: a.created_at
        })),
        ...globalData.map(g => ({
          id: g.id,
          isGlobal: true,
          symbol: g.symbol,
          name: g.name,
          change_pct: g.change_pct,
          price: g.price,
          alert_type: g.alert_type,
          created_at: g.created_at
        }))
      ];
      
      unified.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setAlerts(unified);
      setLoadingA(false);
    } catch {
      setLoadingA(false);
    }
  };

  // On mount — request browser notification permission + load initial data
  useEffect(() => {
    if (Notification.permission === "default") {
      Notification.requestPermission();
    }
    getWatchlist().then((data) => { setWatchlist(data); setLoadingW(false); });
    loadAlerts();
    getNews("NIFTY").then((data) => { setNews(data); setLoadingN(false); });
  }, []);

  // React to WebSocket push events
  useEffect(() => {
    if (lastEvent?.type === "alert_triggered") {
      const ev = lastEvent as {
        type: string;
        symbol: string;
        target_price: number;
        direction: string;
        current_price: number;
        timestamp: string;
      };

      setAlerts((prev) => [
        {
          id: Date.now(),
          isGlobal: false,
          symbol: ev.symbol,
          target_price: ev.target_price,
          direction: ev.direction,
          triggered: true,
          created_at: ev.timestamp,
        } as UnifiedAlert,
        ...prev,
      ]);

      if (Notification.permission === "granted") {
        new Notification("🚨 Nivesh AI Alert!", {
          body: `${ev.symbol} has hit your target of ₹${ev.target_price.toLocaleString()}! Current price: ₹${ev.current_price.toLocaleString()}`,
          icon: "/favicon.ico",
        });
      }
    } else if (lastEvent?.type === "global_market_alert") {
      const ev = lastEvent as {
        type: string;
        symbol: string;
        name: string;
        change_pct: number;
        current_price: number;
        alert_type: string;
        timestamp: string;
      };

      setAlerts((prev) => [
        {
          id: Date.now(),
          isGlobal: true,
          symbol: ev.symbol,
          name: ev.name,
          change_pct: ev.change_pct,
          price: ev.current_price,
          alert_type: ev.alert_type,
          created_at: ev.timestamp
        } as UnifiedAlert,
        ...prev,
      ]);

      if (Notification.permission === "granted") {
        const isUp = ev.change_pct >= 0;
        const curSymbol = ev.symbol.includes("USD") ? "$" : "₹";
        new Notification(`🌍 Global Alert: ${ev.name}`, {
          body: `${ev.alert_type} for ${ev.symbol}! Price: ${curSymbol}${ev.current_price.toLocaleString()} (${isUp ? "+" : ""}${ev.change_pct.toFixed(2)}%)`,
          icon: "/favicon.ico",
        });
      }
    }
  }, [lastEvent]);


  const handleAddSymbol = async () => {
    const sym = newSymbol.trim().toUpperCase();
    if (!sym || addingSymbol) return;
    setAddingSymbol(true);
    const ok = await addToWatchlist(sym);
    if (ok) {
      // Optimistically add to UI; re-fetch to get server-assigned id/timestamp
      const refreshed = await getWatchlist();
      setWatchlist(refreshed);
    }
    setNewSymbol("");
    setAddingSymbol(false);
    inputRef.current?.focus();
  };

  const handleRemoveSymbol = async (symbol: string) => {
    await removeFromWatchlist(symbol);
    setWatchlist((prev) => prev.filter((w) => w.symbol !== symbol));
  };

  const handleCreateAlert = async () => {
    const sym = alertSymbol.trim().toUpperCase();
    const price = parseFloat(alertPrice);
    if (!sym || isNaN(price) || creatingAlert) return;
    setCreatingAlert(true);
    const ok = await createAlert({ symbol: sym, target_price: price, direction: alertDirection });
    if (ok) {
      const refreshed = await getAlerts();
      setAlerts(refreshed);
      setAlertSymbol("");
      setAlertPrice("");
    }
    setCreatingAlert(false);
  };


  return (
    <section className="relative overflow-hidden py-32">
      <video
        src={videos.futuristicDashboard}
        autoPlay
        muted
        loop
        playsInline
        className="absolute inset-0 h-full w-full object-cover opacity-30"
      />
      <div className="absolute inset-0 bg-gradient-to-b from-background via-background/80 to-background" />
      <div className="relative mx-auto max-w-7xl px-6">
        <p className="mb-3 text-xs uppercase tracking-[0.3em] text-secondary">06 · Command Center</p>
        <h2 className="max-w-3xl text-4xl font-semibold tracking-tight md:text-6xl" style={{ letterSpacing: "-0.03em" }}>
          Your <span className="text-gradient">cockpit</span> for the market.
        </h2>

        <div className="mt-10 grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-4">
          {/* Watchlist Panel */}
          <Panel title="Watchlist" icon={Eye} className="lg:col-span-2">
            {loadingW ? (
              <PanelSkeleton />
            ) : (
              <>
                <ul className="space-y-3 max-h-[350px] overflow-y-auto pr-1 scrollbar-thin">
                  {watchlist.length === 0 && (
                    <li className="text-xs text-muted-foreground">No symbols yet.</li>
                  )}
                  {watchlist.map((w) => (
                    <li key={w.id} className="flex items-center justify-between text-sm group">
                      <span className="font-medium">{w.symbol}</span>
                      <button
                        onClick={() => handleRemoveSymbol(w.symbol)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                        aria-label={`Remove ${w.symbol}`}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
                {/* Add symbol input */}
                <div className="mt-4 flex items-center gap-2">
                  <input
                    ref={inputRef}
                    value={newSymbol}
                    onChange={(e) => setNewSymbol(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAddSymbol()}
                    placeholder="Add symbol…"
                    className="flex-1 rounded-lg bg-muted/30 px-3 py-1.5 text-xs outline-none placeholder:text-muted-foreground/60 focus:ring-1 focus:ring-primary/40"
                  />
                  <button
                    onClick={handleAddSymbol}
                    disabled={addingSymbol || !newSymbol.trim()}
                    aria-label="Add to watchlist"
                    className="rounded-lg bg-primary/20 p-1.5 hover:bg-primary/40 disabled:opacity-40 transition-colors"
                  >
                    <Plus className="h-3.5 w-3.5 text-primary" />
                  </button>
                </div>
              </>
            )}
          </Panel>

          {/* Sentiment Panel — static data kept as-is */}
          <Panel title="Sentiment" icon={BarChart3} delay={0.2} className="lg:col-span-2">
            <div className="space-y-3">
              {[
                { k: "Bullish", v: 64, c: "bg-accent" },
                { k: "Neutral", v: 22, c: "bg-primary" },
                { k: "Bearish", v: 14, c: "bg-destructive" },
              ].map((row) => (
                <div key={row.k}>
                  <div className="mb-1 flex justify-between text-xs text-muted-foreground">
                    <span>{row.k}</span>
                    <span>{row.v}%</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/40">
                    <motion.div
                      initial={{ width: 0 }}
                      whileInView={{ width: `${row.v}%` }}
                      viewport={{ once: true }}
                      transition={{ duration: 1, ease: "easeOut" }}
                      className={`h-full ${row.c}`}
                    />
                  </div>
                </div>
              ))}
            </div>
          </Panel>

          {/* Alerts Panel */}
          <Panel title="Alerts" icon={Bell} delay={0.1} className="lg:col-span-2">
            {loadingA ? (
              <PanelSkeleton />
            ) : (
              <>
                <ul className="space-y-3 max-h-[350px] overflow-y-auto pr-1 scrollbar-thin">
                  {alerts.length === 0 && (
                    <li className="text-xs text-muted-foreground">No alerts set.</li>
                  )}
                  {alerts.map((a) => {
                    if (a.isGlobal) {
                      const isUp = (a.change_pct ?? 0) >= 0;
                      const badgeBg = a.alert_type?.includes("CRASH")
                        ? "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                        : a.alert_type?.includes("BREAKOUT")
                        ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                        : isUp
                        ? "bg-green-500/10 text-green-300 border border-green-500/15"
                        : "bg-red-500/10 text-red-300 border border-red-500/15";

                      return (
                        <li key={a.id} className="rounded-xl p-3 text-sm bg-muted/40 border border-muted/50 transition-all">
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-foreground flex items-center gap-1.5">
                              <span>🌍</span>
                              {a.name} ({a.symbol})
                            </span>
                            <span className={`text-[9px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full ${badgeBg}`}>
                              {a.alert_type}
                            </span>
                          </div>
                          <div className="mt-2 flex items-center justify-between text-xs">
                            <span className="font-medium text-muted-foreground">
                              Price: {a.symbol.includes("USD") ? "$" : "₹"}{a.price?.toLocaleString()}
                            </span>
                            <span className={`font-semibold ${isUp ? "text-emerald-400" : "text-rose-400"}`}>
                              {isUp ? "+" : ""}{a.change_pct?.toFixed(2)}%
                            </span>
                          </div>
                          <div className="mt-1 text-[10px] text-muted-foreground">
                            {new Date(a.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </li>
                      );
                    } else {
                      return (
                        <li key={a.id} className={`rounded-xl p-3 text-sm transition-all ${
                          a.triggered
                            ? "bg-rose-500/10 border border-rose-500/20 animate-pulse-once"
                            : "bg-muted/30"
                        }`}>
                          <div className={a.triggered ? "text-rose-300 font-medium" : ""}>
                            {a.triggered && <span className="mr-1.5">🚨</span>}
                            {a.symbol} · {a.direction} ₹{a.target_price?.toLocaleString()}
                          </div>
                          <div className="mt-1 text-[11px] text-muted-foreground">
                            {a.triggered ? "✅ Triggered" : "⏳ Watching"} · {a.created_at.slice(0, 10)}
                          </div>
                        </li>
                      );
                    }
                  })}
                </ul>

                {/* Create Alert inline form */}
                <div className="mt-4 border-t border-border/20 pt-4 space-y-2">
                  <div className="flex gap-2">
                    <input
                      placeholder="TCS.NS"
                      value={alertSymbol}
                      onChange={(e) => setAlertSymbol(e.target.value.toUpperCase())}
                      className="w-1/2 rounded-lg bg-muted/30 px-2.5 py-1.5 text-xs outline-none placeholder:text-muted-foreground/60 focus:ring-1 focus:ring-primary/40"
                    />
                    <input
                      type="number"
                      placeholder="Target Price"
                      value={alertPrice}
                      onChange={(e) => setAlertPrice(e.target.value)}
                      className="w-1/2 rounded-lg bg-muted/30 px-2.5 py-1.5 text-xs outline-none placeholder:text-muted-foreground/60 focus:ring-1 focus:ring-primary/40"
                    />
                  </div>
                  <div className="flex gap-2 items-center">
                    <select
                      value={alertDirection}
                      onChange={(e) => setAlertDirection(e.target.value as "above" | "below")}
                      className="flex-1 rounded-lg bg-muted/30 px-2 py-1.5 text-xs outline-none text-muted-foreground border border-transparent focus:border-primary/20"
                    >
                      <option value="above" className="bg-background text-foreground">Crosses Above</option>
                      <option value="below" className="bg-background text-foreground">Crosses Below</option>
                    </select>
                    <button
                      onClick={handleCreateAlert}
                      disabled={creatingAlert || !alertSymbol || !alertPrice}
                      className="rounded-lg bg-primary/20 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/40 disabled:opacity-40 transition-colors"
                    >
                      Set Alert
                    </button>
                  </div>
                </div>
              </>
            )}
          </Panel>

          {/* News Feed Panel */}
          <Panel title="News Feed" icon={Newspaper} delay={0.3} className="lg:col-span-2">
            {loadingN ? (
              <PanelSkeleton />
            ) : (
              <ul className="space-y-3 max-h-[350px] overflow-y-auto pr-1 scrollbar-thin">
                {news.length === 0 && (
                  <li className="text-xs text-muted-foreground">No news available.</li>
                )}
                {news.map((n, idx) => (
                  <li key={idx} className="glass-card hover:bg-muted/20 border border-transparent hover:border-border/30 rounded-2xl p-3 transition-all text-sm flex flex-col justify-between gap-1 group">
                    <div>
                      {n.link ? (
                        <a href={n.link} target="_blank" rel="noopener noreferrer" className="font-medium hover:text-primary transition-colors leading-snug block">
                          {n.title}
                        </a>
                      ) : (
                        <div className="font-medium leading-snug">{n.title}</div>
                      )}
                    </div>
                    <div className="mt-1.5 flex items-center justify-between text-[10px] text-muted-foreground">
                      {n.publisher && (
                        <span className="font-semibold text-primary/80">{n.publisher}</span>
                      )}
                      {n.published && (
                        <span>
                          {(() => {
                            try {
                              const d = new Date(n.published);
                              if (isNaN(d.getTime())) return n.published;
                              return d.toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
                            } catch {
                              return n.published;
                            }
                          })()}
                        </span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </section>
  );
}