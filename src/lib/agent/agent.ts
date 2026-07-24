import { randomUUID } from "node:crypto";

import { createAgentContext } from "@/lib/agent/context";
import { createFallbackResponse } from "@/lib/agent/intent";
import {
  buildCurrentTurnPrompt,
  resumeAskAiRun,
  runAskAiTurn,
  type RunnerTurnResult,
} from "@/lib/agent/runner";
import { listToolRunsByRequest } from "@/lib/db/repositories/tool-runs";
import { getArtifactById } from "@/lib/db/repositories/projects";
import { extractRenderChartSpecs } from "@/lib/plot/extract-charts";
import { SqliteSession } from "@/lib/session/sqlite-session";
import { conversationTaskStore } from "@/lib/task/task-store";
import { titleFromFirstMessage } from "@/lib/task/task-state";
import {
  completeDralkWorkflow,
  getActiveDralkWorkflow,
  markDralkAttachedAndRunning,
  startDralkFromAgentIntent,
  transitionDralkWorkflow,
} from "@/lib/workflows/dralk";
import type { AgentAction, AgentRequest, AgentResponse, ChatMessage } from "@/types/agent";
import type {
  AgentResumeRequest,
  AgentRunRequest,
  AgentRunResponse,
} from "@/types/agent-runtime";
import type { WorkflowRequest } from "@/types/workflow";
import type { ToolReceipt } from "@/types/tool-receipt";

/** @deprecated Prefer runAgentTurn via POST /api/agent/run. */
export async function runCanvasAgent(request: AgentRequest): Promise<AgentResponse> {
  return createFallbackResponse(request);
}

function enrichEvidenceFromToolRuns(
  evidence: AgentRunResponse["evidence"] = [],
  requestId?: string,
): NonNullable<AgentRunResponse["evidence"]> {
  if (!requestId) {
    return evidence;
  }

  const existingSources = new Set(evidence.map((item) => item.source));
  const existingIds = new Set(evidence.map((item) => item.id));
  const merged = [...evidence];

  for (const run of listToolRunsByRequest(requestId)) {
    if (run.status === "running" || !run.resultJson) {
      continue;
    }
    let receipt: ToolReceipt | null = null;
    try {
      receipt = JSON.parse(run.resultJson) as ToolReceipt;
    } catch {
      continue;
    }

    if (
      run.toolName === "search_web" &&
      receipt?.ok &&
      typeof receipt.data === "object" &&
      receipt.data !== null
    ) {
      const hits = (receipt.data as { hits?: unknown[] }).hits ?? [];
      for (const [index, hit] of hits.entries()) {
        if (!hit || typeof hit !== "object") {
          continue;
        }
        const item = hit as { url?: unknown; title?: unknown };
        if (typeof item.url !== "string" || typeof item.title !== "string") {
          continue;
        }
        if (existingSources.has(item.url)) {
          continue;
        }
        const citationId = `${receipt.executionId}:web:${index}`;
        existingSources.add(item.url);
        existingIds.add(citationId);
        merged.push({
          id: citationId,
          label: item.title,
          source: item.url,
        });
      }
    }

    const source = `tool_receipt:${run.toolName}`;
    if (existingSources.has(source)) {
      continue;
    }
    const id = receipt?.executionId || run.id;
    if (existingIds.has(id)) {
      // Model already cited this receipt under another source label.
      continue;
    }
    existingSources.add(source);
    existingIds.add(id);
    const written =
      receipt?.ok &&
      typeof receipt.data === "object" &&
      receipt.data !== null &&
      "written" in (receipt.data as Record<string, unknown>)
        ? Boolean((receipt.data as { written?: boolean }).written)
        : receipt?.ok;
    const calendarData =
      run.toolName === "create_calendar_event" &&
      receipt?.ok &&
      typeof receipt.data === "object" &&
      receipt.data !== null
        ? (receipt.data as { title?: string; startAt?: string; calendarName?: string })
        : null;
    merged.push({
      id,
      label: calendarData?.title
        ? `已写入 ${calendarData.calendarName ?? "Tablet 日历"}：${calendarData.title}${calendarData.startAt ? ` · ${calendarData.startAt}` : ""}`
        : written
          ? `${run.toolName} 已写入`
          : receipt?.ok
            ? `${run.toolName} 完成`
            : `${run.toolName} 失败`,
      source,
    });
  }

  return merged;
}

function enrichArtifactsFromToolRuns(
  artifacts: AgentRunResponse["artifacts"] = [],
  requestId?: string,
): NonNullable<AgentRunResponse["artifacts"]> {
  if (!requestId) {
    return artifacts;
  }

  const existingIds = new Set(artifacts.map((item) => item.id));
  const merged = [...artifacts];

  for (const run of listToolRunsByRequest(requestId)) {
    if (run.toolName !== "save_artifact_to_project" || !run.resultJson) {
      continue;
    }
    try {
      const receipt = JSON.parse(run.resultJson) as ToolReceipt<{
        artifactId?: string;
        projectId?: string;
      }>;
      const artifactId = receipt.data?.artifactId;
      if (!artifactId || existingIds.has(artifactId)) {
        continue;
      }
      existingIds.add(artifactId);
      const stored = getArtifactById(artifactId);
      merged.push({
        id: artifactId,
        title: stored?.title || "Saved artifact",
        artifactType: stored?.artifactType || "typed_blocks",
      });
    } catch {
      // ignore malformed receipt
    }
  }

  return merged;
}

function extractWorkflowSignalsFromToolRuns(
  requestId: string | undefined,
  fallbackActions: AgentAction[],
): {
  workflowRequest?: WorkflowRequest;
  actions: AgentAction[];
} {
  if (!requestId) {
    return { actions: fallbackActions };
  }

  let workflowRequest: WorkflowRequest | undefined;
  let meetingId: string | null | undefined;
  for (const run of listToolRunsByRequest(requestId)) {
    if (!run.resultJson || run.status !== "completed") {
      continue;
    }
    try {
      const receipt = JSON.parse(run.resultJson) as ToolReceipt<{
        workflowRequest?: WorkflowRequest;
        meetingId?: string;
      }>;
      if (!receipt.ok) {
        continue;
      }
      if (run.toolName === "start_dralk_workflow" && receipt.data?.workflowRequest) {
        workflowRequest = receipt.data.workflowRequest;
      }
      if (run.toolName === "start_meeting_workflow") {
        meetingId = receipt.data?.meetingId ?? null;
      }
    } catch {
      // Ignore malformed tool output and retain the model action fallback.
    }
  }

  const actions = [...fallbackActions];
  if (
    meetingId !== undefined &&
    !actions.some((action) => action.type === "open_meeting_workflow")
  ) {
    actions.push({ type: "open_meeting_workflow", meetingId });
  }

  return { workflowRequest, actions };
}

function buildRunResponse(input: {
  conversationId: string;
  sessionId: string;
  turn: RunnerTurnResult;
  userMessageId: string;
  assistantMessageId: string;
  workflowRequest?: WorkflowRequest;
  actions?: AgentAction[];
}): AgentRunResponse {
  if (input.turn.kind === "waiting_for_approval") {
    conversationTaskStore.update(input.conversationId, {
      status: "waiting_for_approval",
      currentStep: "approval:pending",
    });
  }

  const updated = conversationTaskStore.getById(input.conversationId);
  const evidence = enrichEvidenceFromToolRuns(
    input.turn.structured.evidence,
    input.turn.requestId,
  );
  const artifacts = enrichArtifactsFromToolRuns(
    input.turn.structured.artifacts,
    input.turn.requestId,
  );

  return {
    conversationId: input.conversationId,
    sessionId: input.sessionId,
    status:
      input.turn.kind === "waiting_for_approval"
        ? "waiting_for_approval"
        : (updated?.status ?? "ready"),
    message: input.turn.response.message,
    blocks: input.turn.response.blocks,
    actions: input.actions ?? input.turn.response.actions,
    userMessageId: input.userMessageId,
    assistantMessageId: input.assistantMessageId,
    outputStatus: input.turn.structured.status,
    evidence,
    artifacts,
    requestId: input.turn.requestId,
    workflowRequest: input.workflowRequest,
    runStateId: input.turn.kind === "waiting_for_approval" ? input.turn.runStateId : undefined,
    approvals: input.turn.approvals ?? [],
  };
}

export async function runAgentTurn(input: AgentRunRequest): Promise<AgentRunResponse> {
  const conversation = conversationTaskStore.ensure(input.conversationId, {
    userId: input.userId,
    tenantId: input.tenantId,
    title: titleFromFirstMessage(input.message),
    originSurface: "askai",
    projectId: input.projectId ?? undefined,
  });

  if (input.projectId !== undefined && conversation.projectId !== input.projectId) {
    conversationTaskStore.update(conversation.id, { projectId: input.projectId });
  }

  const conversationFresh =
    conversationTaskStore.getById(conversation.id) ?? conversation;

  conversationTaskStore.update(conversationFresh.id, { status: "running" });

  const activeBefore = getActiveDralkWorkflow(conversationFresh.id);
  const shouldConsumeDralk = Boolean(input.dralkContext || input.attachments.length > 0);
  // Only advance Dralk when this turn carries handwriting/voice context.
  // Never use canvas.isOpen alone — that forced status=running and trapped the UI.
  if (activeBefore && shouldConsumeDralk) {
    if (input.dralkContext) {
      try {
        transitionDralkWorkflow({
          conversationId: conversationFresh.id,
          workflowId: activeBefore.id,
          event: activeBefore.status === "capturing" ? "recognized" : "attached",
          queryPayload: input.dralkContext,
        });
      } catch {
        // ignore workflow race
      }
    }
    markDralkAttachedAndRunning(conversationFresh.id);
  }

  const userMessageId = randomUUID();
  conversationTaskStore.appendMessage({
    conversationId: conversationFresh.id,
    id: userMessageId,
    role: "user",
    content: input.message,
    attachments: input.attachments,
  });

  if (
    conversationFresh.title === "New chat" ||
    conversationFresh.title === "New task" ||
    conversationFresh.title === "Dralk 输入" ||
    conversationFresh.title === "AskAI · Dralk"
  ) {
    conversationTaskStore.update(conversationFresh.id, {
      title: titleFromFirstMessage(input.message),
    });
  }

  const session = new SqliteSession({ sessionId: conversationFresh.sessionId });
  const context = createAgentContext({
    userId: input.userId ?? conversationFresh.userId,
    tenantId: input.tenantId ?? conversationFresh.tenantId,
    conversationId: conversationFresh.id,
    projectId: conversationFresh.projectId ?? undefined,
    currentSurface: activeBefore ? "canvas" : "ask_ai",
  });

  const agentRequest: AgentRequest = {
    message: input.message,
    history: [],
    canvas: input.canvas,
    attachments: input.attachments,
  };

  const turn = await runAskAiTurn({
    context,
    session,
    prompt: buildCurrentTurnPrompt(agentRequest),
    request: agentRequest,
    signal: input.signal,
  });

  const workflowSignals = extractWorkflowSignalsFromToolRuns(
    turn.requestId,
    turn.response.actions,
  );
  const charts = extractRenderChartSpecs(workflowSignals.actions);
  const assistantMessageId = randomUUID();
  const evidence = enrichEvidenceFromToolRuns(turn.structured.evidence, turn.requestId);
  const artifacts = enrichArtifactsFromToolRuns(turn.structured.artifacts, turn.requestId);

  conversationTaskStore.appendMessage({
    conversationId: conversationFresh.id,
    id: assistantMessageId,
    role: "assistant",
    content: turn.response.message,
    blocks: turn.response.blocks,
    actions: workflowSignals.actions,
    charts,
    evidence,
    artifacts,
  });

  let workflowRequest = workflowSignals.workflowRequest;
  if (turn.kind === "completed") {
    const openCanvasAction = workflowRequest
      ? undefined
      : workflowSignals.actions.find(
      (action) => action.type === "open_handwriting_canvas",
        );
    if (openCanvasAction && openCanvasAction.type === "open_handwriting_canvas") {
      workflowRequest = startDralkFromAgentIntent({
        conversationId: conversationFresh.id,
        prompt: openCanvasAction.prompt || input.message,
        mode: openCanvasAction.mode,
        language: openCanvasAction.language,
        forceNew: openCanvasAction.force_new,
      });
    } else if (shouldConsumeDralk) {
      // This turn used Dralk input — close the workflow.
      if (getActiveDralkWorkflow(conversationFresh.id)) {
        completeDralkWorkflow(conversationFresh.id);
      } else {
        conversationTaskStore.update(conversationFresh.id, { status: "ready", currentStep: null });
      }
    } else {
      const stillActive = getActiveDralkWorkflow(conversationFresh.id);
      if (stillActive) {
        // Keep Dralk session open while user chats; restore waiting status.
        conversationTaskStore.update(conversationFresh.id, {
          status: "waiting_for_input",
          currentStep: `dralk:${stillActive.status}`,
        });
      } else {
        conversationTaskStore.update(conversationFresh.id, { status: "ready", currentStep: null });
      }
    }
  }

  return buildRunResponse({
    conversationId: conversationFresh.id,
    sessionId: conversationFresh.sessionId,
    turn,
    userMessageId,
    assistantMessageId,
    workflowRequest,
    actions: workflowSignals.actions,
  });
}

export async function resumeAgentTurn(input: AgentResumeRequest): Promise<AgentRunResponse> {
  const conversation = conversationTaskStore.getById(input.conversationId);
  if (!conversation) {
    throw new Error(`Conversation not found: ${input.conversationId}`);
  }
  if (
    (input.userId && conversation.userId !== input.userId) ||
    (input.tenantId && conversation.tenantId !== input.tenantId)
  ) {
    throw new Error("Conversation access denied for current principal");
  }

  conversationTaskStore.update(conversation.id, { status: "running", currentStep: "approval:resuming" });

  const session = new SqliteSession({ sessionId: conversation.sessionId });
  const context = createAgentContext({
    userId: input.userId ?? conversation.userId,
    tenantId: input.tenantId ?? conversation.tenantId,
    conversationId: conversation.id,
    projectId: conversation.projectId ?? undefined,
    currentSurface: "ask_ai",
  });

  const agentRequest: AgentRequest = {
    message: "Resume after approval decisions.",
    history: [],
    attachments: [],
  };

  const turn = await resumeAskAiRun({
    context,
    session,
    runStateId: input.runStateId,
    decisions: input.decisions,
    request: agentRequest,
    signal: input.signal,
  });

  const workflowSignals = extractWorkflowSignalsFromToolRuns(
    turn.requestId,
    turn.response.actions,
  );
  const charts = extractRenderChartSpecs(workflowSignals.actions);
  const assistantMessageId = randomUUID();
  const evidence = enrichEvidenceFromToolRuns(turn.structured.evidence, turn.requestId);
  const artifacts = enrichArtifactsFromToolRuns(turn.structured.artifacts, turn.requestId);

  conversationTaskStore.appendMessage({
    conversationId: conversation.id,
    id: assistantMessageId,
    role: "assistant",
    content: turn.response.message,
    blocks: turn.response.blocks,
    actions: workflowSignals.actions,
    charts,
    evidence,
    artifacts,
  });

  const workflowRequest = workflowSignals.workflowRequest;
  if (turn.kind === "completed") {
    conversationTaskStore.update(conversation.id, { status: "ready", currentStep: null });
  }

  return buildRunResponse({
    conversationId: conversation.id,
    sessionId: conversation.sessionId,
    turn,
    userMessageId: "",
    assistantMessageId,
    workflowRequest,
    actions: workflowSignals.actions,
  });
}

export function getConversationMessagesForUi(conversationId: string): ChatMessage[] {
  return conversationTaskStore.listMessages(conversationId);
}
