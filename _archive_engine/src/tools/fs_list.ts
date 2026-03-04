import * as fs from "node:fs/promises";
import * as path from "node:path";

export interface FsListArgs {
  path: string;
  recursive?: boolean;
  maxDepth?: number;
}

export interface FsEntry {
  name: string;
  path: string;
  type: "file" | "directory" | "symlink";
  size?: number;
}

export async function fsList(args: FsListArgs): Promise<FsEntry[]> {
  const targetPath = args.path;
  const recursive = args.recursive ?? false;
  const maxDepth = args.maxDepth ?? 1;

  return listDir(targetPath, recursive, maxDepth, 0);
}

async function listDir(
  dirPath: string,
  recursive: boolean,
  maxDepth: number,
  currentDepth: number,
): Promise<FsEntry[]> {
  const entries: FsEntry[] = [];

  const dirents = await fs.readdir(dirPath, { withFileTypes: true });

  // Sort: directories first, then files, alphabetical within each group
  dirents.sort((a, b) => {
    const aIsDir = a.isDirectory() ? 0 : 1;
    const bIsDir = b.isDirectory() ? 0 : 1;
    if (aIsDir !== bIsDir) return aIsDir - bIsDir;
    return a.name.localeCompare(b.name);
  });

  for (const dirent of dirents) {
    // Skip hidden files/dirs and common noise
    if (dirent.name.startsWith(".") && dirent.name !== ".tide") continue;
    if (dirent.name === "node_modules" || dirent.name === "target" || dirent.name === "dist") continue;

    const fullPath = path.join(dirPath, dirent.name);
    const entry: FsEntry = {
      name: dirent.name,
      path: fullPath,
      type: dirent.isDirectory()
        ? "directory"
        : dirent.isSymbolicLink()
          ? "symlink"
          : "file",
    };

    if (!dirent.isDirectory()) {
      try {
        const stat = await fs.stat(fullPath);
        entry.size = stat.size;
      } catch {
        // skip stat errors
      }
    }

    entries.push(entry);

    if (recursive && dirent.isDirectory() && currentDepth < maxDepth - 1) {
      try {
        const children = await listDir(fullPath, recursive, maxDepth, currentDepth + 1);
        entries.push(...children);
      } catch {
        // skip inaccessible directories
      }
    }
  }

  return entries;
}
