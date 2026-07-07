"use client";

import { useCallback, useMemo, useRef, useState } from "react";

import { ChatPanel } from "@/components/chat/ChatPanel";
import { HandwritingCanvas } from "@/components/canvas/HandwritingCanvas";
import { createCanvasSummary, type CanvasElement } from "@/lib/canvas/actions";
import type {
  AgentAction,
  AgentResponse,
  ChatMessage,
  HandwritingPayload,
  HwrMode,
  HwrOpenResponse,
  HwrRecognizeResponse,
  HwrRecognitionMode,
} from "@/types/agent";

const welcomeMessage: ChatMessage = {
  id: "welcome",
  role: "assistant",
  content:
    "你好，我是 Canvas Agent。你可以让我在对话中打开手写画布，停笔后我会自动结构化识别结果。",
};

type CanvasStatus = "idle" | "opening" | "ready" | "recognizing" | "recognized" | "error";
type CanvasDisplayMode = "inline" | "fullscreen";

function inferRecognitionMode(prompt: string, mode: HwrMode): HwrRecognitionMode {
  const normalized = prompt.toLowerCase();

  if (
    mode === "structure" ||
    normalized.includes("分子") ||
    normalized.includes("结构式") ||
    normalized.includes("molecule") ||
    normalized.includes("smiles")
  ) {
    return "structure";
  }

  if (
    normalized.includes("数学") ||
    normalized.includes("公式") ||
    normalized.includes("方程") ||
    normalized.includes("math") ||
    normalized.includes("equation")
  ) {
    return "math";
  }

  if (
    normalized.includes("化学") ||
    normalized.includes("chemical") ||
    normalized.includes("chemistry")
  ) {
    return "chemical";
  }

  return "text";
}

export function CanvasAgentApp() {
  const [messages, setMessages] = useState<ChatMessage[]>([welcomeMessage]);
  const [elements, setElements] = useState<CanvasElement[]>([]);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [canvasOpen, setCanvasOpen] = useState(false);
  const [canvasAfterMessageId, setCanvasAfterMessageId] = useState<string | null>(null);
  const [canvasStatus, setCanvasStatus] = useState<CanvasStatus>("idle");
  const [canvasDisplayMode, setCanvasDisplayMode] = useState<CanvasDisplayMode>("inline");
  const [hwrMode, setHwrMode] = useState<HwrMode>("general");
  const [hwrLanguage, setHwrLanguage] = useState("");
  const [hwrPrompt, setHwrPrompt] = useState("");
  const [hwrMessage, setHwrMessage] = useState<string | null>(null);
  const [recognitionText, setRecognitionText] = useState("");
  const [recognitionError, setRecognitionError] = useState<string | null>(null);
  const [composerDraft, setComposerDraft] = useState("");
  const [composerFocusSignal, setComposerFocusSignal] = useState(0);
  const recognitionRequestIdRef = useRef(0);

  const canvasSummary = useMemo(
    () => createCanvasSummary(canvasOpen, elements, selectedElementId),
    [canvasOpen, elements, selectedElementId],
  );

  async function openHandwritingCanvas(action: Extract<AgentAction, { type: "open_handwriting_canvas" }>) {
    setCanvasOpen(true);
    setCanvasStatus("opening");
    setCanvasDisplayMode("inline");
    setHwrMode(action.mode);
    setHwrLanguage(action.language);
    setHwrPrompt(action.prompt);
    setHwrMessage("正在连接 FluxInk MCP");
    setRecognitionText("");
    setRecognitionError(null);

    if (action.force_new) {
      setElements([]);
      setSelectedElementId(null);
    }

    const response = await fetch("/api/mcp/hwr/open", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(action),
    });
    const payload = (await response.json()) as HwrOpenResponse;

    if (!response.ok || !payload.ok) {
      throw new Error(payload.error || "手写画布初始化失败");
    }

    setHwrMessage(payload.message || "Draw on the canvas below");
    setCanvasStatus("ready");
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

  const handleRecognizeHandwriting = useCallback(
    async function handleRecognizeHandwriting(payload: HandwritingPayload) {
      const requestId = recognitionRequestIdRef.current + 1;
      recognitionRequestIdRef.current = requestId;
      setCanvasStatus("recognizing");
      setRecognitionError(null);

      try {
        const response = await fetch("/api/mcp/hwr/recognize", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            strokes: payload,
            mode: hwrMode,
            recognitionMode: inferRecognitionMode(hwrPrompt, hwrMode),
            language: hwrLanguage,
          }),
        });
        const result = (await response.json()) as HwrRecognizeResponse;

        if (requestId !== recognitionRequestIdRef.current) {
          return;
        }

        if (!response.ok || !result.ok || !result.text) {
          throw new Error(result.error || "手写识别失败");
        }

        setRecognitionText(result.text);
        setCanvasStatus("recognized");
      } catch (error) {
        if (requestId !== recognitionRequestIdRef.current) {
          return;
        }

        setCanvasStatus("error");
        setRecognitionError(error instanceof Error ? error.message : "手写识别失败");
      }
    },
    [hwrLanguage, hwrMode, hwrPrompt],
  );

  function handleSendRecognitionToAskAIInput() {
    setCanvasDisplayMode("inline");

    const text = recognitionText.trim();

    if (!text) {
      return;
    }

    setComposerDraft((current) => {
      const trimmedCurrent = current.trimEnd();

      if (!trimmedCurrent) {
        return text;
      }

      if (trimmedCurrent.includes(text)) {
        return trimmedCurrent;
      }

      return `${trimmedCurrent}\n\n${text}`;
    });
    setComposerFocusSignal((current) => current + 1);
  }

  const canvasSlot = canvasOpen ? (
    <HandwritingCanvas
      displayMode={canvasDisplayMode}
      elements={elements}
      mode={hwrMode}
      mcpMessage={hwrMessage}
      recognitionError={recognitionError}
      recognitionStatus={canvasStatus}
      recognitionText={recognitionText}
      selectedElementId={selectedElementId}
      recognitionBusy={canvasStatus === "recognizing" || canvasStatus === "opening"}
      onDisplayModeChange={setCanvasDisplayMode}
      onElementsChange={setElements}
      onRecognizeHandwriting={handleRecognizeHandwriting}
      onSendToAskAIInput={handleSendRecognitionToAskAIInput}
      onSelectedElementChange={setSelectedElementId}
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
