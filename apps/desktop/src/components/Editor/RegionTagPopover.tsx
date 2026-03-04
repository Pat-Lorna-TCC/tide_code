import { useState, useRef, useEffect, useCallback } from "react";

interface RegionTagPopoverProps {
  position: { x: number; y: number };
  onCreateTag: (label: string, note?: string, pinned?: boolean) => Promise<void>;
  onCancel: () => void;
}

export function RegionTagPopover({ position, onCreateTag, onCancel }: RegionTagPopoverProps) {
  const [label, setLabel] = useState("");
  const [note, setNote] = useState("");
  const [pinned, setPinned] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const labelRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    labelRef.current?.focus();
  }, []);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onCancel();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onCancel]);

  const handleSubmit = useCallback(async () => {
    if (!label.trim() || submitting) return;
    setSubmitting(true);
    try {
      await onCreateTag(label.trim(), note.trim() || undefined, pinned);
    } finally {
      setSubmitting(false);
    }
  }, [label, note, pinned, submitting, onCreateTag]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      } else if (e.key === "Escape") {
        onCancel();
      }
    },
    [handleSubmit, onCancel],
  );

  return (
    <div ref={containerRef} style={{ ...s.container, left: position.x, top: position.y }} onKeyDown={handleKeyDown}>
      <div style={s.header}>Tag Region</div>
      <input
        ref={labelRef}
        style={s.input}
        type="text"
        placeholder="Label (required)"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
      />
      <textarea
        style={s.textarea}
        placeholder="Note (optional)"
        value={note}
        rows={2}
        onChange={(e) => setNote(e.target.value)}
      />
      <label style={s.checkboxRow}>
        <input
          type="checkbox"
          checked={pinned}
          onChange={(e) => setPinned(e.target.checked)}
        />
        <span>Pin to context</span>
      </label>
      <div style={s.actions}>
        <button style={s.cancelBtn} onClick={onCancel} type="button">
          Cancel
        </button>
        <button
          style={{ ...s.createBtn, opacity: label.trim() ? 1 : 0.5 }}
          onClick={handleSubmit}
          disabled={!label.trim() || submitting}
          type="button"
        >
          {submitting ? "Creating..." : "Create"}
        </button>
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  container: {
    position: "fixed",
    zIndex: 1000,
    width: 280,
    background: "var(--bg-tertiary)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-md)",
    boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
    padding: 12,
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  header: {
    fontSize: "var(--font-size-sm)",
    fontWeight: 600,
    color: "var(--text-bright)",
  },
  input: {
    background: "var(--bg-primary)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-sm)",
    padding: "6px 8px",
    fontSize: "var(--font-size-sm)",
    color: "var(--text-primary)",
    outline: "none",
    fontFamily: "var(--font-ui)",
  },
  textarea: {
    background: "var(--bg-primary)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-sm)",
    padding: "6px 8px",
    fontSize: "var(--font-size-sm)",
    color: "var(--text-primary)",
    outline: "none",
    fontFamily: "var(--font-ui)",
    resize: "vertical" as const,
  },
  checkboxRow: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: "var(--font-size-xs)",
    color: "var(--text-secondary)",
    cursor: "pointer",
  },
  actions: {
    display: "flex",
    justifyContent: "flex-end",
    gap: 6,
  },
  cancelBtn: {
    padding: "4px 12px",
    fontSize: "var(--font-size-xs)",
    fontFamily: "var(--font-ui)",
    color: "var(--text-secondary)",
    background: "transparent",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-sm)",
    cursor: "pointer",
  },
  createBtn: {
    padding: "4px 12px",
    fontSize: "var(--font-size-xs)",
    fontFamily: "var(--font-ui)",
    color: "white",
    background: "var(--accent)",
    border: "none",
    borderRadius: "var(--radius-sm)",
    cursor: "pointer",
  },
};
