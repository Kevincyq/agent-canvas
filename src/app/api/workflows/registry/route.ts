import { NextResponse } from "next/server";

import { listWorkflowDefinitions } from "@/lib/workflows/registry";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    workflows: listWorkflowDefinitions(),
    serviceBoundaries: {
      pkb: {
        component: "tool_service_adapter",
        realIntegration: false,
        registry: "tool_registry",
        reason: "PKB is retrieval/context infrastructure, not a user workflow.",
      },
    },
  });
}
