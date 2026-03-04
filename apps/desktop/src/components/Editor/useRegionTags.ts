import { useEffect, useCallback, useRef, useState } from "react";
import { KeyMod, KeyCode } from "monaco-editor";
import type { editor, IDisposable } from "monaco-editor";
import { useRegionTagStore } from "../../stores/regionTagStore";

/** Compute SHA-256 hex hash of text. */
async function contentHash(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

interface UseRegionTagsResult {
  showPopover: boolean;
  popoverPosition: { x: number; y: number } | null;
  selectedRange: {
    startLine: number;
    startColumn: number;
    endLine: number;
    endColumn: number;
    selectedText: string;
  } | null;
  handleCreateTag: (label: string, note?: string, pinned?: boolean) => Promise<void>;
  handleCancelPopover: () => void;
}

export function useRegionTags(
  editorInstance: editor.IStandaloneCodeEditor | null,
  filePath: string,
): UseRegionTagsResult {
  const { getTagsForFile, loadTagsForFile, createTag } = useRegionTagStore();
  const decorationsRef = useRef<string[]>([]);
  const [showPopover, setShowPopover] = useState(false);
  const [popoverPosition, setPopoverPosition] = useState<{ x: number; y: number } | null>(null);
  const [selectedRange, setSelectedRange] = useState<UseRegionTagsResult["selectedRange"]>(null);

  // Load tags when file changes
  useEffect(() => {
    if (filePath) {
      loadTagsForFile(filePath);
    }
  }, [filePath, loadTagsForFile]);

  // Apply decorations when tags change
  useEffect(() => {
    if (!editorInstance) return;

    const tags = getTagsForFile(filePath);
    const staleTags = useRegionTagStore.getState().staleTags;

    const decorations: editor.IModelDeltaDecoration[] = tags.map((tag) => {
      const isStale = staleTags.has(tag.id);
      const isPinned = tag.pinned;

      return {
        range: {
          startLineNumber: tag.startLine,
          startColumn: tag.startColumn,
          endLineNumber: tag.endLine,
          endColumn: tag.endColumn,
        },
        options: {
          className: isPinned ? "region-tag-pinned" : "region-tag-unpinned",
          glyphMarginClassName: isStale ? "region-tag-glyph-stale" : "region-tag-glyph",
          hoverMessage: {
            value: `**${tag.label}**${tag.note ? `\n\n${tag.note}` : ""}${isPinned ? "\n\n📌 Pinned" : ""}${isStale ? "\n\n⚠️ Stale" : ""}`,
          },
          isWholeLine: false,
        },
      };
    });

    decorationsRef.current = editorInstance.deltaDecorations(
      decorationsRef.current,
      decorations,
    );
  }, [editorInstance, filePath, getTagsForFile]);

  // Register Cmd+Shift+T keybinding
  useEffect(() => {
    if (!editorInstance) return;

    const disposable: IDisposable = editorInstance.addAction({
      id: "tide.tagRegion",
      label: "Tag Region",
      // eslint-disable-next-line no-bitwise
      keybindings: [KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyT],
      run: (ed) => {
        const selection = ed.getSelection();
        if (!selection || selection.isEmpty()) return;

        const model = ed.getModel();
        if (!model) return;

        const selectedText = model.getValueInRange(selection);
        if (!selectedText.trim()) return;

        // Get pixel position for popover
        const endPos = ed.getScrolledVisiblePosition({
          lineNumber: selection.endLineNumber,
          column: selection.endColumn,
        });

        const domNode = ed.getDomNode();
        if (endPos && domNode) {
          const rect = domNode.getBoundingClientRect();
          setPopoverPosition({
            x: rect.left + endPos.left,
            y: rect.top + endPos.top + endPos.height,
          });
        }

        setSelectedRange({
          startLine: selection.startLineNumber,
          startColumn: selection.startColumn,
          endLine: selection.endLineNumber,
          endColumn: selection.endColumn,
          selectedText,
        });
        setShowPopover(true);
      },
    });

    return () => disposable.dispose();
  }, [editorInstance]);

  const handleCreateTag = useCallback(
    async (label: string, note?: string, pinned = false) => {
      if (!selectedRange) return;

      const hash = await contentHash(selectedRange.selectedText);

      await createTag({
        filePath,
        startLine: selectedRange.startLine,
        startColumn: selectedRange.startColumn,
        endLine: selectedRange.endLine,
        endColumn: selectedRange.endColumn,
        label,
        note,
        pinned,
        contentHash: hash,
      });

      setShowPopover(false);
      setSelectedRange(null);

      // Reload to refresh decorations
      await loadTagsForFile(filePath);
    },
    [selectedRange, filePath, createTag, loadTagsForFile],
  );

  const handleCancelPopover = useCallback(() => {
    setShowPopover(false);
    setSelectedRange(null);
  }, []);

  return {
    showPopover,
    popoverPosition,
    selectedRange,
    handleCreateTag,
    handleCancelPopover,
  };
}
