import type { RunContext } from "@openai/agents";

import type { AgentContext } from "@/lib/agent/context";
import { consumeToolBudget } from "@/lib/agent/runtime-budget";
import {
  authorizeToolCall,
  type AskAiToolName,
} from "@/lib/agent/tool-policy";
import { withToolRunLogging } from "@/lib/db/repositories/tool-runs";
import { createFailedToolReceipt } from "@/types/tool-receipt";
import type { ToolReceipt } from "@/types/tool-receipt";

export function getAgentContext(
  runContext?: RunContext<AgentContext>,
): AgentContext | null {
  return runContext?.context ?? null;
}

export async function executeLoggedTool<T>(
  toolName: AskAiToolName,
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
    async () => {
      const authorization = authorizeToolCall(context, toolName, args);
      if (!authorization.allowed) {
        return createFailedToolReceipt(
          toolName,
          authorization.code,
          authorization.message,
          false,
        );
      }

      const budget = consumeToolBudget(context.runtimeBudget, toolName);
      if (!budget.allowed) {
        return createFailedToolReceipt(
          toolName,
          budget.code,
          budget.message,
          false,
        );
      }

      return execute(context);
    },
  );
}
