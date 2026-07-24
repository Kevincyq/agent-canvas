import { NextResponse } from "next/server";

import { resolvePortalUserContext } from "@/lib/portal/user-context";
import { canAccessConversation } from "@/lib/security/resource-access";
import { transitionDralkWorkflow } from "@/lib/workflows/dralk";
import { TransitionDralkWorkflowRequestSchema } from "@/types/workflow";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as unknown;
    const payload = TransitionDralkWorkflowRequestSchema.parse(body);
    const portal = resolvePortalUserContext({ headers: request.headers });
    if (!canAccessConversation(payload.conversationId, portal)) {
      return NextResponse.json({ message: "Conversation access denied" }, { status: 403 });
    }
    const workflow = transitionDralkWorkflow(payload);
    return NextResponse.json({ workflow });
  } catch (error) {
    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : "Failed to transition Dralk workflow",
      },
      { status: 400 },
    );
  }
}
