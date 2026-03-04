import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";

export type ThresholdColor = "green" | "yellow" | "red";

export interface CategoryBreakdown {
  category: string;
  tokens: number;
  percentage: number;
}

export interface BudgetBreakdown {
  totalTokens: number;
  budgetTokens: number;
  usagePercent: number;
  thresholdColor: ThresholdColor;
  categories: CategoryBreakdown[];
}

export interface ContextItem {
  id: string;
  type: string;
  source: string;
  content: string;
  tokenEstimate: number;
  pinned: boolean;
  priority: number;
  trimmable: boolean;
}

export interface ContextPack {
  items: ContextItem[];
  totalTokens: number;
  budgetTokens: number;
  usagePercent: number;
  trimmedItems: ContextItem[];
}

interface ContextState {
  breakdown: BudgetBreakdown | null;
  contextPack: ContextPack | null;
  inspectorOpen: boolean;

  refreshBreakdown: () => Promise<void>;
  refreshItems: () => Promise<void>;
  togglePin: (id: string) => Promise<void>;
  openInspector: () => void;
  closeInspector: () => void;
}

export const useContextStore = create<ContextState>((set, get) => ({
  breakdown: null,
  contextPack: null,
  inspectorOpen: false,

  refreshBreakdown: async () => {
    try {
      const breakdown = await invoke<BudgetBreakdown>("context_get_breakdown");
      set({ breakdown });
    } catch (err) {
      console.error("[contextStore] Failed to refresh breakdown:", err);
    }
  },

  refreshItems: async () => {
    try {
      const contextPack = await invoke<ContextPack>("context_get_items");
      set({ contextPack });
    } catch (err) {
      console.error("[contextStore] Failed to refresh items:", err);
    }
  },

  togglePin: async (id: string) => {
    try {
      await invoke("context_toggle_pin", { id });
      // Refresh both breakdown and items
      await Promise.all([get().refreshBreakdown(), get().refreshItems()]);
    } catch (err) {
      console.error("[contextStore] Failed to toggle pin:", err);
    }
  },

  openInspector: () => set({ inspectorOpen: true }),
  closeInspector: () => set({ inspectorOpen: false }),
}));
