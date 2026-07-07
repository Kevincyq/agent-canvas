import { NextResponse } from "next/server";

import { inspectMcpServer } from "@/lib/mcp/client";

export const runtime = "nodejs";

export async function GET() {
  const results = await inspectMcpServer();
  const ok = results.some((result) => result.ok);

  return NextResponse.json(
    {
      ok,
      results,
    },
    {
      status: ok ? 200 : 502,
    },
  );
}
