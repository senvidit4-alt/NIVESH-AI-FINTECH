"use client";
import { useEffect, useState, useRef, useCallback } from "react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from "recharts";
import { TopBar } from "@/components/layout/TopBar";
import { IndexCard } from "@/components/cards/IndexCard";
import { KPICard } from "@/components/cards/KPICard";
import { LoadingSkeleton, CardSkeleton } from "@/components/ui/LoadingSkeleton";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useMarketStore } from "@/store/marketStore";
import { usePortfolioStore } from "@/store/portfolioStore";
import { MarketIndex } from "@/types";
import { formatINR, formatPct } from "@/lib/formatters";
import api from "@/lib/api";
import Link from "next/link";
import { RefreshCw, TrendingUp } from "lucide-react";

// ── Circular gauge ────────────────────────────────────────────
function CircularGauge({ value, max = 10, label }: { value: number; max?: number; label: string }) {
  const r = 36;
  const circ = 2 * Math.PI * r;
  const dash = Math.min(value / max, 1) * circ;
  return (
    <div className="flex flex-col items-center gap-2">
      <svg width="90" height="90" viewBox="0 0 90 90">
        <circle cx="45" cy="45" r={r} fill="none" stroke="rgba(30,58,95,0.4)" strokeWidth="8" />
        <circle cx="45" cy="45" r={r} fill="none" stroke="#3b82f6" strokeWidth="8"
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
          transform="rotate(-90 45 45)" />
        <text x="45" y="49" textAnchor="middle" fill="#f1f5f9" fontSize="14"
          fontFamily="JetBrains Mono, monospace" fontWeight="600">{value}%</text>
      </svg>
      <span className="text-xs text-slate-500">{label}</span>
    </div>
  );
}

// ── Market Pulse (SSE live chart) ─────────────────────────────
interface PriceTick { time: string; close: number; volume?: number; }

function MarketPulse({ symbol = "^NSEI" }: { symbol?: string }) {
  const [ticks, setTicks] = useState<PriceTick[]>([]);
  const [latest, setLatest] = useState<number | null>(null);
  const [change, setChange] = useState(0);
  const [changePct, setChangePct] = useState(0);
  const [isLive, setIsLive] = useState(false);
  const [lastUpdate, setLastUpdate] = useState("");
  const esRef = useRef<EventSource | null>(null);
  const basePrice = useRef<number | null>(null);

  const loadHistory = useCallback(async () => {
    try {
      const res = await api.get(`/market-pulse/${encodeURIComponent(symbol)}`);
      const candles: PriceTick[] = res.data.candles;
      setTicks(candles);
      if (candles.length > 0) {
        const last = candles[candles.length - 1].close;
        setLatest(last);
        basePrice.current = candles[0].close;
        const chg = last - candles[0].close;
        setChange(chg);
        setChangePct((chg / candles[0].close) * 100);
      }
    } catch {}
  }, [symbol]);

  const connectSSE = useCallback(() => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    const es = new EventSource(`${apiUrl}/live-price/${encodeURIComponent(symbol)}`);
    esRef.current = es;
    es.onopen = () => setIsLive(true);
    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.error) return;
        setTicks((prev) => [...prev.slice(-59), { time: data.timestamp, close: data.price, volume: data.volume }]);
        setLatest(data.price);
        setLastUpdate(data.timestamp);
        if (basePrice.current) {
          const chg = data.price - basePrice.current;
          setChange(chg);
          setChangePct((chg / basePrice.current) * 100);
        }
      } catch {}
    };
    es.onerror = () => {
      setIsLive(false);
      es.close();
      setTimeout(connectSSE, 5000);
    };
  }, [symbol]);

  useEffect(() => {
    loadHistory();
    connectSSE();
    return () => esRef.current?.close();
  }, [loadHistory, connectSSE]);

  const isPositive = change >= 0;
  const lineColor = isPositive ? "#10b981" : "#ef4444";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div style={{ background: "#0d1117", border: "1px solid #1e3a5f", borderRadius: 8, padding: "8px 12px", fontSize: 12 }}>
        <p style={{ color: "#64748b", margin: 0 }}>{payload[0]?.payload?.time}</p>
        <p style={{ color: lineColor, margin: 0, fontWeight: 600, fontFamily: "JetBrains Mono, monospace" }}>
          ₹{Number(payload[0]?.value).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
        </p>
      </div>
    );
  };

  return (
    <div className="glass p-6" style={{ minHeight: 360 }}>
      <div className="flex justify-between items-start mb-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-slate-200">Market Pulse — NIFTY 50</h3>
            <span className="flex items-center gap-1">
              <span className={`w-2 h-2 rounded-full ${isLive ? "bg-emerald-400 animate-pulse" : "bg-amber-400"}`} />
              <span className={`text-xs mono ${isLive ? "text-emerald-400" : "text-amber-400"}`}>
                {isLive ? "LIVE" : "RECONNECTING"}
              </span>
            </span>
          </div>
          {latest && (
            <div className="flex items-baseline gap-3 mt-1">
              <span className="text-2xl font-bold mono text-slate-100">
                ₹{latest.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </span>
              <span className={`text-sm mono font-medium ${isPositive ? "text-emerald-400" : "text-red-400"}`}>
                {isPositive ? "▲" : "▼"} {Math.abs(change).toFixed(2)} ({isPositive ? "+" : ""}{changePct.toFixed(2)}%)
              </span>
            </div>
          )}
        </div>
        <span className="text-xs text-slate-600 mono">{lastUpdate}</span>
      </div>

      <div style={{ width: "100%", height: 240 }}>
        {ticks.length > 1 ? (
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={ticks} margin={{ top: 5, right: 5, left: 10, bottom: 5 }}>
              <defs>
                <linearGradient id="priceGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={lineColor} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={lineColor} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(30,58,95,0.3)" />
              <XAxis dataKey="time" tick={{ fill: "#475569", fontSize: 10 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
              <YAxis tick={{ fill: "#475569", fontSize: 10 }} tickLine={false} axisLine={false}
                tickFormatter={(v) => v.toLocaleString("en-IN")} domain={["auto", "auto"]} width={70} />
              <Tooltip content={<CustomTooltip />} />
              {basePrice.current && (
                <ReferenceLine y={basePrice.current} stroke="#334155" strokeDasharray="4 4"
                  label={{ value: "Open", fill: "#475569", fontSize: 10 }} />
              )}
              <Area type="monotone" dataKey="close" stroke={lineColor} strokeWidth={2}
                fill="url(#priceGrad)" dot={false}
                activeDot={{ r: 4, fill: lineColor, stroke: "#0d1117", strokeWidth: 2 }}
                isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <LoadingSkeleton rows={4} />
        )}
      </div>
    </div>
  );
}

// ── Dashboard Page ────────────────────────────────────────────
export default function DashboardPage() {
  const { indices, setIndices } = useMarketStore();
  const { holdings, totalValue } = usePortfolioStore();
  const [loadingMarket, setLoadingMarket] = useState(true);
  const [marketError, setMarketError] = useState("");
  const [econ, setEcon] = useState<Record<string, unknown> | null>(null);
  const [topStocks, setTopStocks] = useState<{ symbol: string; price: number }[]>([]);
  const [quickSymbol, setQuickSymbol] = useState("");
  const [quickResult, setQuickResult] = useState("");
  const [quickLoading, setQuickLoading] = useState(false);
  const staleRef = useRef(false);

  const fetchMarket = useCallback(async () => {
    if (staleRef.current) return;
    try {
      const res = await api.get("/market-summary");
      setIndices(res.data.indices || []);
      setMarketError("");
    } catch (e: unknown) {
      setMarketError(e instanceof Error ? e.message : "Failed to fetch market data");
    } finally {
      setLoadingMarket(false);
    }
  }, [setIndices]);

  const fetchEcon = useCallback(async () => {
    try {
      const res = await api.get("/economic-indicators");
      setEcon(res.data);
    } catch {}
  }, []);

  const fetchTopStocks = useCallback(async () => {
    try {
      const symbols = ["RELIANCE.NS", "TCS.NS", "INFY.NS", "HDFCBANK.NS", "ICICIBANK.NS"];
      const res = await api.post("/prices-bulk", symbols);
      setTopStocks(res.data.prices || []);
    } catch {}
  }, []);

  useEffect(() => {
    staleRef.current = false;
    fetchMarket(); fetchEcon(); fetchTopStocks();
    const id1 = setInterval(fetchMarket, 10000);
    const id2 = setInterval(fetchTopStocks, 30000);
    return () => { staleRef.current = true; clearInterval(id1); clearInterval(id2); };
  }, [fetchMarket, fetchEcon, fetchTopStocks]);

  const quickAnalyze = async () => {
    if (!quickSymbol.trim()) return;
    setQuickLoading(true); setQuickResult("");
    try {
      const res = await api.post("/analyze-stock", { symbol: quickSymbol.toUpperCase(), query: `Brief analysis of ${quickSymbol}` });
      const text: string = res.data.analysis || "";
      setQuickResult(text.slice(0, 300) + (text.length > 300 ? "…" : ""));
    } catch { setQuickResult("Analysis failed. Check symbol."); }
    setQuickLoading(false);
  };

  const sentiment = indices.length
    ? (indices.filter((i: MarketIndex) => i.direction === "up").length >= indices.length / 2 ? "BULLISH 📈" : "BEARISH 📉")
    : null;

  const repoRate = econ ? (econ.repo_rate as number ?? 6.5) : null;
  const cpi = econ ? (econ.cpi_inflation as number ?? null) : null;

  return (
    <div>
      <TopBar title="Dashboard" />
      <div className="p-6 space-y-6">

        {/* Row 1 — Market Indices */}
        {marketError ? (
          <div className="border border-red-500/30 bg-red-500/5 rounded-xl p-4 flex items-center justify-between">
            <span className="text-sm text-red-400">{marketError}</span>
            <Button variant="danger" size="sm" onClick={fetchMarket}><RefreshCw size={12} /> Retry</Button>
          </div>
        ) : loadingMarket ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[0,1,2,3].map((i) => <CardSkeleton key={i} />)}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {indices.map((idx: MarketIndex) => <IndexCard key={idx.symbol} index={idx} />)}
          </div>
        )}

        {/* Row 2 — Market Pulse + Economic Snapshot */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-2" style={{ minHeight: 380 }}>
            <MarketPulse symbol="^NSEI" />
          </div>
          <div className="glass p-5 space-y-5" style={{ minHeight: 360 }}>
            <h3 className="text-sm font-semibold text-slate-300">Economic Snapshot</h3>
            {econ ? (
              <>
                <div className="flex justify-around">
                  <CircularGauge value={repoRate ?? 6.5} label="RBI Repo Rate" />
                </div>
                {cpi !== null && (
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-slate-500">CPI Inflation</span>
                      <span className="mono text-slate-300">{cpi}%</span>
                    </div>
                    <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                      <div className="h-full bg-amber-500 rounded-full" style={{ width: `${Math.min((cpi / 10) * 100, 100)}%` }} />
                    </div>
                  </div>
                )}
                {sentiment && (
                  <div className="flex items-center justify-between pt-2 border-t border-slate-800">
                    <span className="text-xs text-slate-500">Market Sentiment</span>
                    <Badge label={sentiment} variant={sentiment.includes("BULL") ? "success" : "danger"} />
                  </div>
                )}
                <p className="text-xs text-slate-600">Source: {econ.source as string}</p>
              </>
            ) : <LoadingSkeleton rows={3} />}
          </div>
        </div>

        {/* Row 3 — Bottom strip */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Top NSE Stocks — live prices */}
          <div className="glass p-5">
            <h3 className="text-sm font-semibold text-slate-300 mb-4">Top NSE Stocks</h3>
            {topStocks.length > 0 ? (
              <div className="space-y-3">
                {topStocks.map((s) => (
                  <div key={s.symbol} className="flex items-center justify-between">
                    <span className="mono text-sm text-slate-300">{s.symbol.replace(".NS", "")}</span>
                    <span className="mono text-sm text-slate-200">
                      {s.price ? formatINR(s.price) : <span className="text-slate-600">—</span>}
                    </span>
                  </div>
                ))}
              </div>
            ) : <LoadingSkeleton rows={5} />}
          </div>

          {/* Quick Analysis */}
          <div className="glass p-5">
            <h3 className="text-sm font-semibold text-slate-300 mb-4">Quick Analysis</h3>
            <div className="flex gap-2 mb-3">
              <Input value={quickSymbol} onChange={setQuickSymbol}
                placeholder="e.g. TCS.NS"
                onKeyDown={(e) => e.key === "Enter" && quickAnalyze()} />
              <Button onClick={quickAnalyze} loading={quickLoading} size="sm">
                <TrendingUp size={14} />
              </Button>
            </div>
            {quickResult && <p className="text-xs text-slate-400 leading-relaxed">{quickResult}</p>}
          </div>

          {/* Portfolio Snapshot */}
          <div className="glass p-5">
            <h3 className="text-sm font-semibold text-slate-300 mb-4">Portfolio Snapshot</h3>
            {holdings.length > 0 ? (
              <div className="space-y-2">
                <KPICard title="Total Value" value={formatINR(totalValue)} rawValue={totalValue} glowColor="blue" />
                <p className="text-xs text-slate-500">{holdings.length} holdings tracked</p>
              </div>
            ) : (
              <div className="text-center py-4">
                <p className="text-sm text-slate-600 mb-3">No holdings yet</p>
                <Link href="/portfolio">
                  <Button variant="secondary" size="sm">Add Holdings</Button>
                </Link>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
