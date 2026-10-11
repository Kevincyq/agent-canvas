import { MCPServerStreamableHttp } from "@openai/agents";

import { getNumberEnv, getOptionalEnv } from "@/lib/env";
import { DEFAULT_FLUXINK_HWR_UI_RESOURCE_URI, HWR_TOOL_ALIASES } from "@/lib/mcp/constants";
import { extractRecognitionText } from "@/lib/mcp/recognition";
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
  listResourceTemplates?: () => Promise<{ resourceTemplates: McpResource[] } | McpResource[]>;
  readResource?: (uri: string) => Promise<{ contents: Array<{ uri?: string; mimeType?: string; text?: string; blob?: string }> }>;
  callTool?: (toolName: string, args: Record<string, unknown>) => Promise<unknown>;
};

type McpServerConstructor = new (options: {
  url: string;
  name: string;
  cacheToolsList: boolean;
  timeout: number;
  clientSessionTimeoutSeconds?: number;
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

let sharedMcpServer: ConnectableMcpServer | null = null;
let sharedMcpConnectPromise: Promise<ConnectableMcpServer> | null = null;

const TRANSPORT_ERROR_CODES = new Set([
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_SOCKET",
  "ECONNREFUSED",
  "ECONNRESET",
  "ENOTFOUND",
  "EAI_AGAIN",
  "ETIMEDOUT",
]);

/** `fetch failed` hides the real reason in `cause`; walk the chain before classifying. */
function describeMcpError(error: unknown): { message: string; code?: string } {
  const parts: string[] = [];
  let code: string | undefined;
  let current: unknown = error;

  for (let depth = 0; current && depth < 5; depth += 1) {
    if (current instanceof Error) {
      parts.push(current.message);
      const candidate = (current as { code?: unknown }).code;
      if (!code && typeof candidate === "string") {
        code = candidate;
      }
      current = (current as { cause?: unknown }).cause;
      continue;
    }
    parts.push(String(current));
    break;
  }

  return { message: parts.join(" | "), code };
}

function isTransportError(error: unknown): boolean {
  const { message, code } = describeMcpError(error);

  return (
    (code !== undefined && TRANSPORT_ERROR_CODES.has(code)) ||
    message.includes("fetch failed") ||
    message.includes("Connect Timeout")
  );
}

function isMcpSessionError(error: unknown): boolean {
  const { message } = describeMcpError(error);

  return (
    isTransportError(error) ||
    message.includes("timed out") ||
    message.includes("-32001") ||
    message.includes("not connected") ||
    message.includes("connect")
  );
}

async function resetSharedMcpServer(): Promise<void> {
  const server = sharedMcpServer;
  sharedMcpServer = null;
  sharedMcpConnectPromise = null;

  if (server) {
    await server.close().catch(() => undefined);
  }
}

async function getSharedMcpServer(): Promise<ConnectableMcpServer> {
  if (sharedMcpServer) {
    return sharedMcpServer;
  }

  if (!sharedMcpConnectPromise) {
    sharedMcpConnectPromise = (async () => {
      const server = createStreamableHttpMcpServer();
      await server.connect();
      sharedMcpServer = server;
      return server;
    })().catch(async (error) => {
      await resetSharedMcpServer();
      throw error;
    });
  }

  return sharedMcpConnectPromise;
}

function formatMcpError(error: unknown): Error {
  const { message } = describeMcpError(error);

  if (isTransportError(error)) {
    return new Error(
      `无法连接 FluxInk MCP（${getMcpServerUrl()}）。请检查本机网络/代理是否可直连该域名，再重试。原始错误：${message}`,
    );
  }

  if (message.includes("timed out") || message.includes("-32001")) {
    return new Error(
      `FluxInk MCP 请求超时（-32001）。请确认 MCP_SERVER_URL 指向可用的 FluxInk 服务，或增大 MCP_TIMEOUT_MS 后重试。原始错误：${message}`,
    );
  }

  return error instanceof Error ? error : new Error(message);
}

async function withMcpServer<T>(operation: (server: ConnectableMcpServer) => Promise<T>): Promise<T> {
  try {
    const server = await getSharedMcpServer();
    return await operation(server);
  } catch (error) {
    if (!isMcpSessionError(error)) {
      throw formatMcpError(error);
    }

    // One reconnect retry for transient session/timeouts on the shared MCP client.
    await resetSharedMcpServer();

    try {
      const server = await getSharedMcpServer();
      return await operation(server);
    } catch (retryError) {
      if (isMcpSessionError(retryError)) {
        await resetSharedMcpServer();
      }
      throw formatMcpError(retryError);
    }
  }
}

export { DEFAULT_FLUXINK_HWR_UI_RESOURCE_URI };

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
  const timeoutMs = getNumberEnv("MCP_TIMEOUT_MS", 120_000);
  const clientSessionTimeoutSeconds = Math.max(
    30,
    Math.ceil(timeoutMs / 1000),
  );

  return new MCPServerStreamableHttp({
    url: getMcpServerUrl(),
    name: getOptionalEnv("MCP_SERVER_NAME", "FluxInk MCP"),
    cacheToolsList: true,
    timeout: timeoutMs,
    clientSessionTimeoutSeconds,
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
    timeout: getNumberEnv("MCP_TIMEOUT_MS", 120_000),
    clientSessionTimeoutSeconds: Math.max(
      30,
      Math.ceil(getNumberEnv("MCP_TIMEOUT_MS", 120_000) / 1000),
    ),
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

export async function listMcpTools(): Promise<McpTool[]> {
  return withMcpServer(async (server) => server.listTools?.() ?? []);
}

export async function listMcpResources(): Promise<McpResource[]> {
  return withMcpServer(async (server) => {
    const resourceResult = await server.listResources?.();

    if (!resourceResult) {
      return [];
    }

    return Array.isArray(resourceResult) ? resourceResult : resourceResult.resources;
  });
}

export type McpUiResourcePayload = {
  uri: string;
  mimeType?: string;
  html: string;
};

export async function readMcpUiResource(uri: string): Promise<{ contents: McpUiResourcePayload[] }> {
  return withMcpServer(async (server) => {
    if (!server.readResource) {
      throw new Error("The connected MCP server does not expose readResource.");
    }

    const response = await server.readResource(uri);
    const contents: McpUiResourcePayload[] = [];

    for (const item of response.contents) {
      if (typeof item.text === "string" && item.text.length > 0) {
        contents.push({
          uri: item.uri ?? uri,
          mimeType: item.mimeType,
          html: item.text,
        });
      }
    }

    if (contents.length === 0) {
      const rawKeys = (response.contents ?? []).map((item) => Object.keys(item));
      throw new Error(
        `MCP UI resource returned no HTML for ${uri} ` +
          `(contents=${response.contents?.length ?? 0}, keys=${JSON.stringify(rawKeys)}). ` +
          `FluxInk server may be empty or the server id may no longer be registered.`,
      );
    }

    return { contents };
  });
}

function matchesToolAlias(toolName: string, aliases: readonly string[]): boolean {
  const normalized = toolName.replaceAll("_", "-");

  return aliases.some((alias) => alias.replaceAll("_", "-") === normalized);
}

export async function callAllowedMcpTool(
  toolName: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const isShowTool = matchesToolAlias(toolName, HWR_TOOL_ALIASES.showHandwritingCanvas);
  const isRecognizeTool = matchesToolAlias(toolName, HWR_TOOL_ALIASES.recognizeHandwriting);

  if (!isShowTool && !isRecognizeTool) {
    throw new Error(`Tool is not allowed: ${toolName}`);
  }

  const aliases = isShowTool
    ? HWR_TOOL_ALIASES.showHandwritingCanvas
    : HWR_TOOL_ALIASES.recognizeHandwriting;
  const result = await callResolvedMcpTool(aliases, args);

  if (!result.ok) {
    throw new Error(result.error || `MCP tool call failed: ${toolName}`);
  }

  return normalizeMcpResult(result.result);
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
  try {
    return await withMcpServer(async (server) => {
      if (!server.listTools || !server.callTool) {
        throw new Error("The connected MCP server does not expose listTools/callTool.");
      }

      const toolName = pickToolName(await server.listTools(), aliases);

      return {
        ok: true,
        toolName,
        result: normalizeMcpResult(await server.callTool(toolName, args)),
      };
    });
  } catch (error) {
    if (isMcpSessionError(error)) {
      await resetSharedMcpServer();
    }

    return {
      ok: false,
      toolName: aliases[0],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
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
  const text = extractRecognitionText(result.result);

  return {
    ok: Boolean(text),
    text,
    rawResult: result.result,
    toolName: result.toolName,
    error: text ? undefined : "MCP recognition result did not include recognized text.",
  };
}
