import { create } from "zustand";

export interface FsEntry {
  name: string;
  path: string;
  isDir: boolean;
  size?: number;
  children?: FsEntry[];
}

export interface OpenTab {
  path: string;
  name: string;
  content: string;
  isDirty: boolean;
  language: string;
}

interface WorkspaceState {
  rootPath: string | null;
  fileTree: FsEntry[];
  expandedDirs: Set<string>;
  openTabs: OpenTab[];
  activeTabPath: string | null;

  setRootPath: (path: string) => void;
  setFileTree: (entries: FsEntry[]) => void;
  toggleDir: (path: string) => void;
  setDirChildren: (dirPath: string, children: FsEntry[]) => void;
  openFile: (tab: OpenTab) => void;
  closeTab: (path: string) => void;
  setActiveTab: (path: string | null) => void;
  updateTabContent: (path: string, content: string) => void;
}

function insertChildren(entries: FsEntry[], dirPath: string, children: FsEntry[]): FsEntry[] {
  return entries.map((entry) => {
    if (entry.path === dirPath && entry.isDir) {
      return { ...entry, children };
    }
    if (entry.children) {
      return { ...entry, children: insertChildren(entry.children, dirPath, children) };
    }
    return entry;
  });
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  rootPath: null,
  fileTree: [],
  expandedDirs: new Set(),
  openTabs: [],
  activeTabPath: null,

  setRootPath: (path) => set({ rootPath: path }),

  setFileTree: (entries) => set({ fileTree: entries }),

  toggleDir: (path) =>
    set((state) => {
      const next = new Set(state.expandedDirs);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return { expandedDirs: next };
    }),

  setDirChildren: (dirPath, children) =>
    set((state) => ({
      fileTree: insertChildren(state.fileTree, dirPath, children),
    })),

  openFile: (tab) =>
    set((state) => {
      const existing = state.openTabs.find((t) => t.path === tab.path);
      if (existing) {
        return { activeTabPath: tab.path };
      }
      return {
        openTabs: [...state.openTabs, tab],
        activeTabPath: tab.path,
      };
    }),

  closeTab: (path) =>
    set((state) => {
      const tabs = state.openTabs.filter((t) => t.path !== path);
      let activeTabPath = state.activeTabPath;
      if (activeTabPath === path) {
        const idx = state.openTabs.findIndex((t) => t.path === path);
        activeTabPath = tabs[Math.min(idx, tabs.length - 1)]?.path ?? null;
      }
      return { openTabs: tabs, activeTabPath };
    }),

  setActiveTab: (path) => set({ activeTabPath: path }),

  updateTabContent: (path, content) =>
    set((state) => ({
      openTabs: state.openTabs.map((t) =>
        t.path === path ? { ...t, content, isDirty: true } : t,
      ),
    })),
}));
