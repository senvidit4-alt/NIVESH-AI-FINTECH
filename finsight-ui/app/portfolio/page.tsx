"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { TopBar } from "@/components/layout/TopBar";
import { KPICard } from "@/components/cards/KPICard";
import { PortfolioTable } from "@/components/features/PortfolioTable";
import { RiskMetrics } from "@/components/features/RiskMetrics";
import { MPTOptimizer } from "@/components/features/MPTOptimizer";
import { PieChart } from "@/components/charts/PieChart";
import { ScatterChart } from "@/components/charts/ScatterChart";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { LoadingSkeleton } from "@/components/ui/LoadingSkeleton";
import { usePortfolioStore } from "@/store/portfolioStore";
import { PortfolioResponse, EfficientFrontierPoint } from "@/types";
import { formatINR, formatPct, pctColor } from "@/lib/formatters";
import api from "@/lib/api";
import { Plus, RefreshCw } from "lucide-react";
import clsx from "clsx";

export default function PortfolioPage() {
  const { holdings, liveHoldings, totalValue, riskMetrics, addHolding, removeHolding, setLiveData } = usePortfolioStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [addModal, setAddModal] = useState(false);
  const [newSym, setNewSym] = useState("");
  const [newQty, setNewQty] = useState("1");
  const [newAvg, setNewAvg] = useState("");
  const [frontier, setFrontier] = useState<EfficientFrontierPoint[]>([]);
  const [frontierLoading, setFrontierLoading] = useState(false);
  const staleRef = useRef(false);

  const fetchRisk = useCallback(async () => {
    if (!holdings.length) return;
    setLoading(true); setError("");
    try {
      const res = await api.post<PortfolioResponse>("/get-portfolio-risk", { holdings });
      if (!staleRef.current) {
        setLiveData(res.data.holdings, res.data.total_value, res.data.risk_metrics);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to fetch portfolio risk");
    } finally {
      setLoading(false);
    }
  }, [holdings, setLiveData]);

  useEffect(() => {
    staleRef.current = false;
    fetchRisk();
    return () => { staleRef.current = true; };
  }, [fetchRisk]);

  const handleAdd = () => {
    if (!newSym.trim()) return;
    addHolding({ symbol: newSym.toUpperCase().trim(), quantity: parseFloat(newQty) || 1, avg_price: parseFloat(newAvg) || 0 });
    setAddModal(false); setNewSym(""); setNewQty("1"); setNewAvg("");
  };

  const loadFrontier = async () => {
    if (holdings.length < 2) return;
    setFrontierLoading(true);
    try {
      const res = await api.post("/efficient-frontier", { symbols: holdings.map((h) => h.symbol) });
      setFrontier(res.data.points || []);
    } catch {}
    setFrontierLoading(false);
  };

  const pieData = liveHoldings.map((h) => ({ name: h.symbol, value: h.current_value }));
  const todayPnl = liveHoldings.reduce((s, h) => s + h.pnl, 0);

  return (
    <div>
      <TopBar title="Portfolio" />
      <div className="p-6 space-y-6">

        {/* Summary strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KPICard title="Total Value" value={formatINR(totalValue)} rawValue={totalValue} glowColor="blue"
            trend={totalValue > 0 ? "up" : "neutral"} />
          <KPICard title="Today's P&L" value={formatINR(todayPnl)} rawValue={Math.abs(todayPnl)}
            trend={todayPnl >= 0 ? "up" : "down"} trendValue={liveHoldings.length ? formatPct(todayPnl / (totalValue || 1) * 100) : undefined}
            glowColor={todayPnl >= 0 ? "green" : "red"} />
          <KPICard title="Holdings" value={`${holdings.length}`} subtitle="positions" />
          {riskMetrics && (
            <KPICard title="Risk Level" value={riskMetrics.risk_level.replace(/[🟢🟡🔴⚪]/g, "").trim()}
              subtitle={`Sharpe: ${riskMetrics.sharpe_ratio.toFixed(2)}`}
              glowColor={/low/i.test(riskMetrics.risk_level) ? "green" : /medium/i.test(riskMetrics.risk_level) ? "amber" : "red"} />
          )}
        </div>

        {error && (
          <div className="border border-red-500/30 bg-red-500/5 rounded-xl p-4 flex items-center justify-between">
            <span className="text-sm text-red-400">{error}</span>
            <Button variant="danger" size="sm" onClick={fetchRisk}><RefreshCw size={12} /> Retry</Button>
          </div>
        )}

        {/* Holdings table */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-slate-300">Holdings</h2>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={fetchRisk} loading={loading}><RefreshCw size={12} /> Refresh</Button>
              <Button size="sm" onClick={() => setAddModal(true)}><Plus size={12} /> Add Holding</Button>
            </div>
          </div>
          {loading ? <LoadingSkeleton rows={4} /> : (
            <PortfolioTable holdings={liveHoldings} onRemove={removeHolding} />
          )}
        </div>

        {/* Pie + MPT */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {pieData.length > 0
            ? <PieChart data={pieData} title="Portfolio Allocation" />
            : <div className="glass p-5 flex items-center justify-center text-slate-600 text-sm">Add holdings to see allocation</div>
          }
          <MPTOptimizer symbols={holdings.map((h) => h.symbol)} />
        </div>

        {/* Risk metrics */}
        {riskMetrics && <RiskMetrics metrics={riskMetrics} />}

        {/* Efficient Frontier */}
        {holdings.length >= 2 && (
          <div className="glass p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-slate-300">Efficient Frontier</h3>
              <Button size="sm" variant="secondary" onClick={loadFrontier} loading={frontierLoading}>Generate Frontier</Button>
            </div>
            {frontier.length > 0
              ? <ScatterChart data={frontier} />
              : <div className="text-center py-8 text-slate-600 text-sm">Click "Generate Frontier" to visualize 500 portfolio simulations</div>
            }
          </div>
        )}
      </div>

      <Modal open={addModal} onClose={() => setAddModal(false)} title="Add Holding">
        <div className="space-y-3">
          <Input value={newSym} onChange={setNewSym} placeholder="Symbol (e.g. TCS.NS)" />
          <Input value={newQty} onChange={setNewQty} placeholder="Quantity" type="number" />
          <Input value={newAvg} onChange={setNewAvg} placeholder="Avg buy price (₹)" type="number" />
          <Button onClick={handleAdd} className="w-full justify-center">Add</Button>
        </div>
      </Modal>
    </div>
  );
}
