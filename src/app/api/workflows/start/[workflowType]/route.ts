import { NextResponse } from "next/server";

import { resolvePortalUserContext } from "@/lib/portal/user-context";
import { canAccessConversation } from "@/lib/security/resource-access";
import { startRegisteredWorkflow } from "@/lib/workflows/registry";
import {
  RegisteredWorkflowTypeSchema,
  StartRegisteredWorkflowRequestSchema,
} from "@/types/workflow-runtime";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ workflowType: string }> },
) {
  try {
    const { workflowType: rawWorkflowType } = await context.params;
    const workflowType = RegisteredWorkflowTypeSchema.parse(rawWorkflowType);
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const payload = StartRegisteredWorkflowRequestSchema.parse({
      ...body,
      workflowType,
    });
    const portal = resolvePortalUserContext({
      headers: request.headers,
      bodyUserId: payload.userId,
      bodyTenantId: payload.tenantId,
    });
    if (
      payload.conversationId &&
      !canAccessConversation(payload.conversationId, portal)
    ) {
      return NextResponse.json(
        { message: "Conversation access denied" },
        { status: 403 },
      );
    }
    const started = await startRegisteredWorkflow({
      ...payload,
      userId: portal.userId,
      tenantId: portal.tenantId,
    });
    return NextResponse.json(started, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Failed to start registered workflow",
      },
      { status: 400 },
    );
  }
}
