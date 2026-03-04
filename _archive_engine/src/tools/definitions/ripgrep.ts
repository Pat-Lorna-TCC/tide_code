import { z } from "zod";
import { execFile } from "node:child_process";
import type { AnyToolDefinition } from "@tide/shared";

const ArgsSchema = z.object({
  pattern: z.string(),
  path: z.string(),
  caseSensitive: z.boolean().optional().default(true),
  fileType: z.string().optional(),
  maxResults: z.number().int().min(1).optional().default(100),
});

const MatchSchema = z.object({
  filePath: z.string(),
  lineNumber: z.number(),
  matchText: z.string(),
  contextBefore: z.array(z.string()).optional(),
  contextAfter: z.array(z.string()).optional(),
});

const ResultSchema = z.object({
  matches: z.array(MatchSchema),
  truncated: z.boolean(),
});

export const ripgrepTool: AnyToolDefinition = {
  name: "ripgrep",
  description: "Search file contents using regex patterns (requires rg binary)",
  safetyLevel: "read",
  argsSchema: ArgsSchema,
  resultSchema: ResultSchema,
  cancellable: true,
  defaultTimeoutMs: 30_000,
  execute: async (ctx) => {
    const { pattern, path: searchPath, caseSensitive, fileType, maxResults } = ctx.args;

    const rgArgs = ["--json", "--max-count", String(maxResults)];
    if (!caseSensitive) rgArgs.push("--ignore-case");
    if (fileType) rgArgs.push("--type", fileType);
    rgArgs.push("--", pattern, searchPath);

    return new Promise<z.infer<typeof ResultSchema>>((resolve, reject) => {
      const child = execFile("rg", rgArgs, { maxBuffer: 10 * 1024 * 1024 }, (err, stdout) => {
        // rg exits with 1 when no matches found — that's not an error
        if (err && (err as NodeJS.ErrnoException).code === "ENOENT") {
          reject(new Error("ripgrep (rg) not found. Install it: brew install ripgrep"));
          return;
        }

        const lines = stdout.trim().split("\n").filter(Boolean);
        const matches: z.infer<typeof MatchSchema>[] = [];
        let truncated = false;

        for (const line of lines) {
          try {
            const msg = JSON.parse(line);
            if (msg.type === "match") {
              const data = msg.data;
              matches.push({
                filePath: data.path?.text ?? "",
                lineNumber: data.line_number ?? 0,
                matchText: data.lines?.text?.trimEnd() ?? "",
              });
              if (matches.length >= maxResults) {
                truncated = true;
                break;
              }
            }
          } catch {
            // skip malformed JSON lines
          }
        }

        resolve({ matches, truncated });
      });

      // Support cancellation by killing the child process
      ctx.cancellationToken.onCancel(() => {
        child.kill("SIGTERM");
      });
    });
  },
};
