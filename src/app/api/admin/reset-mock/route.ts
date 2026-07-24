import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * Dev/PoC helper: wipe conversations + mock tables and reseed the five collections.
 * POST /api/admin/reset-mock
 */
export async function POST() {
  if (process.env.NODE_ENV !== "development" && process.env.AGENT_EVAL_MODE !== "1") {
    return NextResponse.json({ message: "Not found" }, { status: 404 });
  }
  try {
    const [{ closeDb, getDb }, { resetMockData, resetSeedFlagForTests }] =
      await Promise.all([
        import("@/lib/db/client"),
        import("@/lib/services/seed"),
      ]);
    const db = getDb({ skipMigrate: false });
    resetSeedFlagForTests();
    resetMockData(db);
    return NextResponse.json({
      ok: true,
      message: "Mock data reset. Seeded collections + 2026-07-22 产品沟通会纪要.",
    });
  } catch (error) {
    const { closeDb } = await import("@/lib/db/client");
    closeDb();
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to reset mock data" },
      { status: 500 },
    );
  }
}
