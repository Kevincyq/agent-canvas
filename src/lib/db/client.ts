import { mkdirSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { getOptionalEnv } from "@/lib/env";
import { runMigrations } from "@/lib/db/migrate";
import { ensureSeedData, resetSeedFlagForTests } from "@/lib/services/seed";

const DEFAULT_DB_PATH = "./data/agent-canvas.sqlite";

let dbSingleton: DatabaseSync | null = null;
let migrationsApplied = false;

export function resolveSqlitePath(explicitPath?: string): string {
  const configured = explicitPath || getOptionalEnv("SQLITE_PATH", DEFAULT_DB_PATH);
  return isAbsolute(configured)
    ? configured
    : join(/* turbopackIgnore: true */ process.cwd(), configured);
}

export function getDb(options?: { path?: string; skipMigrate?: boolean }): DatabaseSync {
  const dbPath = resolveSqlitePath(options?.path);

  if (dbSingleton && !options?.path) {
    if (!options?.skipMigrate && !migrationsApplied) {
      runMigrations(dbSingleton);
      ensureSeedData(dbSingleton);
      migrationsApplied = true;
    }
    return dbSingleton;
  }

  mkdirSync(dirname(dbPath), { recursive: true });

  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec("PRAGMA journal_mode = WAL;");

  if (!options?.skipMigrate) {
    runMigrations(db);
    ensureSeedData(db);
    if (!options?.path) {
      migrationsApplied = true;
    }
  }

  if (!options?.path) {
    dbSingleton = db;
  }

  return db;
}

/** Close and drop the process singleton. Used by tests/spikes that simulate restart. */
export function closeDb(): void {
  if (dbSingleton) {
    dbSingleton.close();
    dbSingleton = null;
    migrationsApplied = false;
    resetSeedFlagForTests();
  }
}

export function resetDbForTests(): void {
  closeDb();
}
