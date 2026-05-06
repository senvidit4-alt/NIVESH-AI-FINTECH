"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { WatchlistItem, Alert } from "@/types";
import { formatINR } from "@/lib/formatters";
import { Search, Bell, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import api from "@/lib/api";
import clsx from "clsx";

interface Props {
  items: WatchlistItem[];
  onRemove: (symbol: string) => void;
  onAlertAdded: () => void;
}

export function WatchlistTable({ items, onRemove, onAlertAdded }: Props) {
  const router = useRouter();
  const [alertModal, setAlertModal] = useState<string | null>(null);
  const [targetPrice, setTargetPrice] = useState("");
  const [direction, setDirection] = useState<"above" | "below">("above");
  const [saving, setSaving] = useState(false);

  const saveAlert = async () => {
    if (!alertModal || !targetPrice) return;
    setSaving(true);
    try {
      await api.post("/alerts", { symbol: alertModal, target_price: parseFloat(targetPrice), direction });
      setAlertModal(null); setTargetPrice("");
      onAlertAdded();
    } catch {}
    setSaving(false);
  };

  if (!items.length) {
    return <div className="glass p-8 text-center text-slate-600 text-sm">Watchlist is empty. Add symbols above.</div>;
  }

  return (
    <>
      <div className="glass overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-800">
              {["Symbol", "Price", "Source", "Actions"].map((c) => (
                <th key={c} className="px-4 py-3 text-left text-xs text-slate-500 font-medium uppercase tracking-wider">{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.symbol} className="border-b border-slate-800/50 hover:bg-slate-800/20 transition-colors">
                <td className="px-4 py-3 mono font-semibold text-slate-200">{item.symbol}</td>
                <td className="px-4 py-3 mono text-slate-300">
                  {item.price ? formatINR(item.price) : <span className="text-slate-600">—</span>}
                </td>
                <td className="px-4 py-3">
                  <Badge label={item.symbol.includes(".NS") ? "NSE" : item.symbol.includes(".BO") ? "BSE" : "INTL"} variant="info" />
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <button onClick={() => router.push(`/analyze?symbol=${item.symbol}`)}
                      className="text-slate-500 hover:text-blue-400 transition-colors" title="Analyze">
                      <Search size={14} />
                    </button>
                    <button onClick={() => setAlertModal(item.symbol)}
                      className="text-slate-500 hover:text-amber-400 transition-colors" title="Set Alert">
                      <Bell size={14} />
                    </button>
                    <button onClick={() => onRemove(item.symbol)}
                      className="text-slate-500 hover:text-red-400 transition-colors" title="Remove">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={!!alertModal} onClose={() => setAlertModal(null)} title={`Set Alert — ${alertModal}`}>
        <div className="space-y-4">
          <div className="flex gap-2">
            {(["above", "below"] as const).map((d) => (
              <button key={d} onClick={() => setDirection(d)}
                className={clsx("flex-1 py-2 rounded-lg text-sm font-medium capitalize transition-all",
                  direction === d ? "bg-blue-600 text-white" : "bg-slate-800 text-slate-400"
                )}>{d}</button>
            ))}
          </div>
          <Input value={targetPrice} onChange={setTargetPrice} placeholder="Target price (₹)" type="number" />
          <Button onClick={saveAlert} loading={saving} className="w-full justify-center">Save Alert</Button>
        </div>
      </Modal>
    </>
  );
}
