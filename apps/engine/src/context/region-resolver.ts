import { createHash } from "node:crypto";
import * as fs from "node:fs/promises";
import { getTagsByIds } from "../persistence/region-tags.js";
import { estimateTokens } from "./token-estimator.js";
import type { RegionTag } from "@tide/shared";

export interface ResolvedRegion {
  tag: RegionTag;
  content: string;
  isStale: boolean;
  tokenEstimate: number;
}

/** Compute SHA-256 hex hash. */
function sha256(text: string): string {
  return createHash("sha256").update(text, "utf-8").digest("hex");
}

/** Extract content for a tag's line/column range from file content. */
function extractRange(
  lines: string[],
  startLine: number,
  startColumn: number,
  endLine: number,
  endColumn: number,
): string {
  if (startLine === endLine) {
    const line = lines[startLine - 1] ?? "";
    return line.slice(startColumn - 1, endColumn - 1);
  }

  const parts: string[] = [];
  for (let i = startLine; i <= endLine; i++) {
    const line = lines[i - 1] ?? "";
    if (i === startLine) {
      parts.push(line.slice(startColumn - 1));
    } else if (i === endLine) {
      parts.push(line.slice(0, endColumn - 1));
    } else {
      parts.push(line);
    }
  }
  return parts.join("\n");
}

/**
 * Resolve region tags by loading current file content, extracting the tagged
 * ranges, and computing staleness via contentHash comparison.
 */
export async function resolveRegions(tagIds: string[]): Promise<ResolvedRegion[]> {
  if (tagIds.length === 0) return [];

  const tags = getTagsByIds(tagIds);

  // Group tags by file path to minimize file reads
  const byFile = new Map<string, RegionTag[]>();
  for (const tag of tags) {
    const list = byFile.get(tag.filePath) ?? [];
    list.push(tag);
    byFile.set(tag.filePath, list);
  }

  const results: ResolvedRegion[] = [];

  for (const [filePath, fileTags] of byFile) {
    let fileContent: string;
    try {
      fileContent = await fs.readFile(filePath, "utf-8");
    } catch {
      // File no longer exists — mark all as stale with empty content
      for (const tag of fileTags) {
        results.push({
          tag,
          content: "",
          isStale: true,
          tokenEstimate: 0,
        });
      }
      continue;
    }

    const lines = fileContent.split("\n");

    for (const tag of fileTags) {
      const content = extractRange(
        lines,
        tag.startLine,
        tag.startColumn,
        tag.endLine,
        tag.endColumn,
      );
      const currentHash = sha256(content);
      const isStale = currentHash !== tag.contentHash;

      results.push({
        tag,
        content,
        isStale,
        tokenEstimate: estimateTokens(content, "code"),
      });
    }
  }

  return results;
}
