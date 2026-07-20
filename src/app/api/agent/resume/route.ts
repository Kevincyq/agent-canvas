import { NextResponse } from "next/server";

import { resumeAgentTurn } from "@/lib/agent/agent";
import { AgentResumeRequestSchema } from "@/types/agent-runtime";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as unknown;
    const payload = AgentResumeRequestSchema.parse(body);
    return NextResponse.json(await resumeAgentTurn(payload));
  } catch (error) {
    return NextResponse.json(
      {
        conversationId: "",
        sessionId: "",
        status: "failed",
        message: error instanceof Error ? error.message : "Agent resume 失败",
        blocks: [],
        actions: [],
        userMessageId: "",
        assistantMessageId: "",
        approvals: [],
      },
      { status: 400 },
    );
  }
}
