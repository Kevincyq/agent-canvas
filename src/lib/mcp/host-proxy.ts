import type { McpHostProxyRequest, McpHostProxyResponse } from "@/lib/mcp/host-server";

export async function proxyMcpHostRequest(
  request: McpHostProxyRequest,
): Promise<McpHostProxyResponse> {
  const response = await fetch("/api/mcp/host", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  });

  return (await response.json()) as McpHostProxyResponse;
}

export type { McpHostProxyRequest, McpHostProxyResponse };
