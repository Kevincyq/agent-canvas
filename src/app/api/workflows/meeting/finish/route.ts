import { NextResponse } from "next/server";

import { resolvePortalUserContext } from "@/lib/portal/user-context";
import { canAccessConversation } from "@/lib/security/resource-access";
import { finishMeetingWorkflow } from "@/lib/workflows/meeting";
import { FinishMeetingWorkflowRequestSchema } from "@/types/meeting-workflow";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as unknown;
    const payload = FinishMeetingWorkflowRequestSchema.parse(body);
    const portal = resolvePortalUserContext({ headers: request.headers });
    if (!canAccessConversation(payload.conversationId, portal)) {
      return NextResponse.json({ message: "Conversation access denied" }, { status: 403 });
    }
    const workflow = finishMeetingWorkflow(payload);
    return NextResponse.json({ workflow });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to finish meeting workflow" },
      { status: 400 },
    );
  }
}
