export interface DiffLine {
  type: "context" | "add" | "remove";
  content: string;
}

export interface DiffHunk {
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  lines: DiffLine[];
}

export interface ParsedPatch {
  hunks: DiffHunk[];
  headerLines: string[];
}

const HUNK_HEADER_RE = /^@@\s+-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s+@@/;

/**
 * Parse a unified diff string into structured hunks.
 * Handles multiple hunks, no-newline markers, and file creation patches.
 */
export function parseUnifiedDiff(patch: string): ParsedPatch {
  const lines = patch.split("\n");
  const headerLines: string[] = [];
  const hunks: DiffHunk[] = [];
  let currentHunk: DiffHunk | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Skip the "\ No newline at end of file" marker
    if (line.startsWith("\\ ")) continue;

    // Try to match a hunk header
    const hunkMatch = HUNK_HEADER_RE.exec(line);
    if (hunkMatch) {
      if (currentHunk) {
        hunks.push(currentHunk);
      }
      currentHunk = {
        oldStart: parseInt(hunkMatch[1], 10),
        oldCount: hunkMatch[2] !== undefined ? parseInt(hunkMatch[2], 10) : 1,
        newStart: parseInt(hunkMatch[3], 10),
        newCount: hunkMatch[4] !== undefined ? parseInt(hunkMatch[4], 10) : 1,
        lines: [],
      };
      continue;
    }

    // If we haven't seen a hunk yet, this is a header line
    if (!currentHunk) {
      // Collect --- and +++ and other header lines
      if (line.length > 0) {
        headerLines.push(line);
      }
      continue;
    }

    // Inside a hunk: classify lines
    if (line.startsWith("+")) {
      currentHunk.lines.push({ type: "add", content: line.substring(1) });
    } else if (line.startsWith("-")) {
      currentHunk.lines.push({ type: "remove", content: line.substring(1) });
    } else if (line.startsWith(" ")) {
      currentHunk.lines.push({ type: "context", content: line.substring(1) });
    } else if (line === "" && i === lines.length - 1) {
      // Trailing empty line — ignore
    } else {
      // Treat unrecognized lines as context (e.g., missing leading space)
      currentHunk.lines.push({ type: "context", content: line });
    }
  }

  // Push the last hunk
  if (currentHunk) {
    hunks.push(currentHunk);
  }

  return { hunks, headerLines };
}
