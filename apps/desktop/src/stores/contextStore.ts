import { create } from "zustand";

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

// TODO: Rewire to Pi's get_state response in Phase 5.
// Context management is now handled by Pi's session system.
export const useContextStore = create<ContextState>((set) => ({
  breakdown: null,
  contextPack: null,
  inspectorOpen: false,

  refreshBreakdown: async () => {
    // No-op: Pi manages context internally. Will be wired to Pi get_state in Phase 5.
  },

  refreshItems: async () => {
    // No-op: Pi manages context internally. Will be wired to Pi get_state in Phase 5.
  },

  togglePin: async (_id: string) => {
    // No-op: Region-based pinning will be handled via Pi's tide_tags tool in Phase 5.
  },

  openInspector: () => set({ inspectorOpen: true }),
  closeInspector: () => set({ inspectorOpen: false }),
}));
