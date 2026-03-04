import { IpcMessageSchema } from "@tide/shared";
import type { IpcMessage, SafetyConfig } from "@tide/shared";
import { Transport } from "./transport.js";
import { StreamManager } from "../stream/manager.js";
import * as regionTagsDb from "../persistence/region-tags.js";
import { BudgetTracker } from "../context/budget-tracker.js";
import { ContextBuilder } from "../context/context-builder.js";
import { resolveRegions } from "../context/region-resolver.js";
import type { CreateRegionTag, UpdateRegionTag } from "@tide/shared";
import { randomUUID } from "node:crypto";
import { ToolRegistry } from "../tools/registry.js";
import { ToolExecutor } from "../tools/executor.js";
import { registerAllTools } from "../tools/definitions/index.js";
import { ApprovalGate } from "../safety/approval-gate.js";
import { ToolLogger } from "../logging/tool-logger.js";
import { CancellationToken } from "../orchestration/cancellation.js";
import { DEFAULT_SAFETY_CONFIG } from "../safety/safety-config.js";

const ENGINE_VERSION = "0.1.0";
const ENGINE_ID = randomUUID();
const streamManager = new StreamManager();

// ── Tool infrastructure ────────────────────────────────────
const registry = new ToolRegistry();
registerAllTools(registry);

const toolLogger = new ToolLogger();

// Per-connection state
let approvalGate: ApprovalGate | null = null;
let safetyConfig: SafetyConfig = { ...DEFAULT_SAFETY_CONFIG };

// Active cancellation tokens per requestId
const activeTokens = new Map<string, CancellationToken>();

export type MessageHandler = (msg: IpcMessage, transport: Transport) => void;
const handlers = new Map<string, MessageHandler>();

/** Register a handler for a specific message type. */
export function registerHandler(type: string, handler: MessageHandler): void {
  handlers.set(type, handler);
}

/** Set the safety config (loaded from TIDE.md at startup). */
export function setSafetyConfig(config: SafetyConfig): void {
  safetyConfig = config;
}

/** Send a tool_response back to the caller. */
function sendToolResponse(
  transport: Transport,
  requestId: string,
  result?: unknown,
  error?: { code: string; message: string },
): void {
  transport.send({
    id: randomUUID(),
    type: "tool_response",
    timestamp: Date.now(),
    requestId,
    ...(result !== undefined ? { result } : {}),
    ...(error ? { error } : {}),
  });
}

/**
 * Internal tools are not registered in the ToolRegistry — they handle
 * IDE-specific concerns (region tags, context management, streaming demo).
 */
const INTERNAL_TOOLS = new Set([
  "region_tags.list",
  "region_tags.create",
  "region_tags.update",
  "region_tags.delete",
  "context.get_breakdown",
  "context.get_items",
  "context.toggle_pin",
  "tool_logs.list",
  "chat",
]);

/** Handle internal tool requests (region tags, context, chat). */
async function handleInternalTool(
  tool: string,
  requestId: string,
  args: Record<string, unknown>,
  transport: Transport,
): Promise<void> {
  switch (tool) {
    case "region_tags.list": {
      const result = regionTagsDb.listTags((args as { filePath?: string }).filePath);
      sendToolResponse(transport, requestId, result);
      break;
    }
    case "region_tags.create": {
      const result = regionTagsDb.createTag(args as CreateRegionTag);
      sendToolResponse(transport, requestId, result);
      break;
    }
    case "region_tags.update": {
      const { id, ...updates } = args as { id: string } & UpdateRegionTag;
      const result = regionTagsDb.updateTag(id, updates);
      if (!result) {
        sendToolResponse(transport, requestId, undefined, {
          code: "NOT_FOUND",
          message: `Tag not found: ${id}`,
        });
      } else {
        sendToolResponse(transport, requestId, result);
      }
      break;
    }
    case "region_tags.delete": {
      const deleted = regionTagsDb.deleteTag((args as { id: string }).id);
      sendToolResponse(transport, requestId, { deleted });
      break;
    }
    case "context.get_breakdown": {
      const allTags = regionTagsDb.listTags();
      const tracker = new BudgetTracker();
      const resolved = await resolveRegions(allTags.map((t) => t.id));
      let tagTokens = 0;
      for (const r of resolved) tagTokens += r.tokenEstimate;
      tracker.setTokens("taggedRegions", tagTokens);
      sendToolResponse(transport, requestId, tracker.getBreakdown());
      break;
    }
    case "context.get_items": {
      const allTags = regionTagsDb.listTags();
      const resolved = await resolveRegions(allTags.map((t) => t.id));
      const builder = new ContextBuilder();
      for (const r of resolved) {
        builder.addItem({
          id: r.tag.id,
          type: "region_tag",
          source: `${r.tag.filePath}:${r.tag.startLine}-${r.tag.endLine}`,
          content: r.content,
          pinned: r.tag.pinned,
          trimmable: !r.tag.pinned,
          tokenEstimate: r.tokenEstimate,
        });
      }
      sendToolResponse(transport, requestId, builder.build());
      break;
    }
    case "context.toggle_pin": {
      const { id: tagId } = args as { id: string };
      const tag = regionTagsDb.listTags().find((t) => t.id === tagId);
      if (!tag) {
        sendToolResponse(transport, requestId, undefined, {
          code: "NOT_FOUND",
          message: `Tag not found: ${tagId}`,
        });
      } else {
        const updated = regionTagsDb.updateTag(tagId, { pinned: !tag.pinned });
        sendToolResponse(transport, requestId, updated);
      }
      break;
    }
    case "tool_logs.list": {
      const logs = toolLogger.getRecentLogs(100);
      sendToolResponse(transport, requestId, logs);
      break;
    }
    case "chat": {
      await streamManager.simulateStream(requestId, transport);
      break;
    }
  }
}

/** Handle a tool_request via the ToolRegistry + ToolExecutor pipeline. */
async function handleRegisteredTool(
  tool: string,
  requestId: string,
  args: Record<string, unknown>,
  transport: Transport,
): Promise<void> {
  // Ensure approval gate exists for this transport
  if (!approvalGate) {
    approvalGate = new ApprovalGate(transport);
  }

  const executor = new ToolExecutor(registry, {
    workspaceRoot: process.cwd(),
    approvalGate,
    safetyConfig,
    logger: toolLogger,
  });

  const token = new CancellationToken();
  activeTokens.set(requestId, token);

  try {
    const result = await executor.execute(tool, args, requestId, token);

    if (result.error) {
      sendToolResponse(transport, requestId, undefined, result.error);
    } else {
      sendToolResponse(transport, requestId, result.result);
    }
  } finally {
    activeTokens.delete(requestId);
  }
}

/** Handle a tool_request message by dispatching to internal or registered tools. */
async function handleToolRequest(
  msg: Extract<IpcMessage, { type: "tool_request" }>,
  transport: Transport,
): Promise<void> {
  const { tool, requestId, arguments: args } = msg;
  console.log(`[handler] Tool request: ${tool} (${requestId})`);

  try {
    if (INTERNAL_TOOLS.has(tool)) {
      await handleInternalTool(tool, requestId, args, transport);
    } else if (registry.has(tool)) {
      await handleRegisteredTool(tool, requestId, args, transport);
    } else {
      sendToolResponse(transport, requestId, undefined, {
        code: "UNKNOWN_TOOL",
        message: `Unknown tool: ${tool}`,
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[handler] Tool error (${tool}):`, message);
    sendToolResponse(transport, requestId, undefined, {
      code: "TOOL_ERROR",
      message,
    });
  }
}

/** Dispatch an incoming raw message through the handler pipeline. */
export function handleMessage(raw: unknown, transport: Transport): void {
  console.log(`[handler] Received raw message type=${(raw as Record<string, unknown>)?.type}`);
  const parsed = IpcMessageSchema.safeParse(raw);

  if (!parsed.success) {
    console.error("[handler] Invalid message:", JSON.stringify(parsed.error.format()));
    console.error("[handler] Raw message was:", JSON.stringify(raw));
    return;
  }

  const msg = parsed.data;

  // Built-in handshake handler
  if (msg.type === "handshake") {
    console.log(`[handler] Handshake from client v${msg.version}`);
    transport.send({
      id: randomUUID(),
      type: "handshake_ack",
      timestamp: Date.now(),
      version: ENGINE_VERSION,
      engineId: ENGINE_ID,
    });
    return;
  }

  // Tool request dispatcher
  if (msg.type === "tool_request") {
    handleToolRequest(msg, transport).catch((err) => {
      console.error("[handler] Unhandled tool error:", err);
    });
    return;
  }

  // Approval response from UI
  if (msg.type === "approval_response") {
    if (approvalGate) {
      approvalGate.handleResponse(msg.approvalId, msg.approved);
    }
    return;
  }

  // Cancel request from UI
  if (msg.type === "cancel") {
    const token = activeTokens.get(msg.requestId);
    if (token) {
      console.log(`[handler] Cancelling request: ${msg.requestId}`);
      token.cancel();
    }
    return;
  }

  const handler = handlers.get(msg.type);
  if (handler) {
    handler(msg, transport);
  } else {
    console.warn(`[handler] No handler for message type: ${msg.type}`);
  }
}
