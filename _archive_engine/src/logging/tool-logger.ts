import { randomUUID } from "node:crypto";
import type { ToolLoggerInterface, SafetyLevel } from "@tide/shared";
import { getDb } from "../persistence/sqlite.js";

export interface ToolLogEntry {
  id: string;
  requestId: string;
  sessionId: string | null;
  toolName: string;
  argsJson: string;
  safetyLevel: SafetyLevel;
  approvalRequired: boolean;
  approvalResult: string | null;
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  status: "running" | "success" | "error" | "cancelled";
  resultJson: string | null;
  error: string | null;
}

/**
 * ToolLogger records tool invocations in SQLite for audit trail and UI display.
 */
export class ToolLogger implements ToolLoggerInterface {
  private sessionId: string;

  constructor(sessionId?: string) {
    this.sessionId = sessionId ?? randomUUID();
  }

  /** Log the start of a tool execution. Returns the log entry ID. */
  logStart(params: {
    requestId: string;
    toolName: string;
    args: Record<string, unknown>;
    safetyLevel: SafetyLevel;
    approvalRequired: boolean;
  }): string {
    const id = randomUUID();
    const db = getDb();
    db.prepare(`
      INSERT INTO tool_logs (id, request_id, session_id, tool_name, args_json, safety_level, approval_required, started_at, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), 'running')
    `).run(
      id,
      params.requestId,
      this.sessionId,
      params.toolName,
      JSON.stringify(params.args),
      params.safetyLevel,
      params.approvalRequired ? 1 : 0,
    );
    return id;
  }

  /** Log successful completion of a tool. */
  logEnd(logId: string, result: unknown): void {
    const db = getDb();
    const started = db
      .prepare("SELECT started_at FROM tool_logs WHERE id = ?")
      .get(logId) as { started_at: string } | undefined;

    const durationMs = started
      ? Date.now() - new Date(started.started_at + "Z").getTime()
      : null;

    db.prepare(`
      UPDATE tool_logs SET status = 'success', completed_at = datetime('now'),
      duration_ms = ?, result_json = ? WHERE id = ?
    `).run(durationMs, JSON.stringify(result), logId);
  }

  /** Log a tool error. */
  logError(logId: string, error: string): void {
    const db = getDb();
    db.prepare(`
      UPDATE tool_logs SET status = 'error', completed_at = datetime('now'),
      error = ? WHERE id = ?
    `).run(error, logId);
  }

  /** Log a tool cancellation. */
  logCancelled(logId: string): void {
    const db = getDb();
    db.prepare(`
      UPDATE tool_logs SET status = 'cancelled', completed_at = datetime('now')
      WHERE id = ?
    `).run(logId);
  }

  /** Get recent tool logs. */
  getRecentLogs(limit: number = 50): ToolLogEntry[] {
    const db = getDb();
    const rows = db
      .prepare(
        "SELECT * FROM tool_logs ORDER BY started_at DESC LIMIT ?",
      )
      .all(limit) as ToolLogRow[];
    return rows.map(rowToEntry);
  }

  /** Get logs for a specific session. */
  getLogsBySession(sessionId: string): ToolLogEntry[] {
    const db = getDb();
    const rows = db
      .prepare(
        "SELECT * FROM tool_logs WHERE session_id = ? ORDER BY started_at ASC",
      )
      .all(sessionId) as ToolLogRow[];
    return rows.map(rowToEntry);
  }
}

interface ToolLogRow {
  id: string;
  request_id: string;
  session_id: string | null;
  tool_name: string;
  args_json: string;
  safety_level: string;
  approval_required: number;
  approval_result: string | null;
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
  status: string;
  result_json: string | null;
  error: string | null;
}

function rowToEntry(row: ToolLogRow): ToolLogEntry {
  return {
    id: row.id,
    requestId: row.request_id,
    sessionId: row.session_id,
    toolName: row.tool_name,
    argsJson: row.args_json,
    safetyLevel: row.safety_level as SafetyLevel,
    approvalRequired: row.approval_required === 1,
    approvalResult: row.approval_result,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    durationMs: row.duration_ms,
    status: row.status as ToolLogEntry["status"],
    resultJson: row.result_json,
    error: row.error,
  };
}
