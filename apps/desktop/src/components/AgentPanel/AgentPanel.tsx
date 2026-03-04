import { useState, useEffect, useRef } from "react";
import { useStreamStore } from "../../stores/stream";
import { sendMessage } from "../../lib/ipc";

export function AgentPanel() {
  const [input, setInput] = useState("");
  const { content, isStreaming, handleEvent, reset } = useStreamStore();
  const outputRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [content]);

  const handleSend = async () => {
    if (!input.trim() || isStreaming) return;
    const msg = input.trim();
    setInput("");
    reset();
    try {
      await sendMessage(msg, handleEvent);
    } catch (err) {
      console.error("Send failed:", err);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div style={panelStyles.container}>
      <div style={panelStyles.header}>Agent</div>
      <div ref={outputRef} style={panelStyles.output}>
        {content ? (
          <pre style={panelStyles.outputText}>{content}</pre>
        ) : (
          <p style={panelStyles.placeholder}>
            Send a message to test streaming...
          </p>
        )}
        {isStreaming && <span style={panelStyles.cursor}>|</span>}
      </div>
      <div style={panelStyles.inputArea}>
        <textarea
          style={panelStyles.textarea}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message... (Cmd+Enter)"
          rows={2}
          disabled={isStreaming}
        />
        <button
          style={{
            ...panelStyles.button,
            opacity: isStreaming || !input.trim() ? 0.5 : 1,
          }}
          onClick={handleSend}
          disabled={isStreaming || !input.trim()}
        >
          {isStreaming ? "..." : "Send"}
        </button>
      </div>
    </div>
  );
}

const panelStyles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    background: "var(--bg-secondary)",
  },
  header: {
    display: "flex",
    alignItems: "center",
    height: 32,
    padding: "0 12px",
    fontSize: "var(--font-size-sm)",
    fontWeight: 600,
    color: "var(--text-bright)",
    background: "var(--bg-tertiary)",
    borderBottom: "1px solid var(--border)",
  },
  output: {
    flex: 1,
    overflow: "auto",
    padding: 12,
  },
  outputText: {
    fontFamily: "var(--font-mono)",
    fontSize: "var(--font-size-sm)",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    margin: 0,
    lineHeight: 1.5,
  },
  placeholder: {
    color: "var(--text-secondary)",
    fontStyle: "italic",
    fontSize: "var(--font-size-sm)",
  },
  cursor: {
    color: "var(--accent)",
  },
  inputArea: {
    display: "flex",
    gap: 6,
    padding: 8,
    borderTop: "1px solid var(--border)",
    alignItems: "flex-end",
  },
  textarea: {
    flex: 1,
    padding: "6px 8px",
    fontFamily: "var(--font-mono)",
    fontSize: "var(--font-size-sm)",
    color: "var(--text-primary)",
    background: "var(--bg-input)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-sm)",
    resize: "none",
    outline: "none",
  },
  button: {
    padding: "6px 12px",
    fontFamily: "var(--font-ui)",
    fontSize: "var(--font-size-sm)",
    fontWeight: 500,
    color: "white",
    background: "var(--accent)",
    border: "none",
    borderRadius: "var(--radius-sm)",
    cursor: "pointer",
  },
};
