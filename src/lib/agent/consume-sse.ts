import type { AgentRunResponse } from "@/types/agent-runtime";
import type { AgentStreamEvent } from "@/types/agent-stream";

/**
 * Browser helper: parse an Agent SSE body and return the terminal `done` payload.
 */
export async function consumeAgentSse(
  response: Response,
  onEvent?: (event: AgentStreamEvent) => void | Promise<void>,
): Promise<AgentRunResponse> {
  if (!response.body) {
    throw new Error("SSE 响应没有正文");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let doneResult: AgentRunResponse | null = null;
  let errorMessage: string | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() ?? "";

    for (const chunk of chunks) {
      const dataLine = chunk
        .split("\n")
        .find((line) => line.startsWith("data:"));
      if (!dataLine) {
        continue;
      }
      const event = JSON.parse(dataLine.slice(5).trim()) as AgentStreamEvent;
      await onEvent?.(event);
      if (event.type === "done") {
        doneResult = event.result;
      }
      if (event.type === "error") {
        errorMessage = event.message;
      }
    }
  }

  if (errorMessage) {
    throw new Error(errorMessage);
  }
  if (!doneResult) {
    throw new Error("SSE 未返回完成事件");
  }
  return doneResult;
}
