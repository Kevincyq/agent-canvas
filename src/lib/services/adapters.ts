import { randomUUID } from "node:crypto";

import type { ToolReceipt } from "@/types/tool-receipt";

/**
 * Service adapters hide Mock vs Real implementations from Agent tools.
 * M2 only defines the contract; M3 fills mock/real adapters.
 */
export type ServiceAdapters = {
  searchPersonalKnowledge: (query: string) => Promise<ToolReceipt<{ hits: unknown[] }>>;
  searchWeb: (query: string) => Promise<ToolReceipt<{ hits: unknown[] }>>;
  getMeetingContext: (meetingId?: string) => Promise<ToolReceipt<{ meeting: unknown | null }>>;
  getProjectContext: (projectId: string) => Promise<ToolReceipt<{ project: unknown | null }>>;
  saveArtifactToProject: (input: {
    projectId: string;
    title: string;
    blocks: unknown[];
  }) => Promise<ToolReceipt<{ artifactId: string }>>;
  createTodo: (input: {
    title: string;
    dueAt?: string;
    idempotencyKey?: string;
  }) => Promise<ToolReceipt<{ todoId: string; written: boolean; provider: string }>>;
};

async function notImplemented(tool: string): Promise<ToolReceipt<never>> {
  return {
    ok: false,
    tool,
    executionId: randomUUID(),
    error: {
      code: "NOT_IMPLEMENTED",
      message: `${tool} is not available until M3 Tool Registry.`,
      retryable: false,
    },
    verifiedAt: new Date().toISOString(),
  };
}

export function createStubServiceAdapters(): ServiceAdapters {
  return {
    searchPersonalKnowledge: async () => notImplemented("search_personal_knowledge"),
    searchWeb: async () => notImplemented("search_web"),
    getMeetingContext: async () => notImplemented("get_meeting_context"),
    getProjectContext: async () => notImplemented("get_project_context"),
    saveArtifactToProject: async () => notImplemented("save_artifact_to_project"),
    createTodo: async () => notImplemented("create_todo"),
  };
}
