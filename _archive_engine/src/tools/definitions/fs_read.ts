import { z } from "zod";
import type { AnyToolDefinition } from "@tide/shared";
import { fsRead } from "../fs_read.js";

const ArgsSchema = z.object({
  path: z.string(),
  startLine: z.number().int().min(1).optional(),
  endLine: z.number().int().min(1).optional(),
});

const ResultSchema = z.object({
  content: z.string(),
  totalLines: z.number(),
  language: z.string(),
});

export const fsReadTool: AnyToolDefinition = {
  name: "fs_read",
  description: "Read file content with optional line range",
  safetyLevel: "read",
  argsSchema: ArgsSchema,
  resultSchema: ResultSchema,
  cancellable: false,
  defaultTimeoutMs: 10_000,
  execute: async (ctx) => fsRead(ctx.args),
};
