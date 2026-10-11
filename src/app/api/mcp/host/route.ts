import { NextResponse } from "next/server";

import { handleMcpHostProxyRequest, type McpHostProxyRequest } from "@/lib/mcp/host-server";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as McpHostProxyRequest;

    if (!body.method) {
      return NextResponse.json(
        {
          jsonrpc: "2.0",
          id: body.id ?? null,
          error: {
            code: -32600,
            message: "Invalid MCP host proxy request.",
          },
        },
        { status: 400 },
      );
    }

    return NextResponse.json(await handleMcpHostProxyRequest(body));
  } catch (error) {
    return NextResponse.json(
      {
        jsonrpc: "2.0",
        id: null,
        error: {
          code: -32700,
          message: error instanceof Error ? error.message : "Failed to parse MCP host proxy request.",
        },
      },
      { status: 400 },
    );
  }
}
