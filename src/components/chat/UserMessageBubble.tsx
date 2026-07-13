import { formatUserMessageDisplay } from "@/lib/chat/message-display";
import type { AgentAttachment } from "@/types/agent";

type UserMessageBubbleProps = {
  content: string;
  attachments?: AgentAttachment[];
};

export function UserMessageBubble({ content, attachments }: UserMessageBubbleProps) {
  const summary = formatUserMessageDisplay(content, attachments);

  return (
    <article className="message user">
      <p className="message-plain message-summary">{summary}</p>
    </article>
  );
}
