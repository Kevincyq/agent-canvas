import {
  getProjectById,
  insertArtifact,
  insertMockTodo,
  listProjectSources,
  searchProjectSources,
} from "@/lib/db/repositories/projects";
import type { ServiceAdapters } from "@/lib/services/adapters";
import {
  SEED_ACTION_CANDIDATES,
  SEED_MEETING,
  SEED_PROJECT,
  SEED_WEB_RESULTS,
} from "@/lib/services/mock/fixtures";
import { createToolReceipt } from "@/types/tool-receipt";

export type CurrentContextData = {
  userId: string;
  tenantId: string;
  conversationId: string;
  projectId: string | null;
  currentSurface: string;
  selectedSourceIds: string[];
  permissions: Record<string, boolean>;
  defaultProjectId: string;
};

export type ProjectContextData = {
  project: {
    id: string;
    name: string;
    instructions: string;
  };
  sources: Array<{
    id: string;
    title: string;
    sourceType: string;
    excerpt: string;
  }>;
  actionCandidates: Array<{ id: string; title: string; dueAt: string }>;
};

export type KnowledgeHit = {
  sourceId: string;
  title: string;
  excerpt: string;
  scoreHint: number;
};

export type WebHit = {
  url: string;
  title: string;
  snippet: string;
};

export type MeetingContextData = {
  meeting: {
    id: string;
    title: string;
    startsAt: string;
    endsAt: string;
    participants: string[];
    agenda: string[];
    historySummary: string;
    projectId: string;
  };
};

export function createMockServiceAdapters(): ServiceAdapters {
  return {
    getCurrentContext: async (context) =>
      createToolReceipt<CurrentContextData>({
        ok: true,
        tool: "get_current_context",
        data: {
          userId: context.userId,
          tenantId: context.tenantId,
          conversationId: context.conversationId,
          projectId: context.projectId ?? null,
          currentSurface: context.currentSurface,
          selectedSourceIds: context.selectedSourceIds,
          permissions: { ...context.permissions },
          defaultProjectId: SEED_PROJECT.id,
        },
      }),

    getProjectContext: async (projectId) => {
      const project = getProjectById(projectId);
      if (!project) {
        return createToolReceipt<ProjectContextData>({
          ok: false,
          tool: "get_project_context",
          error: {
            code: "PROJECT_NOT_FOUND",
            message: `Project not found: ${projectId}`,
            retryable: false,
          },
        });
      }

      const sources = listProjectSources(projectId).map((source) => ({
        id: source.id,
        title: source.title,
        sourceType: source.sourceType,
        excerpt: source.content.slice(0, 180),
      }));

      return createToolReceipt<ProjectContextData>({
        ok: true,
        tool: "get_project_context",
        data: {
          project: {
            id: project.id,
            name: project.name,
            instructions: project.instructions,
          },
          sources,
          actionCandidates: SEED_ACTION_CANDIDATES.map((item) => ({
            id: item.id,
            title: item.title,
            dueAt: item.dueAt,
          })),
        },
      });
    },

    searchPersonalKnowledge: async (query, projectId = SEED_PROJECT.id) => {
      const matches = searchProjectSources(projectId, query, 5);
      const hits: KnowledgeHit[] = matches.map((source, index) => ({
        sourceId: source.id,
        title: source.title,
        excerpt: source.content.slice(0, 220),
        scoreHint: Math.max(1, matches.length - index),
      }));

      return createToolReceipt<{ hits: KnowledgeHit[]; projectId: string; query: string }>({
        ok: true,
        tool: "search_personal_knowledge",
        data: {
          projectId,
          query,
          hits,
        },
      });
    },

    searchWeb: async (query) => {
      const normalized = query.trim().toLowerCase();
      const hits: WebHit[] = SEED_WEB_RESULTS.filter((item) => {
        if (!normalized) {
          return true;
        }
        const haystack = `${item.title} ${item.snippet}`.toLowerCase();
        return normalized.split(/\s+/).some((token) => haystack.includes(token));
      });

      return createToolReceipt<{ hits: WebHit[]; query: string; provider: "mock" }>({
        ok: true,
        tool: "search_web",
        data: {
          query,
          provider: "mock",
          hits: hits.length > 0 ? hits : [...SEED_WEB_RESULTS],
        },
      });
    },

    getMeetingContext: async (meetingId) => {
      if (meetingId && meetingId !== SEED_MEETING.id) {
        return createToolReceipt<MeetingContextData>({
          ok: false,
          tool: "get_meeting_context",
          error: {
            code: "MEETING_NOT_FOUND",
            message: `Meeting not found: ${meetingId}`,
            retryable: false,
          },
        });
      }

      return createToolReceipt<MeetingContextData>({
        ok: true,
        tool: "get_meeting_context",
        data: {
          meeting: {
            id: SEED_MEETING.id,
            title: SEED_MEETING.title,
            startsAt: SEED_MEETING.startsAt,
            endsAt: SEED_MEETING.endsAt,
            participants: [...SEED_MEETING.participants],
            agenda: [...SEED_MEETING.agenda],
            historySummary: SEED_MEETING.historySummary,
            projectId: SEED_MEETING.projectId,
          },
        },
      });
    },

    saveArtifactToProject: async (input) => {
      const project = getProjectById(input.projectId);
      if (!project) {
        return createToolReceipt<{ artifactId: string; projectId: string }>({
          ok: false,
          tool: "save_artifact_to_project",
          error: {
            code: "PROJECT_NOT_FOUND",
            message: `Project not found: ${input.projectId}`,
            retryable: false,
          },
        });
      }

      const saved = insertArtifact({
        conversationId: input.conversationId,
        projectId: input.projectId,
        title: input.title,
        artifactType: input.artifactType ?? "typed_blocks",
        blocks: input.blocks,
        evidence: input.evidence,
      });

      return createToolReceipt({
        ok: true,
        tool: "save_artifact_to_project",
        data: saved,
      });
    },

    createTodo: async (input) => {
      const written = insertMockTodo({
        title: input.title,
        dueAt: input.dueAt,
        projectId: input.projectId,
        idempotencyKey: input.idempotencyKey,
      });

      return createToolReceipt({
        ok: true,
        tool: "create_todo",
        data: written,
      });
    },
  };
}
