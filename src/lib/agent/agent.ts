import { randomUUID } from "node:crypto";

import { createAgentContext } from "@/lib/agent/context";
import { createFallbackResponse } from "@/lib/agent/intent";
import { buildCurrentTurnPrompt, runAskAiTurn } from "@/lib/agent/runner";
import { extractRenderChartSpecs } from "@/lib/plot/extract-charts";
import { SqliteSession } from "@/lib/session/sqlite-session";
import { conversationTaskStore } from "@/lib/task/task-store";
import { titleFromFirstMessage } from "@/lib/task/task-state";
import type { AgentRequest, AgentResponse, ChatMessage } from "@/types/agent";
import type { AgentRunRequest, AgentRunResponse } from "@/types/agent-runtime";

/** @deprecated Prefer runAgentTurn via POST /api/agent/run. */
export async function runCanvasAgent(request: AgentRequest): Promise<AgentResponse> {
  // Legacy one-shot path without Session — kept only for rare local helpers.
  return createFallbackResponse(request);
}

export async function runAgentTurn(input: AgentRunRequest): Promise<AgentRunResponse> {
  const conversation = conversationTaskStore.ensure(input.conversationId, {
    userId: input.userId,
    title: titleFromFirstMessage(input.message),
    originSurface: "askai",
  });

  conversationTaskStore.update(conversation.id, { status: "running" });

  const userMessageId = randomUUID();
  conversationTaskStore.appendMessage({
    conversationId: conversation.id,
    id: userMessageId,
    role: "user",
    content: input.message,
    attachments: input.attachments,
  });

  if (conversation.title === "New chat") {
    conversationTaskStore.update(conversation.id, {
      title: titleFromFirstMessage(input.message),
    });
  }

  const session = new SqliteSession({ sessionId: conversation.sessionId });
  const context = createAgentContext({
    userId: input.userId ?? conversation.userId,
    conversationId: conversation.id,
    projectId: conversation.projectId ?? undefined,
    currentSurface: "ask_ai",
  });

  // Session owns multi-turn history; never accept client-side history windows.
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

  const updated = conversationTaskStore.update(conversation.id, { status: "ready" });

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
  };
}

export function getConversationMessagesForUi(conversationId: string): ChatMessage[] {
  return conversationTaskStore.listMessages(conversationId);
}
