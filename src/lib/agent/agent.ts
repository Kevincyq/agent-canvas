import { randomUUID } from "node:crypto";

import { createAgentContext } from "@/lib/agent/context";
import { createFallbackResponse } from "@/lib/agent/intent";
import {
  buildCurrentTurnPrompt,
  resumeAskAiRun,
  runAskAiTurn,
  type RunnerTurnResult,
} from "@/lib/agent/runner";
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

/** @deprecated Prefer runAgentTurn via POST /api/agent/run. */
export async function runCanvasAgent(request: AgentRequest): Promise<AgentResponse> {
  return createFallbackResponse(request);
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
    evidence: input.turn.structured.evidence,
    artifacts: input.turn.structured.artifacts,
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
  });

  conversationTaskStore.update(conversation.id, { status: "running" });

  const activeBefore = getActiveDralkWorkflow(conversation.id);
  if (activeBefore && (input.dralkContext || input.attachments.length > 0 || input.canvas?.isOpen)) {
    if (input.dralkContext) {
      try {
        transitionDralkWorkflow({
          conversationId: conversation.id,
          workflowId: activeBefore.id,
          event: activeBefore.status === "capturing" ? "recognized" : "attached",
          queryPayload: input.dralkContext,
        });
      } catch {
        // ignore workflow race
      }
    }
    markDralkAttachedAndRunning(conversation.id);
  }

  const userMessageId = randomUUID();
  conversationTaskStore.appendMessage({
    conversationId: conversation.id,
    id: userMessageId,
    role: "user",
    content: input.message,
    attachments: input.attachments,
  });

  if (conversation.title === "New chat" || conversation.title === "Dralk 输入") {
    conversationTaskStore.update(conversation.id, {
      title: titleFromFirstMessage(input.message),
    });
  }

  const session = new SqliteSession({ sessionId: conversation.sessionId });
  const context = createAgentContext({
    userId: input.userId ?? conversation.userId,
    conversationId: conversation.id,
    projectId: conversation.projectId ?? undefined,
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

  conversationTaskStore.appendMessage({
    conversationId: conversation.id,
    id: assistantMessageId,
    role: "assistant",
    content: turn.response.message,
    blocks: turn.response.blocks,
    actions: turn.response.actions,
    charts,
  });

  let workflowRequest: WorkflowRequest | undefined;
  if (turn.kind === "completed") {
    const openCanvasAction = turn.response.actions.find(
      (action) => action.type === "open_handwriting_canvas",
    );
    if (openCanvasAction && openCanvasAction.type === "open_handwriting_canvas") {
      workflowRequest = startDralkFromAgentIntent({
        conversationId: conversation.id,
        prompt: openCanvasAction.prompt || input.message,
        mode: openCanvasAction.mode,
        language: openCanvasAction.language,
        forceNew: openCanvasAction.force_new,
      });
    } else if (getActiveDralkWorkflow(conversation.id)) {
      completeDralkWorkflow(conversation.id);
    } else {
      conversationTaskStore.update(conversation.id, { status: "ready", currentStep: null });
    }
  }

  return buildRunResponse({
    conversationId: conversation.id,
    sessionId: conversation.sessionId,
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

  conversationTaskStore.appendMessage({
    conversationId: conversation.id,
    id: assistantMessageId,
    role: "assistant",
    content: turn.response.message,
    blocks: turn.response.blocks,
    actions: turn.response.actions,
    charts,
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
