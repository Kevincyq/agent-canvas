import { NextResponse } from "next/server";

import { startMeetingWorkflow } from "@/lib/workflows/meeting";
import { StartMeetingWorkflowRequestSchema } from "@/types/meeting-workflow";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as unknown;
    const payload = StartMeetingWorkflowRequestSchema.parse(body);
    return NextResponse.json(startMeetingWorkflow(payload), { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to start meeting workflow" },
      { status: 400 },
    );
  }
}
