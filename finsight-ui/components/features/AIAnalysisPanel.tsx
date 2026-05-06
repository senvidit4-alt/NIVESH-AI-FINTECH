"use client";
import { Badge } from "@/components/ui/Badge";

interface Props { analysis: string; symbol: string; }

function highlight(text: string) {
  return text
    .replace(/\bBullish\b/gi, '<span class="text-emerald-400 font-semibold">Bullish</span>')
    .replace(/\bBearish\b/gi, '<span class="text-red-400 font-semibold">Bearish</span>')
    .replace(/\bNeutral\b/gi, '<span class="text-amber-400 font-semibold">Neutral</span>');
}

function getSentimentBadge(text: string) {
  if (/bullish/i.test(text)) return <Badge label="BULLISH" variant="success" />;
  if (/bearish/i.test(text)) return <Badge label="BEARISH" variant="danger" />;
  return <Badge label="NEUTRAL" variant="warning" />;
}

export function AIAnalysisPanel({ analysis, symbol }: Props) {
  return (
    <div className="glass p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-slate-300">AI Analysis — {symbol}</h3>
        {getSentimentBadge(analysis)}
      </div>
      <div
        className="text-sm text-slate-400 leading-relaxed whitespace-pre-wrap"
        dangerouslySetInnerHTML={{ __html: highlight(analysis) }}
      />
      <p className="mt-4 text-xs text-slate-600 border-t border-slate-800 pt-3">
        ⚠️ Not financial advice. For educational purposes only.
      </p>
    </div>
  );
}
