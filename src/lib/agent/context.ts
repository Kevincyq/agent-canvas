import { randomUUID } from "node:crypto";

import type { AgentRuntimeEventSink } from "@/types/agent-stream";
import type { ServiceAdapters } from "@/lib/services/adapters";
import { createServiceAdapters } from "@/lib/services";
import {
  createRuntimeBudgetState,
  type AgentRuntimeBudgetState,
} from "@/lib/agent/runtime-budget";
import { SEED_PROJECT } from "@/lib/services/mock/fixtures";

export type PermissionSnapshot = {
  canReadProject: boolean;
  canWriteTodo: boolean;
  canSaveArtifact: boolean;
  canSearchWeb: boolean;
  canWriteCalendar: boolean;
  canStartDralk: boolean;
  canStartMeeting: boolean;
  canStartWritingAssist: boolean;
  canStartTranslation: boolean;
};

export type AgentSurface = "ask_ai" | "note" | "reader" | "meeting" | "canvas";

export type AgentContext = {
  userId: string;
  tenantId: string;
  conversationId: string;
  projectId?: string;
  currentSurface: AgentSurface;
  selectedSourceIds: string[];
  permissions: PermissionSnapshot;
  services: ServiceAdapters;
  requestId: string;
  runtimeBudget: AgentRuntimeBudgetState;
  onRuntimeEvent?: AgentRuntimeEventSink;
};

export type CreateAgentContextInput = {
  userId?: string;
  tenantId?: string;
  conversationId: string;
  projectId?: string | null;
  currentSurface?: AgentSurface;
  selectedSourceIds?: string[];
  permissions?: Partial<PermissionSnapshot>;
  services?: ServiceAdapters;
  requestId?: string;
  runtimeBudget?: AgentRuntimeBudgetState;
  onRuntimeEvent?: AgentRuntimeEventSink;
  /** When true, omit default seed projectId (general chat). */
  allowEmptyProject?: boolean;
};

const DEFAULT_PERMISSIONS: PermissionSnapshot = {
  canReadProject: true,
  canWriteTodo: true,
  canSaveArtifact: true,
  canSearchWeb: true,
  canWriteCalendar: true,
  canStartDralk: true,
  canStartMeeting: true,
  canStartWritingAssist: true,
  canStartTranslation: true,
};

/**
 * Build per-request AgentContext.
 * Private credentials and adapter internals must never be serialized into RunState/prompts.
 */
export function createAgentContext(input: CreateAgentContextInput): AgentContext {
  const projectId =
    input.projectId === null
      ? undefined
      : (input.projectId ??
        (input.allowEmptyProject ? undefined : SEED_PROJECT.id));

  return {
    userId: input.userId ?? "local-user",
    tenantId: input.tenantId ?? "local-tenant",
    conversationId: input.conversationId,
    projectId,
    currentSurface: input.currentSurface ?? "ask_ai",
    selectedSourceIds: input.selectedSourceIds ?? [],
    permissions: {
      ...DEFAULT_PERMISSIONS,
      ...input.permissions,
    },
    services: input.services ?? createServiceAdapters(),
    requestId: input.requestId ?? randomUUID(),
    runtimeBudget: input.runtimeBudget ?? createRuntimeBudgetState(),
    onRuntimeEvent: input.onRuntimeEvent,
  };
}
