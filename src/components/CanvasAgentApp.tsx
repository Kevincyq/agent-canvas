"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ChatPanel } from "@/components/chat/ChatPanel";
import { FluxInkWidgetHost } from "@/components/canvas/FluxInkWidgetHost";
import { VoiceRecorder, type VoiceRecorderHandle } from "@/components/voice/VoiceRecorder";
import { createCanvasSummary } from "@/lib/canvas/actions";
import { prepareRecognitionForComposer } from "@/lib/canvas/composer";
import { markAndroidTabletDocument } from "@/lib/device/tablet";
import { extractRenderChartSpecs } from "@/lib/plot/extract-charts";
import { extractLegacySvgFences, extractRenderSvgSpecs } from "@/lib/svg/extract";
import { DEFAULT_FLUXINK_HWR_UI_RESOURCE_URI } from "@/lib/mcp/constants";
import { createVoiceTranscriptAttachment, type VoiceTranscriptPayload } from "@/lib/voice/timeline";
import {
  shouldSendVoiceAttachment,
  stripVoiceAttachmentReference,
} from "@/lib/voice/composer-sync";
import type {
  AgentAttachment,
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
    "你好，我是 Dralk Agent，你可以边画边说输入内容，发给 AskAI，整理内容、解题或追问。",
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
  const [canvasCollapsed, setCanvasCollapsed] = useState(false);
  const [hwrMode, setHwrMode] = useState<HwrMode>("general");
  const [hwrLanguage, setHwrLanguage] = useState("");
  const [hwrPrompt, setHwrPrompt] = useState("");
  const [hwrOpenResult, setHwrOpenResult] = useState<HwrOpenResponse | null>(null);
  const [recognitionText, setRecognitionText] = useState("");
  const [recognitionError, setRecognitionError] = useState<string | null>(null);
  const [composerDraft, setComposerDraft] = useState("");
  const [composerFocusSignal, setComposerFocusSignal] = useState(0);
  const [widgetSessionId, setWidgetSessionId] = useState(0);
  const [voiceSessionId, setVoiceSessionId] = useState(() => crypto.randomUUID());
  const [voiceAttachment, setVoiceAttachment] = useState<AgentAttachment | null>(null);
  const hwrPromptRef = useRef("");
  const voiceAttachmentRef = useRef<AgentAttachment | null>(null);
  const voiceRecorderRef = useRef<VoiceRecorderHandle | null>(null);
  const canvasSessionStartedAtRef = useRef(0);

  hwrPromptRef.current = hwrPrompt;
  voiceAttachmentRef.current = voiceAttachment;

  useEffect(() => {
    markAndroidTabletDocument();

    function handleViewportChange() {
      markAndroidTabletDocument();
    }

    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("orientationchange", handleViewportChange);

    return () => {
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("orientationchange", handleViewportChange);
    };
  }, []);

  const canvasSummary = useMemo(
    () =>
      createCanvasSummary(
        canvasOpen,
        [],
        null,
      ),
    [canvasOpen],
  );

  const getCanvasElapsedMs = useCallback(() => {
    if (canvasSessionStartedAtRef.current <= 0) {
      return 0;
    }

    return Math.max(0, Math.round(performance.now() - canvasSessionStartedAtRef.current));
  }, []);

  async function openHandwritingCanvas(action: Extract<AgentAction, { type: "open_handwriting_canvas" }>) {
    const nextVoiceSessionId = crypto.randomUUID();

    setCanvasOpen(true);
    setCanvasStatus("opening");
    setWidgetStatus("loading");
    setCanvasDisplayMode("inline");
    setCanvasCollapsed(false);
    setHwrMode(action.mode);
    setHwrLanguage(action.language);
    setHwrPrompt(action.prompt);
    setRecognitionText("");
    setRecognitionError(null);
    setComposerDraft("");
    setVoiceSessionId(nextVoiceSessionId);
    setVoiceAttachment(null);
    canvasSessionStartedAtRef.current = performance.now();

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
    const cleanedMessage = stripVoiceAttachmentReference(message);

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: cleanedMessage,
    };

    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setBusy(true);

    try {
      const outboundAttachments = shouldSendVoiceAttachment(voiceAttachmentRef.current)
        ? [voiceAttachmentRef.current!]
        : [];

      const response = await fetch("/api/agent", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: cleanedMessage,
          history: nextMessages
            .filter((item) => item.role === "user" || item.role === "assistant")
            .slice(-8)
            .map((item) => ({
              role: item.role,
              content: item.content,
            })),
          canvas: canvasSummary,
          attachments: outboundAttachments,
        }),
      });

      const payload = (await response.json()) as AgentResponse;

      if (!response.ok) {
        throw new Error(payload.message || "Agent API 请求失败");
      }

      const legacySvg = extractLegacySvgFences(payload.message);
      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: legacySvg.content || (legacySvg.specs.length > 0 ? "已生成规范图形。" : payload.message),
        charts: extractRenderChartSpecs(payload.actions),
        svgs: [...extractRenderSvgSpecs(payload.actions), ...legacySvg.specs],
      };
      const opensCanvas = payload.actions.some((action) => action.type === "open_handwriting_canvas");

      setMessages((current) => [...current, assistantMessage]);
      if (opensCanvas) {
        setCanvasAfterMessageId(assistantMessage.id);
      }
      await applyActions(payload.actions);
      setVoiceAttachment(null);
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
    if (voiceRecorderRef.current?.isRecording()) {
      const payload = voiceRecorderRef.current.stopAndFlush();
      const attachment = payload ? createVoiceTranscriptAttachment(payload) : voiceAttachmentRef.current;
      if (attachment) {
        setVoiceAttachment(attachment);
        voiceAttachmentRef.current = attachment;
      }
    }

    const prepared = stripVoiceAttachmentReference(prepareRecognitionForComposer(text, hwrPromptRef.current));

    if (!prepared) {
      return;
    }

    setCanvasDisplayMode("inline");
    setCanvasCollapsed(true);
    setComposerDraft((current) => {
      const sanitizedCurrent = stripVoiceAttachmentReference(
        prepareRecognitionForComposer(current, hwrPromptRef.current),
      );

      if (!sanitizedCurrent) {
        return prepared;
      }

      if (sanitizedCurrent.includes(prepared)) {
        return sanitizedCurrent;
      }

      return `${sanitizedCurrent}\n\n${prepared}`;
    });
    setComposerFocusSignal((current) => current + 1);
  }, []);

  const handleVoiceTranscriptChange = useCallback((payload: VoiceTranscriptPayload) => {
    const attachment = createVoiceTranscriptAttachment(payload);
    setVoiceAttachment(attachment);
    voiceAttachmentRef.current = attachment;
  }, []);

  const handleCanvasDisplayModeChange = useCallback((mode: CanvasDisplayMode) => {
    setCanvasDisplayMode(mode);
    if (mode === "fullscreen") {
      setCanvasCollapsed(false);
    }
  }, []);

  const canvasSlot = canvasOpen ? (
    <div
      className={
        canvasDisplayMode === "fullscreen"
          ? "canvas-session canvas-session-fullscreen"
          : canvasCollapsed
            ? "canvas-session canvas-session-inline canvas-session-collapsed"
            : "canvas-session canvas-session-inline"
      }
    >
      {canvasCollapsed ? (
        <div className="canvas-collapsed-summary" role="status">
          <div className="canvas-collapsed-copy">
            <span className="canvas-collapsed-icon" aria-hidden="true">✓</span>
            <div>
              <strong>手写内容已转到 AskAI 输入框</strong>
              <p>{recognitionText.trim() || "识别结果已放入下方输入框，可继续补充要求。"}</p>
            </div>
          </div>
          <button type="button" onClick={() => setCanvasCollapsed(false)}>
            重新展开
          </button>
        </div>
      ) : null}
      <div
        className={canvasCollapsed ? "canvas-session-content is-collapsed" : "canvas-session-content"}
        aria-hidden={canvasCollapsed}
        inert={canvasCollapsed}
      >
        <FluxInkWidgetHost
          key={widgetSessionId}
          displayMode={canvasDisplayMode}
          mode={hwrMode}
          language={hwrLanguage}
          prompt={hwrPrompt}
          uiResourceUri={DEFAULT_FLUXINK_HWR_UI_RESOURCE_URI}
          openResult={hwrOpenResult}
          recognitionError={recognitionError}
          onDisplayModeChange={handleCanvasDisplayModeChange}
          onRecognitionChange={stableWidgetRecognitionChange}
          onSendResultToComposer={handleSendResultToComposer}
        />
        <VoiceRecorder
          ref={voiceRecorderRef}
          sessionId={voiceSessionId}
          disabled={busy}
          getElapsedMs={getCanvasElapsedMs}
          onTranscriptChange={handleVoiceTranscriptChange}
          compact={canvasDisplayMode === "fullscreen"}
        />
      </div>
    </div>
  ) : null;

  return (
    <main className="app-shell">
      <ChatPanel
        canvasSlot={canvasSlot}
        canvasAfterMessageId={canvasAfterMessageId}
        draft={composerDraft}
        focusComposerSignal={composerFocusSignal}
        voiceAttachment={voiceAttachment}
        messages={messages}
        busy={busy}
        onDraftChange={setComposerDraft}
        onSend={handleSend}
      />
    </main>
  );
}
