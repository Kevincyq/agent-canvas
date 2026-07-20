import { randomUUID } from "node:crypto";

import { createStubServiceAdapters, type ServiceAdapters } from "@/lib/services/adapters";

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
  return {
    userId: input.userId ?? "local-user",
    tenantId: input.tenantId ?? "local-tenant",
    conversationId: input.conversationId,
    projectId: input.projectId ?? undefined,
    currentSurface: input.currentSurface ?? "ask_ai",
    selectedSourceIds: input.selectedSourceIds ?? [],
    permissions: {
      ...DEFAULT_PERMISSIONS,
      ...input.permissions,
    },
    services: input.services ?? createStubServiceAdapters(),
    requestId: input.requestId ?? randomUUID(),
  };
}
