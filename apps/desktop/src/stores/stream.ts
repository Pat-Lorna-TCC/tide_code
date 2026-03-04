import { create } from "zustand";
import type { PiEvent } from "../lib/pi-events";

interface ToolCallState {
  id: string;
  toolName: string;
  status: "running" | "completed" | "error";
}

interface StreamState {
  content: string;
  isStreaming: boolean;
  agentActive: boolean;
  activeToolCalls: ToolCallState[];

  handlePiEvent: (event: PiEvent) => void;
  reset: () => void;
}

export const useStreamStore = create<StreamState>((set) => ({
  content: "",
  isStreaming: false,
  agentActive: false,
  activeToolCalls: [],

  handlePiEvent: (event: PiEvent) => {
    switch (event.type) {
      case "agent_start":
        set({
          agentActive: true,
          isStreaming: true,
          content: "",
          activeToolCalls: [],
        });
        break;

      case "agent_end":
        set({ agentActive: false, isStreaming: false });
        break;

      case "message_update": {
        // Handle text deltas from Pi's streaming
        const ame = (event as any).assistantMessageEvent;
        if (ame?.type === "text_delta" && typeof ame.delta === "string") {
          set((state) => ({ content: state.content + ame.delta }));
        }
        break;
      }

      case "tool_execution_start": {
        const e = event as any;
        set((state) => ({
          activeToolCalls: [
            ...state.activeToolCalls,
            {
              id: e.toolCallId || e.tool_call_id || "",
              toolName: e.toolName || e.tool_name || "unknown",
              status: "running" as const,
            },
          ],
        }));
        break;
      }

      case "tool_execution_end": {
        const e = event as any;
        const callId = e.toolCallId || e.tool_call_id || "";
        set((state) => ({
          activeToolCalls: state.activeToolCalls.map((tc) =>
            tc.id === callId
              ? { ...tc, status: "completed" as const }
              : tc,
          ),
        }));
        break;
      }
    }
  },

  reset: () =>
    set({
      content: "",
      isStreaming: false,
      agentActive: false,
      activeToolCalls: [],
    }),
}));
