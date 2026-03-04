import type { DiffHunk } from "./patch-parser.js";

export interface PatchResult {
  result: string;
  linesAdded: number;
  linesRemoved: number;
}

/**
 * Apply parsed diff hunks to original file content.
 * Hunks are applied sequentially with cumulative line offset tracking.
 */
export function applyPatch(original: string, hunks: DiffHunk[]): PatchResult {
  const originalLines = original.split("\n");
  let resultLines = [...originalLines];
  let linesAdded = 0;
  let linesRemoved = 0;

  // Cumulative offset: as hunks add/remove lines, subsequent hunk positions shift
  let offset = 0;

  for (let h = 0; h < hunks.length; h++) {
    const hunk = hunks[h];
    // Convert 1-indexed oldStart to 0-indexed, apply cumulative offset
    const startIdx = hunk.oldStart - 1 + offset;

    // Verify context lines match (basic validation)
    verifyContext(resultLines, startIdx, hunk);

    // Build the replacement lines for this hunk
    const newLines: string[] = [];
    let removeCount = 0;

    for (const line of hunk.lines) {
      switch (line.type) {
        case "context":
          newLines.push(line.content);
          removeCount++;
          break;
        case "add":
          newLines.push(line.content);
          linesAdded++;
          break;
        case "remove":
          removeCount++;
          linesRemoved++;
          break;
      }
    }

    // Splice: remove old lines, insert new lines
    resultLines.splice(startIdx, removeCount, ...newLines);

    // Update offset for subsequent hunks
    offset += newLines.length - removeCount;
  }

  return {
    result: resultLines.join("\n"),
    linesAdded,
    linesRemoved,
  };
}

/**
 * Verify that context lines in the hunk match the file content at the expected position.
 * Throws a descriptive error on mismatch.
 */
function verifyContext(
  lines: string[],
  startIdx: number,
  hunk: DiffHunk,
): void {
  let fileIdx = startIdx;

  for (const line of hunk.lines) {
    if (line.type === "context" || line.type === "remove") {
      if (fileIdx >= lines.length) {
        throw new Error(
          `Patch context mismatch at hunk @@ -${hunk.oldStart},${hunk.oldCount} @@: ` +
            `expected line ${fileIdx + 1} but file only has ${lines.length} lines`,
        );
      }
      if (lines[fileIdx] !== line.content) {
        throw new Error(
          `Patch context mismatch at line ${fileIdx + 1} ` +
            `(hunk @@ -${hunk.oldStart},${hunk.oldCount} @@): ` +
            `expected "${line.content}" but found "${lines[fileIdx]}"`,
        );
      }
      fileIdx++;
    }
  }
}
