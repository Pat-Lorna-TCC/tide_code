import { z } from "zod";
import * as fs from "node:fs/promises";
import type { AnyToolDefinition } from "@tide/shared";

const ArgsSchema = z.object({
  path: z.string(),
});

const ResultSchema = z.object({
  size: z.number(),
  isFile: z.boolean(),
  isDirectory: z.boolean(),
  isSymlink: z.boolean(),
  modifiedMs: z.number(),
  createdMs: z.number(),
});

export const fsStatTool: AnyToolDefinition = {
  name: "fs_stat",
  description: "Get file or directory metadata (size, type, timestamps)",
  safetyLevel: "read",
  argsSchema: ArgsSchema,
  resultSchema: ResultSchema,
  cancellable: false,
  defaultTimeoutMs: 5_000,
  execute: async (ctx) => {
    const stat = await fs.lstat(ctx.args.path);
    return {
      size: stat.size,
      isFile: stat.isFile(),
      isDirectory: stat.isDirectory(),
      isSymlink: stat.isSymbolicLink(),
      modifiedMs: stat.mtimeMs,
      createdMs: stat.birthtimeMs,
    };
  },
};
