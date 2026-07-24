import { NextResponse } from "next/server";

import { getPendingApprovalCards } from "@/lib/agent/runner";
import { getLatestMeetingWorkflow } from "@/lib/db/repositories/meeting-workflows";
import { resolvePortalUserContext } from "@/lib/portal/user-context";
import { canAccessConversation } from "@/lib/security/resource-access";
import { conversationTaskStore } from "@/lib/task/task-store";
import { getActiveDralkWorkflow } from "@/lib/workflows/dralk";
import { PatchConversationRequestSchema } from "@/types/task";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const conversation = conversationTaskStore.getById(id);
    if (!conversation) {
      return NextResponse.json({ message: `Conversation not found: ${id}` }, { status: 404 });
    }
    const portal = resolvePortalUserContext({ headers: request.headers });
    if (!canAccessConversation(id, portal)) {
      return NextResponse.json({ message: "Conversation access denied" }, { status: 403 });
    }

    const messages = conversationTaskStore.listMessages(id);
    const activeWorkflow = getActiveDralkWorkflow(id);
    const meetingWorkflow = getLatestMeetingWorkflow(id);
    const approvals = getPendingApprovalCards(id);
    return NextResponse.json({
      conversation,
      messages,
      activeWorkflow,
      meetingWorkflow,
      approvals,
    });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to load conversation" },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const portal = resolvePortalUserContext({ headers: request.headers });
    if (!canAccessConversation(id, portal)) {
      return NextResponse.json({ message: "Conversation access denied" }, { status: 403 });
    }
    const body = (await request.json()) as unknown;
    const payload = PatchConversationRequestSchema.parse(body);
    const conversation = conversationTaskStore.update(id, payload);
    if (!conversation) {
      return NextResponse.json({ message: `Conversation not found: ${id}` }, { status: 404 });
    }
    return NextResponse.json({ conversation });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to update conversation" },
      { status: 400 },
    );
  }
}
