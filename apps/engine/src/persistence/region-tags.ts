import { randomUUID } from "node:crypto";
import { getDb } from "./sqlite.js";
import type { RegionTag, CreateRegionTag, UpdateRegionTag } from "@tide/shared";

interface RegionTagRow {
  id: string;
  file_path: string;
  start_line: number;
  start_column: number;
  end_line: number;
  end_column: number;
  label: string;
  note: string | null;
  pinned: number;
  content_hash: string;
  created_at: string;
  updated_at: string;
}

function rowToTag(row: RegionTagRow): RegionTag {
  return {
    id: row.id,
    filePath: row.file_path,
    startLine: row.start_line,
    startColumn: row.start_column,
    endLine: row.end_line,
    endColumn: row.end_column,
    label: row.label,
    note: row.note ?? undefined,
    pinned: row.pinned === 1,
    contentHash: row.content_hash,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createTag(input: CreateRegionTag): RegionTag {
  const db = getDb();
  const id = randomUUID();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO region_tags (id, file_path, start_line, start_column, end_line, end_column, label, note, pinned, content_hash, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    input.filePath,
    input.startLine,
    input.startColumn,
    input.endLine,
    input.endColumn,
    input.label,
    input.note ?? null,
    input.pinned ? 1 : 0,
    input.contentHash,
    now,
    now,
  );

  return {
    id,
    ...input,
    createdAt: now,
    updatedAt: now,
  };
}

export function updateTag(id: string, updates: UpdateRegionTag): RegionTag | null {
  const db = getDb();
  const existing = db.prepare("SELECT * FROM region_tags WHERE id = ?").get(id) as RegionTagRow | undefined;
  if (!existing) return null;

  const setClauses: string[] = [];
  const values: unknown[] = [];

  if (updates.label !== undefined) { setClauses.push("label = ?"); values.push(updates.label); }
  if (updates.note !== undefined) { setClauses.push("note = ?"); values.push(updates.note); }
  if (updates.pinned !== undefined) { setClauses.push("pinned = ?"); values.push(updates.pinned ? 1 : 0); }
  if (updates.startLine !== undefined) { setClauses.push("start_line = ?"); values.push(updates.startLine); }
  if (updates.startColumn !== undefined) { setClauses.push("start_column = ?"); values.push(updates.startColumn); }
  if (updates.endLine !== undefined) { setClauses.push("end_line = ?"); values.push(updates.endLine); }
  if (updates.endColumn !== undefined) { setClauses.push("end_column = ?"); values.push(updates.endColumn); }
  if (updates.contentHash !== undefined) { setClauses.push("content_hash = ?"); values.push(updates.contentHash); }

  if (setClauses.length === 0) {
    return rowToTag(existing);
  }

  setClauses.push("updated_at = ?");
  values.push(new Date().toISOString());
  values.push(id);

  db.prepare(`UPDATE region_tags SET ${setClauses.join(", ")} WHERE id = ?`).run(...values);

  const updated = db.prepare("SELECT * FROM region_tags WHERE id = ?").get(id) as RegionTagRow;
  return rowToTag(updated);
}

export function deleteTag(id: string): boolean {
  const db = getDb();
  const result = db.prepare("DELETE FROM region_tags WHERE id = ?").run(id);
  return result.changes > 0;
}

export function listTags(filePath?: string): RegionTag[] {
  const db = getDb();
  if (filePath) {
    const rows = db.prepare("SELECT * FROM region_tags WHERE file_path = ? ORDER BY start_line, start_column").all(filePath) as RegionTagRow[];
    return rows.map(rowToTag);
  }
  const rows = db.prepare("SELECT * FROM region_tags ORDER BY file_path, start_line, start_column").all() as RegionTagRow[];
  return rows.map(rowToTag);
}

export function getTagsByIds(ids: string[]): RegionTag[] {
  if (ids.length === 0) return [];
  const db = getDb();
  const placeholders = ids.map(() => "?").join(", ");
  const rows = db.prepare(`SELECT * FROM region_tags WHERE id IN (${placeholders})`).all(...ids) as RegionTagRow[];
  return rows.map(rowToTag);
}
