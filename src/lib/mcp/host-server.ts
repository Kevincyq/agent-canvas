import {
  ALLOWED_MCP_HOST_TOOL_NAMES,
  isAllowedFluxInkUiResourceUri,
} from "@/lib/mcp/constants";
import { extractRecognitionText } from "@/lib/mcp/recognition";
import {
  callAllowedMcpTool,
  readMcpUiResource,
  listMcpResources,
  listMcpTools,
} from "@/lib/mcp/client";

type JsonRpcId = string | number | null;

export type McpHostProxyRequest = {
  jsonrpc?: string;
  id?: JsonRpcId;
  method: string;
  params?: Record<string, unknown>;
};

export type McpHostProxyResponse = {
  jsonrpc: "2.0";
  id: JsonRpcId;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
};

function jsonRpcError(id: JsonRpcId, code: number, message: string, data?: unknown): McpHostProxyResponse {
  return {
    jsonrpc: "2.0",
    id: id ?? null,
    error: {
      code,
      message,
      data,
    },
  };
}

function jsonRpcResult(id: JsonRpcId, result: unknown): McpHostProxyResponse {
  return {
    jsonrpc: "2.0",
    id: id ?? null,
    result,
  };
}

function getToolName(params: Record<string, unknown> | undefined): string | undefined {
  const name = params?.name;

  return typeof name === "string" && name.length > 0 ? name : undefined;
}

function isAllowedHostToolName(toolName: string): boolean {
  if (ALLOWED_MCP_HOST_TOOL_NAMES.has(toolName)) {
    return true;
  }

  const normalized = toolName.replaceAll("_", "-");

  return [...ALLOWED_MCP_HOST_TOOL_NAMES].some(
    (allowedName) => allowedName.replaceAll("_", "-") === normalized,
  );
}

function getResourceUri(params: Record<string, unknown> | undefined): string | undefined {
  const uri = params?.uri;

  return typeof uri === "string" && uri.length > 0 ? uri : undefined;
}

export async function handleMcpHostProxyRequest(
  request: McpHostProxyRequest,
): Promise<McpHostProxyResponse> {
  const id = request.id ?? null;
  const params = request.params ?? {};

  try {
    switch (request.method) {
      case "tools/list": {
        const tools = await listMcpTools();
        return jsonRpcResult(id, { tools });
      }

      case "tools/call": {
        const toolName = getToolName(params);

        if (!toolName || !isAllowedHostToolName(toolName)) {
          return jsonRpcError(id, -32602, `Tool is not allowed for MCP App Host: ${toolName ?? "unknown"}`);
        }

        const argumentsValue = params.arguments;
        const args =
          argumentsValue && typeof argumentsValue === "object" && !Array.isArray(argumentsValue)
            ? (argumentsValue as Record<string, unknown>)
            : {};

        const result = await callAllowedMcpTool(toolName, args);
        const recognitionText = extractRecognitionText(result);

        return jsonRpcResult(id, {
          ...asMcpToolResult(result),
          recognitionText,
        });
      }

      case "resources/list": {
        const resources = await listMcpResources();
        return jsonRpcResult(id, { resources });
      }

      case "resources/read": {
        const uri = getResourceUri(params);

        if (!uri || !isAllowedFluxInkUiResourceUri(uri)) {
          return jsonRpcError(id, -32602, `UI resource is not allowed: ${uri ?? "unknown"}`);
        }

        const resource = await readMcpUiResource(uri);
        return jsonRpcResult(id, resource);
      }

      default:
        return jsonRpcError(id, -32601, `Method not supported by MCP App Host proxy: ${request.method}`);
    }
  } catch (error) {
    return jsonRpcError(
      id,
      -32000,
      error instanceof Error ? error.message : "MCP App Host proxy request failed.",
    );
  }
}

function asMcpToolResult(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return {
    content: [
      {
        type: "text",
        text: typeof value === "string" ? value : JSON.stringify(value),
      },
    ],
  };
}
