import { NextResponse } from "next/server";

import { continueAgentAfterWorkflowResult } from "@/lib/agent/agent";
import { getMeetingWorkflowById } from "@/lib/db/repositories/meeting-workflows";
import { getWorkflowInstance } from "@/lib/db/repositories/workflow-instances";
import { resolvePortalUserContext } from "@/lib/portal/user-context";
import { canAccessConversation } from "@/lib/security/resource-access";
import { finishRegisteredMeeting } from "@/lib/workflows/registry";
import { FinishMeetingWorkflowRequestSchema } from "@/types/meeting-workflow";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as unknown;
    const payload = FinishMeetingWorkflowRequestSchema.parse(body);
    const portal = resolvePortalUserContext({ headers: request.headers });
    const existing = getWorkflowInstance(payload.workflowId);
    if (
      !existing ||
      existing.workflowType !== "meeting" ||
      existing.conversationId !== payload.conversationId
    ) {
      return NextResponse.json({ message: "Meeting workflow not found" }, { status: 404 });
    }
    if (!canAccessConversation(existing.conversationId, portal)) {
      return NextResponse.json({ message: "Conversation access denied" }, { status: 403 });
    }
    const completed = finishRegisteredMeeting(payload.workflowId);
    const agentRun = completed.accepted
      ? await continueAgentAfterWorkflowResult({
          workflowResult: completed.workflowResult,
          userId: portal.userId,
          tenantId: portal.tenantId,
          signal: request.signal,
        })
      : null;
    return NextResponse.json({
      workflow: getMeetingWorkflowById(payload.workflowId),
      instance: completed.instance,
      workflowResult: completed.workflowResult,
      accepted: completed.accepted,
      agentRun,
    });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to finish meeting workflow" },
      { status: 400 },
    );
  }
}
