import { IpcMessageSchema } from "@tide/shared";
import type { IpcMessage } from "@tide/shared";
import { Transport } from "./transport.js";
import { StreamManager } from "../stream/manager.js";
import { fsList } from "../tools/fs_list.js";
import { fsRead } from "../tools/fs_read.js";
import * as regionTagsDb from "../persistence/region-tags.js";
import { BudgetTracker } from "../context/budget-tracker.js";
import { ContextBuilder } from "../context/context-builder.js";
import { resolveRegions } from "../context/region-resolver.js";
import { estimateTokens } from "../context/token-estimator.js";
import type { CreateRegionTag, UpdateRegionTag } from "@tide/shared";
import { randomUUID } from "node:crypto";

const ENGINE_VERSION = "0.1.0";
const ENGINE_ID = randomUUID();
const streamManager = new StreamManager();

export type MessageHandler = (msg: IpcMessage, transport: Transport) => void;

const handlers = new Map<string, MessageHandler>();

/** Register a handler for a specific message type. */
export function registerHandler(type: string, handler: MessageHandler): void {
  handlers.set(type, handler);
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

/** Handle a tool_request message by dispatching to the appropriate tool. */
async function handleToolRequest(
  msg: Extract<IpcMessage, { type: "tool_request" }>,
  transport: Transport,
): Promise<void> {
  const { tool, requestId, arguments: args } = msg;
  console.log(`[handler] Tool request: ${tool} (${requestId})`);

  try {
    switch (tool) {
      case "fs_list": {
        console.log(`[handler] fs_list: path=${(args as { path: string }).path}`);
        const result = await fsList(args as { path: string; recursive?: boolean; maxDepth?: number });
        console.log(`[handler] fs_list: returning ${result.length} entries`);
        sendToolResponse(transport, requestId, result);
        console.log(`[handler] fs_list: response sent for ${requestId}`);
        break;
      }
      case "fs_read": {
        const result = await fsRead(args as { path: string; startLine?: number; endLine?: number });
        sendToolResponse(transport, requestId, result);
        break;
      }
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
        // Build a budget breakdown from all tags
        const allTags = regionTagsDb.listTags();
        const tracker = new BudgetTracker();
        const resolved = await resolveRegions(allTags.map((t) => t.id));
        let tagTokens = 0;
        for (const r of resolved) {
          tagTokens += r.tokenEstimate;
        }
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
        const pack = builder.build();
        sendToolResponse(transport, requestId, pack);
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
      case "chat": {
        // Legacy streaming demo
        await streamManager.simulateStream(requestId, transport);
        break;
      }
      default:
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

  const handler = handlers.get(msg.type);
  if (handler) {
    handler(msg, transport);
  } else {
    console.warn(`[handler] No handler for message type: ${msg.type}`);
  }
}
