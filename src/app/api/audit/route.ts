import { NextResponse } from "next/server";

import { listAuditEvents } from "@/lib/observability/audit";
import { resolvePortalUserContext } from "@/lib/portal/user-context";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const portal = resolvePortalUserContext({ headers: request.headers });
    const limit = Number(searchParams.get("limit") ?? "50");
    const events = listAuditEvents(portal, Number.isFinite(limit) ? limit : 50);
    return NextResponse.json({ events });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to list audit events" },
      { status: 500 },
    );
  }
}
