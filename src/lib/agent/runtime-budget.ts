import { getNumberEnv } from "@/lib/env";

export type AgentRuntimeBudgetState = {
  startedAtMs: number;
  deadlineAtMs: number;
  maxToolCalls: number;
  maxCallsPerTool: number;
  totalToolCalls: number;
  toolCalls: Record<string, number>;
};

export type AgentRuntimeLimits = {
  maxTurns: number;
  timeoutMs: number;
  maxToolCalls: number;
  maxCallsPerTool: number;
  maxFunctionToolConcurrency: number;
  toolTimeoutMs: number;
};

function boundedInteger(value: number, min: number, max: number): number {
  return Math.min(Math.max(Math.floor(value), min), max);
}

export function getAgentRuntimeLimits(): AgentRuntimeLimits {
  return {
    maxTurns: boundedInteger(getNumberEnv("AGENT_MAX_TURNS", 8), 2, 24),
    timeoutMs: boundedInteger(getNumberEnv("AGENT_RUN_TIMEOUT_MS", 90_000), 5_000, 300_000),
    maxToolCalls: boundedInteger(getNumberEnv("AGENT_MAX_TOOL_CALLS", 12), 1, 40),
    maxCallsPerTool: boundedInteger(
      getNumberEnv("AGENT_MAX_CALLS_PER_TOOL", 4),
      1,
      12,
    ),
    maxFunctionToolConcurrency: boundedInteger(
      getNumberEnv("AGENT_MAX_TOOL_CONCURRENCY", 3),
      1,
      8,
    ),
    toolTimeoutMs: boundedInteger(
      getNumberEnv("AGENT_TOOL_TIMEOUT_MS", 20_000),
      1_000,
      120_000,
    ),
  };
}

export function createRuntimeBudgetState(
  limits = getAgentRuntimeLimits(),
): AgentRuntimeBudgetState {
  const startedAtMs = Date.now();
  return {
    startedAtMs,
    deadlineAtMs: startedAtMs + limits.timeoutMs,
    maxToolCalls: limits.maxToolCalls,
    maxCallsPerTool: limits.maxCallsPerTool,
    totalToolCalls: 0,
    toolCalls: {},
  };
}

export type ToolBudgetDecision =
  | { allowed: true; totalToolCalls: number; toolCalls: number }
  | { allowed: false; code: "RUN_DEADLINE_EXCEEDED" | "TOOL_BUDGET_EXCEEDED"; message: string };

export function consumeToolBudget(
  state: AgentRuntimeBudgetState,
  toolName: string,
): ToolBudgetDecision {
  if (Date.now() >= state.deadlineAtMs) {
    return {
      allowed: false,
      code: "RUN_DEADLINE_EXCEEDED",
      message: "Agent 运行时间预算已耗尽，工具调用被终止。",
    };
  }

  const callsForTool = state.toolCalls[toolName] ?? 0;
  if (
    state.totalToolCalls >= state.maxToolCalls ||
    callsForTool >= state.maxCallsPerTool
  ) {
    return {
      allowed: false,
      code: "TOOL_BUDGET_EXCEEDED",
      message:
        state.totalToolCalls >= state.maxToolCalls
          ? `本轮最多允许 ${state.maxToolCalls} 次工具调用。`
          : `工具 ${toolName} 本轮最多允许调用 ${state.maxCallsPerTool} 次。`,
    };
  }

  state.totalToolCalls += 1;
  state.toolCalls[toolName] = callsForTool + 1;
  return {
    allowed: true,
    totalToolCalls: state.totalToolCalls,
    toolCalls: state.toolCalls[toolName],
  };
}

export function createRunAbortSignal(
  externalSignal: AbortSignal | undefined,
  timeoutMs: number,
): AbortSignal {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  return externalSignal
    ? AbortSignal.any([externalSignal, timeoutSignal])
    : timeoutSignal;
}
