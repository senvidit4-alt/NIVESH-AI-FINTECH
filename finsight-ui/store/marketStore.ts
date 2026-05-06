import { create } from "zustand";
import { MarketIndex } from "@/types";

interface MarketStore {
  indices: MarketIndex[];
  lastUpdated: string | null;
  setIndices: (indices: MarketIndex[]) => void;
}

export const useMarketStore = create<MarketStore>((set) => ({
  indices: [],
  lastUpdated: null,
  setIndices: (indices) =>
    set({ indices, lastUpdated: new Date().toISOString() }),
}));
