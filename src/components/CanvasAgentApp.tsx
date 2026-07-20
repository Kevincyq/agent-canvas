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
import { svgSpecsToContentBlocks } from "@/lib/content/legacy";
import { DEFAULT_FLUXINK_HWR_UI_RESOURCE_URI } from "@/lib/mcp/constants";
import { createVoiceTranscriptAttachment, type VoiceTranscriptPayload } from "@/lib/voice/timeline";
import {
  shouldSendVoiceAttachment,
  stripVoiceAttachmentReference,
} from "@/lib/voice/composer-sync";
import type {
  AgentAttachment,
  AgentAction,
  ChatMessage,
  HwrMode,
  HwrOpenResponse,
} from "@/types/agent";
import type { AgentRunResponse } from "@/types/agent-runtime";
import type { ContentBlock } from "@/types/content-block";
import type { ConversationTask } from "@/types/task";
import type { DralkWorkflowRecord, WorkflowRequest } from "@/types/workflow";

const CONVERSATION_STORAGE_KEY = "askai.conversationId";
const WORKFLOW_STORAGE_KEY = "askai.dralkWorkflowId";

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
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([welcomeMessage]);
  const [busy, setBusy] = useState(false);
  const [hydrating, setHydrating] = useState(true);
  const [activeWorkflow, setActiveWorkflow] = useState<DralkWorkflowRecord | null>(null);
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

  useEffect(() => {
    let cancelled = false;

    async function hydrateConversation() {
      const storedId = window.localStorage.getItem(CONVERSATION_STORAGE_KEY);
      if (!storedId) {
        if (!cancelled) {
          setHydrating(false);
        }
        return;
      }

      try {
        const response = await fetch(`/api/conversations/${storedId}`);
        if (!response.ok) {
          window.localStorage.removeItem(CONVERSATION_STORAGE_KEY);
          return;
        }

        const payload = (await response.json()) as {
          conversation: ConversationTask;
          messages: ChatMessage[];
          activeWorkflow?: DralkWorkflowRecord | null;
        };

        if (cancelled) {
          return;
        }

        setConversationId(payload.conversation.id);
        setMessages(payload.messages.length > 0 ? payload.messages : [welcomeMessage]);

        if (payload.activeWorkflow) {
          setActiveWorkflow(payload.activeWorkflow);
          window.localStorage.setItem(WORKFLOW_STORAGE_KEY, payload.activeWorkflow.id);
          const wf = payload.activeWorkflow;
          setCanvasOpen(true);
          setCanvasStatus(
            wf.status === "recognized" || wf.status === "attached" ? "recognized" : "ready",
          );
          setWidgetStatus("ready");
          setCanvasDisplayMode("inline");
          setCanvasCollapsed(wf.status === "attached" || wf.status === "recognized");
          setHwrMode(wf.payload.mode);
          setHwrLanguage(wf.payload.language);
          setHwrPrompt(wf.payload.prompt);
          setRecognitionText(wf.payload.queryPayload?.displaySummary ?? "");
          setHwrOpenResult({
            ok: true,
            mode: wf.payload.mode,
            language: wf.payload.language,
            prompt: wf.payload.prompt,
            toolName: "fluxink-widget-host",
          });
          setWidgetSessionId((current) => current + 1);
          canvasSessionStartedAtRef.current = performance.now();
        }
      } catch {
        // Keep welcome state if restore fails; next send creates a new conversation.
      } finally {
        if (!cancelled) {
          setHydrating(false);
        }
      }
    }

    void hydrateConversation();

    return () => {
      cancelled = true;
    };
  }, []);

  function persistConversationId(nextId: string) {
    setConversationId(nextId);
    window.localStorage.setItem(CONVERSATION_STORAGE_KEY, nextId);
  }

  async function postDralkEvent(
    event: "canvas_opened" | "recognized" | "attached" | "cancelled" | "failed" | "completed",
    extra?: {
      queryPayload?: {
        displaySummary?: string;
        recognitionType?: string;
        structuredContent?: unknown;
        voiceTranscriptRef?: string;
        startMs?: number;
        endMs?: number;
        canvasSessionId?: string;
      };
      errorMessage?: string;
    },
  ) {
    if (!conversationId || !activeWorkflow) {
      return null;
    }

    const response = await fetch("/api/workflows/dralk/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        conversationId,
        workflowId: activeWorkflow.id,
        event,
        canvasSessionId: activeWorkflow.payload.canvasSessionId ?? undefined,
        ...extra,
      }),
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as { workflow: DralkWorkflowRecord };
    setActiveWorkflow(payload.workflow);
    return payload.workflow;
  }

  async function openCanvasFromWorkflowRequest(request: WorkflowRequest, afterMessageId?: string) {
    const nextVoiceSessionId = crypto.randomUUID();

    setActiveWorkflow({
      id: request.workflowId,
      conversationId: request.conversationId,
      workflowType: "dralk_input",
      status: request.status,
      payload: {
        origin: request.origin,
        prompt: request.prompt,
        mode: request.mode,
        language: request.language,
        forceNew: request.forceNew,
        canvasSessionId: null,
        queryPayload: null,
        errorMessage: null,
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    window.localStorage.setItem(WORKFLOW_STORAGE_KEY, request.workflowId);

    setCanvasOpen(true);
    setCanvasStatus("opening");
    setWidgetStatus("loading");
    setCanvasDisplayMode("inline");
    setCanvasCollapsed(false);
    setHwrMode(request.mode);
    setHwrLanguage(request.language);
    setHwrPrompt(request.prompt);
    setRecognitionText("");
    setRecognitionError(null);
    setVoiceSessionId(nextVoiceSessionId);
    setVoiceAttachment(null);
    canvasSessionStartedAtRef.current = performance.now();
    if (afterMessageId) {
      setCanvasAfterMessageId(afterMessageId);
    }

    setHwrOpenResult({
      ok: true,
      mode: request.mode,
      language: request.language,
      prompt: request.prompt,
      toolName: "fluxink-widget-host",
    });
    setCanvasStatus("ready");
    setWidgetSessionId((current) => current + 1);

    await fetch("/api/workflows/dralk/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        conversationId: request.conversationId,
        workflowId: request.workflowId,
        event: "canvas_opened",
      }),
    })
      .then(async (response) => {
        if (!response.ok) {
          return;
        }
        const payload = (await response.json()) as { workflow: DralkWorkflowRecord };
        setActiveWorkflow(payload.workflow);
      })
      .catch(() => undefined);
  }

  async function handleStartDralk() {
    setBusy(true);
    try {
      const response = await fetch("/api/workflows/dralk/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: conversationId ?? undefined,
          origin: "user_button",
          prompt: "请在画布中边画边说输入内容",
          forceNew: true,
        }),
      });
      const payload = (await response.json()) as {
        conversationId: string;
        workflowRequest: WorkflowRequest;
        message?: string;
      };
      if (!response.ok) {
        throw new Error(payload.message || "启动 Dralk 失败");
      }
      persistConversationId(payload.conversationId);
      await openCanvasFromWorkflowRequest(payload.workflowRequest);
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "system",
          content: error instanceof Error ? error.message : "启动 Dralk 失败",
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  const canvasSummary = useMemo(
    () =>
      createCanvasSummary(
        canvasOpen,
        [],
        null,
      ),
    [canvasOpen],
  );

  const workflowStatusLabel = useMemo(() => {
    if (!activeWorkflow) {
      return null;
    }
    const labels: Record<string, string> = {
      waiting_for_input: "Dralk：等待输入",
      capturing: "Dralk：采集中",
      recognized: "Dralk：已识别",
      attached: "Dralk：已附到 Composer",
      running: "Dralk：Ask AI 处理中",
    };
    return labels[activeWorkflow.status] ?? null;
  }, [activeWorkflow]);

  const getCanvasElapsedMs = useCallback(() => {
    if (canvasSessionStartedAtRef.current <= 0) {
      return 0;
    }

    return Math.max(0, Math.round(performance.now() - canvasSessionStartedAtRef.current));
  }, []);

  async function handleSend(message: string) {
    const cleanedMessage = stripVoiceAttachmentReference(message);
    const outboundAttachments = shouldSendVoiceAttachment(voiceAttachmentRef.current)
      ? [voiceAttachmentRef.current!]
      : [];

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: cleanedMessage,
      attachments: outboundAttachments,
    };

    setMessages((current) => [...current, userMessage]);
    setBusy(true);
    setVoiceAttachment(null);
    voiceAttachmentRef.current = null;
    voiceRecorderRef.current?.clearTranscript();

    try {
      if (activeWorkflow && recognitionText.trim()) {
        await postDralkEvent("attached", {
          queryPayload: {
            displaySummary: recognitionText.trim(),
            recognitionType: "handwriting",
            structuredContent: recognitionText.trim(),
            voiceTranscriptRef: outboundAttachments[0]?.id ?? null,
            startMs: 0,
            endMs: getCanvasElapsedMs(),
            canvasSessionId: activeWorkflow.payload.canvasSessionId ?? undefined,
          },
        });
      }

      const response = await fetch("/api/agent/run", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          conversationId: conversationId ?? undefined,
          message: cleanedMessage,
          canvas: canvasSummary,
          attachments: outboundAttachments,
          dralkContext: recognitionText.trim()
            ? {
                displaySummary: recognitionText.trim(),
                recognitionType: "handwriting",
                structuredContent: recognitionText.trim(),
                voiceTranscriptRef: outboundAttachments[0]?.id ?? null,
                startMs: 0,
                endMs: getCanvasElapsedMs(),
                canvasSessionId: activeWorkflow?.payload.canvasSessionId ?? null,
                confidence: null,
                sourceMetadata: null,
                strokesRef: null,
              }
            : undefined,
        }),
      });

      const payload = (await response.json()) as AgentRunResponse;

      if (!response.ok) {
        throw new Error(payload.message || "Agent run 请求失败");
      }

      persistConversationId(payload.conversationId);

      const legacySvg = extractLegacySvgFences(payload.message);
      const legacySvgBlocks = svgSpecsToContentBlocks([
        ...extractRenderSvgSpecs(payload.actions),
        ...legacySvg.specs,
      ]);
      const assistantMessage: ChatMessage = {
        id: payload.assistantMessageId || crypto.randomUUID(),
        role: "assistant",
        content: legacySvg.content || (legacySvg.specs.length > 0 ? "已生成规范图形。" : payload.message),
        blocks: [...payload.blocks, ...legacySvgBlocks],
        charts: extractRenderChartSpecs(payload.actions),
      };

      setMessages((current) => {
        const withoutTempUser = current.filter((item) => item.id !== userMessage.id);
        return [
          ...withoutTempUser,
          {
            ...userMessage,
            id: payload.userMessageId || userMessage.id,
          },
          assistantMessage,
        ];
      });

      if (payload.workflowRequest) {
        setCanvasAfterMessageId(assistantMessage.id);
        await openCanvasFromWorkflowRequest(payload.workflowRequest, assistantMessage.id);
      } else if (payload.actions.some((action) => action.type === "open_handwriting_canvas")) {
        const action = payload.actions.find(
          (item) => item.type === "open_handwriting_canvas",
        ) as Extract<AgentAction, { type: "open_handwriting_canvas" }>;
        const startResponse = await fetch("/api/workflows/dralk/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            conversationId: payload.conversationId,
            origin: "agent_intent",
            prompt: action.prompt,
            mode: action.mode,
            language: action.language,
            forceNew: action.force_new,
          }),
        });
        if (startResponse.ok) {
          const started = (await startResponse.json()) as {
            workflowRequest: WorkflowRequest;
          };
          setCanvasAfterMessageId(assistantMessage.id);
          await openCanvasFromWorkflowRequest(started.workflowRequest, assistantMessage.id);
        }
      } else {
        setActiveWorkflow(null);
        window.localStorage.removeItem(WORKFLOW_STORAGE_KEY);
      }

      if (canvasOpen) {
        setCanvasCollapsed(true);
      }
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

  function handleUpdateMessageBlocks(messageId: string, blocks: ContentBlock[]) {
    setMessages((current) => current.map((message) => message.id === messageId ? { ...message, blocks } : message));
  }

  function handleCreateDocument(sourceMessageId: string, title: string, blocks: ContentBlock[]) {
    const documentId = crypto.randomUUID();
    const documentBlocks = structuredClone(blocks).map((block, index) => ({
      ...block,
      id: `${documentId}-block-${index + 1}`,
    }));
    const documentMessage: ChatMessage = {
      id: documentId,
      role: "assistant",
      content: "",
      document: {
        title,
        sourceMessageId,
        createdAt: new Date().toISOString(),
      },
      blocks: documentBlocks,
    };

    setMessages((current) => [...current, documentMessage]);
  }

  const stableWidgetRecognitionChange = useCallback(
    (payload: { text: string; status: WidgetStatus; error?: string | null }) => {
      setWidgetStatus(payload.status);
      setRecognitionText(payload.text);
      setRecognitionError(payload.error ?? null);

      if (payload.status === "recognized") {
        setCanvasStatus("recognized");
        if (conversationId && activeWorkflow) {
          void fetch("/api/workflows/dralk/event", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              conversationId,
              workflowId: activeWorkflow.id,
              event: "recognized",
              queryPayload: {
                displaySummary: payload.text,
                recognitionType: "handwriting",
                structuredContent: payload.text,
                canvasSessionId: activeWorkflow.payload.canvasSessionId,
              },
            }),
          })
            .then(async (response) => {
              if (!response.ok) {
                return;
              }
              const body = (await response.json()) as { workflow: DralkWorkflowRecord };
              setActiveWorkflow(body.workflow);
            })
            .catch(() => undefined);
        }
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
    [activeWorkflow, conversationId],
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
              <strong>手写内容已就绪</strong>
              <p>可在下方输入框补充说明后发送 AskAI。</p>
              {voiceAttachment?.content.trim() ? (
                <span className="canvas-voice-attached">语音已附加</span>
              ) : null}
            </div>
          </div>
          <button type="button" onClick={() => setCanvasCollapsed(false)}>
            展开
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
          disabled={busy || hydrating}
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
        workflowStatusLabel={workflowStatusLabel}
        messages={messages}
        busy={busy || hydrating}
        onDraftChange={setComposerDraft}
        onSend={handleSend}
        onStartDralk={handleStartDralk}
        onCreateDocument={handleCreateDocument}
        onUpdateMessageBlocks={handleUpdateMessageBlocks}
      />
    </main>
  );
}
