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
import type { ConnectorId } from "@/types/tool-gateway";

const TOOL_CONNECTOR: Record<AskAiToolName, ConnectorId> = {
  get_current_context: "runtime",
  get_project_context: "pkb",
  search_personal_knowledge: "pkb",
  search_web: "web_search",
  get_meeting_context: "meeting",
  start_dralk_workflow: "workflow",
  start_meeting_workflow: "workflow",
  start_writing_assist_workflow: "workflow",
  start_translation_workflow: "workflow",
  save_artifact_to_project: "artifact",
  create_todo: "todo",
  create_calendar_event: "calendar",
};

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

      context.onRuntimeEvent?.({
        type: "tool.started",
        requestId: context.requestId,
        toolName,
        connectorId: TOOL_CONNECTOR[toolName],
      });

      try {
        const receipt = await execute(context);
        context.onRuntimeEvent?.({
          type: "tool.completed",
          requestId: context.requestId,
          toolName,
          connectorId: TOOL_CONNECTOR[toolName],
          ok: receipt.ok,
        });
        return receipt;
      } catch (error) {
        context.onRuntimeEvent?.({
          type: "tool.completed",
          requestId: context.requestId,
          toolName,
          connectorId: TOOL_CONNECTOR[toolName],
          ok: false,
        });
        throw error;
      }
    },
  );
}
