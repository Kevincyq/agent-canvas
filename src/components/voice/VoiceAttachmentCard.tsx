import type { AgentAttachment } from "@/types/agent";

type VoiceAttachmentCardProps = {
  attachment: AgentAttachment;
  status: "pending" | "sent";
  defaultOpen?: boolean;
};

function formatDuration(attachment: AgentAttachment): string | null {
  const { startMs, endMs } = attachment.metadata;
  if (typeof startMs !== "number" || typeof endMs !== "number" || endMs < startMs) {
    return null;
  }

  const seconds = Math.max(1, Math.round((endMs - startMs) / 1000));
  return `${seconds} 秒`;
}

export function VoiceAttachmentCard({
  attachment,
  status,
  defaultOpen = false,
}: VoiceAttachmentCardProps) {
  const duration = formatDuration(attachment);
  const segmentCount = attachment.metadata.segmentCount;
  const metadata = [
    typeof segmentCount === "number" && segmentCount > 0 ? `${segmentCount} 段` : null,
    duration,
  ].filter(Boolean).join(" · ");

  return (
    <details className={`voice-attachment-card voice-attachment-${status}`} open={defaultOpen}>
      <summary>
        <span className="voice-attachment-check" aria-hidden="true">✓</span>
        <span>
          <strong>语音转写{status === "pending" ? "已附加" : "已发送"}</strong>
          <small>{metadata || (status === "pending" ? "将随本次 AskAI 请求发送" : "已随本次请求发送")}</small>
        </span>
        <span className="voice-attachment-toggle">查看内容</span>
      </summary>
      <p>{attachment.content}</p>
    </details>
  );
}
