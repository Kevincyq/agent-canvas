import type { RunContext } from "@openai/agents";

import type { AgentContext } from "@/lib/agent/context";
import { withToolRunLogging } from "@/lib/db/repositories/tool-runs";
import type { ToolReceipt } from "@/types/tool-receipt";

export function getAgentContext(
  runContext?: RunContext<AgentContext>,
): AgentContext | null {
  return runContext?.context ?? null;
}

export async function executeLoggedTool<T>(
  toolName: string,
  args: unknown,
  runContext: RunContext<AgentContext> | undefined,
  execute: (context: AgentContext) => Promise<ToolReceipt<T>>,
): Promise<ToolReceipt<T>> {
  const context = getAgentContext(runContext);
  if (!context) {
    return {
      ok: false,
      tool: toolName,
      executionId: "missing_context",
      error: {
        code: "MISSING_CONTEXT",
        message: "AgentContext is required for tool execution.",
        retryable: false,
      },
      verifiedAt: new Date().toISOString(),
    };
  }

  return withToolRunLogging(
    {
      conversationId: context.conversationId,
      requestId: context.requestId,
      toolName,
      arguments: args,
    },
    () => execute(context),
  );
}
