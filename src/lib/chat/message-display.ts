import type { AgentAttachment } from "@/types/agent";

const STRUCTURE_SHAPE_PATTERN = /\b(pentagon|ellipse|circle|rectangle|rect|line|arrow)\b/gi;

function formatVoiceAttachmentHint(attachments?: AgentAttachment[]): string | null {
  const attachment = attachments?.find((item) => item.kind === "voice_transcript" && item.content.trim());
  if (!attachment) {
    return null;
  }

  const { startMs, endMs, segmentCount } = attachment.metadata;
  const durationSeconds =
    typeof startMs === "number" && typeof endMs === "number" && endMs >= startMs
      ? Math.max(1, Math.round((endMs - startMs) / 1000))
      : null;

  const parts = [
    "附带语音说明",
    typeof segmentCount === "number" && segmentCount > 0 ? `${segmentCount} 段` : null,
    durationSeconds ? `${durationSeconds} 秒` : null,
  ].filter(Boolean);

  return parts.join(" · ");
}

function extractStructureLabels(content: string): string[] {
  const labels = [...content.matchAll(/(?:pentagon|ellipse|circle|rectangle|rect)\s+([^\s]+)/gi)]
    .map((match) => match[1]?.replace(/^F\(/, "").replace(/\)$/, "").trim())
    .filter(Boolean);

  return [...new Set(labels)];
}

function formatHandwritingSummary(content: string): string {
  const trimmed = content.trim();
  if (!trimmed) {
    return "已发送手写内容";
  }

  if (!STRUCTURE_SHAPE_PATTERN.test(trimmed)) {
    return trimmed.length > 72 ? `${trimmed.slice(0, 72)}…` : trimmed;
  }

  const labels = extractStructureLabels(trimmed);
  if (labels.length >= 2) {
    return `手写了 ${labels.length} 层结构：${labels.slice().reverse().join(" → ")}`;
  }

  if (labels.length === 1) {
    return `手写了：${labels[0]}`;
  }

  return "已发送手写内容";
}

export function formatUserMessageDisplay(
  content: string,
  attachments?: AgentAttachment[],
): string {
  const lines = [formatHandwritingSummary(content)];
  const voiceHint = formatVoiceAttachmentHint(attachments);

  if (voiceHint) {
    lines.push(voiceHint);
  }

  return lines.join("\n");
}

export function formatVoiceAttachmentMeta(attachment: AgentAttachment): string {
  const { startMs, endMs, segmentCount } = attachment.metadata;
  const durationSeconds =
    typeof startMs === "number" && typeof endMs === "number" && endMs >= startMs
      ? Math.max(1, Math.round((endMs - startMs) / 1000))
      : null;

  return [
    typeof segmentCount === "number" && segmentCount > 0 ? `${segmentCount} 段` : null,
    durationSeconds ? `${durationSeconds} 秒` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}
