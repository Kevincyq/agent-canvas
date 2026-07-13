"use client";

import type { FormEvent } from "react";
import type { ReactNode } from "react";
import { Fragment, useEffect, useMemo, useRef } from "react";

import { ChatMessageContent } from "@/components/chat/ChatMessageContent";
import { UserMessageBubble } from "@/components/chat/UserMessageBubble";
import { PlotCard } from "@/components/chart/PlotCard";
import { SvgDiagramCard } from "@/components/svg/SvgDiagramCard";
import { VoiceAttachmentCard } from "@/components/voice/VoiceAttachmentCard";
import type { ChatMessage, AgentAttachment } from "@/types/agent";

type ChatPanelProps = {
  messages: ChatMessage[];
  busy: boolean;
  canvasAfterMessageId?: string | null;
  canvasSlot?: ReactNode;
  draft: string;
  focusComposerSignal: number;
  voiceAttachment?: AgentAttachment | null;
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
  voiceAttachment = null,
  onDraftChange,
  onSend,
}: ChatPanelProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const messageListRef = useRef<HTMLDivElement | null>(null);

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
    window.requestAnimationFrame(() => {
      messageListRef.current?.scrollTo({
        top: messageListRef.current.scrollHeight,
        behavior: "smooth",
      });
      textarea.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
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
        <h1 className="panel-title">Dralk Agent</h1>
        <span
          className={busy ? "status-dot busy" : "status-dot"}
          aria-label={busy ? "运行中" : "就绪"}
          title={busy ? "运行中" : "就绪"}
        />
      </div>

      <div ref={messageListRef} className="message-list">
        {messages.map((message) => (
          <Fragment key={message.id}>
            {message.role === "user" ? (
              <UserMessageBubble content={message.content} attachments={message.attachments} />
            ) : (
              <article className={`message ${message.role}`}>
                <ChatMessageContent content={message.content} variant={message.role} />
              </article>
            )}
            {message.attachments?.map((attachment) => (
              <div key={`${message.id}-${attachment.id}`} className="message-attachment-slot">
                <VoiceAttachmentCard attachment={attachment} status="sent" compact />
              </div>
            ))}
            {message.charts?.map((spec, index) => (
              <div key={`${message.id}-chart-${index}`} className="message-chart-slot">
                <PlotCard spec={spec} />
              </div>
            ))}
            {message.svgs?.map((spec, index) => (
              <div key={`${message.id}-svg-${index}`} className="message-svg-slot">
                <SvgDiagramCard spec={spec} />
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
            rows={2}
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
        {voiceAttachment?.content.trim() ? (
          <div className="composer-attachment" aria-label="语音附件预览">
            <VoiceAttachmentCard attachment={voiceAttachment} status="pending" compact />
          </div>
        ) : null}
      </form>
    </section>
  );
}
