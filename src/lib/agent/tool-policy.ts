import { createHash } from "node:crypto";
import type { RunContext } from "@openai/agents";

import type { AgentContext, PermissionSnapshot } from "@/lib/agent/context";
import { getConversationById } from "@/lib/db/repositories/conversations";
import { getProjectById } from "@/lib/db/repositories/projects";
import { SEED_PROJECTS } from "@/lib/services/mock/fixtures";

export const ASK_AI_TOOL_NAMES = [
  "get_current_context",
  "get_project_context",
  "search_personal_knowledge",
  "search_web",
  "get_meeting_context",
  "start_dralk_workflow",
  "start_meeting_workflow",
  "save_artifact_to_project",
  "create_todo",
  "create_calendar_event",
] as const;

export type AskAiToolName = (typeof ASK_AI_TOOL_NAMES)[number];
export type ToolRiskLevel = "L0" | "L1" | "L2";

type ToolPolicy = {
  permission?: keyof PermissionSnapshot;
  riskLevel: ToolRiskLevel;
  requiresApproval: boolean;
};

const TOOL_POLICIES: Record<AskAiToolName, ToolPolicy> = {
  get_current_context: { riskLevel: "L0", requiresApproval: false },
  get_project_context: {
    permission: "canReadProject",
    riskLevel: "L0",
    requiresApproval: false,
  },
  search_personal_knowledge: {
    permission: "canReadProject",
    riskLevel: "L0",
    requiresApproval: false,
  },
  search_web: {
    permission: "canSearchWeb",
    riskLevel: "L0",
    requiresApproval: false,
  },
  get_meeting_context: {
    permission: "canReadProject",
    riskLevel: "L0",
    requiresApproval: false,
  },
  start_dralk_workflow: {
    permission: "canStartDralk",
    riskLevel: "L0",
    requiresApproval: false,
  },
  start_meeting_workflow: {
    permission: "canStartMeeting",
    riskLevel: "L0",
    requiresApproval: false,
  },
  save_artifact_to_project: {
    permission: "canSaveArtifact",
    riskLevel: "L1",
    requiresApproval: false,
  },
  create_todo: {
    permission: "canWriteTodo",
    riskLevel: "L2",
    requiresApproval: true,
  },
  create_calendar_event: {
    permission: "canWriteCalendar",
    riskLevel: "L2",
    requiresApproval: true,
  },
};

const SEED_PROJECT_IDS = new Set<string>(SEED_PROJECTS.map((project) => project.id));

function projectIdFromArgs(args: unknown): string | null {
  if (!args || typeof args !== "object") {
    return null;
  }
  const projectId = (args as { projectId?: unknown }).projectId;
  return typeof projectId === "string" && projectId ? projectId : null;
}

export type ToolAuthorizationDecision =
  | { allowed: true; riskLevel: ToolRiskLevel }
  | { allowed: false; code: string; message: string; riskLevel: ToolRiskLevel };

export function authorizeToolCall(
  context: AgentContext,
  toolName: AskAiToolName,
  args: unknown,
): ToolAuthorizationDecision {
  const policy = TOOL_POLICIES[toolName];
  const conversation = getConversationById(context.conversationId);
  if (
    !conversation ||
    conversation.userId !== context.userId ||
    conversation.tenantId !== context.tenantId
  ) {
    return {
      allowed: false,
      code: "CONVERSATION_ACCESS_DENIED",
      message: "当前用户或租户无权访问该任务。",
      riskLevel: policy.riskLevel,
    };
  }

  if (policy.permission && !context.permissions[policy.permission]) {
    return {
      allowed: false,
      code: "TOOL_PERMISSION_DENIED",
      message: `当前用户没有执行 ${toolName} 的权限。`,
      riskLevel: policy.riskLevel,
    };
  }

  const projectId = projectIdFromArgs(args) ?? context.projectId ?? null;
  if (projectId && !SEED_PROJECT_IDS.has(projectId)) {
    const project = getProjectById(projectId);
    if (
      !project ||
      project.userId !== context.userId ||
      project.tenantId !== context.tenantId
    ) {
      return {
        allowed: false,
        code: "PROJECT_ACCESS_DENIED",
        message: `当前用户或租户无权访问 Collection：${projectId}`,
        riskLevel: policy.riskLevel,
      };
    }
  }

  return { allowed: true, riskLevel: policy.riskLevel };
}

export function isToolEnabledForContext(toolName: AskAiToolName) {
  return async ({
    runContext,
  }: {
    runContext: RunContext<AgentContext>;
  }): Promise<boolean> => {
    const policy = TOOL_POLICIES[toolName];
    return !policy.permission || Boolean(runContext.context.permissions[policy.permission]);
  };
}

export function toolNeedsApproval(toolName: AskAiToolName) {
  return async (runContext: RunContext<unknown>, args: unknown): Promise<boolean> => {
    const context = runContext.context as AgentContext;
    const authorization = authorizeToolCall(context, toolName, args);
    return authorization.allowed && TOOL_POLICIES[toolName].requiresApproval;
  };
}

export function riskLevelForRegisteredTool(toolName: string): ToolRiskLevel {
  return toolName in TOOL_POLICIES
    ? TOOL_POLICIES[toolName as AskAiToolName].riskLevel
    : "L0";
}

export function buildToolIdempotencyKey(
  context: AgentContext,
  toolName: AskAiToolName,
  stableInput: unknown,
): string {
  const digest = createHash("sha256")
    .update(
      JSON.stringify({
        tenantId: context.tenantId,
        userId: context.userId,
        conversationId: context.conversationId,
        toolName,
        stableInput,
      }),
    )
    .digest("hex")
    .slice(0, 32);
  return `askai:${toolName}:${digest}`;
}
