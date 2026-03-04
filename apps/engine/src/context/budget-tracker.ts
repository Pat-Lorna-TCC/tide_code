import { type ContextConfig, DEFAULT_CONTEXT_CONFIG, computeBudget } from "./context-config.js";

export type BudgetCategory =
  | "tideRules"
  | "activePlan"
  | "attachments"
  | "taggedRegions"
  | "repoMap"
  | "sessionSummary"
  | "other";

export type ThresholdColor = "green" | "yellow" | "red";

export interface CategoryBreakdown {
  category: BudgetCategory;
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

export class BudgetTracker {
  private config: ContextConfig;
  private categoryTotals = new Map<BudgetCategory, number>();

  constructor(config: ContextConfig = DEFAULT_CONTEXT_CONFIG) {
    this.config = config;
  }

  /** Add tokens to a category. */
  addTokens(category: BudgetCategory, tokens: number): void {
    const current = this.categoryTotals.get(category) ?? 0;
    this.categoryTotals.set(category, current + tokens);
  }

  /** Set the token count for a category (replace, not add). */
  setTokens(category: BudgetCategory, tokens: number): void {
    this.categoryTotals.set(category, tokens);
  }

  /** Get total tokens across all categories. */
  getTotalTokens(): number {
    let total = 0;
    for (const v of this.categoryTotals.values()) total += v;
    return total;
  }

  /** Get budget in tokens. */
  getBudget(): number {
    return computeBudget(this.config);
  }

  /** Get usage as a percentage (0.0 - 1.0+). */
  getUsagePercent(): number {
    const budget = this.getBudget();
    if (budget === 0) return 0;
    return this.getTotalTokens() / budget;
  }

  /** Get threshold color based on usage. */
  getThresholdColor(): ThresholdColor {
    const usage = this.getUsagePercent();
    if (usage < this.config.thresholds.green) return "green";
    if (usage < this.config.thresholds.yellow) return "yellow";
    return "red";
  }

  /** Get full breakdown. */
  getBreakdown(): BudgetBreakdown {
    const budgetTokens = this.getBudget();
    const totalTokens = this.getTotalTokens();
    const usagePercent = this.getUsagePercent();

    const categories: CategoryBreakdown[] = [];
    for (const [category, tokens] of this.categoryTotals) {
      categories.push({
        category,
        tokens,
        percentage: budgetTokens > 0 ? tokens / budgetTokens : 0,
      });
    }

    // Sort by tokens descending
    categories.sort((a, b) => b.tokens - a.tokens);

    return {
      totalTokens,
      budgetTokens,
      usagePercent,
      thresholdColor: this.getThresholdColor(),
      categories,
    };
  }

  /** Reset all category totals. */
  reset(): void {
    this.categoryTotals.clear();
  }
}
