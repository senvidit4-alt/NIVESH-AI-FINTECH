"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { TopBar } from "@/components/layout/TopBar";
import { WatchlistTable } from "@/components/features/WatchlistTable";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { LoadingSkeleton } from "@/components/ui/LoadingSkeleton";
import { useWatchlistStore } from "@/store/watchlistStore";
import { WatchlistItem, Alert } from "@/types";
import { formatINR } from "@/lib/formatters";
import api from "@/lib/api";
import { Plus, RefreshCw, Trash2, Bell } from "lucide-react";
import clsx from "clsx";

export default function WatchlistPage() {
  const { items, alerts, setItems, setAlerts, removeItem, removeAlert } = useWatchlistStore();
  const [newSym, setNewSym] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
  const staleRef = useRef(false);

  const fetchAll = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [wlRes, alertRes] = await Promise.all([
        api.get("/watchlist"),
        api.get("/alerts"),
      ]);
      if (staleRef.current) return;
      const wlItems: WatchlistItem[] = wlRes.data.watchlist || [];
      // Fetch prices concurrently
      const priceResults = await Promise.allSettled(
        wlItems.map((item) => api.get(`/stock-price/${item.symbol}`))
      );
      const enriched = wlItems.map((item, i) => {
        const r = priceResults[i];
        return { ...item, price: r.status === "fulfilled" ? r.value.data.price : undefined };
      });
      setItems(enriched);
      setAlerts(alertRes.data.alerts || []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load watchlist");
    } finally {
      setLoading(false);
    }
  }, [setItems, setAlerts]);

  useEffect(() => {
    staleRef.current = false;
    fetchAll();
    return () => { staleRef.current = true; };
  }, [fetchAll]);

  const addSymbol = async () => {
    if (!newSym.trim()) return;
    setAdding(true);
    try {
      await api.post("/watchlist/add", { symbol: newSym.toUpperCase().trim() });
      setNewSym("");
      fetchAll();
    } catch {}
    setAdding(false);
  };

  const handleRemove = async (symbol: string) => {
    try {
      await api.delete(`/watchlist/${symbol}`);
      removeItem(symbol);
    } catch {}
  };

  const handleDeleteAlert = async (id: number) => {
    try {
      await api.delete(`/alerts/${id}`);
      removeAlert(id);
    } catch {}
  };

  return (
    <div>
      <TopBar title="Watchlist" />
      <div className="p-6 space-y-6">

        {/* Add bar */}
        <div className="flex gap-3">
          <Input value={newSym} onChange={setNewSym}
            placeholder="Add symbol e.g. INFY.NS"
            onKeyDown={(e) => e.key === "Enter" && addSymbol()}
            className="max-w-xs" />
          <Button onClick={addSymbol} loading={adding}><Plus size={14} /> Add</Button>
          <Button variant="ghost" onClick={fetchAll} loading={loading}><RefreshCw size={14} /></Button>
        </div>

        {error && (
          <div className="border border-red-500/30 bg-red-500/5 rounded-xl p-4 flex items-center justify-between">
            <span className="text-sm text-red-400">{error}</span>
            <Button variant="danger" size="sm" onClick={fetchAll}>Retry</Button>
          </div>
        )}

        {loading ? <LoadingSkeleton rows={5} /> : (
          <WatchlistTable items={items} onRemove={handleRemove} onAlertAdded={fetchAll} />
        )}

        {/* Active Alerts */}
        {alerts.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2">
              <Bell size={14} className="text-amber-400" /> Active Alerts
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {alerts.map((alert) => {
                const wlItem = items.find((i) => i.symbol === alert.symbol);
                const current = wlItem?.price;
                const gap = current ? ((alert.target_price - current) / current * 100) : null;
                return (
                  <div key={alert.id} className={clsx("glass p-4 space-y-2", alert.triggered && "opacity-50")}>
                    <div className="flex items-center justify-between">
                      <span className="mono font-semibold text-slate-200 text-sm">{alert.symbol}</span>
                      <div className="flex items-center gap-2">
                        <Badge
                          label={`${alert.direction.toUpperCase()} ₹${alert.target_price.toLocaleString("en-IN")}`}
                          variant={alert.direction === "above" ? "success" : "danger"}
                        />
                        <button onClick={() => handleDeleteAlert(alert.id)}
                          className="text-slate-600 hover:text-red-400 transition-colors">
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                    {current && (
                      <div className="text-xs text-slate-500">
                        Current: <span className="mono text-slate-300">{formatINR(current)}</span>
                        {gap !== null && (
                          <span className={clsx("ml-2", Math.abs(gap) < 2 ? "text-amber-400" : "text-slate-500")}>
                            ({gap > 0 ? "+" : ""}{gap.toFixed(1)}% away)
                          </span>
                        )}
                      </div>
                    )}
                    {alert.triggered && <Badge label="TRIGGERED" variant="warning" />}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
