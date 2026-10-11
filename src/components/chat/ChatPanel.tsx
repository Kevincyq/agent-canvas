"use client";

import type { FormEvent } from "react";
import type { ReactNode } from "react";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";

import { ApprovalCardList } from "@/components/chat/ApprovalCardList";
import { AssistantMessageActions } from "@/components/chat/AssistantMessageActions";
import { ChatMessageContent } from "@/components/chat/ChatMessageContent";
import { EvidenceList } from "@/components/chat/EvidenceList";
import { UserMessageBubble } from "@/components/chat/UserMessageBubble";
import { ContentBlockCard } from "@/components/content/ContentBlockCard";
import { UnifiedDocumentEditor } from "@/components/editor/UnifiedDocumentEditor";
import { VoiceAttachmentCard } from "@/components/voice/VoiceAttachmentCard";
import { MeetingWorkflowCard } from "@/components/meeting/MeetingWorkflowCard";
import type { ChatMessage, AgentAttachment } from "@/types/agent";
import type { ApprovalCard } from "@/types/agent-runtime";
import type { ContentBlock } from "@/types/content-block";
import type { MeetingWorkflowRecord } from "@/types/meeting-workflow";

type ChatPanelProps = {
  messages: ChatMessage[];
  busy: boolean;
  runProgress?: string | null;
  canvasAfterMessageId?: string | null;
  canvasSlot?: ReactNode;
  draft: string;
  focusComposerSignal: number;
  voiceAttachment?: AgentAttachment | null;
  approvals?: ApprovalCard[];
  meetingWorkflow?: MeetingWorkflowRecord | null;
  navOpen?: boolean;
  onToggleNav?: () => void;
  onDraftChange: (draft: string) => void;
  onSend: (message: string) => Promise<void>;
  onFinishMeeting?: () => Promise<void>;
  onWriteMeetingCalendar?: () => Promise<void>;
  onCreateDocument: (sourceMessageId: string, title: string, blocks: ContentBlock[]) => void;
  onApprovalDecide?: (input: {
    callId: string;
    decision: "approve" | "reject";
  }) => Promise<void>;
  onOpenArtifact?: (artifactId: string) => void;
};

function precedingUserPrompt(messages: ChatMessage[], assistantMessageId: string): string | null {
  const index = messages.findIndex((message) => message.id === assistantMessageId);
  if (index < 0) {
    return null;
  }

  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    const candidate = messages[cursor];
    if (candidate?.role === "user" && candidate.content.trim()) {
      return candidate.content.trim();
    }
  }

  return null;
}

function hasRichAnswerBody(message: ChatMessage): boolean {
  return (
    (message.blocks?.length ?? 0) > 0 ||
    (message.charts?.length ?? 0) > 0 ||
    (message.svgs?.length ?? 0) > 0
  );
}

/** Canvas-open turns must not look like a separate「AskAI 答复」. */
function isCanvasOpenStub(message: ChatMessage): boolean {
  if (message.role !== "assistant" || hasRichAnswerBody(message)) {
    return false;
  }
  const text = message.content.trim();
  if (!text) {
    return true;
  }
  return /手写画布|Dralk 手写|准备打开|已打开 Dralk|打开手写/.test(text);
}

/** Within this distance of the bottom the view keeps following new output. */
const BOTTOM_STICK_THRESHOLD_PX = 64;

export function ChatPanel({
  messages,
  busy,
  runProgress = null,
  canvasAfterMessageId,
  canvasSlot,
  draft,
  focusComposerSignal,
  voiceAttachment = null,
  approvals = [],
  meetingWorkflow = null,
  navOpen = false,
  onToggleNav,
  onDraftChange,
  onSend,
  onFinishMeeting,
  onWriteMeetingCalendar,
  onCreateDocument,
  onApprovalDecide,
}: ChatPanelProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const messageListRef = useRef<HTMLDivElement | null>(null);
  const stickToBottomRef = useRef(true);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);

  const canSend = useMemo(() => draft.trim().length > 0 && !busy, [busy, draft]);
  const shouldRenderFallbackCanvas = Boolean(
    canvasSlot && canvasAfterMessageId && !messages.some((message) => message.id === canvasAfterMessageId),
  );

  /**
   * Follow streaming output, but stop following once the user scrolls up to
   * read earlier content. A DOM observer is used instead of a `messages`
   * effect so that height changes landing after commit — mermaid, charts,
   * editors — also keep the view pinned.
   */
  useEffect(() => {
    const list = messageListRef.current;

    if (!list) {
      return;
    }

    const scrollToBottom = () => {
      if (!stickToBottomRef.current) {
        return;
      }
      // `instant` overrides the list's CSS smooth scrolling, which restarts on
      // every delta and never catches up while text is streaming.
      list.scrollTo({ top: list.scrollHeight, behavior: "instant" });
    };

    scrollToBottom();

    const observer = new MutationObserver(scrollToBottom);
    observer.observe(list, { childList: true, subtree: true, characterData: true });

    return () => observer.disconnect();
  }, []);

  function handleMessageListScroll() {
    const list = messageListRef.current;

    if (!list) {
      return;
    }

    const distanceFromBottom = list.scrollHeight - list.scrollTop - list.clientHeight;
    stickToBottomRef.current = distanceFromBottom <= BOTTOM_STICK_THRESHOLD_PX;
  }

  useEffect(() => {
    const textarea = textareaRef.current;

    if (!textarea || focusComposerSignal === 0) {
      return;
    }

    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    stickToBottomRef.current = true;
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
    // Sending is an explicit request to see the answer, so re-follow the tail
    // even if the user had scrolled up while reading.
    stickToBottomRef.current = true;
    await onSend(message);
  }

  return (
    <section className="chat-panel" aria-label="AskAI 任务区">
      <div className="panel-header">
        <div className="panel-header-leading">
          {onToggleNav ? (
            <button
              type="button"
              className="nav-menu-btn"
              aria-label={navOpen ? "关闭导航栏" : "打开导航栏"}
              aria-expanded={navOpen}
              onClick={onToggleNav}
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20">
                {navOpen ? (
                  <path
                    d="M6 6l12 12M18 6 6 18"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                ) : (
                  <path
                    d="M4 7h16M4 12h16M4 17h16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                )}
              </svg>
            </button>
          ) : null}
          <div className="brand-lockup">
            <h1 className="brand-lockup-title">
              Ask<span>AI</span> Agent
            </h1>
            <p className="brand-lockup-sub">任务 · 工具 · Dralk</p>
          </div>
        </div>
        <div
          className="status-chip"
          data-state={busy ? "busy" : "ready"}
          aria-label={busy ? runProgress || "运行中" : "就绪"}
          title={busy ? runProgress || "运行中" : "就绪"}
        >
          <span className={busy ? "status-dot busy" : "status-dot"} />
          {busy ? runProgress || "思考中" : "就绪"}
        </div>
      </div>

      <div ref={messageListRef} className="message-list" onScroll={handleMessageListScroll}>
        {messages.map((message) => (
          <Fragment key={message.id}>
            {message.id === "welcome" ? (
              <p className="chat-startup-title">{message.content}</p>
            ) : message.id === "collection-switch" ? (
              <p className="chat-context-notice">{message.content}</p>
            ) : message.document ? (
              <article className="saved-document-banner" aria-label={`新文档：${message.document.title}`}>
                <span>新文档</span>
                <div>
                  <strong>{message.document.title}</strong>
                  <small>已保留原答复，可继续编辑或下载</small>
                </div>
              </article>
            ) : message.role === "user" ? (
              <UserMessageBubble content={message.content} attachments={message.attachments} />
            ) : message.role === "assistant" ? (
              isCanvasOpenStub(message) ? null : (
                <>
                  {(message.content.trim() || hasRichAnswerBody(message)) && (
                    <div className="message-content-block-slot">
                      <ContentBlockCard
                        content={message.content}
                        blocks={message.blocks}
                        charts={message.charts}
                        svgs={message.svgs}
                        onEdit={() => setEditingMessageId(message.id)}
                      />
                    </div>
                  )}
                  <EvidenceList evidence={message.evidence} />
                  <AssistantMessageActions
                    messageId={message.id}
                    content={message.content}
                    blocks={message.blocks}
                    busy={busy}
                    onRegenerate={() => {
                      const prompt = precedingUserPrompt(messages, message.id);
                      if (prompt) {
                        void onSend(prompt);
                      }
                    }}
                    onSaveAsNote={() => {
                      const blocks = message.blocks ?? [];
                      if (blocks.length === 0) {
                        return;
                      }
                      const title =
                        blocks.find((block) => block.title)?.title?.trim() ||
                        "AskAI 笔记";
                      onCreateDocument(message.id, title, blocks);
                    }}
                  />
                </>
              )
            ) : message.content ? (
              <article className={`message ${message.role}`}>
                <ChatMessageContent content={message.content} variant={message.role} />
              </article>
            ) : null}
            {message.attachments?.map((attachment) => (
              <div key={`${message.id}-${attachment.id}`} className="message-attachment-slot">
                <VoiceAttachmentCard attachment={attachment} status="sent" compact />
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

      {onApprovalDecide ? (
        <ApprovalCardList
          approvals={approvals}
          busy={busy}
          onDecide={onApprovalDecide}
        />
      ) : null}

      {meetingWorkflow ? (
        <MeetingWorkflowCard
          workflow={meetingWorkflow}
          busy={busy}
          onFinish={() => {
            void onFinishMeeting?.();
          }}
          onWriteCalendar={() => {
            void onWriteMeetingCalendar?.();
          }}
        />
      ) : null}

      <form className="composer" onSubmit={handleSubmit}>
        <div className="composer-input">
          <textarea
            ref={textareaRef}
            value={draft}
            placeholder="向 AskAI 提问..."
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
      {editingMessageId ? (
        <UnifiedDocumentEditor
          blocks={messages.find((message) => message.id === editingMessageId)?.blocks || []}
          onClose={() => setEditingMessageId(null)}
          onSaveAsNew={(title, blocks) => {
            onCreateDocument(editingMessageId, title, blocks);
            setEditingMessageId(null);
          }}
        />
      ) : null}
    </section>
  );
}
