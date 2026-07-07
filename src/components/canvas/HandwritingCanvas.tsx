"use client";

import type { PointerEvent as ReactPointerEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

import type { CanvasElement } from "@/lib/canvas/actions";
import type { HandwritingPayload, HwrMode, Point } from "@/types/agent";

type HandwritingCanvasProps = {
  elements: CanvasElement[];
  displayMode: "inline" | "fullscreen";
  mode: HwrMode;
  mcpMessage: string | null;
  recognitionText: string;
  recognitionStatus: "idle" | "opening" | "ready" | "recognizing" | "recognized" | "error";
  recognitionError: string | null;
  recognitionBusy: boolean;
  selectedElementId: string | null;
  onElementsChange: (elements: CanvasElement[]) => void;
  onDisplayModeChange: (mode: "inline" | "fullscreen") => void;
  onSendToAskAIInput: () => void;
  onSelectedElementChange: (id: string | null) => void;
  onRecognizeHandwriting: (payload: HandwritingPayload) => Promise<void>;
};

type StrokeDraft = {
  points: Point[];
};

function getCanvasPoint(canvas: HTMLCanvasElement, event: PointerEvent) {
  const rect = canvas.getBoundingClientRect();

  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
    t: Date.now(),
  };
}

function drawElements(
  canvas: HTMLCanvasElement,
  context: CanvasRenderingContext2D,
  elements: CanvasElement[],
  draft: StrokeDraft | null,
) {
  const ratio = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();

  canvas.width = Math.floor(rect.width * ratio);
  canvas.height = Math.floor(rect.height * ratio);
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, rect.width, rect.height);

  context.lineCap = "round";
  context.lineJoin = "round";

  for (const element of elements) {
    if (element.type === "text") {
      context.font = "16px Inter, system-ui, sans-serif";
      context.fillStyle = element.highlighted ? "#1d4ed8" : "#111827";
      context.fillText(element.text, element.x, element.y);
      continue;
    }

    if (element.points.length < 2) {
      continue;
    }

    context.beginPath();
    context.strokeStyle = element.highlighted ? "#1d4ed8" : element.color;
    context.lineWidth = element.highlighted ? element.width + 2 : element.width;
    context.moveTo(element.points[0].x, element.points[0].y);

    for (const point of element.points.slice(1)) {
      context.lineTo(point.x, point.y);
    }

    context.stroke();
  }

  if (draft && draft.points.length > 1) {
    context.beginPath();
    context.strokeStyle = "#111827";
    context.lineWidth = 3;
    context.moveTo(draft.points[0].x, draft.points[0].y);

    for (const point of draft.points.slice(1)) {
      context.lineTo(point.x, point.y);
    }

    context.stroke();
  }
}

export function HandwritingCanvas({
  elements,
  displayMode,
  mode,
  mcpMessage,
  recognitionText,
  recognitionStatus,
  recognitionError,
  recognitionBusy,
  selectedElementId,
  onElementsChange,
  onDisplayModeChange,
  onSendToAskAIInput,
  onSelectedElementChange,
  onRecognizeHandwriting,
}: HandwritingCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const lastRecognitionSignatureRef = useRef("");
  const [draft, setDraft] = useState<StrokeDraft | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  const buildHandwritingPayload = useCallback((): HandwritingPayload | null => {
    const canvas = canvasRef.current;
    const rect = canvas?.getBoundingClientRect();
    const strokes = elements
      .filter((element): element is Extract<CanvasElement, { type: "stroke" }> => element.type === "stroke")
      .map((element) => ({
        points: element.points,
        width: element.width,
        color: element.color,
      }));

    if (!canvas || !rect || strokes.length === 0) {
      return null;
    }

    return {
      strokes,
      canvas: {
        width: Math.max(1, Math.round(rect.width)),
        height: Math.max(1, Math.round(rect.height)),
        devicePixelRatio: window.devicePixelRatio || 1,
      },
    };
  }, [elements]);

  useEffect(() => {
    if (isDrawing || recognitionBusy) {
      return;
    }

    const payload = buildHandwritingPayload();

    if (!payload) {
      lastRecognitionSignatureRef.current = "";
      return;
    }

    const signature = JSON.stringify(payload.strokes.map((stroke) => stroke.points));

    if (signature === lastRecognitionSignatureRef.current) {
      return;
    }

    const timer = window.setTimeout(() => {
      lastRecognitionSignatureRef.current = signature;
      void onRecognizeHandwriting(payload);
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [buildHandwritingPayload, isDrawing, onRecognizeHandwriting, recognitionBusy]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");

    if (!canvas || !context) {
      return;
    }

    const redraw = () => drawElements(canvas, context, elements, draft);
    redraw();

    const observer = new ResizeObserver(redraw);
    observer.observe(canvas);

    return () => observer.disconnect();
  }, [draft, elements]);

  function handlePointerDown(event: ReactPointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;

    if (!canvas) {
      return;
    }

    canvas.setPointerCapture(event.pointerId);
    setIsDrawing(true);
    setDraft({ points: [getCanvasPoint(canvas, event.nativeEvent)] });
    onSelectedElementChange(null);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;

    if (!canvas || !isDrawing) {
      return;
    }

    const nextPoint = getCanvasPoint(canvas, event.nativeEvent);
    setDraft((current) =>
      current ? { points: [...current.points, nextPoint] } : { points: [nextPoint] },
    );
  }

  function finishStroke() {
    if (!draft || draft.points.length < 2) {
      setDraft(null);
      setIsDrawing(false);
      return;
    }

    onElementsChange([
      ...elements,
      {
        id: crypto.randomUUID(),
        type: "stroke",
        points: draft.points,
        color: "#111827",
        width: 3,
      },
    ]);
    setDraft(null);
    setIsDrawing(false);
  }

  function exportPng() {
    const canvas = canvasRef.current;

    if (!canvas) {
      return;
    }

    const link = document.createElement("a");
    link.download = "canvas-agent-sketch.png";
    link.href = canvas.toDataURL("image/png");
    link.click();
  }

  async function copyRecognitionText() {
    if (!recognitionText) {
      return;
    }

    await navigator.clipboard.writeText(recognitionText);
  }

  return (
    <section
      className={displayMode === "fullscreen" ? "canvas-panel canvas-fullscreen" : "canvas-panel canvas-inline"}
      aria-label="手写画布"
    >
      <div className="panel-header">
        <div>
          <p className="eyebrow">Handwriting Canvas</p>
          <h2>手写画布</h2>
          <p className="canvas-subtitle">
            {mode === "structure" ? "结构识别模式" : "通用识别模式"}
            {mcpMessage ? ` · ${mcpMessage}` : ""}
          </p>
        </div>
        <div className="canvas-actions">
          <button
            type="button"
            onClick={() => onElementsChange(elements.slice(0, -1))}
            disabled={elements.length === 0}
          >
            撤销
          </button>
          <button type="button" onClick={() => onElementsChange([])} disabled={elements.length === 0}>
            清空
          </button>
          <button type="button" onClick={exportPng} disabled={elements.length === 0}>
            导出 PNG
          </button>
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

      <div className="canvas-shell">
        <canvas
          ref={canvasRef}
          aria-label="可手写的画布"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={finishStroke}
          onPointerCancel={finishStroke}
        />
      </div>

      <div className="canvas-meta">
        <span>元素：{elements.length}</span>
        <span>笔画：{elements.filter((element) => element.type === "stroke").length}</span>
        <span>选中：{selectedElementId ?? "无"}</span>
        <span>
          {recognitionStatus === "recognizing"
            ? "停笔识别中"
            : recognitionStatus === "recognized"
              ? "已结构化"
              : recognitionStatus === "error"
                ? "识别异常"
                : "停笔 1s 自动识别"}
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
              disabled={!recognitionText || recognitionStatus === "recognizing"}
            >
              Send to AskAI
            </button>
          </div>
        </div>
        <pre>
          {recognitionError
            ? recognitionError
            : recognitionText || "开始书写后，停笔超过 1 秒会自动识别并更新这里。"}
        </pre>
      </div>
    </section>
  );
}
