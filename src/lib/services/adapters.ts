import type { AgentContext } from "@/lib/agent/context";
import type { ToolReceipt } from "@/types/tool-receipt";

/**
 * Service adapters hide Mock vs Real implementations from Agent tools.
 * Model only sees tool schemas; adapters provide data behind stable ToolReceipts.
 */
export type ServiceAdapters = {
  getCurrentContext: (
    context: AgentContext,
  ) => Promise<ToolReceipt<Record<string, unknown>>>;
  searchPersonalKnowledge: (
    query: string,
    projectId?: string | null,
  ) => Promise<ToolReceipt<{ hits: unknown[]; projectId?: string | null; query?: string }>>;
  searchWeb: (
    query: string,
  ) => Promise<ToolReceipt<{ hits: unknown[]; query?: string; provider?: string }>>;
  getMeetingContext: (
    meetingId?: string,
  ) => Promise<ToolReceipt<{ meeting: unknown | null }>>;
  getProjectContext: (
    projectId: string,
  ) => Promise<
    ToolReceipt<{
      project: unknown | null;
      sources?: unknown[];
      actionCandidates?: unknown[];
    }>
  >;
  saveArtifactToProject: (input: {
    conversationId: string;
    projectId: string;
    title: string;
    blocks: unknown[];
    artifactType?: string;
    evidence?: unknown;
  }) => Promise<ToolReceipt<{ artifactId: string; projectId: string }>>;
  createTodo: (input: {
    title: string;
    dueAt?: string;
    projectId?: string;
    idempotencyKey?: string;
  }) => Promise<
    ToolReceipt<{ todoId: string; written: boolean; provider: string; title?: string }>
  >;
  createCalendarEvent: (input: {
    title: string;
    startAt: string;
    endAt: string;
    notes?: string;
    sourceId?: string;
    idempotencyKey?: string;
  }) => Promise<
    ToolReceipt<{
      eventId: string;
      title: string;
      startAt: string;
      endAt: string;
      calendarName: string;
      written: boolean;
      provider: string;
    }>
  >;
};
