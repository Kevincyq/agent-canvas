import type { DatabaseSync } from "node:sqlite";

import {
  SEED_PROJECTS,
  SEED_SOURCES,
  SEED_USER_ID,
  SEED_VERSION,
} from "@/lib/services/mock/fixtures";

let seeded = false;

function ensureMetaTable(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS app_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
}

function getMeta(db: DatabaseSync, key: string): string | null {
  const row = db.prepare("SELECT value FROM app_meta WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}

function setMeta(db: DatabaseSync, key: string, value: string): void {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO app_meta (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  ).run(key, value, now);
}

/** Wipe product mock tables then insert the current collection fixtures. */
export function resetMockData(db: DatabaseSync): void {
  ensureMetaTable(db);

  const deletableTables = [
    "approvals",
    "run_states",
    "tool_runs",
    "audit_events",
    "artifacts",
    "mock_calendar_events",
    "mock_todos",
    "workflow_states",
    "session_items",
    "conversation_messages",
    "conversations",
    "project_sources",
    "projects",
  ];

  db.exec("BEGIN");
  try {
    for (const table of deletableTables) {
      try {
        db.exec(`DELETE FROM ${table}`);
      } catch {
        // Table may not exist yet on partially migrated DBs.
      }
    }

    const now = new Date().toISOString();
    const insertProject = db.prepare(
      `INSERT INTO projects (id, user_id, name, instructions, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );
    for (const project of SEED_PROJECTS) {
      insertProject.run(
        project.id,
        SEED_USER_ID,
        project.name,
        project.instructions,
        now,
        now,
      );
    }

    const insertSource = db.prepare(
      `INSERT INTO project_sources (id, project_id, title, source_type, content, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );
    for (const source of SEED_SOURCES) {
      insertSource.run(
        source.id,
        source.projectId,
        source.title,
        source.sourceType,
        source.content,
        now,
      );
    }

    setMeta(db, "seed_version", SEED_VERSION);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function ensureSeedData(db: DatabaseSync): void {
  if (seeded) {
    return;
  }

  ensureMetaTable(db);
  const current = getMeta(db, "seed_version");
  if (current !== SEED_VERSION) {
    resetMockData(db);
  }

  seeded = true;
}

export function resetSeedFlagForTests(): void {
  seeded = false;
}
