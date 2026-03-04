import type {
  ToolResult,
  ApprovalGateInterface,
  ToolLoggerInterface,
  SafetyConfig,
  SafetyLevel,
} from "@tide/shared";
import type { CancellationToken } from "../orchestration/cancellation.js";
import { CancellationError } from "../orchestration/cancellation.js";
import type { ToolRegistry } from "./registry.js";

const DEFAULT_SAFETY_CONFIG: SafetyConfig = {
  approvalPolicy: { read: "never", write: "always", command: "disabled" },
  commandAllowlist: [],
  gitWriteEnabled: false,
};

export interface ToolExecutorOptions {
  workspaceRoot: string;
  approvalGate?: ApprovalGateInterface;
  safetyConfig?: SafetyConfig;
  logger?: ToolLoggerInterface;
}

/**
 * ToolExecutor orchestrates the full tool execution pipeline:
 * registry lookup → Zod validation → safety check → approval → log → execute → log result
 */
export class ToolExecutor {
  private registry: ToolRegistry;
  private options: ToolExecutorOptions;

  constructor(registry: ToolRegistry, options: ToolExecutorOptions) {
    this.registry = registry;
    this.options = options;
  }

  async execute(
    toolName: string,
    rawArgs: Record<string, unknown>,
    requestId: string,
    cancellationToken: CancellationToken,
  ): Promise<ToolResult> {
    const startTime = Date.now();

    // 1. Get tool from registry
    const tool = this.registry.get(toolName);
    if (!tool) {
      return {
        toolName,
        error: { code: "UNKNOWN_TOOL", message: `Unknown tool: ${toolName}` },
        durationMs: Date.now() - startTime,
        cancelled: false,
      };
    }

    // 2. Validate args via Zod
    const parseResult = tool.argsSchema.safeParse(rawArgs);
    if (!parseResult.success) {
      const issues = parseResult.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ");
      return {
        toolName,
        error: { code: "VALIDATION_ERROR", message: `Invalid arguments: ${issues}` },
        durationMs: Date.now() - startTime,
        cancelled: false,
      };
    }
    const validatedArgs = parseResult.data;

    // 3. Check safety policy
    const safetyConfig = this.options.safetyConfig ?? DEFAULT_SAFETY_CONFIG;
    const approvalRequired = this.requiresApproval(tool.safetyLevel, safetyConfig, toolName);

    // Command disabled check
    if (tool.safetyLevel === "command" && safetyConfig.approvalPolicy.command === "disabled") {
      return {
        toolName,
        error: {
          code: "COMMAND_DISABLED",
          message: "Command execution is disabled. Enable it in TIDE.md.",
        },
        durationMs: Date.now() - startTime,
        cancelled: false,
      };
    }

    // Command allowlist check
    if (
      tool.safetyLevel === "command" &&
      safetyConfig.approvalPolicy.command === "allowlist"
    ) {
      const cmd = (rawArgs as Record<string, unknown>).cmd;
      if (typeof cmd === "string" && !safetyConfig.commandAllowlist.includes(cmd)) {
        return {
          toolName,
          error: {
            code: "COMMAND_NOT_ALLOWED",
            message: `Command "${cmd}" is not in the allowlist. Add it to TIDE.md.`,
          },
          durationMs: Date.now() - startTime,
          cancelled: false,
        };
      }
    }

    // 4. Log start
    const logId = this.options.logger?.logStart({
      requestId,
      toolName,
      args: rawArgs,
      safetyLevel: tool.safetyLevel,
      approvalRequired,
    });

    // 5. Request approval if needed
    if (approvalRequired && this.options.approvalGate) {
      // Compute diff preview if the tool supports it
      let diffPreview;
      if (tool.computeDiffPreview) {
        try {
          diffPreview = await tool.computeDiffPreview({
            args: validatedArgs,
            workspaceRoot: this.options.workspaceRoot,
            requestId,
            cancellationToken,
          });
        } catch {
          // Preview computation failed — proceed with approval without preview
        }
      }

      const approved = await this.options.approvalGate.requestApproval({
        toolName,
        args: rawArgs,
        safetyLevel: tool.safetyLevel,
        requestId,
        diffPreview,
      });

      if (!approved) {
        if (logId) this.options.logger?.logError(logId, "Approval denied by user");
        return {
          toolName,
          error: { code: "APPROVAL_DENIED", message: "User denied approval" },
          durationMs: Date.now() - startTime,
          cancelled: false,
        };
      }
    }

    // 6. Execute with timeout
    try {
      cancellationToken.throwIfCancelled();

      const result = await this.withTimeout(
        tool.execute({
          args: validatedArgs,
          workspaceRoot: this.options.workspaceRoot,
          requestId,
          cancellationToken,
        }),
        tool.defaultTimeoutMs,
        cancellationToken,
      );

      // 7. Log success
      if (logId) this.options.logger?.logEnd(logId, result);

      return {
        toolName,
        result,
        durationMs: Date.now() - startTime,
        cancelled: false,
      };
    } catch (err) {
      if (err instanceof CancellationError) {
        if (logId) this.options.logger?.logCancelled(logId);
        return {
          toolName,
          error: { code: "CANCELLED", message: "Operation cancelled" },
          durationMs: Date.now() - startTime,
          cancelled: true,
        };
      }

      const message = err instanceof Error ? err.message : String(err);
      if (logId) this.options.logger?.logError(logId, message);

      return {
        toolName,
        error: { code: "TOOL_ERROR", message },
        durationMs: Date.now() - startTime,
        cancelled: false,
      };
    }
  }

  /** Determine if a tool requires user approval based on safety config. */
  private requiresApproval(
    safetyLevel: SafetyLevel,
    config: SafetyConfig,
    _toolName: string,
  ): boolean {
    switch (safetyLevel) {
      case "read":
        return false; // Never requires approval
      case "write":
        return config.approvalPolicy.write === "always" ||
          config.approvalPolicy.write === "ask";
      case "command":
        return config.approvalPolicy.command === "always" ||
          config.approvalPolicy.command === "allowlist";
      default:
        return true;
    }
  }

  /** Race a promise against a timeout, respecting cancellation. */
  private withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    cancellationToken: CancellationToken,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      let settled = false;

      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          reject(new Error(`Tool timed out after ${timeoutMs}ms`));
        }
      }, timeoutMs);

      cancellationToken.onCancel(() => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          reject(new CancellationError());
        }
      });

      promise
        .then((val) => {
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            resolve(val);
          }
        })
        .catch((err) => {
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            reject(err);
          }
        });
    });
  }
}
