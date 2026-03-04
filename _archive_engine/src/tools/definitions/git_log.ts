import { z } from "zod";
import { execFile } from "node:child_process";
import type { AnyToolDefinition } from "@tide/shared";

const ArgsSchema = z.object({
  limit: z.number().int().min(1).max(100).optional().default(20),
});

const LogEntrySchema = z.object({
  hash: z.string(),
  message: z.string(),
});

const ResultSchema = z.object({
  entries: z.array(LogEntrySchema),
});

export const gitLogTool: AnyToolDefinition = {
  name: "git_log",
  description: "Show recent commit history",
  safetyLevel: "read",
  argsSchema: ArgsSchema,
  resultSchema: ResultSchema,
  cancellable: false,
  defaultTimeoutMs: 10_000,
  execute: async (ctx) => {
    const { limit } = ctx.args;

    return new Promise<z.infer<typeof ResultSchema>>((resolve, reject) => {
      execFile(
        "git",
        ["log", "--oneline", `-n${limit}`],
        { cwd: ctx.workspaceRoot },
        (err, stdout) => {
          if (err) {
            reject(new Error(`git log failed: ${err.message}`));
            return;
          }
          const lines = stdout.trim().split("\n").filter(Boolean);
          const entries = lines.map((line) => {
            const spaceIdx = line.indexOf(" ");
            return {
              hash: line.substring(0, spaceIdx),
              message: line.substring(spaceIdx + 1),
            };
          });
          resolve({ entries });
        },
      );
    });
  },
};
