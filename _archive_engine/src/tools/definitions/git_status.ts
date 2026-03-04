import { z } from "zod";
import { execFile } from "node:child_process";
import type { AnyToolDefinition } from "@tide/shared";

const ArgsSchema = z.object({});

const StatusEntrySchema = z.object({
  status: z.string(),
  path: z.string(),
});

const ResultSchema = z.object({
  entries: z.array(StatusEntrySchema),
  clean: z.boolean(),
});

export const gitStatusTool: AnyToolDefinition = {
  name: "git_status",
  description: "Show working tree status (staged, modified, untracked files)",
  safetyLevel: "read",
  argsSchema: ArgsSchema,
  resultSchema: ResultSchema,
  cancellable: false,
  defaultTimeoutMs: 10_000,
  execute: async (ctx) => {
    return new Promise<z.infer<typeof ResultSchema>>((resolve, reject) => {
      execFile(
        "git",
        ["status", "--porcelain"],
        { cwd: ctx.workspaceRoot },
        (err, stdout) => {
          if (err) {
            reject(new Error(`git status failed: ${err.message}`));
            return;
          }
          const lines = stdout.trim().split("\n").filter(Boolean);
          const entries = lines.map((line) => ({
            status: line.substring(0, 2).trim(),
            path: line.substring(3),
          }));
          resolve({ entries, clean: entries.length === 0 });
        },
      );
    });
  },
};
