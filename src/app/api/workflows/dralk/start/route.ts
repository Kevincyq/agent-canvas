import { NextResponse } from "next/server";

import { startDralkWorkflow } from "@/lib/workflows/dralk";
import { StartDralkWorkflowRequestSchema } from "@/types/workflow";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as unknown;
    const payload = StartDralkWorkflowRequestSchema.parse(body);
    const started = startDralkWorkflow(payload);
    return NextResponse.json({
      conversationId: started.conversationId,
      workflow: started.workflow,
      workflowRequest: started.workflowRequest,
      userMessageId: started.userMessageId,
      assistantMessageId: started.assistantMessageId,
    });
  } catch (error) {
    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : "Failed to start Dralk workflow",
      },
      { status: 400 },
    );
  }
}
