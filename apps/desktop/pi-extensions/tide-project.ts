import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import * as fs from "node:fs";
import * as path from "node:path";

interface RegionTag {
  id: string;
  filePath: string;
  startLine: number;
  endLine: number;
  label: string;
  note?: string;
  pinned: boolean;
  createdAt: string;
}

function ensureTideDir(workspaceRoot: string): void {
  const tideDir = path.join(workspaceRoot, ".tide");
  if (!fs.existsSync(tideDir)) {
    fs.mkdirSync(tideDir, { recursive: true });
  }
  const tagsDir = path.join(tideDir, "tags");
  if (!fs.existsSync(tagsDir)) {
    fs.mkdirSync(tagsDir, { recursive: true });
  }
}

function loadTags(workspaceRoot: string): RegionTag[] {
  const tagsFile = path.join(workspaceRoot, ".tide", "tags", "tags.json");
  if (!fs.existsSync(tagsFile)) return [];
  try {
    return JSON.parse(fs.readFileSync(tagsFile, "utf-8"));
  } catch {
    return [];
  }
}

function formatTagsForContext(tags: RegionTag[]): string {
  if (tags.length === 0) return "";

  let ctx = "## Pinned Region Tags\n\n";
  for (const tag of tags) {
    ctx += `- **${tag.label}** (${tag.filePath}:${tag.startLine}-${tag.endLine})`;
    if (tag.note) ctx += ` — ${tag.note}`;
    ctx += "\n";
  }
  return ctx;
}

export default function tideProject(pi: ExtensionAPI) {
  pi.on("session_start", async (_event, ctx) => {
    ensureTideDir(ctx.cwd);
  });

  // Inject .tide/ context before each agent conversation
  pi.on("before_agent_start", async (_event, ctx) => {
    const workspaceRoot = ctx.cwd;
    const parts: string[] = [];

    // Read TIDE.md for project-specific instructions
    const tideMdPath = path.join(workspaceRoot, "TIDE.md");
    if (fs.existsSync(tideMdPath)) {
      try {
        const content = fs.readFileSync(tideMdPath, "utf-8");
        parts.push(`# Project Configuration (TIDE.md)\n\n${content}`);
      } catch { /* ignore */ }
    }

    // Inject pinned region tags as context
    const tags = loadTags(workspaceRoot);
    const pinnedTags = tags.filter((t) => t.pinned);
    if (pinnedTags.length > 0) {
      parts.push(formatTagsForContext(pinnedTags));
    }

    if (parts.length > 0) {
      return {
        systemPrompt: (_event as any).systemPrompt + "\n\n" + parts.join("\n\n"),
      };
    }
  });

  // Register custom tool for agent to query region tags
  pi.registerTool({
    name: "tide_tags",
    description: "List region tags for a file or the entire workspace. Region tags are user-annotated code regions.",
    parameters: Type.Object({
      filePath: Type.Optional(Type.String({ description: "Filter tags by file path" })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const tags = loadTags(ctx.cwd);
      const filtered = params.filePath
        ? tags.filter((t) => t.filePath === params.filePath)
        : tags;

      return {
        content: [{ type: "text" as const, text: JSON.stringify(filtered, null, 2) }],
        details: { count: filtered.length },
      };
    },
  });
}
