import { randomUUID } from "node:crypto";

import { getDb } from "@/lib/db/client";
import { createToolReceipt, type ToolReceipt } from "@/types/tool-receipt";

export type ToolRunStatus = "running" | "completed" | "failed";

export function startToolRun(input: {
  conversationId: string;
  requestId: string;
  toolName: string;
  arguments: unknown;
}): string {
  const id = randomUUID();
  getDb()
    .prepare(
      `INSERT INTO tool_runs (
        id, conversation_id, request_id, tool_name, arguments_json, result_json, status, started_at, completed_at
      ) VALUES (?, ?, ?, ?, ?, NULL, 'running', ?, NULL)`,
    )
    .run(
      id,
      input.conversationId,
      input.requestId,
      input.toolName,
      JSON.stringify(input.arguments ?? {}),
      new Date().toISOString(),
    );
  return id;
}

export function completeToolRun(
  id: string,
  status: Exclude<ToolRunStatus, "running">,
  result: unknown,
): void {
  getDb()
    .prepare(
      `UPDATE tool_runs
       SET status = ?, result_json = ?, completed_at = ?
       WHERE id = ?`,
    )
    .run(status, JSON.stringify(result ?? null), new Date().toISOString(), id);
}

export async function withToolRunLogging<T>(
  input: {
    conversationId: string;
    requestId: string;
    toolName: string;
    arguments: unknown;
  },
  execute: () => Promise<ToolReceipt<T>>,
): Promise<ToolReceipt<T>> {
  const runId = startToolRun(input);
  try {
    const receipt = await execute();
    completeToolRun(runId, receipt.ok ? "completed" : "failed", receipt);
    return {
      ...receipt,
      executionId: receipt.executionId || runId,
    };
  } catch (error) {
    const failed = createToolReceipt<T>({
      ok: false,
      tool: input.toolName,
      executionId: runId,
      error: {
        code: "TOOL_EXCEPTION",
        message: error instanceof Error ? error.message : "Tool execution failed",
        retryable: true,
      },
    });
    completeToolRun(runId, "failed", failed);
    return failed;
  }
}
