import { NextResponse } from "next/server";

import { summarizeToolMetrics } from "@/lib/observability/metrics";
import { resolvePortalUserContext } from "@/lib/portal/user-context";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const portal = resolvePortalUserContext({ headers: request.headers });
    const conversationId = searchParams.get("conversationId") ?? undefined;
    const metrics = summarizeToolMetrics({
      conversationId,
      userId: portal.userId,
      tenantId: portal.tenantId,
    });
    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      conversationId: conversationId ?? null,
      tools: metrics,
    });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to load tool metrics" },
      { status: 500 },
    );
  }
}
