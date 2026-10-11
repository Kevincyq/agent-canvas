import { NextResponse } from "next/server";

import { continueAgentAfterWorkflowResult } from "@/lib/agent/agent";
import { getWorkflowInstance } from "@/lib/db/repositories/workflow-instances";
import { resolvePortalUserContext } from "@/lib/portal/user-context";
import { canAccessConversation } from "@/lib/security/resource-access";
import { submitRegisteredWorkflowResult } from "@/lib/workflows/registry";
import { SubmitWorkflowResultRequestSchema } from "@/types/workflow-runtime";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ workflowId: string }> },
) {
  try {
    const { workflowId } = await context.params;
    const payload = SubmitWorkflowResultRequestSchema.parse(
      (await request.json()) as unknown,
    );
    const existing = getWorkflowInstance(workflowId);
    if (!existing) {
      return NextResponse.json(
        { message: "Workflow instance not found" },
        { status: 404 },
      );
    }
    const portal = resolvePortalUserContext({ headers: request.headers });
    if (!canAccessConversation(existing.conversationId, portal)) {
      return NextResponse.json(
        { message: "Conversation access denied" },
        { status: 403 },
      );
    }
    const completed = submitRegisteredWorkflowResult({
      workflowId,
      result: payload,
    });
    const agentRun =
      completed.accepted &&
      payload.continueAgent &&
      completed.instance.resumePolicy === "agent_on_result"
        ? await continueAgentAfterWorkflowResult({
            workflowResult: completed.workflowResult,
            userId: portal.userId,
            tenantId: portal.tenantId,
            signal: request.signal,
          })
        : null;
    return NextResponse.json({
      instance: completed.instance,
      workflowResult: completed.workflowResult,
      accepted: completed.accepted,
      agentRun,
    });
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Failed to submit workflow result",
      },
      { status: 400 },
    );
  }
}
