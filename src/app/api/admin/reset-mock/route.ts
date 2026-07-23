import { NextResponse } from "next/server";

import { closeDb, getDb } from "@/lib/db/client";
import { resetMockData, resetSeedFlagForTests } from "@/lib/services/seed";

export const runtime = "nodejs";

/**
 * Dev/PoC helper: wipe conversations + mock tables and reseed the five collections.
 * POST /api/admin/reset-mock
 */
export async function POST() {
  try {
    const db = getDb({ skipMigrate: false });
    resetSeedFlagForTests();
    resetMockData(db);
    return NextResponse.json({
      ok: true,
      message: "Mock data reset. Seeded collections + 2026-07-22 产品沟通会纪要.",
    });
  } catch (error) {
    closeDb();
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to reset mock data" },
      { status: 500 },
    );
  }
}
