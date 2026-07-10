import type { AgentAttachment } from "@/types/agent";

export const VOICE_ATTACHMENT_NAME = "attached file";

export function stripVoiceAttachmentReference(value: string): string {
  return value
    .replace(/\n{0,2}\s*语音说明：\s*attached file1?\s*$/i, "")
    .replace(/\n{0,2}\s*Voice note:\s*attached file1?\s*$/i, "")
    .trim();
}

export function shouldSendVoiceAttachment(attachment: AgentAttachment | null | undefined): boolean {
  return Boolean(attachment?.content.trim());
}
