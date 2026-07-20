import { NextResponse } from "next/server";

import { summarizeToolMetrics } from "@/lib/observability/metrics";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const conversationId = searchParams.get("conversationId") ?? undefined;
    const metrics = summarizeToolMetrics({ conversationId });
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
