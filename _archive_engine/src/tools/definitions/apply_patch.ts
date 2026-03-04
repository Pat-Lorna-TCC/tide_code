import { z } from "zod";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { randomUUID } from "node:crypto";
import type { AnyToolDefinition, DiffPreviewData, ToolExecutionContext } from "@tide/shared";
import { parseUnifiedDiff } from "../patch/patch-parser.js";
import { applyPatch } from "../patch/patch-applier.js";

const ArgsSchema = z.object({
  path: z.string(),
  patch: z.string(),
});

const ResultSchema = z.object({
  applied: z.boolean(),
  linesAdded: z.number(),
  linesRemoved: z.number(),
});

type ArgsType = z.infer<typeof ArgsSchema>;

/** Read file or return empty string for new file creation. */
async function readOriginal(resolvedPath: string): Promise<string> {
  try {
    return await fs.readFile(resolvedPath, "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return "";
    }
    throw err;
  }
}

/** Compute the would-be result without writing (for diff preview). */
async function computePreview(
  ctx: ToolExecutionContext<ArgsType>,
): Promise<DiffPreviewData> {
  const { path: filePath, patch } = ctx.args;
  const resolvedPath = path.isAbsolute(filePath)
    ? filePath
    : path.resolve(ctx.workspaceRoot, filePath);

  const original = await readOriginal(resolvedPath);
  const parsed = parseUnifiedDiff(patch);
  const { result: modified } = applyPatch(original, parsed.hunks);

  return { filePath, originalContent: original, modifiedContent: modified };
}

export const applyPatchTool: AnyToolDefinition = {
  name: "apply_patch",
  description: "Apply a unified diff patch to a file",
  safetyLevel: "write",
  argsSchema: ArgsSchema,
  resultSchema: ResultSchema,
  cancellable: false,
  defaultTimeoutMs: 10_000,
  computeDiffPreview: computePreview,
  execute: async (ctx) => {
    const { path: filePath, patch } = ctx.args as ArgsType;

    const resolvedPath = path.isAbsolute(filePath)
      ? filePath
      : path.resolve(ctx.workspaceRoot, filePath);

    // Read original
    const original = await readOriginal(resolvedPath);

    // Parse and apply
    const parsed = parseUnifiedDiff(patch);
    const { result: modified, linesAdded, linesRemoved } = applyPatch(
      original,
      parsed.hunks,
    );

    // Atomic write
    const dir = path.dirname(resolvedPath);
    await fs.mkdir(dir, { recursive: true });
    const tmpPath = path.join(dir, `.tide-tmp-${randomUUID()}`);

    try {
      await fs.writeFile(tmpPath, modified, "utf-8");
      await fs.rename(tmpPath, resolvedPath);
    } catch (err) {
      try {
        await fs.unlink(tmpPath);
      } catch {
        // ignore
      }
      throw err;
    }

    return { applied: true, linesAdded, linesRemoved };
  },
};
