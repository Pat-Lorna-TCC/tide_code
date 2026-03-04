import { z } from "zod";
import type { AnyToolDefinition } from "@tide/shared";
import { fsList } from "../fs_list.js";

const ArgsSchema = z.object({
  path: z.string(),
  recursive: z.boolean().optional().default(false),
  maxDepth: z.number().int().min(1).optional().default(1),
});

const FsEntrySchema = z.object({
  name: z.string(),
  path: z.string(),
  type: z.enum(["file", "directory", "symlink"]),
  size: z.number().optional(),
});

const ResultSchema = z.array(FsEntrySchema);

export const fsListTool: AnyToolDefinition = {
  name: "fs_list",
  description: "List files and directories at a given path",
  safetyLevel: "read",
  argsSchema: ArgsSchema,
  resultSchema: ResultSchema,
  cancellable: false,
  defaultTimeoutMs: 10_000,
  execute: async (ctx) => fsList(ctx.args),
};
