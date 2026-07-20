import { randomUUID } from "node:crypto";

import { createAgentContext } from "@/lib/agent/context";
import { createFallbackResponse } from "@/lib/agent/intent";
import { buildCurrentTurnPrompt, runAskAiTurn } from "@/lib/agent/runner";
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
import type { AgentRunRequest, AgentRunResponse } from "@/types/agent-runtime";
import type { WorkflowRequest } from "@/types/workflow";

/** @deprecated Prefer runAgentTurn via POST /api/agent/run. */
export async function runCanvasAgent(request: AgentRequest): Promise<AgentResponse> {
  return createFallbackResponse(request);
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
        // Keep going; agent turn should not fail solely on workflow transition races.
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
  }

  const updated = conversationTaskStore.getById(conversation.id);

  return {
    conversationId: conversation.id,
    sessionId: conversation.sessionId,
    status: updated?.status ?? "ready",
    message: turn.response.message,
    blocks: turn.response.blocks,
    actions: turn.response.actions,
    userMessageId,
    assistantMessageId,
    outputStatus: turn.structured.status,
    evidence: turn.structured.evidence,
    artifacts: turn.structured.artifacts,
    requestId: turn.requestId,
    workflowRequest,
  };
}

export function getConversationMessagesForUi(conversationId: string): ChatMessage[] {
  return conversationTaskStore.listMessages(conversationId);
}
