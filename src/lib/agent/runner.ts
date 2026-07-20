import { Runner, setTracingDisabled, type Session } from "@openai/agents";

import { getAskAiAgent } from "@/lib/agent/ask-ai-agent";
import type { AgentContext } from "@/lib/agent/context";
import { applyProviderConfig } from "@/lib/agent/provider";
import {
  AskAiStructuredOutputSchema,
  createEmptyStructuredOutput,
  structuredOutputToAgentResponse,
  type AskAiStructuredOutput,
} from "@/lib/agent/result";
import type { AgentRequest, AgentResponse } from "@/types/agent";

export type RunnerTurnInput = {
  context: AgentContext;
  session: Session;
  /** Current-turn prompt only. Multi-turn history must come from Session. */
  prompt: string;
  /** Used only for local fallback / fidelity helpers when model is unavailable. */
  request: AgentRequest;
};

export type RunnerTurnResult = {
  structured: AskAiStructuredOutput;
  response: AgentResponse;
  requestId: string;
};

let sharedRunner: Runner | null = null;

export function getSharedRunner(): Runner {
  applyProviderConfig();
  setTracingDisabled(true);

  if (!sharedRunner) {
    sharedRunner = new Runner({
      // Provider client is applied globally via applyProviderConfig().
      // Guardrails live on the Agent; Runner orchestrates the loop + Session.
    });
  }

  return sharedRunner;
}

export function resetSharedRunnerForTests() {
  sharedRunner = null;
}

/**
 * Build current-turn model input without client-side chat history windows.
 * Session supplies prior turns.
 */
export function buildCurrentTurnPrompt(request: AgentRequest): string {
  return JSON.stringify({
    task: "Answer via structured output. Use Session history for follow-ups; do not expect recentHistory.",
    userMessage: request.message,
    canvas: request.canvas ?? null,
    attachments: request.attachments.map((attachment) => ({
      id: attachment.id,
      name: attachment.name,
      kind: attachment.kind,
      mimeType: attachment.mimeType,
      content: attachment.content,
      metadata: attachment.metadata,
    })),
  });
}

export async function runAskAiTurn(input: RunnerTurnInput): Promise<RunnerTurnResult> {
  const provider = applyProviderConfig();

  if (!provider.configured) {
    const { createFallbackResponse } = await import("@/lib/agent/intent");
    const fallback = createFallbackResponse(input.request);
    const structured = createEmptyStructuredOutput(
      fallback.message,
      fallback.actions.some((action) => action.type === "open_handwriting_canvas")
        ? "needs_input"
        : "failed",
    );
    // Preserve fallback actions by mapping through a synthetic structured shape.
    return {
      structured,
      response: fallback,
      requestId: input.context.requestId,
    };
  }

  const runner = getSharedRunner();
  const agent = getAskAiAgent();

  try {
    const result = await runner.run(agent, input.prompt, {
      context: input.context,
      session: input.session,
    });

    const structured = AskAiStructuredOutputSchema.parse(result.finalOutput);
    let response = structuredOutputToAgentResponse(structured);

    const { enforceHandwritingMindmapFidelity } = await import(
      "@/lib/agent/diagram-fidelity"
    );
    response = enforceHandwritingMindmapFidelity(input.request, response);

    return {
      structured,
      response,
      requestId: input.context.requestId,
    };
  } catch (error) {
    const { createFallbackResponse } = await import("@/lib/agent/intent");
    const fallback = createFallbackResponse(input.request);
    const message =
      error instanceof Error
        ? `模型调用失败，已使用本地 fallback：${error.message}`
        : "模型调用失败，已使用本地 fallback。";

    return {
      structured: createEmptyStructuredOutput(message, "failed"),
      response: { ...fallback, message },
      requestId: input.context.requestId,
    };
  }
}
