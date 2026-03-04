import { z } from "zod";
import { execFile } from "node:child_process";
import type { AnyToolDefinition } from "@tide/shared";

const ArgsSchema = z.object({
  staged: z.boolean().optional().default(false),
  path: z.string().optional(),
});

const ResultSchema = z.object({
  diff: z.string(),
  hasChanges: z.boolean(),
});

export const gitDiffTool: AnyToolDefinition = {
  name: "git_diff",
  description: "Show changes between working tree / staging area and HEAD",
  safetyLevel: "read",
  argsSchema: ArgsSchema,
  resultSchema: ResultSchema,
  cancellable: false,
  defaultTimeoutMs: 10_000,
  execute: async (ctx) => {
    const { staged, path: filePath } = ctx.args;

    const args = ["diff"];
    if (staged) args.push("--staged");
    if (filePath) args.push("--", filePath);

    return new Promise<z.infer<typeof ResultSchema>>((resolve, reject) => {
      execFile(
        "git",
        args,
        { cwd: ctx.workspaceRoot, maxBuffer: 5 * 1024 * 1024 },
        (err, stdout) => {
          if (err) {
            reject(new Error(`git diff failed: ${err.message}`));
            return;
          }
          resolve({ diff: stdout, hasChanges: stdout.length > 0 });
        },
      );
    });
  },
};
