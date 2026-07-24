import { NextResponse } from "next/server";

import { resolvePortalUserContext } from "@/lib/portal/user-context";
import { startMeetingWorkflow } from "@/lib/workflows/meeting";
import { StartMeetingWorkflowRequestSchema } from "@/types/meeting-workflow";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as unknown;
    const payload = StartMeetingWorkflowRequestSchema.parse(body);
    const portal = resolvePortalUserContext({
      headers: request.headers,
      bodyUserId: payload.userId,
      bodyTenantId: payload.tenantId,
    });
    return NextResponse.json(
      startMeetingWorkflow({
        ...payload,
        userId: portal.userId,
        tenantId: portal.tenantId,
      }),
      { status: 201 },
    );
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to start meeting workflow" },
      { status: 400 },
    );
  }
}
