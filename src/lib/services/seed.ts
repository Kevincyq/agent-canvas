import type { DatabaseSync } from "node:sqlite";

import {
  SEED_PROJECT,
  SEED_SOURCES,
  SEED_USER_ID,
} from "@/lib/services/mock/fixtures";

let seeded = false;

export function ensureSeedData(db: DatabaseSync): void {
  if (seeded) {
    return;
  }

  const existing = db
    .prepare("SELECT id FROM projects WHERE id = ?")
    .get(SEED_PROJECT.id) as { id: string } | undefined;

  if (!existing) {
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO projects (id, user_id, name, instructions, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(
      SEED_PROJECT.id,
      SEED_USER_ID,
      SEED_PROJECT.name,
      SEED_PROJECT.instructions,
      now,
      now,
    );

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
  }

  seeded = true;
}

export function resetSeedFlagForTests(): void {
  seeded = false;
}
