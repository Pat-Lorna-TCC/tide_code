import { z } from "zod";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { randomUUID } from "node:crypto";
import type { AnyToolDefinition } from "@tide/shared";

const ArgsSchema = z.object({
  path: z.string(),
  content: z.string(),
});

const ResultSchema = z.object({
  written: z.boolean(),
  bytesWritten: z.number(),
});

export const fsWriteTool: AnyToolDefinition = {
  name: "fs_write",
  description: "Write content to a file (creates parent directories if needed, atomic write)",
  safetyLevel: "write",
  argsSchema: ArgsSchema,
  resultSchema: ResultSchema,
  cancellable: false,
  defaultTimeoutMs: 10_000,
  execute: async (ctx) => {
    const { path: filePath, content } = ctx.args as z.infer<typeof ArgsSchema>;

    // Resolve relative to workspace root
    const resolvedPath = path.isAbsolute(filePath)
      ? filePath
      : path.resolve(ctx.workspaceRoot, filePath);

    // Create parent directories
    const dir = path.dirname(resolvedPath);
    await fs.mkdir(dir, { recursive: true });

    // Atomic write: write to temp file in same dir, then rename
    const tmpPath = path.join(dir, `.tide-tmp-${randomUUID()}`);
    const buffer = Buffer.from(content, "utf-8");

    try {
      await fs.writeFile(tmpPath, buffer);
      await fs.rename(tmpPath, resolvedPath);
    } catch (err) {
      // Clean up temp file on failure
      try {
        await fs.unlink(tmpPath);
      } catch {
        // ignore cleanup errors
      }
      throw err;
    }

    return { written: true, bytesWritten: buffer.length };
  },
};
