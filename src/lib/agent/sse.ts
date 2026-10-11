import type { AgentStreamEvent } from "@/types/agent-stream";

export function requestWantsSse(request: Request): boolean {
  const accept = request.headers.get("accept") ?? "";
  return accept.includes("text/event-stream");
}

export function encodeSseEvent(event: AgentStreamEvent): Uint8Array {
  return new TextEncoder().encode(
    `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`,
  );
}

export function createSseResponse(
  run: (send: (event: AgentStreamEvent) => void) => Promise<void>,
): Response {
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: AgentStreamEvent) => {
        controller.enqueue(encodeSseEvent(event));
      };

      try {
        await run(send);
      } catch (error) {
        send({
          type: "error",
          message: error instanceof Error ? error.message : "Agent SSE 运行失败",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
