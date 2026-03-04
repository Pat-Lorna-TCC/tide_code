import * as fs from "node:fs/promises";
import * as path from "node:path";

export interface FsReadArgs {
  path: string;
  startLine?: number;
  endLine?: number;
}

export interface FsReadResult {
  content: string;
  totalLines: number;
  language: string;
}

const EXTENSION_LANGUAGES: Record<string, string> = {
  ".ts": "typescript",
  ".tsx": "typescriptreact",
  ".js": "javascript",
  ".jsx": "javascriptreact",
  ".rs": "rust",
  ".json": "json",
  ".jsonc": "json",
  ".md": "markdown",
  ".html": "html",
  ".htm": "html",
  ".css": "css",
  ".scss": "scss",
  ".less": "less",
  ".yaml": "yaml",
  ".yml": "yaml",
  ".toml": "toml",
  ".xml": "xml",
  ".svg": "xml",
  ".py": "python",
  ".go": "go",
  ".java": "java",
  ".c": "c",
  ".h": "c",
  ".cpp": "cpp",
  ".hpp": "cpp",
  ".sh": "shellscript",
  ".bash": "shellscript",
  ".zsh": "shellscript",
  ".sql": "sql",
  ".graphql": "graphql",
  ".vue": "vue",
  ".svelte": "svelte",
  ".lock": "plaintext",
};

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

function detectLanguage(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return EXTENSION_LANGUAGES[ext] ?? "plaintext";
}

function isBinary(buffer: Buffer): boolean {
  // Check first 8KB for null bytes (common binary indicator)
  const checkLen = Math.min(buffer.length, 8192);
  for (let i = 0; i < checkLen; i++) {
    if (buffer[i] === 0) return true;
  }
  return false;
}

export async function fsRead(args: FsReadArgs): Promise<FsReadResult> {
  const filePath = args.path;

  const stat = await fs.stat(filePath);
  if (stat.isDirectory()) {
    throw new Error("Path is a directory, not a file");
  }
  if (stat.size > MAX_FILE_SIZE) {
    throw new Error(`File too large: ${stat.size} bytes (max ${MAX_FILE_SIZE})`);
  }

  const rawBuffer = await fs.readFile(filePath);

  if (isBinary(rawBuffer)) {
    throw new Error("Binary file detected, cannot read as text");
  }

  const fullContent = rawBuffer.toString("utf-8");
  const lines = fullContent.split("\n");
  const totalLines = lines.length;

  let content: string;
  if (args.startLine != null || args.endLine != null) {
    const start = Math.max(0, (args.startLine ?? 1) - 1);
    const end = Math.min(totalLines, args.endLine ?? totalLines);
    content = lines.slice(start, end).join("\n");
  } else {
    content = fullContent;
  }

  return {
    content,
    totalLines,
    language: detectLanguage(filePath),
  };
}
