import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import ScrollVideo from "@/components/ScrollVideo";
import { videos } from "@/lib/videos";
import { getBulkPrices, type BulkPriceItem } from "@/lib/agent-api";
import { useWebSocket } from "@/hooks/useWebSocket";

const DEFAULT_SYMBOLS = [
  "RELIANCE.NS",
  "TCS.NS",
  "INFY.NS",
  "HDFCBANK.NS",
  "^NSEI",
  "BTC-USD",
];

const DISPLAY_NAMES: Record<string, string> = {
  "RELIANCE.NS": "RELIANCE",
  "TCS.NS": "TCS",
  "INFY.NS": "INFY",
  "HDFCBANK.NS": "HDFCBANK",
  "^NSEI": "NIFTY 50",
  "BTC-USD": "BTC/USD",
};

function LiveNumber({ value }: { value: number }) {
  const [v, setV] = useState(value);
  useEffect(() => {
    setV(value);
  }, [value]);
  useEffect(() => {
    const id = setInterval(() => {
      setV((prev) => prev * (1 + (Math.random() - 0.5) * 0.0015));
    }, 1200);
    return () => clearInterval(id);
  }, []);
  return <span className="tabular-nums">{v.toFixed(2)}</span>;
}

function SkeletonCard() {
  return (
    <div className="glass rounded-2xl p-4 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="h-3 w-16 rounded bg-muted/60" />
        <div className="h-3 w-10 rounded bg-muted/40" />
      </div>
      <div className="mt-2 h-8 w-24 rounded bg-muted/50" />
      <div className="mt-3 h-8 w-full rounded bg-muted/30" />
    </div>
  );
}

export default function MarketIntel() {
  const [tickers, setTickers] = useState<BulkPriceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const { prices, connected } = useWebSocket();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const data = await getBulkPrices(DEFAULT_SYMBOLS);
      if (!cancelled) {
        setTickers(data.prices);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Merge live WS price updates on top of the REST-fetched base values
  const mergedTickers = tickers.map((t) => {
    const live = prices[t.symbol];
    if (live) {
      return { ...t, price: live.price, change_pct: live.change_pct };
    }
    return t;
  });

  return (
    <section id="intel" className="relative">
      <ScrollVideo
        src={videos.aiGlobe}
        mode="scrub"
        scrubLength={2}
        className="h-screen w-full"
        overlayClassName="bg-gradient-to-b from-background/50 via-transparent to-background"
      />
      <div className="pointer-events-none absolute inset-0 z-10 flex items-center">
        <div className="mx-auto w-full max-w-7xl px-6">
          <div className="grid grid-cols-1 gap-10 md:grid-cols-2">
            <div>
              <p className="mb-3 text-xs uppercase tracking-[0.3em] text-primary">02 · Market Intelligence</p>
              <h2 className="text-4xl font-semibold tracking-tight md:text-6xl" style={{ letterSpacing: "-0.03em" }}>
                A live <span className="text-gradient">pulse</span> of every market.
              </h2>
              <p className="mt-5 max-w-md text-muted-foreground">
                Equities, indices, crypto, FX, and commodities — streamed and reasoned over by
                FinBERT-grade sentiment and statistical risk models.
              </p>
              {/* WebSocket connection indicator */}
              <div className="mt-4 flex items-center gap-2">
                <span
                  className={`inline-block h-2 w-2 rounded-full transition-colors duration-500 ${
                    connected ? "bg-accent animate-pulse" : "bg-muted-foreground/40"
                  }`}
                />
                <span className="text-[11px] text-muted-foreground">
                  {connected ? "Live stream active" : "Connecting…"}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 pointer-events-auto">
              {loading
                ? DEFAULT_SYMBOLS.map((s) => <SkeletonCard key={s} />)
                : mergedTickers.map((t, i) => {
                    const changePct = prices[t.symbol]?.change_pct ?? 0;
                    const displayName = DISPLAY_NAMES[t.symbol] ?? t.symbol;
                    const isPositive = changePct >= 0;

                    return (
                      <motion.div
                        key={t.symbol}
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true, margin: "-100px" }}
                        transition={{ duration: 0.5, delay: i * 0.06 }}
                        className="glass rounded-2xl p-4"
                      >
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>{displayName}</span>
                          <span className={isPositive ? "text-accent" : "text-destructive"}>
                            {isPositive ? "▲" : "▼"} {Math.abs(changePct).toFixed(2)}%
                          </span>
                        </div>
                        <div className="mt-2 text-2xl font-semibold text-foreground">
                          {t.price != null ? (
                            <LiveNumber value={t.price} />
                          ) : (
                            <span className="text-muted-foreground text-base">—</span>
                          )}
                        </div>
                        <div className="mt-3 h-8 w-full overflow-hidden rounded">
                          <svg viewBox="0 0 100 30" className="h-full w-full">
                            <polyline
                              fill="none"
                              stroke={isPositive ? "oklch(0.85 0.22 155)" : "oklch(0.65 0.24 27)"}
                              strokeWidth="1.5"
                              points={Array.from({ length: 20 })
                                .map((_, k) => `${k * 5},${15 + Math.sin(k + i) * 8 + Math.sin(k * 7) * 2}`)
                                .join(" ")}
                            />
                          </svg>
                        </div>
                      </motion.div>
                    );
                  })}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}