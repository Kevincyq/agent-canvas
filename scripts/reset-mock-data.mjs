#!/usr/bin/env node
/**
 * Reset local SQLite mock data.
 * Deletes ./data/agent-canvas.sqlite* so the next app request migrates and
 * seeds Business / Life / Technology / Study / Art collections.
 *
 * Usage: pnpm run reset:mock
 */

import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const dbPath = join(process.cwd(), "data", "agent-canvas.sqlite");
mkdirSync(join(process.cwd(), "data"), { recursive: true });

for (const suffix of ["", "-wal", "-shm"]) {
  const file = `${dbPath}${suffix}`;
  if (existsSync(file)) {
    rmSync(file, { force: true });
    console.log(`removed ${file}`);
  }
}

console.log("Mock SQLite cleared.");
console.log("On next server start / API call, seed version product-sync-v1 will load:");
console.log("  Business / Life / Technology / Study / Art");
console.log("  + 2026-07-22 产品沟通会纪要（可检索议题与待办）");
