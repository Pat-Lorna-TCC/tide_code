import Database from "better-sqlite3";
import * as path from "node:path";
import * as fs from "node:fs";

let db: Database.Database | null = null;

/** Get or initialize the SQLite database at .tide/tide.db relative to workspace root. */
export function getDb(workspaceRoot?: string): Database.Database {
  if (db) return db;

  const root = workspaceRoot ?? process.cwd();
  const tideDir = path.join(root, ".tide");
  if (!fs.existsSync(tideDir)) {
    fs.mkdirSync(tideDir, { recursive: true });
  }

  const dbPath = path.join(tideDir, "tide.db");
  db = new Database(dbPath);

  // WAL mode for better concurrent reads
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  initTables(db);
  return db;
}

/** Initialize all tables. */
function initTables(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS region_tags (
      id TEXT PRIMARY KEY,
      file_path TEXT NOT NULL,
      start_line INTEGER NOT NULL,
      start_column INTEGER NOT NULL,
      end_line INTEGER NOT NULL,
      end_column INTEGER NOT NULL,
      label TEXT NOT NULL,
      note TEXT,
      pinned INTEGER NOT NULL DEFAULT 0,
      content_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_region_tags_file_path
      ON region_tags(file_path);
  `);
}

/** Close the database connection (for cleanup). */
export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}

/** Reset the cached db instance (for testing or workspace change). */
export function resetDb(): void {
  db = null;
}
