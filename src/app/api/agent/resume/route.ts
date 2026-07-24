import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import { resumeAgentTurn } from "@/lib/agent/agent";
import { writeAuditEvent } from "@/lib/observability/audit";
import { resolvePortalUserContext } from "@/lib/portal/user-context";
import { AgentResumeRequestSchema } from "@/types/agent-runtime";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const requestId = randomUUID();
  try {
    const body = (await request.json()) as unknown;
    const payload = AgentResumeRequestSchema.parse(body);
    const portal = resolvePortalUserContext({
      headers: request.headers,
      bodyUserId: payload.userId,
      bodyTenantId: payload.tenantId,
    });

    writeAuditEvent({
      requestId,
      conversationId: payload.conversationId,
      userId: portal.userId,
      tenantId: portal.tenantId,
      eventType: "agent.resume.start",
      payload: {
        runStateId: payload.runStateId ?? null,
        decisionCount: payload.decisions.length,
        decisions: payload.decisions.map((item) => ({
          callId: item.callId,
          decision: item.decision,
        })),
      },
    });

    const result = await resumeAgentTurn({
      ...payload,
      userId: portal.userId,
      tenantId: portal.tenantId,
      signal: request.signal,
    });

    writeAuditEvent({
      requestId: result.requestId ?? requestId,
      conversationId: result.conversationId,
      userId: portal.userId,
      tenantId: portal.tenantId,
      eventType: "agent.resume.end",
      payload: {
        status: result.status,
        outputStatus: result.outputStatus ?? null,
        remainingApprovals: result.approvals?.length ?? 0,
      },
    });

    return NextResponse.json(result);
  } catch (error) {
    writeAuditEvent({
      requestId,
      eventType: "agent.resume.end",
      payload: {
        status: "failed",
        error: error instanceof Error ? error.message : "Agent resume 失败",
      },
    });
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
