import { NextResponse } from "next/server";

import { getDefaultToolGateway } from "@/lib/tools/registry";
import type { GatewayContext } from "@/types/tool-gateway";
import type { McpInspectionResult } from "@/lib/mcp/client";

export const runtime = "nodejs";

export async function GET() {
  const receipt = await getDefaultToolGateway().invoke("fluxink", "inspect", {}, {
    userId: "system",
    tenantId: "system",
    conversationId: "system",
    currentSurface: "ask_ai",
    selectedSourceIds: [],
    permissions: {},
  } satisfies GatewayContext);

  const results =
    receipt.data && typeof receipt.data === "object" && "results" in receipt.data
      ? ((receipt.data as { results: McpInspectionResult[] }).results ?? [])
      : [];
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
