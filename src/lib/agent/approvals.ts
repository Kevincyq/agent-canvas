import type { RunToolApprovalItem } from "@openai/agents";
import { riskLevelForRegisteredTool } from "@/lib/agent/tool-policy";

export type PendingApprovalView = {
  id: string;
  runStateId: string;
  callId: string;
  toolName: string;
  argumentsJson: string;
  riskLevel: "L2";
  createdAt: string;
};

export function extractApprovalCallId(item: RunToolApprovalItem): string {
  const raw = item.rawItem as { callId?: string; id?: string };
  if (raw.callId) {
    return raw.callId;
  }
  if (raw.id) {
    return raw.id;
  }
  return `${item.name ?? "tool"}_${(item.arguments ?? "args").slice(0, 24)}`;
}

export function riskLevelForTool(toolName: string): "L0" | "L1" | "L2" {
  return riskLevelForRegisteredTool(toolName);
}
