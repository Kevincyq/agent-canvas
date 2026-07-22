"use client";

import { useState } from "react";

import { buildAnswerPlainText } from "@/lib/content/answer-text";
import type { ContentBlock } from "@/types/content-block";

type AssistantMessageActionsProps = {
  messageId: string;
  content?: string;
  blocks?: ContentBlock[];
  busy?: boolean;
  onRegenerate?: () => void;
  onSaveAsNote?: () => void;
};

export function AssistantMessageActions({
  messageId,
  content = "",
  blocks = [],
  busy = false,
  onRegenerate,
  onSaveAsNote,
}: AssistantMessageActionsProps) {
  const [copied, setCopied] = useState(false);
  const [shared, setShared] = useState(false);
  const [feedback, setFeedback] = useState<"up" | "down" | null>(null);

  const plainText = buildAnswerPlainText(content, blocks);

  async function copyAnswer() {
    if (!plainText) {
      return;
    }
    await navigator.clipboard.writeText(plainText);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  async function shareAnswer() {
    if (!plainText) {
      return;
    }

    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: "AskAI 答复", text: plainText });
        return;
      } catch {
        // Fall through to clipboard when share is cancelled or unavailable.
      }
    }

    await navigator.clipboard.writeText(plainText);
    setShared(true);
    window.setTimeout(() => setShared(false), 1600);
  }

  return (
    <div className="assistant-actions" aria-label="答复操作">
      <div className="assistant-actions-icons">
        <button
          type="button"
          className="assistant-action-btn"
          disabled={busy || !onRegenerate}
          title="重新生成"
          aria-label="重新生成"
          onClick={() => onRegenerate?.()}
        >
          <RefreshIcon />
        </button>
        <button
          type="button"
          className="assistant-action-btn"
          disabled={!plainText}
          title={copied ? "已复制" : "复制"}
          aria-label={copied ? "已复制" : "复制"}
          onClick={() => {
            void copyAnswer();
          }}
        >
          <CopyIcon />
        </button>
        <button
          type="button"
          className="assistant-action-btn"
          disabled={!plainText}
          title={shared ? "已复制链接文本" : "分享"}
          aria-label="分享"
          onClick={() => {
            void shareAnswer();
          }}
        >
          <ShareIcon />
        </button>
        <button
          type="button"
          className={
            feedback === "up"
              ? "assistant-action-btn is-active"
              : "assistant-action-btn"
          }
          title="有帮助"
          aria-label="有帮助"
          aria-pressed={feedback === "up"}
          onClick={() => setFeedback((current) => (current === "up" ? null : "up"))}
        >
          <ThumbUpIcon />
        </button>
        <button
          type="button"
          className={
            feedback === "down"
              ? "assistant-action-btn is-active"
              : "assistant-action-btn"
          }
          title="没帮助"
          aria-label="没帮助"
          aria-pressed={feedback === "down"}
          onClick={() => setFeedback((current) => (current === "down" ? null : "down"))}
        >
          <ThumbDownIcon />
        </button>
      </div>

      <span className="assistant-actions-divider" aria-hidden />

      <button
        type="button"
        className="assistant-action-save"
        disabled={busy || !onSaveAsNote || blocks.length === 0}
        title="保存为笔记"
        onClick={() => onSaveAsNote?.()}
      >
        <SaveIcon />
        <span>保存为笔记</span>
      </button>
      <span className="assistant-actions-message-id" hidden>
        {messageId}
      </span>
    </div>
  );
}

function RefreshIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden fill="none">
      <path
        d="M4.5 12a7.5 7.5 0 0 1 12.7-5.4M19.5 12a7.5 7.5 0 0 1-12.7 5.4"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <path
        d="M17.2 3.8v4.2h-4.2M6.8 20.2v-4.2h4.2"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden fill="none">
      <rect x="8" y="8" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="1.7" />
      <path
        d="M6 15V6.8A1.8 1.8 0 0 1 7.8 5H15"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden fill="none">
      <circle cx="18" cy="5" r="2.4" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="6" cy="12" r="2.4" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="18" cy="19" r="2.4" stroke="currentColor" strokeWidth="1.7" />
      <path d="M8.2 11 15.8 6.2M8.2 13l7.6 4.8" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

function ThumbUpIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden fill="none">
      <path
        d="M7 11v9H4.8A1.8 1.8 0 0 1 3 18.2V12.8A1.8 1.8 0 0 1 4.8 11H7Zm0 0 3.2-6.2A2.2 2.2 0 0 1 12.2 3.5H13a2 2 0 0 1 2 2V8h4.3a2 2 0 0 1 2 2.3l-.9 6.2A2.5 2.5 0 0 1 17.9 19H7"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ThumbDownIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden fill="none">
      <path
        d="M7 13V4H4.8A1.8 1.8 0 0 0 3 5.8v5.4A1.8 1.8 0 0 0 4.8 13H7Zm0 0 3.2 6.2a2.2 2.2 0 0 0 2 1.3H13a2 2 0 0 0 2-2V16h4.3a2 2 0 0 0 2-2.3l-.9-6.2A2.5 2.5 0 0 0 17.9 5H7"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SaveIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden fill="none">
      <path
        d="M5 4.5h11.2L19 7.3V19.5H5V4.5Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path d="M8 4.5V9h7V4.5M8 19.5v-5h8v5" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}
