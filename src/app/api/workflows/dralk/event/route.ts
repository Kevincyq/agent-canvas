import { NextResponse } from "next/server";

import { transitionDralkWorkflow } from "@/lib/workflows/dralk";
import { TransitionDralkWorkflowRequestSchema } from "@/types/workflow";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as unknown;
    const payload = TransitionDralkWorkflowRequestSchema.parse(body);
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
