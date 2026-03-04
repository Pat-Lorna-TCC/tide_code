import type { ContextItem, ContextPack } from "./context-pack.js";
import { estimateTokens } from "./token-estimator.js";
import { computeBudget, DEFAULT_CONTEXT_CONFIG, type ContextConfig } from "./context-config.js";

/**
 * Priority order for context assembly (lower = higher priority):
 *   1. TIDE.md rules (never trimmable)
 *   2. Active plan / feature plan
 *   3. User attachments
 *   4. Pinned region tags
 *   5. PROJECT.md / project spec
 *   6. Repo map
 *   7. Session summary
 */
const TYPE_PRIORITY: Record<string, number> = {
  tide_rules: 1,
  feature_plan: 2,
  user_attachment: 3,
  region_tag: 4,
  project_spec: 5,
  file_snippet: 6,
  repo_map: 7,
  session_summary: 8,
};

export class ContextBuilder {
  private items: ContextItem[] = [];
  private config: ContextConfig;

  constructor(config: ContextConfig = DEFAULT_CONTEXT_CONFIG) {
    this.config = config;
  }

  /** Add a context item. Token estimate is computed if not provided. */
  addItem(item: Omit<ContextItem, "tokenEstimate" | "priority"> & { tokenEstimate?: number; priority?: number }): void {
    const isCode = item.type === "region_tag" || item.type === "file_snippet";
    const tokenEstimate = item.tokenEstimate ?? estimateTokens(item.content, isCode ? "code" : "text");
    const priority = item.priority ?? (TYPE_PRIORITY[item.type] ?? 10);

    this.items.push({
      ...item,
      tokenEstimate,
      priority,
    });
  }

  /** Build the context pack, trimming items if over budget. */
  build(): ContextPack {
    const budget = computeBudget(this.config);

    // Sort by priority (ascending = higher priority first), then by pinned
    const sorted = [...this.items].sort((a, b) => {
      // Non-trimmable always first
      if (a.trimmable !== b.trimmable) return a.trimmable ? 1 : -1;
      // Pinned before unpinned
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      // By priority
      return a.priority - b.priority;
    });

    const included: ContextItem[] = [];
    const trimmed: ContextItem[] = [];
    let totalTokens = 0;

    for (const item of sorted) {
      if (!item.trimmable || totalTokens + item.tokenEstimate <= budget) {
        included.push(item);
        totalTokens += item.tokenEstimate;
      } else {
        trimmed.push(item);
      }
    }

    return {
      items: included,
      totalTokens,
      budgetTokens: budget,
      usagePercent: budget > 0 ? totalTokens / budget : 0,
      trimmedItems: trimmed,
    };
  }

  /** Reset the builder. */
  reset(): void {
    this.items = [];
  }
}
