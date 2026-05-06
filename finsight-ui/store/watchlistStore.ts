import { create } from "zustand";
import { WatchlistItem, Alert } from "@/types";

interface WatchlistStore {
  items: WatchlistItem[];
  alerts: Alert[];
  setItems: (items: WatchlistItem[]) => void;
  setAlerts: (alerts: Alert[]) => void;
  removeItem: (symbol: string) => void;
  removeAlert: (id: number) => void;
}

export const useWatchlistStore = create<WatchlistStore>((set) => ({
  items: [],
  alerts: [],
  setItems: (items) => set({ items }),
  setAlerts: (alerts) => set({ alerts }),
  removeItem: (symbol) =>
    set((s) => ({ items: s.items.filter((i) => i.symbol !== symbol) })),
  removeAlert: (id) =>
    set((s) => ({ alerts: s.alerts.filter((a) => a.id !== id) })),
}));
