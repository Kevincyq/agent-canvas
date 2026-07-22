import type { ConversationStatus } from "@/types/task";

export function isTerminalStatus(status: ConversationStatus): boolean {
  return (
    status === "completed" ||
    status === "partially_completed" ||
    status === "failed" ||
    status === "cancelled"
  );
}

export function titleFromFirstMessage(message: string, maxLength = 48): string {
  const normalized = message.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "New task";
  }
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 1)}…`;
}
