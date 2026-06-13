import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Loader2 } from "lucide-react";
import { AgentPipeline } from "@/components/sections/AgentIntel";
import { streamChat, testConnection } from "@/lib/agent-api";
import { MarkdownRenderer } from "@/components/ui/MarkdownRenderer";

type Msg = { role: "user" | "agent"; text: string };

const NODE_SEQUENCE = ["research", "data", "sentiment", "risk", "decision"];

const FINANCE_SITES = [
  "moneycontrol.com",
  "nseindia.com", 
  "economictimes.com",
  "screener.in",
  "tickertape.in",
  "tradingview.com",
  "bseindia.com",
  "zerodha.com",
  "investing.com",
  "livemint.com",
  "businessstandard.com",
  "reuters.com/markets",
  "bloomberg.com/india"
];

const getSitesForQuery = (query: string, phaseNum: number): string[] => {
  const lower = query.toLowerCase();
  
  const hasStockName = /\b[A-Za-z]{2,10}\b/.test(query) && 
    !["nifty", "sensex", "market", "index", "mutual", "fund", "sip", "mf", "nav", "crypto", "bitcoin", "eth"].some(w => lower.includes(w));

  let pool: string[] = [];

  if (hasStockName && ["result", "earning", "quarterly", "profit", "revenue"].some(w => lower.includes(w))) {
    pool = ["screener.in", "tickertape.in", "moneycontrol.com"];
  } else if (["nifty", "sensex", "market", "index"].some(w => lower.includes(w))) {
    pool = ["nseindia.com", "bseindia.com", "economictimes.com"];
  } else if (["mutual fund", "sip", "mf", "fund", "nav"].some(w => lower.includes(w))) {
    pool = ["valueresearchonline.com", "groww.in", "moneycontrol.com"];
  } else if (["crypto", "bitcoin", "eth", "solana", "doge"].some(w => lower.includes(w))) {
    pool = ["coinmarketcap.com", "coingecko.com", "tradingview.com"];
  } else {
    pool = ["moneycontrol.com", "economictimes.com", "livemint.com", "nseindia.com", "tickertape.in"];
  }

  if (phaseNum === 1) {
    return pool.slice(0, 3);
  } else {
    return pool.length > 3 ? pool.slice(3, 6) : [...pool].reverse().slice(0, 3);
  }
};

export default function Chat() {
  const [msgs, setMsgs] = useState<Msg[]>([
    { role: "agent", text: "Hi — I'm Nivesh. Ask me to analyze any stock, index, or portfolio." },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [activeNode, setActiveNode] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState<boolean | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const hasReceivedNodeInfo = useRef(false);
  const [lastResponseTime, setLastResponseTime] = useState<number>(6000);
  const startTimeRef = useRef<number>(0);

  const [searchState, setSearchState] = useState<{
    phase: 'idle' | 'searching' | 'reading' | 'thinking';
    sites: string[];
  }>({ phase: 'idle', sites: [] });

  const phase1TimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const phase2TimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Check connection status on mount
    testConnection().then((connected) => {
      setIsConnected(connected);
      if (!connected) {
        setMsgs((m) => [
          ...m,
          { role: "agent", text: "Backend offline — start FastAPI server to get real analysis" }
        ]);
      }
    });
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs, loading]);

  useEffect(() => {
    if (!loading) {
      return;
    }

    const startTime = startTimeRef.current || performance.now();

    const id = setInterval(() => {
      if (hasReceivedNodeInfo.current) return;

      const elapsed = performance.now() - startTime;
      const pct = Math.min((elapsed / lastResponseTime) * 100, 99);

      let node = "research";
      if (pct >= 85) node = "decision";
      else if (pct >= 65) node = "risk";
      else if (pct >= 40) node = "sentiment";
      else if (pct >= 15) node = "data";

      setActiveNode(node);
    }, 50);

    return () => clearInterval(id);
  }, [loading, lastResponseTime]);

  const send = async () => {
    const q = input.trim();
    if (!q || loading) return;
    setMsgs((m) => [...m, { role: "user", text: q }]);
    setInput("");
    
    // Reset state for new request
    hasReceivedNodeInfo.current = false;
    setActiveNode("research");
    startTimeRef.current = performance.now();
    setLoading(true);

    // Clear any previous search timeouts
    if (phase1TimeoutRef.current) clearTimeout(phase1TimeoutRef.current);
    if (phase2TimeoutRef.current) clearTimeout(phase2TimeoutRef.current);

    // Initialize search animation phases
    setSearchState({ phase: 'searching', sites: getSitesForQuery(q, 1) });

    phase1TimeoutRef.current = setTimeout(() => {
      setSearchState(s => s.phase !== 'idle' ? { phase: 'reading', sites: getSitesForQuery(q, 2) } : s);
    }, 1000);

    phase2TimeoutRef.current = setTimeout(() => {
      setSearchState(s => s.phase !== 'idle' ? { phase: 'thinking', sites: [] } : s);
    }, 2000);

    const clearTimeouts = () => {
      if (phase1TimeoutRef.current) clearTimeout(phase1TimeoutRef.current);
      if (phase2TimeoutRef.current) clearTimeout(phase2TimeoutRef.current);
    };

    // Build conversation history from existing messages (excluding the initial greeting)
    const history = msgs
      .filter((m) => m.text !== "Hi — I'm Nivesh. Ask me to analyze any stock, index, or portfolio." && m.text !== "Backend offline — start FastAPI server to get real analysis")
      .map((m) => ({
        role: m.role === "agent" ? "assistant" : "user",
        content: m.text,
      }));

    // Start with an empty streaming message slot
    let streamedText = "";
    setMsgs((m) => [...m, { role: "agent", text: "" }]);

    await streamChat(
      q,
      history,
      (token) => {
        // Clear timeouts and stop search UI on first token
        clearTimeouts();
        setSearchState({ phase: 'idle', sites: [] });

        // Append each SSE token to the last agent message
        streamedText += token;
        setMsgs((m) => {
          const updated = [...m];
          updated[updated.length - 1] = { role: "agent", text: streamedText };
          return updated;
        });
      },
      (fullText) => {
        clearTimeouts();
        setSearchState({ phase: 'idle', sites: [] });

        const endTime = performance.now();
        const duration = endTime - startTimeRef.current;

        // Finalise with the complete text
        setMsgs((m) => {
          const updated = [...m];
          updated[updated.length - 1] = { role: "agent", text: fullText || streamedText || "(empty response)" };
          return updated;
        });
        setLoading(false);

        setActiveNode("decision");
        if (duration >= 1500) {
          setLastResponseTime(duration);
        }

        // If an error occurred, check if the backend has gone offline
        const isError = !fullText || fullText.startsWith("Error:") || fullText === "Stream error" || fullText.toLowerCase().includes("failed to fetch");
        if (isError) {
          testConnection().then((connected) => {
            setIsConnected(connected);
            if (!connected) {
              setMsgs((m) => [
                ...m,
                { role: "agent", text: "Backend offline — start FastAPI server to get real analysis" }
              ]);
            }
          });
        }
      },
      (nodeName) => {
        hasReceivedNodeInfo.current = true;
        // Map backend node "data_fetch" to frontend node "data"
        const mappedNode = nodeName === "data_fetch" ? "data" : nodeName;
        setActiveNode(mappedNode);
      }
    );
  };

  return (
    <section id="chat" className="relative py-32">
      <div className="mx-auto max-w-6xl px-6">
        <p className="mb-3 text-xs uppercase tracking-[0.3em] text-primary">05 · Live AI Chat</p>
        <h2 className="text-4xl font-semibold tracking-tight md:text-6xl" style={{ letterSpacing: "-0.03em" }}>
          Talk to the <span className="text-gradient">agent</span>.
        </h2>
        <p className="mt-4 max-w-2xl text-muted-foreground">
          Every prompt flows through the LangGraph pipeline. Watch nodes glow as reasoning happens.
        </p>

        <div className="mt-10 grid grid-cols-1 gap-6 lg:grid-cols-5">
          <div className="glass rounded-3xl p-2 lg:col-span-3">
            <div ref={scrollRef} className="h-[480px] space-y-3 overflow-y-auto p-4">
              <AnimatePresence initial={false}>
                {msgs.map((m, i) => (
                  <motion.div
                     key={i}
                     initial={{ opacity: 0, y: 8 }}
                     animate={{ opacity: 1, y: 0 }}
                     className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                        m.role === "user"
                          ? "bg-primary text-primary-foreground"
                          : "glass text-foreground"
                      }`}
                    >
                      {m.role === "user" ? (
                        // User messages: plain text, no markdown
                        <span className="whitespace-pre-wrap">{m.text}</span>
                      ) : m.text ? (
                        // Agent messages: full markdown rendering (tables, bold, lists, code)
                        <MarkdownRenderer content={m.text} />
                      ) : (
                        // Empty agent slot — show search animation or spinner
                        i === msgs.length - 1 && searchState.phase !== "idle" ? (
                          <div className="space-y-2.5 min-w-[200px] py-0.5">
                            <div className="flex items-center gap-2 font-semibold text-foreground text-xs">
                              <span className="animate-pulse">🔍</span>
                              <span>
                                {searchState.phase === 'searching' && "Searching the web..."}
                                {searchState.phase === 'reading' && "Reading results..."}
                                {searchState.phase === 'thinking' && "Analyzing with FinBERT..."}
                              </span>
                            </div>

                            {searchState.sites.length > 0 && (
                              <div className="space-y-1.5 pt-1">
                                {searchState.sites.map((site, index) => (
                                  <motion.div
                                    key={site}
                                    initial={{ opacity: 0, x: -5 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: index * 0.3, duration: 0.3 }}
                                    className="flex items-center justify-between gap-6 text-[11px]"
                                  >
                                    <div className="flex items-center gap-1.5 text-muted-foreground animate-pulse">
                                      <span className="text-[10px] text-primary/70 font-mono">↳</span>
                                      <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                                      <span className="font-mono tracking-tight font-medium text-foreground/90">{site}</span>
                                    </div>
                                    <div className="w-16 h-1 bg-muted/40 rounded-full overflow-hidden relative border border-white/5">
                                      <motion.div
                                        initial={{ width: 0 }}
                                        animate={{ width: "100%" }}
                                        transition={{
                                          duration: 1.0,
                                          ease: "easeInOut",
                                          repeat: Infinity,
                                          repeatType: "loop"
                                        }}
                                        className="h-full bg-gradient-to-r from-primary to-cyan-400 rounded-full"
                                      />
                                    </div>
                                  </motion.div>
                                ))}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="flex items-center gap-2 text-muted-foreground">
                            <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                            <span>Reasoning · {activeNode || "initializing..."}</span>
                          </span>
                        )
                      )}
                    </div>
                  </motion.div>
                ))}
                {loading && msgs[msgs.length - 1]?.role !== "agent" && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-start">
                    <div className="glass flex items-center gap-2 rounded-2xl px-4 py-3 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                      Reasoning · {activeNode}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <div className="flex items-center gap-2 border-t border-border/40 p-3">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && send()}
                placeholder="Analyze Reliance Industries…"
                className="flex-1 bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground"
              />
              <button
                onClick={send}
                disabled={loading || !input.trim()}
                className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground glow-cyan disabled:opacity-50"
              >
                <Send className="h-4 w-4" />
                Send
              </button>
            </div>
          </div>

          <div className="glass rounded-3xl p-5 lg:col-span-2">
            <div className="mb-4 flex items-center justify-between">
              <div className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Agent Workflow</div>
              {isConnected !== null && (
                <div className="flex items-center gap-1.5 text-[11px] font-medium">
                  <span className={`h-2 w-2 rounded-full ${isConnected ? "bg-emerald-500 animate-pulse" : "bg-rose-500"}`} />
                  <span className={isConnected ? "text-emerald-400" : "text-rose-400"}>
                    {isConnected ? "FastAPI Connected" : "Backend Offline"}
                  </span>
                </div>
              )}
            </div>
            <div className="flex flex-col gap-3">
              <AgentPipeline activeId={activeNode} compact={false} />
            </div>

            {!isConnected && isConnected !== null && (
              <div className="mt-4 rounded-xl border border-rose-500/20 bg-rose-500/5 p-3 text-xs text-rose-300">
                <span className="font-semibold block mb-1">Start FastAPI server:</span>
                <code className="block bg-black/40 p-2 rounded text-[11px] font-mono text-rose-200">
                  uvicorn app:app --port 8001
                </code>
              </div>
            )}

            <div className="mt-6 rounded-xl bg-muted/30 p-3 text-[11px] leading-relaxed text-muted-foreground">
              Powered by <span className="text-foreground">logic_agent.py</span> — LangGraph + FinBERT + Groq/GPT-4o.
              Powered by Nivesh AI Engine v1.0
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}