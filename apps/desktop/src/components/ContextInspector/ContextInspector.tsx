import { useEffect, useState, useMemo } from "react";
import { useContextStore, type ContextItem } from "../../stores/contextStore";

const TYPE_ICONS: Record<string, string> = {
  tide_rules: "R",
  project_spec: "P",
  feature_plan: "F",
  region_tag: "T",
  file_snippet: "S",
  repo_map: "M",
  session_summary: "H",
  user_attachment: "A",
};

const TYPE_LABELS: Record<string, string> = {
  tide_rules: "Tide Rules",
  project_spec: "Project Spec",
  feature_plan: "Feature Plan",
  region_tag: "Region Tag",
  file_snippet: "File Snippet",
  repo_map: "Repo Map",
  session_summary: "Session Summary",
  user_attachment: "Attachment",
};

type FilterType = "all" | string;

export function ContextInspector() {
  const { contextPack, inspectorOpen, closeInspector, refreshItems, togglePin } =
    useContextStore();
  const [filter, setFilter] = useState<FilterType>("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (inspectorOpen) {
      refreshItems();
    }
  }, [inspectorOpen, refreshItems]);

  const allItems = useMemo(() => {
    if (!contextPack) return [];
    return [...contextPack.items, ...contextPack.trimmedItems];
  }, [contextPack]);

  const filteredItems = useMemo(() => {
    let items = allItems;
    if (filter !== "all") {
      items = items.filter((i) => i.type === filter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter(
        (i) =>
          i.source.toLowerCase().includes(q) ||
          i.content.toLowerCase().includes(q),
      );
    }
    return items;
  }, [allItems, filter, search]);

  const trimmedIds = useMemo(() => {
    if (!contextPack) return new Set<string>();
    return new Set(contextPack.trimmedItems.map((i) => i.id));
  }, [contextPack]);

  // Unique types for filter dropdown
  const availableTypes = useMemo(() => {
    const types = new Set(allItems.map((i) => i.type));
    return Array.from(types).sort();
  }, [allItems]);

  if (!inspectorOpen) return null;

  return (
    <div style={s.overlay}>
      <div style={s.panel}>
        <div style={s.header}>
          <span style={s.title}>Context Inspector</span>
          <button style={s.closeBtn} onClick={closeInspector} type="button">
            x
          </button>
        </div>

        {/* Summary */}
        {contextPack && (
          <div style={s.summary}>
            <span>
              {contextPack.items.length} items | {contextPack.totalTokens.toLocaleString()} / {contextPack.budgetTokens.toLocaleString()} tokens
            </span>
            <span style={{ color: contextPack.usagePercent > 0.9 ? "var(--error)" : "var(--text-secondary)" }}>
              {Math.round(contextPack.usagePercent * 100)}% used
            </span>
          </div>
        )}

        {/* Filters */}
        <div style={s.filters}>
          <input
            style={s.searchInput}
            type="text"
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            style={s.filterSelect}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="all">All types</option>
            {availableTypes.map((t) => (
              <option key={t} value={t}>
                {TYPE_LABELS[t] ?? t}
              </option>
            ))}
          </select>
        </div>

        {/* Trimmed warning */}
        {contextPack && contextPack.trimmedItems.length > 0 && (
          <div style={s.trimWarning}>
            {contextPack.trimmedItems.length} items trimmed from context
          </div>
        )}

        {/* Item list */}
        <div style={s.itemList}>
          {filteredItems.length === 0 ? (
            <div style={s.emptyState}>No context items</div>
          ) : (
            filteredItems.map((item) => (
              <ContextItemRow
                key={item.id}
                item={item}
                isTrimmed={trimmedIds.has(item.id)}
                onTogglePin={() => togglePin(item.id)}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function ContextItemRow({
  item,
  isTrimmed,
  onTogglePin,
}: {
  item: ContextItem;
  isTrimmed: boolean;
  onTogglePin: () => void;
}) {
  return (
    <div style={{ ...s.itemRow, opacity: isTrimmed ? 0.5 : 1 }}>
      <span style={s.typeIcon} title={TYPE_LABELS[item.type] ?? item.type}>
        {TYPE_ICONS[item.type] ?? "?"}
      </span>
      <div style={s.itemInfo}>
        <div style={s.itemSource}>{item.source}</div>
        <div style={s.itemMeta}>
          {item.tokenEstimate.toLocaleString()} tokens
          {isTrimmed && <span style={s.trimBadge}>trimmed</span>}
        </div>
      </div>
      <button
        style={{ ...s.pinBtn, color: item.pinned ? "var(--accent)" : "var(--text-secondary)" }}
        onClick={onTogglePin}
        title={item.pinned ? "Unpin" : "Pin to context"}
        type="button"
      >
        {item.pinned ? "P" : "o"}
      </button>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.4)",
    zIndex: 500,
    display: "flex",
    justifyContent: "flex-end",
  },
  panel: {
    width: 400,
    maxWidth: "80vw",
    height: "100%",
    background: "var(--bg-secondary)",
    borderLeft: "1px solid var(--border)",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    height: 36,
    padding: "0 12px",
    borderBottom: "1px solid var(--border)",
    flexShrink: 0,
  },
  title: {
    fontSize: "var(--font-size-sm)",
    fontWeight: 600,
    color: "var(--text-bright)",
  },
  closeBtn: {
    background: "transparent",
    border: "none",
    color: "var(--text-secondary)",
    cursor: "pointer",
    fontSize: 14,
    fontFamily: "var(--font-mono)",
    padding: "2px 6px",
  },
  summary: {
    display: "flex",
    justifyContent: "space-between",
    padding: "8px 12px",
    fontSize: "var(--font-size-xs)",
    color: "var(--text-secondary)",
    borderBottom: "1px solid var(--border)",
    flexShrink: 0,
  },
  filters: {
    display: "flex",
    gap: 6,
    padding: "8px 12px",
    borderBottom: "1px solid var(--border)",
    flexShrink: 0,
  },
  searchInput: {
    flex: 1,
    background: "var(--bg-input)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-sm)",
    padding: "4px 8px",
    fontSize: "var(--font-size-xs)",
    color: "var(--text-primary)",
    outline: "none",
    fontFamily: "var(--font-ui)",
  },
  filterSelect: {
    background: "var(--bg-input)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-sm)",
    padding: "4px 6px",
    fontSize: "var(--font-size-xs)",
    color: "var(--text-primary)",
    outline: "none",
    fontFamily: "var(--font-ui)",
  },
  trimWarning: {
    padding: "6px 12px",
    fontSize: "var(--font-size-xs)",
    color: "var(--warning)",
    background: "rgba(234, 179, 8, 0.08)",
    borderBottom: "1px solid var(--border)",
    flexShrink: 0,
  },
  itemList: {
    flex: 1,
    overflow: "auto",
    padding: "4px 0",
  },
  emptyState: {
    padding: 24,
    textAlign: "center" as const,
    color: "var(--text-secondary)",
    fontStyle: "italic",
    fontSize: "var(--font-size-sm)",
  },
  itemRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "6px 12px",
    borderBottom: "1px solid rgba(60,60,60,0.3)",
  },
  typeIcon: {
    width: 22,
    height: 22,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: "var(--radius-sm)",
    background: "var(--bg-tertiary)",
    color: "var(--accent)",
    fontSize: "var(--font-size-xs)",
    fontWeight: 700,
    fontFamily: "var(--font-mono)",
    flexShrink: 0,
  },
  itemInfo: {
    flex: 1,
    minWidth: 0,
  },
  itemSource: {
    fontSize: "var(--font-size-xs)",
    color: "var(--text-primary)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
  },
  itemMeta: {
    fontSize: 10,
    color: "var(--text-secondary)",
    display: "flex",
    alignItems: "center",
    gap: 6,
  },
  trimBadge: {
    fontSize: 9,
    padding: "1px 4px",
    borderRadius: 2,
    background: "rgba(234, 179, 8, 0.15)",
    color: "var(--warning)",
  },
  pinBtn: {
    background: "transparent",
    border: "none",
    cursor: "pointer",
    fontSize: 14,
    fontFamily: "var(--font-mono)",
    padding: "2px 4px",
    flexShrink: 0,
  },
};
