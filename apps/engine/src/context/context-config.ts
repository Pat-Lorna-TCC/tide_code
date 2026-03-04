export interface ContextConfig {
  /** Model context window size in tokens. */
  modelContextWindow: number;
  /** Fraction of context window to use (0.0 - 1.0). */
  contextRatio: number;
  /** Thresholds for budget status. */
  thresholds: {
    green: number;  // usage below this = green
    yellow: number; // usage below this = yellow, above = red
  };
}

export const DEFAULT_CONTEXT_CONFIG: ContextConfig = {
  modelContextWindow: 200_000,
  contextRatio: 0.8,
  thresholds: {
    green: 0.7,
    yellow: 0.9,
  },
};

/** Compute the token budget from config. */
export function computeBudget(config: ContextConfig = DEFAULT_CONTEXT_CONFIG): number {
  return Math.floor(config.modelContextWindow * config.contextRatio);
}
