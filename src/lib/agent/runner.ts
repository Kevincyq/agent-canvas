import {
  Runner,
  RunState,
  RunContext,
  setTracingDisabled,
  type AgentInputItem,
  type RunStreamEvent,
  type Session,
  type RunToolApprovalItem,
} from "@openai/agents";

import { getAskAiAgent } from "@/lib/agent/ask-ai-agent";
import { extractApprovalCallId, riskLevelForTool } from "@/lib/agent/approvals";
import type { AgentContext } from "@/lib/agent/context";
import { parsePartialJson } from "@/lib/agent/partial-json";
import { applyProviderConfig } from "@/lib/agent/provider";
import {
  createRunAbortSignal,
  getAgentRuntimeLimits,
} from "@/lib/agent/runtime-budget";
import {
  AskAiStructuredOutputSchema,
  createEmptyStructuredOutput,
  structuredOutputToAgentResponse,
  type AskAiStructuredOutput,
} from "@/lib/agent/result";
import {
  decideApproval,
  getPendingRunState,
  getRunStateById,
  insertApprovals,
  insertRunState,
  listPendingApprovals,
  resolveRunState,
  updateRunStateJson,
  type ApprovalRecord,
} from "@/lib/db/repositories/approvals";
import type { AgentRequest, AgentResponse } from "@/types/agent";
import {
  STREAMING_BLOCK_ID_PREFIX,
  type AgentRuntimeEventSink,
} from "@/types/agent-stream";

/** Soft cap for Session history sent to the model (current turn always kept). */
const MAX_SESSION_HISTORY_CHARS = 80_000;
const MAX_ATTACHMENT_CONTENT_CHARS = 8_000;

function truncateText(value: string, maxChars: number): string {
  if (value.length <= maxChars) {
    return value;
  }

  return `${value.slice(0, maxChars)}\n…[truncated ${value.length - maxChars} chars]`;
}

/**
 * Keep newest history items that fit the budget, then append this turn's items.
 * Prevents multi-turn tool/diagram payloads from blowing context or guardrails.
 */
export function trimSessionInputForModel(
  historyItems: AgentInputItem[],
  newItems: AgentInputItem[],
): AgentInputItem[] {
  const newItemsSize = JSON.stringify(newItems).length;
  let size = newItemsSize;
  const keptNewest: AgentInputItem[] = [];

  for (let index = historyItems.length - 1; index >= 0; index -= 1) {
    const item = historyItems[index]!;
    const itemSize = JSON.stringify(item).length;

    if (keptNewest.length > 0 && size + itemSize > MAX_SESSION_HISTORY_CHARS) {
      break;
    }

    keptNewest.push(item);
    size += itemSize;
  }

  keptNewest.reverse();
  return [...keptNewest, ...newItems];
}

export type RunnerTurnInput = {
  context: AgentContext;
  session: Session;
  prompt: string;
  request: AgentRequest;
  signal?: AbortSignal;
};

export type ApprovalCard = {
  id: string;
  runStateId: string;
  callId: string;
  toolName: string;
  argumentsJson: string;
  riskLevel: string;
  createdAt: string;
};

export type RunnerTurnResult =
  | {
      kind: "completed";
      structured: AskAiStructuredOutput;
      response: AgentResponse;
      requestId: string;
      approvals?: ApprovalCard[];
    }
  | {
      kind: "waiting_for_approval";
      structured: AskAiStructuredOutput;
      response: AgentResponse;
      requestId: string;
      runStateId: string;
      approvals: ApprovalCard[];
    };

export type ResumeDecision = {
  callId: string;
  decision: "approve" | "reject";
  message?: string;
};

let sharedRunner: Runner | null = null;

export function getSharedRunner(): Runner {
  applyProviderConfig();
  setTracingDisabled(true);
  if (!sharedRunner) {
    sharedRunner = new Runner({});
  }
  return sharedRunner;
}

export function resetSharedRunnerForTests() {
  sharedRunner = null;
}

export function buildCurrentTurnPrompt(request: AgentRequest): string {
  const canvas =
    request.canvas == null
      ? null
      : request.canvas.host === "fluxink_widget" ||
          ((request.canvas.strokeCount ?? 0) === 0 &&
            (request.canvas.textCount ?? 0) === 0 &&
            request.canvas.isOpen)
        ? {
            isOpen: request.canvas.isOpen,
            host: request.canvas.host ?? "fluxink_widget",
            note: "FluxInk strokes are not visible to AskAI until the user sends recognized text from the canvas. Do not infer empty handwriting from missing stroke counts. For prior handwriting, use Session history and attachments.",
          }
        : {
            isOpen: request.canvas.isOpen,
            strokeCount: request.canvas.strokeCount ?? 0,
            textCount: request.canvas.textCount ?? 0,
            selectedElementId: request.canvas.selectedElementId ?? null,
            host: request.canvas.host ?? "local_canvas",
          };

  return JSON.stringify({
    task: "Answer via structured output. Use Session history for follow-ups; do not expect recentHistory.",
    userMessage: truncateText(request.message, MAX_ATTACHMENT_CONTENT_CHARS * 4),
    canvas,
    attachments: request.attachments.map((attachment) => ({
      id: attachment.id,
      name: attachment.name,
      kind: attachment.kind,
      mimeType: attachment.mimeType,
      content: truncateText(attachment.content, MAX_ATTACHMENT_CONTENT_CHARS),
      metadata: attachment.metadata,
    })),
  });
}

function toApprovalCards(records: ApprovalRecord[]): ApprovalCard[] {
  return records.map((record) => ({
    id: record.id,
    runStateId: record.runStateId,
    callId: record.callId,
    toolName: record.toolName,
    argumentsJson: record.argumentsJson,
    riskLevel: record.riskLevel,
    createdAt: record.createdAt,
  }));
}

function waitingMessage(approvals: ApprovalCard[]): AgentResponse {
  const tools = approvals.map((item) => item.toolName).join(", ");
  return {
    message: `需要你确认后才能继续：${tools || "写入操作"}。`,
    blocks: [
      {
        id: "approval-pending",
        type: "markdown",
        sourceFormat: "markdown",
        title: "等待审批",
        source: `以下工具需要你确认后才会执行：\n\n${approvals
          .map((item) => `- **${item.toolName}** (\`${item.callId}\`)`)
          .join("\n")}`,
      },
    ],
    actions: [],
  };
}

async function persistInterruptions(
  conversationId: string,
  state: RunState<AgentContext, ReturnType<typeof getAskAiAgent>>,
  interruptions: RunToolApprovalItem[],
  existingRunStateId?: string,
): Promise<{ runStateId: string; approvals: ApprovalCard[] }> {
  const serialized = state.toString();
  const runState = existingRunStateId
    ? (() => {
        updateRunStateJson(existingRunStateId, serialized);
        const existing = getRunStateById(existingRunStateId);
        if (!existing) {
          throw new Error(`RunState not found: ${existingRunStateId}`);
        }
        return existing;
      })()
    : insertRunState({
        conversationId,
        stateJson: serialized,
        reason: "tool_approval",
      });

  const approvalRows = insertApprovals(
    interruptions.map((item) => {
      const toolName = item.name ?? item.toolName ?? "unknown_tool";
      return {
        conversationId,
        runStateId: runState.id,
        callId: extractApprovalCallId(item),
        toolName,
        argumentsJson: item.arguments ?? "{}",
        riskLevel: riskLevelForTool(toolName),
      };
    }),
  );

  return {
    runStateId: runState.id,
    approvals: toApprovalCards(approvalRows.filter((item) => !item.decision)),
  };
}

async function finalizeResult(
  result: {
    finalOutput?: unknown;
    interruptions: RunToolApprovalItem[];
    state: RunState<AgentContext, ReturnType<typeof getAskAiAgent>>;
  },
  input: { context: AgentContext; request: AgentRequest },
  existingRunStateId?: string,
): Promise<RunnerTurnResult> {
  if (result.interruptions.length > 0) {
    const persisted = await persistInterruptions(
      input.context.conversationId,
      result.state,
      result.interruptions,
      existingRunStateId,
    );
    const response = waitingMessage(persisted.approvals);
    return {
      kind: "waiting_for_approval",
      structured: createEmptyStructuredOutput(response.message, "needs_approval"),
      response,
      requestId: input.context.requestId,
      runStateId: persisted.runStateId,
      approvals: persisted.approvals,
    };
  }

  if (existingRunStateId) {
    resolveRunState(existingRunStateId, "resolved");
  }

  const structured = AskAiStructuredOutputSchema.parse(result.finalOutput);
  let response = structuredOutputToAgentResponse(structured);
  const { enforceHandwritingMindmapFidelity } = await import(
    "@/lib/agent/diagram-fidelity"
  );
  response = enforceHandwritingMindmapFidelity(input.request, response);

  return {
    kind: "completed",
    structured,
    response,
    requestId: input.context.requestId,
    approvals: [],
  };
}

type StreamedTurn = AsyncIterable<RunStreamEvent> & {
  completed: Promise<void>;
  finalOutput?: unknown;
  interruptions?: RunToolApprovalItem[];
  state: RunState<AgentContext, ReturnType<typeof getAskAiAgent>>;
};

type DrainedRun = {
  finalOutput?: unknown;
  interruptions: RunToolApprovalItem[];
  state: RunState<AgentContext, ReturnType<typeof getAskAiAgent>>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Forward prose that is safe to show half-written. Markdown degrades gracefully
 * mid-token, while a truncated table, mermaid or latex source would render as
 * broken output, so those stay gated on `block.completed`.
 */
function emitMarkdownBlockDeltas(
  blocks: unknown,
  emittedBlockChars: Map<string, number>,
  onEvent: AgentRuntimeEventSink,
): void {
  if (!Array.isArray(blocks)) {
    return;
  }

  blocks.forEach((block, index) => {
    if (!isRecord(block) || block.type !== "markdown") {
      return;
    }

    const source = block.source;
    if (typeof source !== "string") {
      return;
    }

    // Key on position: the block's own id is still streaming and would churn.
    const blockId = `${STREAMING_BLOCK_ID_PREFIX}${index}`;
    const sent = emittedBlockChars.get(blockId) ?? 0;
    if (source.length <= sent) {
      return;
    }

    onEvent({
      type: "block.delta",
      blockId,
      title: typeof block.title === "string" ? block.title : undefined,
      delta: source.slice(sent),
    });
    emittedBlockChars.set(blockId, source.length);
  });
}

/**
 * Drain a streamed run, forwarding answer text as the model produces it.
 * Raw deltas are fragments of a single structured-output JSON document, so the
 * buffer is re-parsed tolerantly on each chunk; charts and typed diagrams stay
 * gated on a complete object and are emitted after the run finishes.
 */
async function drainStreamedRun(
  stream: StreamedTurn,
  onEvent?: AgentRuntimeEventSink,
): Promise<DrainedRun> {
  let jsonBuffer = "";
  let emittedMessageChars = 0;
  const emittedBlockChars = new Map<string, number>();

  for await (const event of stream) {
    if (
      event.type !== "raw_model_stream_event" ||
      event.data.type !== "output_text_delta"
    ) {
      continue;
    }

    jsonBuffer += event.data.delta;
    if (!onEvent) {
      continue;
    }

    const draft = parsePartialJson(jsonBuffer);
    if (!isRecord(draft)) {
      continue;
    }

    if (typeof draft.message === "string" && draft.message.length > emittedMessageChars) {
      onEvent({ type: "answer.delta", delta: draft.message.slice(emittedMessageChars) });
      emittedMessageChars = draft.message.length;
    }

    emitMarkdownBlockDeltas(draft.blocks, emittedBlockChars, onEvent);
  }

  await stream.completed;

  return {
    finalOutput: stream.finalOutput,
    interruptions: stream.interruptions ?? [],
    state: stream.state,
  };
}

export async function runAskAiTurn(input: RunnerTurnInput): Promise<RunnerTurnResult> {
  const provider = applyProviderConfig();
  const limits = getAgentRuntimeLimits();

  if (!provider.configured) {
    const { createFallbackResponse } = await import("@/lib/agent/intent");
    const fallback = createFallbackResponse(input.request);
    return {
      kind: "completed",
      structured: createEmptyStructuredOutput(
        fallback.message,
        fallback.actions.some((action) => action.type === "open_handwriting_canvas")
          ? "needs_input"
          : "failed",
      ),
      response: fallback,
      requestId: input.context.requestId,
    };
  }

  const runner = getSharedRunner();
  const agent = getAskAiAgent();

  try {
    const stream = await runner.run(agent, input.prompt, {
      context: input.context,
      session: input.session,
      sessionInputCallback: trimSessionInputForModel,
      maxTurns: limits.maxTurns,
      signal: createRunAbortSignal(input.signal, limits.timeoutMs),
      toolExecution: {
        maxFunctionToolConcurrency: limits.maxFunctionToolConcurrency,
        preApprovalInputGuardrails: true,
      },
      stream: true,
    });

    return finalizeResult(
      await drainStreamedRun(stream, input.context.onRuntimeEvent),
      input,
    );
  } catch (error) {
    const { createFallbackResponse } = await import("@/lib/agent/intent");
    const fallback = createFallbackResponse(input.request);
    const message =
      error instanceof Error
        ? `模型调用失败，已使用本地 fallback：${error.message}`
        : "模型调用失败，已使用本地 fallback。";

    return {
      kind: "completed",
      structured: createEmptyStructuredOutput(message, "failed"),
      response: { ...fallback, message },
      requestId: input.context.requestId,
    };
  }
}

export async function resumeAskAiRun(input: {
  context: AgentContext;
  session: Session;
  runStateId?: string;
  decisions: ResumeDecision[];
  request: AgentRequest;
  signal?: AbortSignal;
}): Promise<RunnerTurnResult> {
  applyProviderConfig();
  const limits = getAgentRuntimeLimits();
  const runner = getSharedRunner();
  const agent = getAskAiAgent();

  const runStateRecord =
    (input.runStateId ? getRunStateById(input.runStateId) : null) ??
    getPendingRunState(input.context.conversationId);

  if (!runStateRecord || runStateRecord.status !== "pending") {
    throw new Error("No pending RunState to resume");
  }

  const state = await RunState.fromStringWithContext(
    agent,
    runStateRecord.stateJson,
    new RunContext(input.context),
  );

  const decisionByCallId = new Map(
    input.decisions.map((item) => [item.callId, item] as const),
  );

  for (const interruption of state.getInterruptions()) {
    const callId = extractApprovalCallId(interruption);
    const decision = decisionByCallId.get(callId);
    if (!decision) {
      continue;
    }

    if (decision.decision === "approve") {
      state.approve(interruption);
      decideApproval({
        runStateId: runStateRecord.id,
        callId,
        decision: "approve",
        decisionMessage: decision.message,
      });
    } else {
      state.reject(interruption, {
        message: decision.message ?? "用户拒绝了该工具调用。",
      });
      decideApproval({
        runStateId: runStateRecord.id,
        callId,
        decision: "reject",
        decisionMessage: decision.message ?? "用户拒绝了该工具调用。",
      });
    }
  }

  // Persist approved/rejected state before resume in case process dies mid-run.
  updateRunStateJson(runStateRecord.id, state.toString());

  const stream = await runner.run(agent, state, {
    context: input.context,
    session: input.session,
    signal: createRunAbortSignal(input.signal, limits.timeoutMs),
    toolExecution: {
      maxFunctionToolConcurrency: limits.maxFunctionToolConcurrency,
      preApprovalInputGuardrails: true,
    },
    stream: true,
  });

  return finalizeResult(
    await drainStreamedRun(stream, input.context.onRuntimeEvent),
    { context: input.context, request: input.request },
    runStateRecord.id,
  );
}

export function getPendingApprovalCards(conversationId: string): ApprovalCard[] {
  return toApprovalCards(listPendingApprovals(conversationId));
}
