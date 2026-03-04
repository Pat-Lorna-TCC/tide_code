import { z } from "zod";

export const ContextItemTypeSchema = z.enum([
  "tide_rules",
  "project_spec",
  "feature_plan",
  "region_tag",
  "file_snippet",
  "repo_map",
  "session_summary",
  "user_attachment",
]);
export type ContextItemType = z.infer<typeof ContextItemTypeSchema>;

export const ContextItemSchema = z.object({
  id: z.string(),
  type: ContextItemTypeSchema,
  source: z.string(),
  content: z.string(),
  tokenEstimate: z.number(),
  pinned: z.boolean(),
  priority: z.number(),
  trimmable: z.boolean(),
});
export type ContextItem = z.infer<typeof ContextItemSchema>;

export const ContextPackSchema = z.object({
  items: z.array(ContextItemSchema),
  totalTokens: z.number(),
  budgetTokens: z.number(),
  usagePercent: z.number(),
  trimmedItems: z.array(ContextItemSchema),
});
export type ContextPack = z.infer<typeof ContextPackSchema>;
