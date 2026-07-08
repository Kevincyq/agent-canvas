"use client";

import type { FormEvent } from "react";
import type { ReactNode } from "react";
import { Fragment, useEffect, useMemo, useRef } from "react";

import { ChatMessageContent } from "@/components/chat/ChatMessageContent";
import { PlotCard } from "@/components/chart/PlotCard";
import type { ChatMessage } from "@/types/agent";

type ChatPanelProps = {
  messages: ChatMessage[];
  busy: boolean;
  canvasAfterMessageId?: string | null;
  canvasSlot?: ReactNode;
  draft: string;
  focusComposerSignal: number;
  onDraftChange: (draft: string) => void;
  onSend: (message: string) => Promise<void>;
};

export function ChatPanel({
  messages,
  busy,
  canvasAfterMessageId,
  canvasSlot,
  draft,
  focusComposerSignal,
  onDraftChange,
  onSend,
}: ChatPanelProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const canSend = useMemo(() => draft.trim().length > 0 && !busy, [busy, draft]);
  const shouldRenderFallbackCanvas = Boolean(
    canvasSlot && canvasAfterMessageId && !messages.some((message) => message.id === canvasAfterMessageId),
  );

  useEffect(() => {
    const textarea = textareaRef.current;

    if (!textarea || focusComposerSignal === 0) {
      return;
    }

    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
  }, [focusComposerSignal]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canSend) {
      return;
    }

    const message = draft.trim();
    onDraftChange("");
    await onSend(message);
  }

  return (
    <section className="chat-panel" aria-label="对话区">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Canvas Agent</p>
          <h1>对话意图识别</h1>
        </div>
        <span className={busy ? "status-dot busy" : "status-dot"}>{busy ? "运行中" : "就绪"}</span>
      </div>

      <div className="message-list">
        {messages.map((message) => (
          <Fragment key={message.id}>
            <article className={`message ${message.role}`}>
              <ChatMessageContent content={message.content} variant={message.role} />
            </article>
            {message.charts?.map((spec, index) => (
              <div key={`${message.id}-chart-${index}`} className="message-chart-slot">
                <PlotCard spec={spec} />
              </div>
            ))}
            {canvasSlot && canvasAfterMessageId === message.id ? (
              <div className="message-canvas-slot">{canvasSlot}</div>
            ) : null}
          </Fragment>
        ))}
        {canvasSlot && (!canvasAfterMessageId || shouldRenderFallbackCanvas) ? (
          <div className="message-canvas-slot">{canvasSlot}</div>
        ) : null}
      </div>

      <form className="composer" onSubmit={handleSubmit}>
        <div className="composer-input">
          <textarea
            ref={textareaRef}
            value={draft}
            placeholder="例如：打开画布或手写输入..."
            rows={3}
            onChange={(event) => onDraftChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
          />
          <button
            type="submit"
            className={canSend ? "composer-send active" : "composer-send"}
            disabled={!canSend}
            aria-label="发送"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18">
              <path
                d="M3.4 20.6 21 12 3.4 3.4l2.8 7.2L16 12l-9.8 1.4-2.8 7.2Z"
                fill="currentColor"
              />
            </svg>
          </button>
        </div>
      </form>
    </section>
  );
}
