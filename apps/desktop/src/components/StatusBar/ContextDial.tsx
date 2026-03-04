import { useEffect, useRef, useState } from "react";
import { useContextStore, type BudgetBreakdown } from "../../stores/contextStore";

const DIAL_SIZE = 18;
const STROKE_WIDTH = 2.5;
const RADIUS = (DIAL_SIZE - STROKE_WIDTH) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const COLORS: Record<string, string> = {
  green: "#22c55e",
  yellow: "#eab308",
  red: "#ef4444",
};

export function ContextDial() {
  const { breakdown, refreshBreakdown, openInspector } = useContextStore();
  const [showTooltip, setShowTooltip] = useState(false);
  const dialRef = useRef<HTMLDivElement>(null);

  // Poll for breakdown updates
  useEffect(() => {
    refreshBreakdown();
    const interval = setInterval(refreshBreakdown, 5000);
    return () => clearInterval(interval);
  }, [refreshBreakdown]);

  const usagePercent = breakdown?.usagePercent ?? 0;
  const color = COLORS[breakdown?.thresholdColor ?? "green"];
  const dashOffset = CIRCUMFERENCE * (1 - Math.min(usagePercent, 1));
  const displayPercent = Math.round(usagePercent * 100);

  return (
    <div
      ref={dialRef}
      style={s.container}
      onClick={openInspector}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
      title=""
    >
      <svg width={DIAL_SIZE} height={DIAL_SIZE} style={{ transform: "rotate(-90deg)" }}>
        {/* Background circle */}
        <circle
          cx={DIAL_SIZE / 2}
          cy={DIAL_SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke="rgba(255,255,255,0.1)"
          strokeWidth={STROKE_WIDTH}
        />
        {/* Progress arc */}
        <circle
          cx={DIAL_SIZE / 2}
          cy={DIAL_SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke={color}
          strokeWidth={STROKE_WIDTH}
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.3s, stroke 0.3s" }}
        />
      </svg>
      <span style={{ ...s.label, color }}>{displayPercent}%</span>

      {showTooltip && breakdown && (
        <DialTooltip breakdown={breakdown} />
      )}
    </div>
  );
}

function DialTooltip({ breakdown }: { breakdown: BudgetBreakdown }) {
  return (
    <div style={s.tooltip}>
      <div style={s.tooltipHeader}>
        Context Budget: {Math.round(breakdown.usagePercent * 100)}%
      </div>
      <div style={s.tooltipRow}>
        <span>Used</span>
        <span>{breakdown.totalTokens.toLocaleString()} tokens</span>
      </div>
      <div style={s.tooltipRow}>
        <span>Budget</span>
        <span>{breakdown.budgetTokens.toLocaleString()} tokens</span>
      </div>
      {breakdown.categories.length > 0 && (
        <>
          <div style={s.tooltipDivider} />
          {breakdown.categories.map((cat) => (
            <div key={cat.category} style={s.tooltipRow}>
              <span style={s.tooltipCategory}>{formatCategory(cat.category)}</span>
              <span>{cat.tokens.toLocaleString()}</span>
            </div>
          ))}
        </>
      )}
      <div style={s.tooltipHint}>Click to open inspector</div>
    </div>
  );
}

function formatCategory(cat: string): string {
  return cat.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase());
}

const s: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    alignItems: "center",
    gap: 4,
    cursor: "pointer",
    position: "relative",
    padding: "0 4px",
  },
  label: {
    fontSize: "var(--font-size-xs)",
    fontWeight: 500,
    fontFamily: "var(--font-mono)",
  },
  tooltip: {
    position: "absolute",
    bottom: 28,
    right: 0,
    width: 220,
    background: "var(--bg-tertiary)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-md)",
    padding: 10,
    boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
    zIndex: 100,
    fontSize: "var(--font-size-xs)",
  },
  tooltipHeader: {
    fontWeight: 600,
    color: "var(--text-bright)",
    marginBottom: 6,
  },
  tooltipRow: {
    display: "flex",
    justifyContent: "space-between",
    padding: "2px 0",
    color: "var(--text-primary)",
  },
  tooltipCategory: {
    color: "var(--text-secondary)",
  },
  tooltipDivider: {
    height: 1,
    background: "var(--border)",
    margin: "4px 0",
  },
  tooltipHint: {
    color: "var(--text-secondary)",
    fontStyle: "italic",
    marginTop: 6,
    textAlign: "center" as const,
  },
};
