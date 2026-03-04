/** Estimate token count using character-based heuristic. */
export function estimateTokens(text: string, type: "code" | "text" = "text"): number {
  if (!text) return 0;
  const divisor = type === "code" ? 3.0 : 3.5;
  return Math.ceil(text.length / divisor);
}
