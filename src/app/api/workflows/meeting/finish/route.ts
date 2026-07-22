import { NextResponse } from "next/server";

import { finishMeetingWorkflow } from "@/lib/workflows/meeting";
import { FinishMeetingWorkflowRequestSchema } from "@/types/meeting-workflow";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as unknown;
    const payload = FinishMeetingWorkflowRequestSchema.parse(body);
    const workflow = finishMeetingWorkflow(payload);
    return NextResponse.json({ workflow });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to finish meeting workflow" },
      { status: 400 },
    );
  }
}
