"use client";

import type { FormEvent } from "react";
import type { ReactNode } from "react";
import { Fragment, useEffect, useMemo, useRef } from "react";

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
              <span className="message-role">
                {message.role === "user" ? "你" : message.role === "assistant" ? "Agent" : "系统"}
              </span>
              <p>{message.content}</p>
            </article>
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
        <textarea
          ref={textareaRef}
          value={draft}
          placeholder="例如：我想手写一个数学公式，帮我识别后继续讨论。"
          rows={3}
          onChange={(event) => onDraftChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
        />
        <button type="submit" disabled={!canSend}>
          发送
        </button>
      </form>
    </section>
  );
}
