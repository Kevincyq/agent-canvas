import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * Hard cut: the one-shot /api/agent endpoint is retired.
 * Clients must use POST /api/agent/run with conversationId + Session persistence.
 */
export async function POST() {
  return NextResponse.json(
    {
      message:
        "POST /api/agent has been removed. Use POST /api/agent/run with an optional conversationId.",
      blocks: [],
      actions: [],
    },
    { status: 410 },
  );
}
