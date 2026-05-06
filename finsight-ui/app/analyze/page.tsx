"use client";
import { useState, useEffect, useRef, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { TopBar } from "@/components/layout/TopBar";
import { AIAnalysisPanel } from "@/components/features/AIAnalysisPanel";
import { KPICard } from "@/components/cards/KPICard";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { LoadingSkeleton } from "@/components/ui/LoadingSkeleton";
import { usePortfolioStore } from "@/store/portfolioStore";
import { SharpResult } from "@/types";
import { formatINR, formatPct, pctColor } from "@/lib/formatters";
import api from "@/lib/api";
import { Search, Plus, Star, TrendingUp, TrendingDown } from "lucide-react";
import clsx from "clsx";

const NSE_SYMBOLS = [
  "RELIANCE.NS","TCS.NS","INFY.NS","HDFCBANK.NS","ICICIBANK.NS",
  "WIPRO.NS","AXISBANK.NS","SBIN.NS","BAJFINANCE.NS","MARUTI.NS",
  "TATAMOTORS.NS","SUNPHARMA.NS","ONGC.NS","NTPC.NS","POWERGRID.NS",
  "ULTRACEMCO.NS","TITAN.NS","NESTLEIND.NS","TECHM.NS","HCLTECH.NS",
];

const STEPS = [
  "Extracting symbol…",
  "Fetching live price…",
  "Analyzing news sentiment…",
  "Calculating risk metrics…",
  "Generating AI decision…",
];

function AnalysisProgress({ step }: { step: number }) {
  return (
    <div className="glass p-6 space-y-4">
      <h3 className="text-sm font-semibold text-slate-300">Running LangGraph Pipeline</h3>
      {STEPS.map((label, i) => (
        <div key={i} className="flex items-center gap-3">
          <div className={clsx("w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-all duration-500",
            i < step ? "bg-emerald-500 text-white" :
            i === step ? "bg-blue-500 text-white animate-pulse" :
            "bg-slate-800 text-slate-600"
          )}>
            {i < step ? "✓" : i + 1}
          </div>
          <span className={clsx("text-sm transition-colors duration-300",
            i < step ? "text-emerald-400" : i === step ? "text-blue-400" : "text-slate-600"
          )}>{label}</span>
        </div>
      ))}
    </div>
  );
}

function AnalyzeContent() {
  const searchParams = useSearchParams();
  const { addHolding } = usePortfolioStore();
  const [query, setQuery] = useState(searchParams.get("symbol") || "");
  const [dropdown, setDropdown] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(0);
  const [analysis, setAnalysis] = useState("");
  const [symbol, setSymbol] = useState("");
  const [sharpData, setSharpData] = useState<SharpResult | null>(null);
  const [price, setPrice] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [qty, setQty] = useState("1");
  const [avgPrice, setAvgPrice] = useState("");
  const [addedMsg, setAddedMsg] = useState("");
  const stepRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const staleRef = useRef(false);

  useEffect(() => {
    const sym = searchParams.get("symbol");
    if (sym) { setQuery(sym); }
  }, [searchParams]);

  const handleInput = (v: string) => {
    setQuery(v);
    setDropdown(v.length > 0 ? NSE_SYMBOLS.filter((s) => s.toLowerCase().includes(v.toLowerCase())).slice(0, 6) : []);
  };

  const analyze = useCallback(async (sym?: string) => {
    const target = (sym || query).trim().toUpperCase();
    if (!target) return;
    setLoading(true); setStep(0); setError(""); setAnalysis(""); setSharpData(null); setDropdown([]);
    staleRef.current = false;

    stepRef.current = setInterval(() => {
      setStep((s) => Math.min(s + 1, STEPS.length - 1));
    }, 4000);

    try {
      const [analysisRes, sharpeRes, priceRes] = await Promise.allSettled([
        api.post("/analyze-stock", { symbol: target, query: `Full analysis of ${target}` }),
        api.get(`/sharpe/${target}`),
        api.get(`/stock-price/${target}`),
      ]);
      if (staleRef.current) return;
      if (analysisRes.status === "fulfilled") {
        setAnalysis(analysisRes.value.data.analysis || "");
        setSymbol(target);
      } else {
        setError("Analysis failed. Check the symbol and try again.");
      }
      if (sharpeRes.status === "fulfilled") setSharpData(sharpeRes.value.data);
      if (priceRes.status === "fulfilled") setPrice(priceRes.value.data.price);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      if (stepRef.current) clearInterval(stepRef.current);
      setStep(STEPS.length);
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    const sym = searchParams.get("symbol");
    if (sym) analyze(sym);
    return () => { staleRef.current = true; if (stepRef.current) clearInterval(stepRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addToPortfolio = () => {
    if (!symbol) return;
    addHolding({ symbol, quantity: parseFloat(qty) || 1, avg_price: parseFloat(avgPrice) || price || 0 });
    setAddedMsg(`${symbol} added to portfolio!`);
    setTimeout(() => setAddedMsg(""), 3000);
  };

  const addToWatchlist = async () => {
    if (!symbol) return;
    try { await api.post("/watchlist/add", { symbol }); } catch {}
  };

  return (
    <div>
      <TopBar title="Stock Analysis" />
      <div className="p-6 space-y-6">
        {/* Search bar */}
        <div className="relative">
          <div className="flex gap-3">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                value={query}
                onChange={(e) => handleInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && analyze()}
                placeholder="Search NSE/BSE symbol e.g. RELIANCE.NS, TCS.NS"
                suppressHydrationWarning
                className="w-full bg-slate-900/60 border border-slate-700 rounded-xl pl-10 pr-4 py-3 text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-blue-500/60 text-sm"
              />
              {dropdown.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-slate-900 border border-slate-700 rounded-xl overflow-hidden z-20 shadow-xl">
                  {dropdown.map((s) => (
                    <button key={s} onClick={() => { setQuery(s); setDropdown([]); analyze(s); }}
                      className="w-full text-left px-4 py-2.5 text-sm text-slate-300 hover:bg-slate-800 mono transition-colors">
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <Button onClick={() => analyze()} loading={loading} size="lg">Analyze</Button>
          </div>
        </div>

        {error && (
          <div className="border border-red-500/30 bg-red-500/5 rounded-xl p-4 flex items-center justify-between">
            <span className="text-sm text-red-400">{error}</span>
            <Button variant="danger" size="sm" onClick={() => analyze()}>Retry</Button>
          </div>
        )}

        {loading && <AnalysisProgress step={step} />}

        {analysis && !loading && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Left — Analysis + price chart placeholder */}
            <div className="md:col-span-2 space-y-4">
              <AIAnalysisPanel analysis={analysis} symbol={symbol} />
              {price && (
                <div className="glass p-4 flex items-center gap-4">
                  <TrendingUp size={20} className="text-blue-400" />
                  <div>
                    <div className="text-xs text-slate-500">Current Price</div>
                    <div className="mono text-xl font-semibold text-slate-100">{formatINR(price)}</div>
                  </div>
                </div>
              )}
            </div>

            {/* Right — Stock card + actions */}
            <div className="space-y-4">
              {sharpData && (
                <div className="glass p-5 space-y-3">
                  <h3 className="text-sm font-semibold text-slate-300">{symbol}</h3>
                  {[
                    { label: "Sharpe Ratio", value: sharpData.sharpe_ratio.toFixed(2),
                      badge: sharpData.sharpe_ratio > 1 ? "success" : sharpData.sharpe_ratio > 0.5 ? "warning" : "danger" as "success"|"warning"|"danger" },
                    { label: "Annual Return", value: formatPct(sharpData.annual_return_pct) },
                    { label: "Volatility", value: formatPct(sharpData.annual_volatility_pct) },
                  ].map(({ label, value, badge }) => (
                    <div key={label} className="flex justify-between items-center">
                      <span className="text-xs text-slate-500">{label}</span>
                      {badge ? <Badge label={value} variant={badge} /> : (
                        <span className={clsx("mono text-sm font-medium", pctColor(parseFloat(value)))}>{value}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <div className="glass p-5 space-y-3">
                <h3 className="text-sm font-semibold text-slate-300">Add to Portfolio</h3>
                <input value={qty} onChange={(e) => setQty(e.target.value)} placeholder="Quantity"
                  suppressHydrationWarning
                  className="w-full bg-slate-900/60 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-blue-500/60" />
                <input value={avgPrice} onChange={(e) => setAvgPrice(e.target.value)} placeholder={`Avg price (₹${price ? price.toFixed(0) : ""})`}
                  suppressHydrationWarning
                  className="w-full bg-slate-900/60 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-blue-500/60" />
                <Button onClick={addToPortfolio} className="w-full justify-center" variant="secondary">
                  <Plus size={14} /> Add to Portfolio
                </Button>
                <Button onClick={addToWatchlist} className="w-full justify-center" variant="ghost">
                  <Star size={14} /> Add to Watchlist
                </Button>
                {addedMsg && <p className="text-xs text-emerald-400">{addedMsg}</p>}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function AnalyzePage() {
  return (
    <Suspense fallback={<div className="p-6"><LoadingSkeleton rows={5} /></div>}>
      <AnalyzeContent />
    </Suspense>
  );
}
