"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";

type ChatMessageContentProps = {
  content: string;
  variant: "assistant" | "user" | "system";
};

function normalizeMathDelimiters(content: string): string {
  return content
    .replace(/\\\[([\s\S]*?)\\\]/g, (_, expression: string) => `$$${expression}$$`)
    .replace(/\\\(([\s\S]*?)\\\)/g, (_, expression: string) => `$${expression}$`);
}

export function ChatMessageContent({ content, variant }: ChatMessageContentProps) {
  if (variant === "user") {
    return <p className="message-plain">{content}</p>;
  }

  const normalizedContent = normalizeMathDelimiters(content);

  return (
    <div className={`message-markdown message-markdown-${variant}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
      >
        {normalizedContent}
      </ReactMarkdown>
    </div>
  );
}
