"use client";
import { useState, useRef, useEffect } from "react";
import { Send } from "lucide-react";
import { ChatMessage } from "@/types";
import clsx from "clsx";
import api from "@/lib/api";

const SUGGESTIONS = [
  "Analyze RELIANCE.NS for me",
  "What is the current NIFTY trend?",
  "Compare TCS.NS and INFY.NS",
  "Should I buy HDFC Bank now?",
  "What is the market sentiment today?",
  "Give me a research report on WIPRO.NS",
  "What is the Sharpe ratio of TATAMOTORS.NS?",
  "Optimize a portfolio of TCS, INFY, RELIANCE",
];

function MessageBubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === "user";
  return (
    <div className={clsx("flex", isUser ? "justify-end" : "justify-start")}>
      <div className={clsx("max-w-[75%] rounded-2xl px-4 py-3 text-sm",
        isUser ? "bg-blue-600/30 border border-blue-500/30 text-slate-200" : "bg-slate-800/60 border border-slate-700/50 text-slate-300"
      )}>
        <div className="whitespace-pre-wrap leading-relaxed">{msg.content}</div>
        {!isUser && (
          <p className="text-xs text-slate-600 mt-2">⚠️ Not financial advice</p>
        )}
        <div className="text-xs text-slate-600 mt-1">{msg.timestamp}</div>
      </div>
    </div>
  );
}

export function ChatInterface() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = async (text: string) => {
    if (!text.trim() || loading) return;
    const ts = new Date().toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour12: false });
    setMessages((m) => [...m, { role: "user", content: text, timestamp: ts }]);
    setInput("");
    setLoading(true);
    try {
      const res = await api.post("/chat", { message: text });
      let reply = "";
      const data = res.data;
      if (typeof data === "string") {
        // SSE text — collect all tokens or grab the final 'full' field
        const lines = data.split("\n").filter((l: string) => l.startsWith("data:"));
        for (const line of lines) {
          try {
            const parsed = JSON.parse(line.replace(/^data:\s*/, ""));
            if (parsed.full) { reply = parsed.full; break; }
            if (parsed.token) reply += parsed.token;
          } catch {}
        }
      } else if (data?.full) {
        reply = data.full;
      } else if (data?.response) {
        reply = data.response;
      }
      if (!reply) reply = "Sorry, I couldn't generate a response. Please try again.";
      const ts2 = new Date().toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour12: false });
      setMessages((m) => [...m, { role: "assistant", content: reply, timestamp: ts2 }]);
    } catch (e: unknown) {
      const ts2 = new Date().toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour12: false });
      setMessages((m) => [...m, { role: "assistant", content: `Error: ${e instanceof Error ? e.message : "Request failed"}`, timestamp: ts2 }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-full gap-4">
      {/* Suggestions sidebar */}
      <div className="w-64 shrink-0 space-y-2">
        <h3 className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-3">Suggested Queries</h3>
        {SUGGESTIONS.map((s) => (
          <button key={s} onClick={() => send(s)}
            className="w-full text-left text-xs text-slate-400 hover:text-slate-200 bg-slate-900/40 hover:bg-slate-800/60 border border-slate-800 hover:border-slate-700 rounded-lg px-3 py-2.5 transition-all">
            {s}
          </button>
        ))}
      </div>

      {/* Chat area */}
      <div className="flex-1 flex flex-col glass overflow-hidden">
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 && (
            <div className="flex items-center justify-center h-full text-slate-600 text-sm">
              Ask anything about stocks, markets, or your portfolio.
            </div>
          )}
          {messages.map((m, i) => <MessageBubble key={i} msg={m} />)}
          {loading && (
            <div className="flex justify-start">
              <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl px-4 py-3">
                <div className="flex gap-1">
                  {[0, 1, 2].map((i) => (
                    <span key={i} className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce"
                      style={{ animationDelay: `${i * 0.15}s` }} />
                  ))}
                </div>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <div className="p-4 border-t border-slate-800">
          <div className="flex gap-2">
            <input
              suppressHydrationWarning
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send(input)}
              placeholder="Ask about stocks, portfolio, market news…"
              disabled={loading}
              className="flex-1 bg-slate-900/60 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-blue-500/60 disabled:opacity-50"
            />
            <button onClick={() => send(input)} disabled={loading || !input.trim()}
              className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl px-4 transition-colors">
              <Send size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
