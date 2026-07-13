import { formatVoiceAttachmentMeta } from "@/lib/chat/message-display";
import type { AgentAttachment } from "@/types/agent";

type VoiceAttachmentCardProps = {
  attachment: AgentAttachment;
  status: "pending" | "sent";
  compact?: boolean;
  defaultOpen?: boolean;
};

export function VoiceAttachmentCard({
  attachment,
  status,
  compact = false,
  defaultOpen = false,
}: VoiceAttachmentCardProps) {
  const metadata = formatVoiceAttachmentMeta(attachment);
  const title = status === "pending" ? "语音已附加" : "语音已发送";

  return (
    <details
      className={
        compact
          ? `voice-attachment-card voice-attachment-compact voice-attachment-${status}`
          : `voice-attachment-card voice-attachment-${status}`
      }
      open={defaultOpen}
    >
      <summary>
        <span className="voice-attachment-check" aria-hidden="true">🎙</span>
        <span className="voice-attachment-summary">
          <strong>{title}</strong>
          {metadata ? <small>{metadata}</small> : null}
        </span>
        <span className="voice-attachment-toggle">查看</span>
      </summary>
      <p>{attachment.content}</p>
    </details>
  );
}
