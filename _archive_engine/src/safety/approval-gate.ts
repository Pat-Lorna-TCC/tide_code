import { randomUUID } from "node:crypto";
import type { ApprovalGateInterface, SafetyLevel, DiffPreviewData } from "@tide/shared";
import type { Transport } from "../ipc/transport.js";

const APPROVAL_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

interface PendingApproval {
  resolve: (approved: boolean) => void;
  timer: ReturnType<typeof setTimeout>;
}

/**
 * ApprovalGate sends approval requests to the UI via IPC transport
 * and awaits the user's response (approve/deny).
 */
export class ApprovalGate implements ApprovalGateInterface {
  private pending = new Map<string, PendingApproval>();
  private transport: Transport;

  constructor(transport: Transport) {
    this.transport = transport;
  }

  /** Update the transport (e.g., when a new client connects). */
  setTransport(transport: Transport): void {
    this.transport = transport;
  }

  /** Send an approval request and wait for the user's response. */
  async requestApproval(params: {
    toolName: string;
    args: Record<string, unknown>;
    safetyLevel: SafetyLevel;
    requestId: string;
    diffPreview?: DiffPreviewData;
  }): Promise<boolean> {
    const approvalId = randomUUID();

    // Send approval_request to UI
    this.transport.send({
      id: randomUUID(),
      type: "approval_request",
      timestamp: Date.now(),
      approvalId,
      requestId: params.requestId,
      toolName: params.toolName,
      safetyLevel: params.safetyLevel,
      arguments: params.args,
      ...(params.diffPreview ? { diffPreview: params.diffPreview } : {}),
    });

    return new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => {
        console.warn(`[approval] Auto-denied after timeout: ${approvalId}`);
        this.pending.delete(approvalId);
        resolve(false);
      }, APPROVAL_TIMEOUT_MS);

      this.pending.set(approvalId, { resolve, timer });
    });
  }

  /** Handle an approval_response from the UI. */
  handleResponse(approvalId: string, approved: boolean): void {
    const entry = this.pending.get(approvalId);
    if (entry) {
      clearTimeout(entry.timer);
      this.pending.delete(approvalId);
      entry.resolve(approved);
    } else {
      console.warn(`[approval] No pending approval for id: ${approvalId}`);
    }
  }

  /** Clean up all pending approvals (e.g., on disconnect). */
  cleanup(): void {
    for (const [id, entry] of this.pending) {
      clearTimeout(entry.timer);
      entry.resolve(false);
      this.pending.delete(id);
    }
  }
}
