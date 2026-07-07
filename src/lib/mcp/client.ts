import { MCPServerStreamableHttp } from "@openai/agents";

import { getNumberEnv, getOptionalEnv } from "@/lib/env";
import type {
  HwrOpenRequest,
  HwrOpenResponse,
  HwrRecognizeRequest,
  HwrRecognizeResponse,
  HwrRecognitionMode,
} from "@/types/agent";

type McpTool = {
  name?: string;
  description?: string;
  inputSchema?: unknown;
};

type McpResource = {
  uri?: string;
  name?: string;
  description?: string;
  mimeType?: string;
};

type ConnectableMcpServer = {
  connect: () => Promise<void>;
  close: () => Promise<void>;
  listTools?: () => Promise<McpTool[]>;
  listResources?: () => Promise<McpResource[] | { resources: McpResource[] }>;
  callTool?: (toolName: string, args: Record<string, unknown>) => Promise<unknown>;
};

type McpServerConstructor = new (options: {
  url: string;
  name: string;
  cacheToolsList: boolean;
  timeout: number;
  requestInit: RequestInit;
}) => ConnectableMcpServer;

export type McpInspectionResult = {
  ok: boolean;
  transport: "streamable_http" | "sse";
  serverUrl: string;
  tools: McpTool[];
  resources: McpResource[];
  error?: string;
};

export type McpToolCallResult = {
  ok: boolean;
  toolName: string;
  result?: unknown;
  error?: string;
};

const DEFAULT_MCP_URL =
  "https://mcp.fluxink.ai/servers/d706699b03524ba6aa84423954c43f3f/mcp";

const HWR_TOOL_ALIASES = {
  showHandwritingCanvas: [
    "show_handwriting_canvas",
    "fluxink-mcp-show-handwriting-canvas",
  ],
  recognizeHandwriting: [
    "recognize_handwriting",
    "fluxink-mcp-recognize-handwriting",
  ],
} as const;

function createRequestInit(): RequestInit {
  const token = getOptionalEnv("MCP_AUTH_TOKEN");
  const headers: Record<string, string> = {};

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return Object.keys(headers).length > 0 ? { headers } : {};
}

export function getMcpServerUrl(): string {
  return getOptionalEnv("MCP_SERVER_URL", DEFAULT_MCP_URL);
}

export function createStreamableHttpMcpServer(): ConnectableMcpServer {
  return new MCPServerStreamableHttp({
    url: getMcpServerUrl(),
    name: getOptionalEnv("MCP_SERVER_NAME", "FluxInk MCP"),
    cacheToolsList: true,
    timeout: getNumberEnv("MCP_TIMEOUT_MS", 30000),
    requestInit: createRequestInit(),
  }) as unknown as ConnectableMcpServer;
}

async function createSseMcpServer(): Promise<ConnectableMcpServer | null> {
  const agents = (await import("@openai/agents")) as Record<string, unknown>;
  const ServerCtor = (agents.MCPServerSSE ?? agents.MCPServerSse) as
    | McpServerConstructor
    | undefined;

  if (typeof ServerCtor !== "function") {
    return null;
  }

  return new ServerCtor({
    url: getMcpServerUrl(),
    name: `${getOptionalEnv("MCP_SERVER_NAME", "FluxInk MCP")} SSE`,
    cacheToolsList: true,
    timeout: getNumberEnv("MCP_TIMEOUT_MS", 15000),
    requestInit: createRequestInit(),
  }) as ConnectableMcpServer;
}

async function inspectServer(
  server: ConnectableMcpServer,
  transport: McpInspectionResult["transport"],
): Promise<McpInspectionResult> {
  try {
    await server.connect();

    const [tools, resourceResult] = await Promise.all([
      server.listTools?.() ?? Promise.resolve([]),
      server.listResources?.() ?? Promise.resolve([]),
    ]);
    const resources = Array.isArray(resourceResult) ? resourceResult : resourceResult.resources;

    return {
      ok: true,
      transport,
      serverUrl: getMcpServerUrl(),
      tools,
      resources,
    };
  } catch (error) {
    return {
      ok: false,
      transport,
      serverUrl: getMcpServerUrl(),
      tools: [],
      resources: [],
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    await server.close().catch(() => undefined);
  }
}

export async function inspectMcpServer(): Promise<McpInspectionResult[]> {
  const streamableResult = await inspectServer(
    createStreamableHttpMcpServer(),
    "streamable_http",
  );

  if (streamableResult.ok) {
    return [streamableResult];
  }

  const sseServer = await createSseMcpServer();

  if (!sseServer) {
    return [
      streamableResult,
      {
        ok: false,
        transport: "sse",
        serverUrl: getMcpServerUrl(),
        tools: [],
        resources: [],
        error: "The installed @openai/agents package does not expose an SSE MCP server class.",
      },
    ];
  }

  return [streamableResult, await inspectServer(sseServer, "sse")];
}

export async function callMcpTool(
  toolName: string,
  args: Record<string, unknown>,
): Promise<McpToolCallResult> {
  const server = createStreamableHttpMcpServer();

  try {
    await server.connect();

    if (!server.callTool) {
      throw new Error("The connected MCP server does not support direct tool calls.");
    }

    return {
      ok: true,
      toolName,
      result: await server.callTool(toolName, args),
    };
  } catch (error) {
    return {
      ok: false,
      toolName,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    await server.close().catch(() => undefined);
  }
}

function parseTextJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function normalizeMcpResult(value: unknown): unknown {
  if (!value || typeof value !== "object") {
    return value;
  }

  if (Array.isArray(value)) {
    if (value.length === 1) {
      return normalizeMcpResult(value[0]);
    }

    return value.map((item) => normalizeMcpResult(item));
  }

  const record = value as Record<string, unknown>;

  if (record.structuredContent) {
    return normalizeMcpResult(record.structuredContent);
  }

  if (Array.isArray(record.content)) {
    const normalizedContent = record.content.map((item) => normalizeMcpResult(item));

    if (normalizedContent.length === 1) {
      return normalizedContent[0];
    }

    return normalizedContent;
  }

  if (record.type === "text" && typeof record.text === "string") {
    return parseTextJson(record.text);
  }

  return value;
}

function pickToolName(tools: McpTool[], aliases: readonly string[]): string {
  const names = tools.map((tool) => tool.name).filter((name): name is string => Boolean(name));
  const exact = aliases.find((alias) => names.includes(alias));

  if (exact) {
    return exact;
  }

  const aliasSet = new Set(aliases.map((alias) => alias.replaceAll("_", "-")));
  const normalized = names.find((name) => aliasSet.has(name.replaceAll("_", "-")));

  if (normalized) {
    return normalized;
  }

  throw new Error(
    `MCP server did not expose any expected HWR tool. Expected one of: ${aliases.join(", ")}. Found: ${names.join(", ") || "none"}`,
  );
}

async function callResolvedMcpTool(
  aliases: readonly string[],
  args: Record<string, unknown>,
): Promise<McpToolCallResult> {
  const server = createStreamableHttpMcpServer();

  try {
    await server.connect();

    if (!server.listTools || !server.callTool) {
      throw new Error("The connected MCP server does not expose listTools/callTool.");
    }

    const toolName = pickToolName(await server.listTools(), aliases);

    return {
      ok: true,
      toolName,
      result: normalizeMcpResult(await server.callTool(toolName, args)),
    };
  } catch (error) {
    return {
      ok: false,
      toolName: aliases[0],
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    await server.close().catch(() => undefined);
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function firstNonEmptyString(...values: unknown[]): string | undefined {
  return values.find((value): value is string => typeof value === "string" && value.length > 0);
}

export async function openHandwritingCanvas(
  input: HwrOpenRequest,
): Promise<HwrOpenResponse> {
  const result = await callResolvedMcpTool(HWR_TOOL_ALIASES.showHandwritingCanvas, {
    mode: input.mode,
    language: input.language,
    prompt: input.prompt,
    force_new: input.force_new,
  });

  if (!result.ok) {
    return {
      ok: false,
      toolName: result.toolName,
      error: result.error,
    };
  }

  const payload = asRecord(result.result);

  return {
    ok: true,
    type: typeof payload.type === "string" ? payload.type : undefined,
    reuse: typeof payload.reuse === "boolean" ? payload.reuse : undefined,
    mode:
      payload.mode === "general" || payload.mode === "structure" ? payload.mode : input.mode,
    language: typeof payload.language === "string" ? payload.language : input.language,
    prompt: typeof payload.prompt === "string" ? payload.prompt : input.prompt,
    apiBaseUrl: typeof payload.apiBaseUrl === "string" ? payload.apiBaseUrl : undefined,
    message: typeof payload.message === "string" ? payload.message : undefined,
    toolName: result.toolName,
  };
}

export async function recognizeHandwriting(
  input: HwrRecognizeRequest,
): Promise<HwrRecognizeResponse> {
  const recognitionMode: HwrRecognitionMode =
    input.recognitionMode ?? (input.mode === "structure" ? "structure" : "text");
  const strokes = input.strokes.strokes.map((stroke) =>
    stroke.points.map((point) => ({
      x: point.x,
      y: point.y,
      t: point.t,
    })),
  );
  const result = await callResolvedMcpTool(HWR_TOOL_ALIASES.recognizeHandwriting, {
    strokes,
    mode: recognitionMode,
    language: input.language,
  });

  if (!result.ok) {
    return {
      ok: false,
      toolName: result.toolName,
      error: result.error,
    };
  }

  const payload = asRecord(result.result);
  const nestedResult = asRecord(payload.result);
  const text = firstNonEmptyString(
    nestedResult.text,
    payload.text,
    payload.latex,
    payload.smiles,
    result.result,
  );

  return {
    ok: Boolean(text),
    text,
    rawResult: result.result,
    toolName: result.toolName,
    error: text ? undefined : "MCP recognition result did not include recognized text.",
  };
}
