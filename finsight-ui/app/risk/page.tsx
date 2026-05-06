"use client";
import { useState, useCallback, useRef } from "react";
import { TopBar } from "@/components/layout/TopBar";
import { KPICard } from "@/components/cards/KPICard";
import { ScatterChart } from "@/components/charts/ScatterChart";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { LoadingSkeleton } from "@/components/ui/LoadingSkeleton";
import { SharpResult, EfficientFrontierPoint } from "@/types";
import { formatINR, formatPct, pctColor } from "@/lib/formatters";
import api from "@/lib/api";
import { Search, RefreshCw } from "lucide-react";
import clsx from "clsx";

interface ScanRow extends SharpResult { price?: number; }

function sharpeVariant(v: number): "success" | "warning" | "danger" {
  return v > 1 ? "success" : v > 0.5 ? "warning" : "danger";
}
function sharpeLabel(v: number) {
  return v > 1 ? "Good" : v > 0.5 ? "Average" : "Poor";
}

export default function RiskPage() {
  const [symbol, setSymbol] = useState("");
  const [sharpData, setSharpData] = useState<SharpResult | null>(null);
  const [sharpLoading, setSharpLoading] = useState(false);
  const [sharpError, setSharpError] = useState("");

  const [frontierSyms, setFrontierSyms] = useState("TCS.NS, INFY.NS, RELIANCE.NS");
  const [frontier, setFrontier] = useState<EfficientFrontierPoint[]>([]);
  const [frontierLoading, setFrontierLoading] = useState(false);
  const [frontierError, setFrontierError] = useState("");

  const [scanSyms, setScanSyms] = useState("");
  const [scanRows, setScanRows] = useState<ScanRow[]>([]);
  const [scanLoading, setScanLoading] = useState(false);
  const [scanSort, setScanSort] = useState<keyof ScanRow>("sharpe_ratio");

  const [varValue, setVarValue] = useState("1000000");
  const [varConf, setVarConf] = useState<95 | 99>(95);
  const [varPeriod, setVarPeriod] = useState<1 | 5>(1);

  const fetchSharpe = useCallback(async () => {
    if (!symbol.trim()) return;
    setSharpLoading(true); setSharpError("");
    try {
      const res = await api.get(`/sharpe/${symbol.trim().toUpperCase()}`);
      setSharpData(res.data);
    } catch (e: unknown) {
      setSharpError(e instanceof Error ? e.message : "Failed to fetch Sharpe data");
    } finally {
      setSharpLoading(false);
    }
  }, [symbol]);

  const generateFrontier = async () => {
    const syms = frontierSyms.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
    if (syms.length < 2) { setFrontierError("Need at least 2 symbols"); return; }
    setFrontierLoading(true); setFrontierError("");
    try {
      const res = await api.post("/efficient-frontier", { symbols: syms });
      setFrontier(res.data.points || []);
    } catch (e: unknown) {
      setFrontierError(e instanceof Error ? e.message : "Failed to generate frontier");
    } finally {
      setFrontierLoading(false);
    }
  };

  const runScan = async () => {
    const syms = scanSyms.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
    if (!syms.length) return;
    setScanLoading(true);
    try {
      const [priceRes, ...sharpeResults] = await Promise.allSettled([
        api.post("/prices-bulk", syms),
        ...syms.map((s) => api.get(`/sharpe/${s}`)),
      ]);
      const prices: Record<string, number> = {};
      if (priceRes.status === "fulfilled") {
        priceRes.value.data.prices?.forEach((p: { symbol: string; price: number }) => { prices[p.symbol] = p.price; });
      }
      const rows: ScanRow[] = sharpeResults.map((r, i) => {
        if (r.status === "fulfilled") return { ...r.value.data, price: prices[syms[i]] };
        return { symbol: syms[i], sharpe_ratio: 0, annual_return_pct: 0, annual_volatility_pct: 0, risk_free_rate_pct: 6.5, price: prices[syms[i]] };
      });
      setScanRows(rows);
    } catch {}
    setScanLoading(false);
  };

  // VaR calculation (client-side)
  const portfolioVal = parseFloat(varValue) || 0;
  const dailyVol = sharpData ? sharpData.annual_volatility_pct / 100 / Math.sqrt(252) : 0.01;
  const zScore = varConf === 95 ? 1.645 : 2.326;
  const varAmount = portfolioVal * dailyVol * zScore * Math.sqrt(varPeriod);

  const sortedScan = [...scanRows].sort((a, b) => {
    const av = a[scanSort] as number ?? 0;
    const bv = b[scanSort] as number ?? 0;
    return bv - av;
  });

  return (
    <div>
      <TopBar title="Risk Center" />
      <div className="p-6 space-y-6">

        {/* Symbol risk lookup */}
        <div className="glass p-5">
          <h2 className="text-sm font-semibold text-slate-300 mb-4">Single Stock Risk Analysis</h2>
          <div className="flex gap-3 mb-4">
            <div className="relative flex-1 max-w-sm">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input value={symbol} onChange={(e) => setSymbol(e.target.value)}
                suppressHydrationWarning
                onKeyDown={(e) => e.key === "Enter" && fetchSharpe()}
                placeholder="e.g. RELIANCE.NS"
                className="w-full bg-slate-900/60 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-blue-500/60" />
            </div>
            <Button onClick={fetchSharpe} loading={sharpLoading}>Analyze Risk</Button>
          </div>

          {sharpError && (
            <div className="border border-red-500/30 bg-red-500/5 rounded-xl p-3 flex items-center justify-between mb-4">
              <span className="text-sm text-red-400">{sharpError}</span>
              <Button variant="danger" size="sm" onClick={fetchSharpe}>Retry</Button>
            </div>
          )}

          {sharpLoading && <LoadingSkeleton rows={3} />}

          {sharpData && !sharpLoading && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="glass p-4 text-center">
                <div className="text-xs text-slate-500 mb-2">Sharpe Ratio</div>
                <div className={clsx("mono text-3xl font-bold mb-2",
                  sharpData.sharpe_ratio > 1 ? "text-emerald-400" : sharpData.sharpe_ratio > 0.5 ? "text-amber-400" : "text-red-400"
                )}>{sharpData.sharpe_ratio.toFixed(2)}</div>
                <Badge label={sharpeLabel(sharpData.sharpe_ratio)} variant={sharpeVariant(sharpData.sharpe_ratio)} />
              </div>
              <KPICard title="Annual Return" value={formatPct(sharpData.annual_return_pct)}
                trend={sharpData.annual_return_pct >= 0 ? "up" : "down"}
                glowColor={sharpData.annual_return_pct >= 0 ? "green" : "red"} />
              <div className="glass p-4">
                <div className="text-xs text-slate-500 mb-2">Volatility</div>
                <div className="mono text-2xl font-semibold text-slate-100 mb-1">{formatPct(sharpData.annual_volatility_pct)}</div>
                <Badge
                  label={sharpData.annual_volatility_pct < 20 ? "Low Risk" : sharpData.annual_volatility_pct < 40 ? "Medium Risk" : "High Risk"}
                  variant={sharpData.annual_volatility_pct < 20 ? "success" : sharpData.annual_volatility_pct < 40 ? "warning" : "danger"}
                />
              </div>
            </div>
          )}
        </div>

        {/* Efficient Frontier */}
        <div className="glass p-5">
          <h2 className="text-sm font-semibold text-slate-300 mb-4">Efficient Frontier</h2>
          <div className="flex gap-3 mb-4">
            <input value={frontierSyms} onChange={(e) => setFrontierSyms(e.target.value)}
              suppressHydrationWarning
              placeholder="Symbols comma-separated"
              className="flex-1 bg-slate-900/60 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-blue-500/60" />
            <Button onClick={generateFrontier} loading={frontierLoading}>Generate Frontier</Button>
          </div>
          {frontierError && <p className="text-sm text-red-400 mb-3">{frontierError}</p>}
          {frontier.length > 0
            ? <ScatterChart data={frontier} />
            : <div className="text-center py-8 text-slate-600 text-sm">Enter symbols and click Generate Frontier</div>
          }
        </div>

        {/* Bottom: Bulk Scanner + VaR */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Bulk Scanner */}
          <div className="glass p-5">
            <h2 className="text-sm font-semibold text-slate-300 mb-4">Bulk Risk Scanner</h2>
            <div className="flex gap-2 mb-4">
              <input value={scanSyms} onChange={(e) => setScanSyms(e.target.value)}
                suppressHydrationWarning
                placeholder="TCS.NS, INFY.NS, WIPRO.NS"
                className="flex-1 bg-slate-900/60 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-blue-500/60" />
              <Button onClick={runScan} loading={scanLoading} size="sm">Scan</Button>
            </div>
            {scanLoading && <LoadingSkeleton rows={3} />}
            {sortedScan.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-800">
                      {["Symbol","Price","Sharpe","Volatility","Return","Risk"].map((c) => (
                        <th key={c} className="px-2 py-2 text-left text-slate-500 font-medium">{c}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sortedScan.map((row) => (
                      <tr key={row.symbol} className="border-b border-slate-800/50 hover:bg-slate-800/20">
                        <td className="px-2 py-2 mono font-semibold text-slate-200">{row.symbol}</td>
                        <td className="px-2 py-2 mono text-slate-400">{row.price ? formatINR(row.price) : "—"}</td>
                        <td className={clsx("px-2 py-2 mono font-medium",
                          row.sharpe_ratio > 1 ? "text-emerald-400" : row.sharpe_ratio > 0.5 ? "text-amber-400" : "text-red-400"
                        )}>{row.sharpe_ratio.toFixed(2)}</td>
                        <td className="px-2 py-2 mono text-slate-400">{formatPct(row.annual_volatility_pct)}</td>
                        <td className={clsx("px-2 py-2 mono", pctColor(row.annual_return_pct))}>{formatPct(row.annual_return_pct)}</td>
                        <td className="px-2 py-2">
                          <Badge
                            label={row.annual_volatility_pct < 20 ? "Low" : row.annual_volatility_pct < 40 ? "Med" : "High"}
                            variant={row.annual_volatility_pct < 20 ? "success" : row.annual_volatility_pct < 40 ? "warning" : "danger"}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* VaR Calculator */}
          <div className="glass p-5 space-y-4">
            <h2 className="text-sm font-semibold text-slate-300">Portfolio VaR Calculator</h2>
            <div>
              <label className="text-xs text-slate-500 mb-1 block">Portfolio Value (₹)</label>
              <Input value={varValue} onChange={setVarValue} type="number" placeholder="e.g. 1000000" />
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-2 block">Confidence Level</label>
              <div className="flex gap-2">
                {([95, 99] as const).map((c) => (
                  <button key={c} onClick={() => setVarConf(c)}
                    className={clsx("flex-1 py-1.5 rounded-lg text-xs font-medium transition-all",
                      varConf === c ? "bg-blue-600 text-white" : "bg-slate-800 text-slate-400"
                    )}>{c}%</button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-2 block">Holding Period</label>
              <div className="flex gap-2">
                {([1, 5] as const).map((p) => (
                  <button key={p} onClick={() => setVarPeriod(p)}
                    className={clsx("flex-1 py-1.5 rounded-lg text-xs font-medium transition-all",
                      varPeriod === p ? "bg-blue-600 text-white" : "bg-slate-800 text-slate-400"
                    )}>{p === 1 ? "1 Day" : "1 Week"}</button>
                ))}
              </div>
            </div>
            {portfolioVal > 0 && (
              <div className="bg-slate-900/60 border border-slate-700 rounded-xl p-4">
                <p className="text-xs text-slate-500 mb-2">At {varConf}% confidence, your</p>
                <p className="mono text-lg font-semibold text-slate-100">{formatINR(portfolioVal)}</p>
                <p className="text-xs text-slate-500 my-1">portfolio could lose up to</p>
                <p className="mono text-2xl font-bold text-red-400">{formatINR(varAmount)}</p>
                <p className="text-xs text-slate-500 mt-1">in {varPeriod === 1 ? "1 day" : "1 week"}</p>
                <p className="text-xs text-slate-600 mt-3">
                  {sharpData ? `Based on ${sharpData.symbol} volatility (${sharpData.annual_volatility_pct.toFixed(1)}% p.a.)` : "Using default 15% annual volatility estimate"}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
