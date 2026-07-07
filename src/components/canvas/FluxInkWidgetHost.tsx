"use client";

import { useEffect, useRef, useState } from "react";

import { DEFAULT_FLUXINK_HWR_UI_RESOURCE_URI } from "@/lib/mcp/constants";
import { proxyMcpHostRequest } from "@/lib/mcp/host-proxy";
import { extractRecognitionText } from "@/lib/mcp/recognition";
import { extractTextFromContentBlocks } from "@/lib/mcp/widget-content";
import type { HwrMode, HwrOpenResponse } from "@/types/agent";

type WidgetStatus = "loading" | "ready" | "recognized" | "error";

type FluxInkWidgetHostProps = {
  displayMode: "inline" | "fullscreen";
  mode: HwrMode;
  language: string;
  prompt: string;
  uiResourceUri?: string;
  openResult: HwrOpenResponse | null;
  recognitionError: string | null;
  onDisplayModeChange: (mode: "inline" | "fullscreen") => void;
  onRecognitionChange: (payload: {
    text: string;
    status: WidgetStatus;
    error?: string | null;
  }) => void;
  onSendResultToComposer: (text: string) => void;
};

type AppBridgeInstance = {
  connect: (transport: unknown) => Promise<void>;
  sendToolInput: (payload: { arguments: Record<string, unknown> }) => void;
  sendToolResult?: (payload: unknown) => void;
  setHostContext?: (context: Record<string, unknown>) => void;
  teardownResource?: (params?: Record<string, unknown>) => Promise<Record<string, unknown>>;
  addEventListener?: (event: string, handler: (params: unknown) => void) => void;
  removeEventListener?: (event: string, handler: (params: unknown) => void) => void;
  oncalltool?: (
    params: { name: string; arguments?: Record<string, unknown> },
    extra: unknown,
  ) => Promise<unknown>;
  onreadresource?: (params: { uri: string }, extra: unknown) => Promise<unknown>;
  onlistresources?: (request: Record<string, unknown>, extra: unknown) => Promise<unknown>;
  onlisttools?: (request: Record<string, unknown>, extra: unknown) => Promise<unknown>;
  onrequestdisplaymode?: (
    params: { mode: "inline" | "fullscreen" | "pip" },
    extra: unknown,
  ) => Promise<{ mode: "inline" | "fullscreen" | "pip" }>;
  onmessage?: (
    params: { role: string; content: unknown[] },
    extra: unknown,
  ) => Promise<Record<string, unknown>>;
  onupdatemodelcontext?: (
    params: { content?: unknown[]; structuredContent?: Record<string, unknown> },
    extra: unknown,
  ) => Promise<Record<string, unknown>>;
};

function createJsonRpcRequest(method: string, params?: Record<string, unknown>) {
  return {
    jsonrpc: "2.0" as const,
    id: crypto.randomUUID(),
    method,
    params,
  };
}

function asCallToolResult(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;

    if (Array.isArray(record.content)) {
      return record;
    }

    if (record.structuredContent && typeof record.structuredContent === "object") {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(record.structuredContent),
          },
        ],
        structuredContent: record.structuredContent,
      };
    }
  }

  const structuredContent =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : { text: String(value ?? "") };

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(structuredContent),
      },
    ],
    structuredContent,
  };
}

function resolveWidgetHeight(displayMode: "inline" | "fullscreen", reportedHeight?: number): number {
  if (displayMode === "fullscreen") {
    return Math.max(480, window.innerHeight - 120);
  }

  if (typeof reportedHeight === "number" && reportedHeight > 0) {
    return Math.max(480, Math.min(reportedHeight, 920));
  }

  return 640;
}

async function loadWidgetModules() {
  const [appBridgeModule, extAppsModule] = await Promise.all([
    import("@modelcontextprotocol/ext-apps/app-bridge"),
    import("@modelcontextprotocol/ext-apps"),
  ]);

  return {
    AppBridge: appBridgeModule.AppBridge as unknown as new (
      client: null,
      hostInfo: { name: string; version: string },
      capabilities: Record<string, unknown>,
      options?: { hostContext?: Record<string, unknown> },
    ) => AppBridgeInstance,
    PostMessageTransport: extAppsModule.PostMessageTransport as new (
      target: Window,
      source: Window,
    ) => unknown,
  };
}

function applyHostContext(
  bridge: AppBridgeInstance,
  nextDisplayMode: "inline" | "fullscreen",
) {
  bridge.setHostContext?.({
    displayMode: nextDisplayMode,
    availableDisplayModes: ["inline", "fullscreen"],
    theme: "light",
    platform: "web",
    containerDimensions: {
      maxHeight: resolveWidgetHeight(nextDisplayMode),
      maxWidth: nextDisplayMode === "fullscreen" ? window.innerWidth : undefined,
    },
  });
}

export function FluxInkWidgetHost({
  displayMode,
  mode,
  language,
  prompt,
  uiResourceUri = DEFAULT_FLUXINK_HWR_UI_RESOURCE_URI,
  openResult,
  recognitionError,
  onDisplayModeChange,
  onRecognitionChange,
  onSendResultToComposer,
}: FluxInkWidgetHostProps) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const bridgeRef = useRef<AppBridgeInstance | null>(null);
  const bridgeInitializedRef = useRef(false);
  const displayModeRef = useRef(displayMode);
  const mountGenerationRef = useRef(0);
  const propsRef = useRef({
    mode,
    language,
    prompt,
    openResult,
    onDisplayModeChange,
    onRecognitionChange,
    onSendResultToComposer,
  });
  const [widgetHeight, setWidgetHeight] = useState(640);

  displayModeRef.current = displayMode;
  propsRef.current = {
    mode,
    language,
    prompt,
    openResult,
    onDisplayModeChange,
    onRecognitionChange,
    onSendResultToComposer,
  };

  useEffect(() => {
    if (!openResult?.ok) {
      return undefined;
    }

    const mountGeneration = mountGenerationRef.current + 1;
    mountGenerationRef.current = mountGeneration;
    let cancelled = false;

    const handleSizeChange = (params: unknown) => {
      const height = (params as { height?: number } | undefined)?.height;
      setWidgetHeight(resolveWidgetHeight(displayModeRef.current, height));
    };

    const deliverRecognizedText = (text: string) => {
      const trimmed = text.trim();

      if (!trimmed) {
        return;
      }

      propsRef.current.onRecognitionChange({
        text: trimmed,
        status: "recognized",
        error: null,
      });
    };

    const handleHostMessage = (content: unknown[]) => {
      if (!bridgeInitializedRef.current) {
        return { isError: true };
      }

      const text = extractTextFromContentBlocks(content);
      deliverRecognizedText(text);
      propsRef.current.onSendResultToComposer(text);
      return {};
    };

    async function mountWidget() {
      const iframe = iframeRef.current;

      if (!iframe) {
        return;
      }

      try {
        const { AppBridge, PostMessageTransport } = await loadWidgetModules();

        if (cancelled || mountGeneration !== mountGenerationRef.current) {
          return;
        }

        const initialDisplayMode = displayModeRef.current;
        const bridge = new AppBridge(
          null,
          { name: "Agent Canvas MCP Host", version: "0.1.0" },
          {
            openLinks: {},
            serverTools: { listChanged: true },
            serverResources: { listChanged: true },
            logging: {},
            message: {
              text: {},
            },
            updateModelContext: {
              text: {},
              structuredContent: {},
            },
          },
          {
            hostContext: {
              displayMode: initialDisplayMode,
              availableDisplayModes: ["inline", "fullscreen"],
              theme: "light",
              platform: "web",
              containerDimensions: {
                maxHeight: resolveWidgetHeight(initialDisplayMode),
              },
            },
          },
        );

        bridge.onrequestdisplaymode = async ({ mode: requestedMode }) => {
          const nextMode = requestedMode === "fullscreen" ? "fullscreen" : "inline";
          propsRef.current.onDisplayModeChange(nextMode);
          setWidgetHeight(resolveWidgetHeight(nextMode));
          applyHostContext(bridge, nextMode);
          return { mode: nextMode };
        };

        bridge.onmessage = async ({ content }) => handleHostMessage(content);

        bridge.onupdatemodelcontext = async ({ content, structuredContent }) => {
          if (!bridgeInitializedRef.current) {
            return {};
          }

          const text =
            extractTextFromContentBlocks(content) ||
            extractRecognitionText(structuredContent) ||
            "";

          deliverRecognizedText(text);
          propsRef.current.onSendResultToComposer(text);
          return {};
        };

        bridge.oncalltool = async (params) => {
          try {
            const response = await proxyMcpHostRequest(
              createJsonRpcRequest("tools/call", params),
            );

            if (response.error) {
              throw new Error(response.error.message);
            }

            const toolResult = asCallToolResult(response.result);
            deliverRecognizedText(
              extractRecognitionText(toolResult.structuredContent ?? response.result) ?? "",
            );

            return toolResult;
          } catch (error) {
            const message = error instanceof Error ? error.message : "FluxInk 识别失败";
            propsRef.current.onRecognitionChange({
              text: "",
              status: "error",
              error: message,
            });
            throw error;
          }
        };

        bridge.onreadresource = async (params) => {
          const response = await proxyMcpHostRequest(
            createJsonRpcRequest("resources/read", params),
          );

          if (response.error) {
            throw new Error(response.error.message);
          }

          return response.result;
        };

        bridge.onlistresources = async () => {
          const response = await proxyMcpHostRequest(createJsonRpcRequest("resources/list"));

          if (response.error) {
            throw new Error(response.error.message);
          }

          return response.result;
        };

        bridge.onlisttools = async () => {
          const response = await proxyMcpHostRequest(createJsonRpcRequest("tools/list"));

          if (response.error) {
            throw new Error(response.error.message);
          }

          return response.result;
        };

        bridge.addEventListener?.("initialized", () => {
          bridgeInitializedRef.current = true;

          const currentOpenResult = propsRef.current.openResult;
          const currentMode = propsRef.current.mode;
          const currentLanguage = propsRef.current.language;
          const currentPrompt = propsRef.current.prompt;

          bridge.sendToolInput({
            arguments: {
              mode: currentOpenResult?.mode ?? currentMode,
              language: currentOpenResult?.language ?? currentLanguage,
              prompt: currentOpenResult?.prompt ?? currentPrompt,
              force_new: true,
              apiBaseUrl: currentOpenResult?.apiBaseUrl,
            },
          });

          if (currentOpenResult) {
            bridge.sendToolResult?.({
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    type: "hwr_init",
                    mode: currentOpenResult.mode ?? currentMode,
                    language: currentOpenResult.language ?? currentLanguage,
                    prompt: currentOpenResult.prompt ?? currentPrompt,
                    apiBaseUrl: currentOpenResult.apiBaseUrl,
                    message: currentOpenResult.message,
                  }),
                },
              ],
              structuredContent: {
                type: "hwr_init",
                mode: currentOpenResult.mode ?? currentMode,
                language: currentOpenResult.language ?? currentLanguage,
                prompt: currentOpenResult.prompt ?? currentPrompt,
                apiBaseUrl: currentOpenResult.apiBaseUrl,
                message: currentOpenResult.message,
              },
            });
          }

          propsRef.current.onRecognitionChange({
            text: "",
            status: "ready",
            error: null,
          });
        });

        bridge.addEventListener?.("sizechange", handleSizeChange);

        const transport = new PostMessageTransport(
          iframe.contentWindow as Window,
          iframe.contentWindow as Window,
        );

        await bridge.connect(transport);

        if (cancelled || mountGeneration !== mountGenerationRef.current) {
          void bridge.teardownResource?.({});
          return;
        }

        bridgeRef.current = bridge;

        const resourceResponse = await fetch(
          `/api/mcp/ui-resource?uri=${encodeURIComponent(uiResourceUri)}`,
        );
        const resourcePayload = (await resourceResponse.json()) as {
          ok: boolean;
          html?: string;
          error?: string;
        };

        if (!resourceResponse.ok || !resourcePayload.ok || !resourcePayload.html) {
          throw new Error(resourcePayload.error || "无法读取 FluxInk UI resource");
        }

        if (cancelled || mountGeneration !== mountGenerationRef.current) {
          return;
        }

        await new Promise<void>((resolve, reject) => {
          iframe.onload = () => resolve();
          iframe.onerror = () => reject(new Error("FluxInk widget iframe 加载失败"));
          iframe.srcdoc = resourcePayload.html ?? "";
        });
      } catch (error) {
        if (cancelled || mountGeneration !== mountGenerationRef.current) {
          return;
        }

        propsRef.current.onRecognitionChange({
          text: "",
          status: "error",
          error: error instanceof Error ? error.message : "FluxInk widget 初始化失败",
        });
      }
    }

    void mountWidget();

    return () => {
      cancelled = true;
      bridgeInitializedRef.current = false;

      const iframe = iframeRef.current;

      if (iframe) {
        iframe.onload = null;
        iframe.onerror = null;
        iframe.srcdoc = "";
      }

      const bridge = bridgeRef.current;
      bridge?.removeEventListener?.("sizechange", handleSizeChange);
      void bridge?.teardownResource?.({});
      bridgeRef.current = null;
    };
  }, [openResult, uiResourceUri]);

  useEffect(() => {
    const bridge = bridgeRef.current;

    if (!bridge) {
      return;
    }

    setWidgetHeight(resolveWidgetHeight(displayMode));
    applyHostContext(bridge, displayMode);
  }, [displayMode]);

  return (
    <section
      className={displayMode === "fullscreen" ? "canvas-panel canvas-fullscreen widget-host" : "canvas-panel canvas-inline widget-host"}
      aria-label="FluxInk MCP App widget"
    >
      {recognitionError ? (
        <div className="widget-host-error" role="alert">
          {recognitionError}
        </div>
      ) : null}

      <div className="widget-shell" style={{ minHeight: widgetHeight }}>
        <iframe
          ref={iframeRef}
          title="FluxInk handwriting widget"
          className="fluxink-widget-frame"
          sandbox="allow-scripts allow-same-origin allow-forms allow-downloads allow-popups"
          style={{ width: "100%", height: widgetHeight, border: 0 }}
        />
      </div>
    </section>
  );
}
