import { randomUUID } from "node:crypto";

import type { ServiceAdapters } from "@/lib/services/adapters";
import { createMockServiceAdapters } from "@/lib/services/mock";
import { SEED_PROJECT } from "@/lib/services/mock/fixtures";

export type PermissionSnapshot = {
  canReadProject: boolean;
  canWriteTodo: boolean;
  canSaveArtifact: boolean;
  canSearchWeb: boolean;
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
  /** When true, omit default seed projectId (general chat). */
  allowEmptyProject?: boolean;
};

const DEFAULT_PERMISSIONS: PermissionSnapshot = {
  canReadProject: true,
  canWriteTodo: true,
  canSaveArtifact: true,
  canSearchWeb: true,
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
    services: input.services ?? createMockServiceAdapters(),
    requestId: input.requestId ?? randomUUID(),
  };
}
