"use client";

import { useCallback, useMemo, useState } from "react";

import { ChatPanel } from "@/components/chat/ChatPanel";
import { FluxInkWidgetHost } from "@/components/canvas/FluxInkWidgetHost";
import { createCanvasSummary } from "@/lib/canvas/actions";
import { extractRenderChartSpecs } from "@/lib/plot/extract-charts";
import { DEFAULT_FLUXINK_HWR_UI_RESOURCE_URI } from "@/lib/mcp/constants";
import type {
  AgentAction,
  AgentResponse,
  ChatMessage,
  HwrMode,
  HwrOpenResponse,
} from "@/types/agent";

const welcomeMessage: ChatMessage = {
  id: "welcome",
  role: "assistant",
  content:
    "你好，我是 Canvas Agent。你可以说「打开画布」或「我要手写输入」，识别结果会回到 AskAI，再发给我整理、解题或继续追问。",
};

type CanvasStatus = "idle" | "opening" | "ready" | "recognized" | "error";
type CanvasDisplayMode = "inline" | "fullscreen";
type WidgetStatus = "loading" | "ready" | "recognized" | "error";

export function CanvasAgentApp() {
  const [messages, setMessages] = useState<ChatMessage[]>([welcomeMessage]);
  const [busy, setBusy] = useState(false);
  const [canvasOpen, setCanvasOpen] = useState(false);
  const [canvasAfterMessageId, setCanvasAfterMessageId] = useState<string | null>(null);
  const [canvasStatus, setCanvasStatus] = useState<CanvasStatus>("idle");
  const [widgetStatus, setWidgetStatus] = useState<WidgetStatus>("loading");
  const [canvasDisplayMode, setCanvasDisplayMode] = useState<CanvasDisplayMode>("inline");
  const [hwrMode, setHwrMode] = useState<HwrMode>("general");
  const [hwrLanguage, setHwrLanguage] = useState("");
  const [hwrPrompt, setHwrPrompt] = useState("");
  const [hwrOpenResult, setHwrOpenResult] = useState<HwrOpenResponse | null>(null);
  const [recognitionText, setRecognitionText] = useState("");
  const [recognitionError, setRecognitionError] = useState<string | null>(null);
  const [composerDraft, setComposerDraft] = useState("");
  const [composerFocusSignal, setComposerFocusSignal] = useState(0);
  const [widgetSessionId, setWidgetSessionId] = useState(0);

  const canvasSummary = useMemo(
    () =>
      createCanvasSummary(
        canvasOpen,
        [],
        null,
      ),
    [canvasOpen],
  );

  async function openHandwritingCanvas(action: Extract<AgentAction, { type: "open_handwriting_canvas" }>) {
    setCanvasOpen(true);
    setCanvasStatus("opening");
    setWidgetStatus("loading");
    setCanvasDisplayMode("inline");
    setHwrMode(action.mode);
    setHwrLanguage(action.language);
    setHwrPrompt(action.prompt);
    setRecognitionText("");
    setRecognitionError(null);

    // Widget host loads FluxInk UI resource directly in-browser.
    // Avoid blocking on show_handwriting_canvas, which can exceed MCP connect timeouts.
    setHwrOpenResult({
      ok: true,
      mode: action.mode,
      language: action.language,
      prompt: action.prompt,
      toolName: "fluxink-widget-host",
    });
    setCanvasStatus("ready");
    setWidgetSessionId((current) => current + 1);
  }

  async function applyActions(actions: AgentAction[]) {
    for (const action of actions) {
      if (action.type === "open_handwriting_canvas") {
        await openHandwritingCanvas(action);
      }
    }
  }

  async function handleSend(message: string) {
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: message,
    };

    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setBusy(true);

    try {
      const response = await fetch("/api/agent", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message,
          history: nextMessages
            .filter((item) => item.role === "user" || item.role === "assistant")
            .slice(-8)
            .map((item) => ({
              role: item.role,
              content: item.content,
            })),
          canvas: canvasSummary,
        }),
      });

      const payload = (await response.json()) as AgentResponse;

      if (!response.ok) {
        throw new Error(payload.message || "Agent API 请求失败");
      }

      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: payload.message,
        charts: extractRenderChartSpecs(payload.actions),
      };
      const opensCanvas = payload.actions.some((action) => action.type === "open_handwriting_canvas");

      setMessages((current) => [...current, assistantMessage]);
      if (opensCanvas) {
        setCanvasAfterMessageId(assistantMessage.id);
      }
      await applyActions(payload.actions);
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "system",
          content: error instanceof Error ? error.message : "未知错误",
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  const stableWidgetRecognitionChange = useCallback(
    (payload: { text: string; status: WidgetStatus; error?: string | null }) => {
      setWidgetStatus(payload.status);
      setRecognitionText(payload.text);
      setRecognitionError(payload.error ?? null);

      if (payload.status === "recognized") {
        setCanvasStatus("recognized");
        return;
      }

      if (payload.status === "error") {
        setCanvasStatus("error");
        return;
      }

      if (payload.status === "ready") {
        setCanvasStatus("ready");
      }
    },
    [],
  );

  const handleSendResultToComposer = useCallback((text: string) => {
    const trimmed = text.trim();

    if (!trimmed) {
      return;
    }

    setCanvasDisplayMode("inline");
    setComposerDraft((current) => {
      const trimmedCurrent = current.trimEnd();

      if (!trimmedCurrent) {
        return trimmed;
      }

      if (trimmedCurrent.includes(trimmed)) {
        return trimmedCurrent;
      }

      return `${trimmedCurrent}\n\n${trimmed}`;
    });
    setComposerFocusSignal((current) => current + 1);
  }, []);

  const canvasSlot = canvasOpen ? (
    <FluxInkWidgetHost
      key={widgetSessionId}
      displayMode={canvasDisplayMode}
      mode={hwrMode}
      language={hwrLanguage}
      prompt={hwrPrompt}
      uiResourceUri={DEFAULT_FLUXINK_HWR_UI_RESOURCE_URI}
      openResult={hwrOpenResult}
      recognitionError={recognitionError}
      onDisplayModeChange={setCanvasDisplayMode}
      onRecognitionChange={stableWidgetRecognitionChange}
      onSendResultToComposer={handleSendResultToComposer}
    />
  ) : null;

  return (
    <main className="app-shell">
      <ChatPanel
        canvasSlot={canvasSlot}
        canvasAfterMessageId={canvasAfterMessageId}
        draft={composerDraft}
        focusComposerSignal={composerFocusSignal}
        messages={messages}
        busy={busy}
        onDraftChange={setComposerDraft}
        onSend={handleSend}
      />
    </main>
  );
}
