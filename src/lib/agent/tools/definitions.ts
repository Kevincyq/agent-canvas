import type { RunContext } from "@openai/agents";
import { tool } from "@openai/agents";
import { z } from "zod";

import type { AgentContext } from "@/lib/agent/context";
import { getAgentRuntimeLimits } from "@/lib/agent/runtime-budget";
import {
  buildToolIdempotencyKey,
  isToolEnabledForContext,
  toolNeedsApproval,
} from "@/lib/agent/tool-policy";
import { executeLoggedTool } from "@/lib/agent/tools/tool-utils";
import { getDefaultToolGateway } from "@/lib/tools/registry";
import { createFailedToolReceipt } from "@/types/tool-receipt";

type Ctx = RunContext<AgentContext> | undefined;
const TOOL_TIMEOUT_OPTIONS = {
  timeoutMs: getAgentRuntimeLimits().toolTimeoutMs,
  timeoutBehavior: "error_as_result" as const,
};

export const getCurrentContextTool = tool({
  name: "get_current_context",
  description:
    "Read the current Ask AI surface, conversation, selected project, and permission snapshot.",
  parameters: z.object({}),
  strict: true,
  isEnabled: isToolEnabledForContext("get_current_context"),
  ...TOOL_TIMEOUT_OPTIONS,
  execute: async (_input, runContext: Ctx) =>
    executeLoggedTool("get_current_context", {}, runContext, (context) =>
      context.services.getCurrentContext(context),
    ),
});

export const getProjectContextTool = tool({
  name: "get_project_context",
  description:
    "Load a project/collection by id (Business/Life/Technology/Study/Art or a user-created project), including instructions and source summaries.",
  parameters: z.object({
    projectId: z
      .string()
      .describe(
        "Project id, e.g. proj_business_001, proj_life_001, proj_technology_001, proj_study_001, proj_art_001.",
      ),
  }),
  strict: true,
  isEnabled: isToolEnabledForContext("get_project_context"),
  ...TOOL_TIMEOUT_OPTIONS,
  execute: async ({ projectId }, runContext: Ctx) =>
    executeLoggedTool("get_project_context", { projectId }, runContext, (context) =>
      context.services.getProjectContext(context, projectId),
    ),
});

export const searchPersonalKnowledgeTool = tool({
  name: "search_personal_knowledge",
  description:
    "Search personal knowledge / project sources. Pass projectId to scope one collection; pass null to search across all collections.",
  parameters: z.object({
    query: z.string().describe("Search query in Chinese or English."),
    projectId: z
      .string()
      .nullable()
      .describe("Optional project id. Null searches all collections."),
  }),
  strict: true,
  isEnabled: isToolEnabledForContext("search_personal_knowledge"),
  ...TOOL_TIMEOUT_OPTIONS,
  execute: async ({ query, projectId }, runContext: Ctx) =>
    executeLoggedTool(
      "search_personal_knowledge",
      { query, projectId },
      runContext,
      (context) => context.services.searchPersonalKnowledge(context, query, projectId),
    ),
});

export const searchWebTool = tool({
  name: "search_web",
  description:
    "Search the live public web via the configured real provider. Results include title, URL, and snippet; cite returned URLs.",
  parameters: z.object({
    query: z.string().describe("Web search query."),
  }),
  strict: true,
  isEnabled: isToolEnabledForContext("search_web"),
  ...TOOL_TIMEOUT_OPTIONS,
  execute: async ({ query }, runContext: Ctx) =>
    executeLoggedTool("search_web", { query }, runContext, (context) => {
      if (!context.permissions.canSearchWeb) {
        return Promise.resolve(
          createFailedToolReceipt(
            "search_web",
            "WEB_SEARCH_FORBIDDEN",
            "当前用户没有 Web Search 权限。",
            false,
          ),
        );
      }
      return context.services.searchWeb(query);
    }),
});

export const getMeetingContextTool = tool({
  name: "get_meeting_context",
  description:
    "Load meeting details including agenda, participants, and history summary. Default is the 2026-07-22 product sync meeting (meeting_product_review_001).",
  parameters: z.object({
    meetingId: z
      .string()
      .nullable()
      .describe("Meeting id. Null selects the default 2026-07-22 product sync meeting."),
  }),
  strict: true,
  isEnabled: isToolEnabledForContext("get_meeting_context"),
  ...TOOL_TIMEOUT_OPTIONS,
  execute: async ({ meetingId }, runContext: Ctx) =>
    executeLoggedTool("get_meeting_context", { meetingId }, runContext, (context) =>
      context.services.getMeetingContext(meetingId ?? undefined),
    ),
});

export const startDralkWorkflowTool = tool({
  name: "start_dralk_workflow",
  description:
    "Start or reuse the persisted Dralk handwriting workflow in this same conversation. Use this instead of merely suggesting that the UI open a canvas.",
  parameters: z.object({
    prompt: z.string().describe("Short instruction shown with the handwriting canvas."),
    mode: z.enum(["general", "structure"]).nullable(),
    language: z.string().nullable(),
    forceNew: z.boolean().nullable(),
  }),
  strict: true,
  isEnabled: isToolEnabledForContext("start_dralk_workflow"),
  ...TOOL_TIMEOUT_OPTIONS,
  execute: async ({ prompt, mode, language, forceNew }, runContext: Ctx) =>
    executeLoggedTool(
      "start_dralk_workflow",
      { prompt, mode, language, forceNew },
      runContext,
      async (context) =>
        getDefaultToolGateway().invoke(
          "workflow",
          "start_dralk",
          {
            prompt,
            mode: mode ?? "general",
            language: language ?? "",
            forceNew: forceNew ?? false,
          },
          context,
        ),
    ),
});

export const startMeetingWorkflowTool = tool({
  name: "start_meeting_workflow",
  description:
    "Start or reuse the persisted Meeting workflow in this same conversation. Use only when the user asks to start or enter a meeting, not when reading existing meeting notes.",
  parameters: z.object({
    meetingId: z.string().nullable(),
  }),
  strict: true,
  isEnabled: isToolEnabledForContext("start_meeting_workflow"),
  ...TOOL_TIMEOUT_OPTIONS,
  execute: async ({ meetingId }, runContext: Ctx) =>
    executeLoggedTool(
      "start_meeting_workflow",
      { meetingId },
      runContext,
      async (context) =>
        getDefaultToolGateway().invoke(
          "workflow",
          "start_meeting",
          { meetingId: meetingId ?? undefined },
          context,
        ),
    ),
});

export const startWritingAssistWorkflowTool = tool({
  name: "start_writing_assist_workflow",
  description:
    "Create a persisted Writing Assist workflow request in this conversation. The workflow contract is real, but the external writing provider is not connected yet; never claim that a draft was generated until a WorkflowResult returns.",
  parameters: z.object({
    goal: z.string(),
    instructions: z.string().nullable(),
    sourceIds: z.array(z.string()),
    audience: z.string().nullable(),
    format: z.string().nullable(),
  }),
  strict: true,
  isEnabled: isToolEnabledForContext("start_writing_assist_workflow"),
  ...TOOL_TIMEOUT_OPTIONS,
  execute: async (
    { goal, instructions, sourceIds, audience, format },
    runContext: Ctx,
  ) =>
    executeLoggedTool(
      "start_writing_assist_workflow",
      { goal, instructions, sourceIds, audience, format },
      runContext,
      async (context) =>
        getDefaultToolGateway().invoke(
          "workflow",
          "start_writing_assist",
          {
            goal,
            instructions: instructions ?? "",
            sourceIds,
            audience,
            format,
            contextRefs: sourceIds.map((id) => ({
              type: "source" as const,
              id,
              version: null,
            })),
          },
          context,
        ),
    ),
});

export const startTranslationWorkflowTool = tool({
  name: "start_translation_workflow",
  description:
    "Create a persisted Translation workflow request in this conversation. The workflow contract is real, but the external translation provider is not connected yet; never claim translated output until a WorkflowResult returns.",
  parameters: z.object({
    content: z.string(),
    targetLanguage: z.string(),
    sourceLanguage: z.string().nullable(),
    preserveFormatting: z.boolean(),
  }),
  strict: true,
  isEnabled: isToolEnabledForContext("start_translation_workflow"),
  ...TOOL_TIMEOUT_OPTIONS,
  execute: async (
    { content, targetLanguage, sourceLanguage, preserveFormatting },
    runContext: Ctx,
  ) =>
    executeLoggedTool(
      "start_translation_workflow",
      { content, targetLanguage, sourceLanguage, preserveFormatting },
      runContext,
      async (context) =>
        getDefaultToolGateway().invoke(
          "workflow",
          "start_translation",
          {
            content,
            targetLanguage,
            sourceLanguage,
            preserveFormatting,
          },
          context,
        ),
    ),
});

export const saveArtifactToProjectTool = tool({
  name: "save_artifact_to_project",
  description:
    "Write a typed artifact into a project and return a Tool Receipt with artifactId. Use this for durable save operations in M3.",
  parameters: z.object({
    projectId: z.string(),
    title: z.string(),
    artifactType: z.string().nullable(),
    blocksJson: z.string().describe("JSON string of typed blocks array to persist."),
  }),
  strict: true,
  isEnabled: isToolEnabledForContext("save_artifact_to_project"),
  ...TOOL_TIMEOUT_OPTIONS,
  execute: async ({ projectId, title, artifactType, blocksJson }, runContext: Ctx) =>
    executeLoggedTool(
      "save_artifact_to_project",
      { projectId, title, artifactType, blocksJson },
      runContext,
      async (context) => {
        let blocks: unknown[] = [];
        try {
          const parsed = JSON.parse(blocksJson) as unknown;
          blocks = Array.isArray(parsed) ? parsed : [parsed];
        } catch {
          blocks = [
            {
              id: "artifact-markdown-1",
              type: "markdown",
              sourceFormat: "markdown",
              title,
              source: blocksJson,
            },
          ];
        }

        return context.services.saveArtifactToProject({
          conversationId: context.conversationId,
          projectId,
          title,
          artifactType: artifactType ?? "typed_blocks",
          blocks,
          idempotencyKey: buildToolIdempotencyKey(
            context,
            "save_artifact_to_project",
            { projectId, title, artifactType: artifactType ?? "typed_blocks", blocks },
          ),
        });
      },
    ),
});

export const createTodoTool = tool({
  name: "create_todo",
  description:
    "Create a todo via Mock adapter. Requires user approval before execution (M5 resume). Prefer save_artifact_to_project for non-approval writes in M3.",
  parameters: z.object({
    title: z.string(),
    dueAt: z.string().nullable(),
    projectId: z.string().nullable(),
    idempotencyKey: z.string().nullable(),
  }),
  strict: true,
  isEnabled: isToolEnabledForContext("create_todo"),
  needsApproval: toolNeedsApproval("create_todo"),
  ...TOOL_TIMEOUT_OPTIONS,
  execute: async ({ title, dueAt, projectId, idempotencyKey }, runContext: Ctx) =>
    executeLoggedTool(
      "create_todo",
      { title, dueAt, projectId, idempotencyKey },
      runContext,
      (context) =>
        context.services.createTodo({
          title,
          dueAt: dueAt ?? undefined,
          projectId: projectId ?? context.projectId,
          idempotencyKey:
            idempotencyKey ??
            buildToolIdempotencyKey(context, "create_todo", {
              title,
              dueAt: dueAt ?? null,
              projectId: projectId ?? context.projectId ?? null,
            }),
        }),
    ),
});

export const createCalendarEventTool = tool({
  name: "create_calendar_event",
  description:
    "Write one meeting-derived action item to the Mock Tablet calendar and return a visible result receipt. This demo tool does not call a production calendar.",
  parameters: z.object({
    title: z.string(),
    startAt: z.string().describe("ISO 8601 event start."),
    endAt: z.string().describe("ISO 8601 event end."),
    notes: z.string().nullable(),
    sourceId: z.string().nullable().describe("Meeting-minutes source id when available."),
    idempotencyKey: z.string().nullable(),
  }),
  strict: true,
  isEnabled: isToolEnabledForContext("create_calendar_event"),
  needsApproval: toolNeedsApproval("create_calendar_event"),
  ...TOOL_TIMEOUT_OPTIONS,
  execute: async (
    { title, startAt, endAt, notes, sourceId, idempotencyKey },
    runContext: Ctx,
  ) =>
    executeLoggedTool(
      "create_calendar_event",
      { title, startAt, endAt, notes, sourceId, idempotencyKey },
      runContext,
      (context) =>
        context.services.createCalendarEvent({
          title,
          startAt,
          endAt,
          notes: notes ?? undefined,
          sourceId: sourceId ?? undefined,
          idempotencyKey:
            idempotencyKey ??
            buildToolIdempotencyKey(context, "create_calendar_event", {
              title,
              startAt,
              endAt,
              sourceId: sourceId ?? null,
            }),
        }),
    ),
});
