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
import type { AgentRequest, AgentResponse, ChatMessage } from "@/types/agent";
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
    const source = `tool_receipt:${run.toolName}`;
    if (existingSources.has(source)) {
      continue;
    }
    existingSources.add(source);
    const written =
      receipt?.ok &&
      typeof receipt.data === "object" &&
      receipt.data !== null &&
      "written" in (receipt.data as Record<string, unknown>)
        ? Boolean((receipt.data as { written?: boolean }).written)
        : receipt?.ok;
    merged.push({
      id: receipt?.executionId || run.id,
      label: written
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

function buildRunResponse(input: {
  conversationId: string;
  sessionId: string;
  turn: RunnerTurnResult;
  userMessageId: string;
  assistantMessageId: string;
  workflowRequest?: WorkflowRequest;
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
    actions: input.turn.response.actions,
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
  if (activeBefore && (input.dralkContext || input.attachments.length > 0 || input.canvas?.isOpen)) {
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

  if (conversationFresh.title === "New chat" || conversationFresh.title === "Dralk 输入") {
    conversationTaskStore.update(conversationFresh.id, {
      title: titleFromFirstMessage(input.message),
    });
  }

  const session = new SqliteSession({ sessionId: conversationFresh.sessionId });
  const context = createAgentContext({
    userId: input.userId ?? conversationFresh.userId,
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
  });

  const charts = extractRenderChartSpecs(turn.response.actions);
  const assistantMessageId = randomUUID();
  const evidence = enrichEvidenceFromToolRuns(turn.structured.evidence, turn.requestId);
  const artifacts = enrichArtifactsFromToolRuns(turn.structured.artifacts, turn.requestId);

  conversationTaskStore.appendMessage({
    conversationId: conversationFresh.id,
    id: assistantMessageId,
    role: "assistant",
    content: turn.response.message,
    blocks: turn.response.blocks,
    actions: turn.response.actions,
    charts,
    evidence,
    artifacts,
  });

  let workflowRequest: WorkflowRequest | undefined;
  if (turn.kind === "completed") {
    const openCanvasAction = turn.response.actions.find(
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
    } else if (getActiveDralkWorkflow(conversationFresh.id)) {
      completeDralkWorkflow(conversationFresh.id);
    } else {
      conversationTaskStore.update(conversationFresh.id, { status: "ready", currentStep: null });
    }
  }

  return buildRunResponse({
    conversationId: conversationFresh.id,
    sessionId: conversationFresh.sessionId,
    turn,
    userMessageId,
    assistantMessageId,
    workflowRequest,
  });
}

export async function resumeAgentTurn(input: AgentResumeRequest): Promise<AgentRunResponse> {
  const conversation = conversationTaskStore.getById(input.conversationId);
  if (!conversation) {
    throw new Error(`Conversation not found: ${input.conversationId}`);
  }

  conversationTaskStore.update(conversation.id, { status: "running", currentStep: "approval:resuming" });

  const session = new SqliteSession({ sessionId: conversation.sessionId });
  const context = createAgentContext({
    userId: input.userId ?? conversation.userId,
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
  });

  const charts = extractRenderChartSpecs(turn.response.actions);
  const assistantMessageId = randomUUID();
  const evidence = enrichEvidenceFromToolRuns(turn.structured.evidence, turn.requestId);
  const artifacts = enrichArtifactsFromToolRuns(turn.structured.artifacts, turn.requestId);

  conversationTaskStore.appendMessage({
    conversationId: conversation.id,
    id: assistantMessageId,
    role: "assistant",
    content: turn.response.message,
    blocks: turn.response.blocks,
    actions: turn.response.actions,
    charts,
    evidence,
    artifacts,
  });

  let workflowRequest: WorkflowRequest | undefined;
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
  });
}

export function getConversationMessagesForUi(conversationId: string): ChatMessage[] {
  return conversationTaskStore.listMessages(conversationId);
}
