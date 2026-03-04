import { z } from "zod";
import { execFile } from "node:child_process";
import * as path from "node:path";
import type { AnyToolDefinition } from "@tide/shared";

const ArgsSchema = z.object({
  cmd: z.string(),
  args: z.array(z.string()).default([]),
  cwd: z.string().optional(),
  timeout_ms: z.number().int().min(1000).max(300_000).default(30_000),
  env_whitelist: z.array(z.string()).optional(),
});

const ResultSchema = z.object({
  exitCode: z.number().nullable(),
  stdout: z.string(),
  stderr: z.string(),
  killed: z.boolean(),
});

type ArgsType = z.infer<typeof ArgsSchema>;

const KILL_GRACE_MS = 3000;

export const runCommandTool: AnyToolDefinition = {
  name: "run_command",
  description: "Execute a command (direct exec only, no shell). Disabled by default.",
  safetyLevel: "command",
  argsSchema: ArgsSchema,
  resultSchema: ResultSchema,
  cancellable: true,
  defaultTimeoutMs: 30_000,
  execute: async (ctx) => {
    const { cmd, args: cmdArgs, cwd, timeout_ms, env_whitelist } =
      ctx.args as ArgsType;

    // Resolve cwd relative to workspace
    const resolvedCwd = cwd
      ? path.resolve(ctx.workspaceRoot, cwd)
      : ctx.workspaceRoot;

    // Build env from whitelist
    let env: NodeJS.ProcessEnv | undefined;
    if (env_whitelist && env_whitelist.length > 0) {
      env = {};
      for (const key of env_whitelist) {
        if (process.env[key] !== undefined) {
          env[key] = process.env[key];
        }
      }
      // Always include PATH
      if (!env.PATH) env.PATH = process.env.PATH;
    }

    return new Promise<z.infer<typeof ResultSchema>>((resolve, reject) => {
      const child = execFile(
        cmd,
        cmdArgs,
        {
          cwd: resolvedCwd,
          timeout: timeout_ms,
          maxBuffer: 5 * 1024 * 1024,
          env,
        },
        (err, stdout, stderr) => {
          if (err && (err as NodeJS.ErrnoException).code === "ENOENT") {
            reject(new Error(`Command not found: ${cmd}`));
            return;
          }
          resolve({
            exitCode: child.exitCode,
            stdout: stdout ?? "",
            stderr: stderr ?? "",
            killed: child.killed,
          });
        },
      );

      // Cancellation: SIGTERM first, then SIGKILL after grace period
      ctx.cancellationToken.onCancel(() => {
        child.kill("SIGTERM");
        setTimeout(() => {
          if (!child.killed) {
            child.kill("SIGKILL");
          }
        }, KILL_GRACE_MS);
      });
    });
  },
};
