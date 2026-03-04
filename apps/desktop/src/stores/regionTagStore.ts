import { create } from "zustand";
import type { RegionTag, CreateRegionTag } from "@tide/shared";

// TODO: Rewire to Pi's tide_tags tool in Phase 5.
// Region tags will be stored as JSON in .tide/tags/ and managed by the tide-project.ts extension.

interface RegionTagState {
  tags: Map<string, RegionTag>;
  tagsByFile: Map<string, Set<string>>;
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

  loadTagsForFile: async (_filePath: string) => {
    // No-op: Region tags backend not yet connected to Pi. See Phase 5.
  },

  loadAllTags: async () => {
    // No-op: Region tags backend not yet connected to Pi. See Phase 5.
  },

  createTag: async (input: CreateRegionTag) => {
    console.warn("[regionTagStore] createTag not yet connected to Pi backend");
    // Return a stub tag so callers don't crash
    const tag: RegionTag = {
      ...input,
      id: crypto.randomUUID(),
      pinned: input.pinned ?? false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
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
    set((state) => {
      const tags = new Map(state.tags);
      tags.set(id, { ...tag, pinned: !tag.pinned, updatedAt: new Date().toISOString() });
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
