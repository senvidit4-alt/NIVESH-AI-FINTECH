import { create } from "zustand";
import { PortfolioHolding, Holding, RiskMetrics } from "@/types";

interface PortfolioStore {
  holdings: PortfolioHolding[];
  liveHoldings: Holding[];
  totalValue: number;
  riskMetrics: RiskMetrics | null;
  addHolding: (h: PortfolioHolding) => void;
  removeHolding: (symbol: string) => void;
  setLiveData: (holdings: Holding[], totalValue: number, risk: RiskMetrics) => void;
}

export const usePortfolioStore = create<PortfolioStore>((set) => ({
  holdings: [],
  liveHoldings: [],
  totalValue: 0,
  riskMetrics: null,
  addHolding: (h) =>
    set((s) => ({
      holdings: [...s.holdings.filter((x) => x.symbol !== h.symbol), h],
    })),
  removeHolding: (symbol) =>
    set((s) => ({ holdings: s.holdings.filter((x) => x.symbol !== symbol) })),
  setLiveData: (liveHoldings, totalValue, riskMetrics) =>
    set({ liveHoldings, totalValue, riskMetrics }),
}));
