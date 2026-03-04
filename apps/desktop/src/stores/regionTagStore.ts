import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import type { RegionTag, CreateRegionTag } from "@tide/shared";

interface RegionTagState {
  /** All tags indexed by id. */
  tags: Map<string, RegionTag>;
  /** Tag ids grouped by file path. */
  tagsByFile: Map<string, Set<string>>;
  /** Tag ids that have stale content (hash mismatch). */
  staleTags: Set<string>;

  loadTagsForFile: (filePath: string) => Promise<void>;
  loadAllTags: () => Promise<void>;
  createTag: (input: CreateRegionTag) => Promise<RegionTag>;
  deleteTag: (id: string) => Promise<void>;
  togglePin: (id: string) => Promise<void>;
  markStale: (id: string) => void;
  markFresh: (id: string) => void;
  getTagsForFile: (filePath: string) => RegionTag[];
}

export const useRegionTagStore = create<RegionTagState>((set, get) => ({
  tags: new Map(),
  tagsByFile: new Map(),
  staleTags: new Set(),

  loadTagsForFile: async (filePath: string) => {
    const result = await invoke<RegionTag[]>("region_tags_list", { filePath });
    set((state) => {
      const tags = new Map(state.tags);
      const tagsByFile = new Map(state.tagsByFile);
      const fileSet = new Set<string>();
      for (const tag of result) {
        tags.set(tag.id, tag);
        fileSet.add(tag.id);
      }
      tagsByFile.set(filePath, fileSet);
      return { tags, tagsByFile };
    });
  },

  loadAllTags: async () => {
    const result = await invoke<RegionTag[]>("region_tags_list", {});
    set(() => {
      const tags = new Map<string, RegionTag>();
      const tagsByFile = new Map<string, Set<string>>();
      for (const tag of result) {
        tags.set(tag.id, tag);
        const fileSet = tagsByFile.get(tag.filePath) ?? new Set();
        fileSet.add(tag.id);
        tagsByFile.set(tag.filePath, fileSet);
      }
      return { tags, tagsByFile, staleTags: new Set() };
    });
  },

  createTag: async (input: CreateRegionTag) => {
    const tag = await invoke<RegionTag>("region_tags_create", { tag: input });
    set((state) => {
      const tags = new Map(state.tags);
      tags.set(tag.id, tag);
      const tagsByFile = new Map(state.tagsByFile);
      const fileSet = new Set(tagsByFile.get(tag.filePath) ?? []);
      fileSet.add(tag.id);
      tagsByFile.set(tag.filePath, fileSet);
      return { tags, tagsByFile };
    });
    return tag;
  },

  deleteTag: async (id: string) => {
    const tag = get().tags.get(id);
    await invoke("region_tags_delete", { id });
    set((state) => {
      const tags = new Map(state.tags);
      tags.delete(id);
      const tagsByFile = new Map(state.tagsByFile);
      if (tag) {
        const fileSet = new Set(tagsByFile.get(tag.filePath) ?? []);
        fileSet.delete(id);
        tagsByFile.set(tag.filePath, fileSet);
      }
      const staleTags = new Set(state.staleTags);
      staleTags.delete(id);
      return { tags, tagsByFile, staleTags };
    });
  },

  togglePin: async (id: string) => {
    const tag = get().tags.get(id);
    if (!tag) return;
    const newPinned = !tag.pinned;
    const updated = await invoke<RegionTag>("region_tags_update", {
      id,
      updates: { pinned: newPinned },
    });
    set((state) => {
      const tags = new Map(state.tags);
      tags.set(id, updated);
      return { tags };
    });
  },

  markStale: (id: string) =>
    set((state) => {
      const staleTags = new Set(state.staleTags);
      staleTags.add(id);
      return { staleTags };
    }),

  markFresh: (id: string) =>
    set((state) => {
      const staleTags = new Set(state.staleTags);
      staleTags.delete(id);
      return { staleTags };
    }),

  getTagsForFile: (filePath: string) => {
    const state = get();
    const ids = state.tagsByFile.get(filePath);
    if (!ids) return [];
    return Array.from(ids)
      .map((id) => state.tags.get(id))
      .filter((t): t is RegionTag => t !== undefined);
  },
}));
