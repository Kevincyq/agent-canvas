import type { ServiceAdapters } from "@/lib/services/adapters";
import { getDefaultToolGateway } from "@/lib/tools/registry";

/**
 * Product adapters are Connector implementations behind Tool Gateway.
 * Agent tools keep stable schemas; swapping Tavily/Fixture/MCP happens in the registry.
 */
export function createServiceAdapters(): ServiceAdapters {
  const gateway = getDefaultToolGateway();

  return {
    getCurrentContext: (context) =>
      gateway.invoke("runtime", "get_current_context", {}, context),
    getProjectContext: (context, projectId) =>
      gateway.invoke("pkb", "get_project_context", { projectId }, context),
    searchPersonalKnowledge: (context, query, projectId) =>
      gateway.invoke(
        "pkb",
        "search",
        { query, projectId: projectId ?? null },
        context,
      ),
    searchWeb: (query) =>
      gateway.invoke("web_search", "search", { query }, {
        userId: "system",
        tenantId: "system",
        conversationId: "system",
        currentSurface: "ask_ai",
        selectedSourceIds: [],
        permissions: {},
      }),
    getMeetingContext: (meetingId) =>
      gateway.invoke(
        "meeting",
        "get_context",
        { meetingId: meetingId ?? null },
        {
          userId: "system",
          tenantId: "system",
          conversationId: "system",
          currentSurface: "ask_ai",
          selectedSourceIds: [],
          permissions: {},
        },
      ),
    saveArtifactToProject: (input) =>
      gateway.invoke(
        "artifact",
        "save",
        {
          projectId: input.projectId,
          title: input.title,
          artifactType: input.artifactType,
          blocks: input.blocks,
          evidence: input.evidence,
          idempotencyKey: input.idempotencyKey,
        },
        {
          userId: "system",
          tenantId: "system",
          conversationId: input.conversationId,
          currentSurface: "ask_ai",
          selectedSourceIds: [],
          permissions: {},
        },
      ),
    createTodo: (input) =>
      gateway.invoke(
        "todo",
        "create",
        {
          title: input.title,
          dueAt: input.dueAt,
          projectId: input.projectId,
          idempotencyKey: input.idempotencyKey,
        },
        {
          userId: "system",
          tenantId: "system",
          conversationId: "system",
          projectId: input.projectId,
          currentSurface: "ask_ai",
          selectedSourceIds: [],
          permissions: {},
        },
      ),
    createCalendarEvent: (input) =>
      gateway.invoke(
        "calendar",
        "create_event",
        {
          title: input.title,
          startAt: input.startAt,
          endAt: input.endAt,
          notes: input.notes,
          sourceId: input.sourceId,
          idempotencyKey: input.idempotencyKey,
        },
        {
          userId: "system",
          tenantId: "system",
          conversationId: "system",
          currentSurface: "ask_ai",
          selectedSourceIds: [],
          permissions: {},
        },
      ),
  };
}
