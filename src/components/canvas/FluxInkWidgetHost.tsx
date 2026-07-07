"use client";

import { useEffect, useRef, useState } from "react";

import { DEFAULT_FLUXINK_HWR_UI_RESOURCE_URI } from "@/lib/mcp/constants";
import { proxyMcpHostRequest } from "@/lib/mcp/host-proxy";
import { extractRecognitionText } from "@/lib/mcp/recognition";
import type { HwrMode, HwrOpenResponse } from "@/types/agent";

type WidgetStatus = "loading" | "ready" | "recognized" | "error";

type FluxInkWidgetHostProps = {
  displayMode: "inline" | "fullscreen";
  mode: HwrMode;
  language: string;
  prompt: string;
  uiResourceUri?: string;
  openResult: HwrOpenResponse | null;
  recognitionText: string;
  recognitionError: string | null;
  recognitionStatus: WidgetStatus;
  onDisplayModeChange: (mode: "inline" | "fullscreen") => void;
  onRecognitionChange: (payload: {
    text: string;
    status: WidgetStatus;
    error?: string | null;
  }) => void;
  onSendToAskAIInput: () => void;
};

type AppBridgeInstance = {
  connect: (transport: unknown) => Promise<void>;
  sendToolInput: (payload: { arguments: Record<string, unknown> }) => void;
  sendToolResult?: (payload: { result: unknown }) => void;
  teardownResource?: () => Promise<void> | void;
  oninitialized?: () => void;
  oncalltool?: (
    request: { params: { name: string; arguments?: Record<string, unknown> } },
    extra: unknown,
  ) => Promise<unknown>;
  onreadresource?: (request: { params: { uri: string } }, extra: unknown) => Promise<unknown>;
  onlistresources?: (request: Record<string, unknown>, extra: unknown) => Promise<unknown>;
  onlisttools?: (request: Record<string, unknown>, extra: unknown) => Promise<unknown>;
};

function createJsonRpcRequest(method: string, params?: Record<string, unknown>) {
  return {
    jsonrpc: "2.0" as const,
    id: crypto.randomUUID(),
    method,
    params,
  };
}

async function loadWidgetModules() {
  const [appBridgeModule, extAppsModule] = await Promise.all([
    import("@modelcontextprotocol/ext-apps/app-bridge"),
    import("@modelcontextprotocol/ext-apps"),
  ]);

  return {
    AppBridge: appBridgeModule.AppBridge as new (
      client: null,
      hostInfo: { name: string; version: string },
      capabilities: {
        openLinks: Record<string, unknown>;
        serverTools: Record<string, unknown>;
        logging: Record<string, unknown>;
      },
    ) => AppBridgeInstance,
    PostMessageTransport: extAppsModule.PostMessageTransport as new (
      target: Window,
      source: Window,
    ) => unknown,
  };
}

export function FluxInkWidgetHost({
  displayMode,
  mode,
  language,
  prompt,
  uiResourceUri = DEFAULT_FLUXINK_HWR_UI_RESOURCE_URI,
  openResult,
  recognitionText,
  recognitionError,
  recognitionStatus,
  onDisplayModeChange,
  onRecognitionChange,
  onSendToAskAIInput,
}: FluxInkWidgetHostProps) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const bridgeRef = useRef<AppBridgeInstance | null>(null);
  const [hostMessage, setHostMessage] = useState("正在加载 FluxInk MCP App widget");
  const [widgetHeight, setWidgetHeight] = useState(420);

  useEffect(() => {
    let cancelled = false;
    const iframe = iframeRef.current;

    if (!iframe || !openResult?.ok) {
      return undefined;
    }

    async function mountWidget() {
      try {
        setHostMessage("正在读取 FluxInk UI resource");

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

        if (cancelled) {
          return;
        }

        await new Promise<void>((resolve, reject) => {
          iframe.onload = () => resolve();
          iframe.onerror = () => reject(new Error("FluxInk widget iframe 加载失败"));
          iframe.srcdoc = resourcePayload.html ?? "";
        });

        if (cancelled) {
          return;
        }

        const { AppBridge, PostMessageTransport } = await loadWidgetModules();
        const bridge = new AppBridge(
          null,
          { name: "Agent Canvas MCP Host", version: "0.1.0" },
          { openLinks: {}, serverTools: {}, logging: {} },
        );

        bridge.oncalltool = async (request) => {
          const response = await proxyMcpHostRequest(
            createJsonRpcRequest("tools/call", request.params),
          );

          if (response.error) {
            throw new Error(response.error.message);
          }

          const text = extractRecognitionText(response.result);

          if (text) {
            onRecognitionChange({
              text,
              status: "recognized",
              error: null,
            });
          }

          return response.result;
        };

        bridge.onreadresource = async (request) => {
          const response = await proxyMcpHostRequest(
            createJsonRpcRequest("resources/read", request.params),
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

        bridge.oninitialized = () => {
          bridge.sendToolInput({
            arguments: {
              mode: openResult.mode ?? mode,
              language: openResult.language ?? language,
              prompt: openResult.prompt ?? prompt,
              force_new: true,
            },
          });

          if (openResult) {
            bridge.sendToolResult?.({ result: openResult });
          }

          setHostMessage(openResult.message || "FluxInk handwriting widget ready");
          onRecognitionChange({
            text: recognitionText,
            status: "ready",
            error: null,
          });
        };

        const transport = new PostMessageTransport(
          iframe.contentWindow as Window,
          iframe.contentWindow as Window,
        );

        await bridge.connect(transport);
        bridgeRef.current = bridge;
      } catch (error) {
        if (cancelled) {
          return;
        }

        onRecognitionChange({
          text: "",
          status: "error",
          error: error instanceof Error ? error.message : "FluxInk widget 初始化失败",
        });
      }
    }

    void mountWidget();

    return () => {
      cancelled = true;
      void bridgeRef.current?.teardownResource?.();
      bridgeRef.current = null;
    };
  }, [
    language,
    mode,
    onRecognitionChange,
    openResult,
    prompt,
    uiResourceUri,
  ]);

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.source !== iframeRef.current?.contentWindow) {
        return;
      }

      const data = event.data;

      if (!data || typeof data !== "object") {
        return;
      }

      const method =
        typeof (data as { method?: unknown }).method === "string"
          ? (data as { method: string }).method
          : null;

      if (method === "ui/notifications/size-changed") {
        const height = (data as { params?: { height?: number } }).params?.height;

        if (typeof height === "number" && height > 0) {
          setWidgetHeight(Math.max(320, Math.min(height, 960)));
        }
      }
    }

    window.addEventListener("message", handleMessage);

    return () => window.removeEventListener("message", handleMessage);
  }, []);

  async function copyRecognitionText() {
    if (!recognitionText) {
      return;
    }

    await navigator.clipboard.writeText(recognitionText);
  }

  return (
    <section
      className={displayMode === "fullscreen" ? "canvas-panel canvas-fullscreen" : "canvas-panel canvas-inline"}
      aria-label="FluxInk MCP App widget"
    >
      <div className="panel-header">
        <div>
          <p className="eyebrow">FluxInk MCP App</p>
          <h2>原生手写画布</h2>
          <p className="canvas-subtitle">
            {mode === "structure" ? "结构识别模式" : "通用识别模式"}
            {hostMessage ? ` · ${hostMessage}` : ""}
          </p>
        </div>
        <div className="canvas-actions">
          <button
            type="button"
            onClick={() =>
              onDisplayModeChange(displayMode === "fullscreen" ? "inline" : "fullscreen")
            }
          >
            {displayMode === "fullscreen" ? "回到对话" : "全屏"}
          </button>
        </div>
      </div>

      <div className="widget-shell" style={{ minHeight: widgetHeight }}>
        <iframe
          ref={iframeRef}
          title="FluxInk handwriting widget"
          className="fluxink-widget-frame"
          sandbox="allow-scripts allow-same-origin allow-forms allow-downloads"
          style={{ width: "100%", height: widgetHeight, border: 0 }}
        />
      </div>

      <div className="canvas-meta">
        <span>Widget: {uiResourceUri}</span>
        <span>
          {recognitionStatus === "loading"
            ? "Widget 加载中"
            : recognitionStatus === "ready"
              ? "可在原生画布中书写"
              : recognitionStatus === "recognized"
                ? "已结构化"
                : "Widget 异常"}
        </span>
      </div>

      <div className="structured-preview" aria-label="结构化识别结果">
        <div className="structured-preview-header">
          <div>
            <p className="eyebrow">Structured Result</p>
            <h3>结构化结果</h3>
          </div>
          <div className="structured-preview-actions">
            <button type="button" onClick={copyRecognitionText} disabled={!recognitionText}>
              Copy
            </button>
            <button
              type="button"
              className="primary-action"
              onClick={onSendToAskAIInput}
              disabled={!recognitionText || recognitionStatus === "loading"}
            >
              Send to AskAI
            </button>
          </div>
        </div>
        <pre>
          {recognitionError
            ? recognitionError
            : recognitionText || "在 FluxInk 原生画布中书写后，识别结果会显示在这里。"}
        </pre>
      </div>
    </section>
  );
}
