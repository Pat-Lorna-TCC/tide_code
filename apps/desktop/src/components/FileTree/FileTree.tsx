import { useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useWorkspaceStore, type FsEntry } from "../../stores/workspace";
import { FileIcon } from "./FileIcon";
import styles from "./FileTree.module.css";

interface RawFsEntry {
  name: string;
  path: string;
  type: "file" | "directory" | "symlink";
  size?: number;
}

function toFsEntries(raw: RawFsEntry[]): FsEntry[] {
  return raw.map((e) => ({
    name: e.name,
    path: e.path,
    isDir: e.type === "directory",
    size: e.size,
  }));
}

function TreeItem({ entry, depth }: { entry: FsEntry; depth: number }) {
  const { expandedDirs, toggleDir, setDirChildren, activeTabPath } =
    useWorkspaceStore();
  const openFile = useWorkspaceStore((s) => s.openFile);
  const isOpen = expandedDirs.has(entry.path);

  const handleClick = useCallback(async () => {
    if (entry.isDir) {
      toggleDir(entry.path);
      // Lazy load children if not loaded yet
      if (!isOpen && !entry.children) {
        try {
          const result = await invoke<RawFsEntry[]>("fs_list_dir", {
            path: entry.path,
          });
          setDirChildren(entry.path, toFsEntries(result));
        } catch (err) {
          console.error("fs_list error:", err);
        }
      }
    } else {
      // Open file in editor
      try {
        const result = await invoke<{
          content: string;
          totalLines: number;
          language: string;
        }>("fs_read_file", { path: entry.path });
        openFile({
          path: entry.path,
          name: entry.name,
          content: result.content,
          isDirty: false,
          language: result.language,
        });
      } catch (err) {
        console.error("fs_read error:", err);
      }
    }
  }, [entry, isOpen, toggleDir, setDirChildren, openFile]);

  const isActive = activeTabPath === entry.path;

  return (
    <>
      <div
        className={`${styles.item} ${isActive ? styles.itemActive : ""}`}
        style={{ paddingLeft: 8 + depth * 16 }}
        onClick={handleClick}
      >
        {entry.isDir ? (
          <svg
            className={`${styles.chevron} ${isOpen ? styles.chevronOpen : ""}`}
            viewBox="0 0 12 12"
          >
            <path d="M4 2l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        ) : (
          <span className={styles.chevronPlaceholder} />
        )}
        <span className={styles.icon}>
          <FileIcon name={entry.name} isDir={entry.isDir} isOpen={isOpen} />
        </span>
        <span className={`${styles.name} ${entry.isDir ? styles.dirName : ""}`}>
          {entry.name}
        </span>
      </div>
      {entry.isDir && isOpen && entry.children && (
        <>
          {entry.children.map((child) => (
            <TreeItem key={child.path} entry={child} depth={depth + 1} />
          ))}
        </>
      )}
    </>
  );
}

export function FileTree() {
  const { fileTree, rootPath } = useWorkspaceStore();

  if (!rootPath) {
    return (
      <div className={styles.tree} style={{ padding: 16, color: "var(--text-secondary)" }}>
        No folder open
      </div>
    );
  }

  return (
    <div className={styles.tree}>
      {fileTree.map((entry) => (
        <TreeItem key={entry.path} entry={entry} depth={0} />
      ))}
    </div>
  );
}
