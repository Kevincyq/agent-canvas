import type { RunContext } from "@openai/agents";
import { tool } from "@openai/agents";
import { z } from "zod";

import type { AgentContext } from "@/lib/agent/context";
import { executeLoggedTool } from "@/lib/agent/tools/tool-utils";

type Ctx = RunContext<AgentContext> | undefined;

export const getCurrentContextTool = tool({
  name: "get_current_context",
  description:
    "Read the current Ask AI surface, conversation, selected project, and permission snapshot.",
  parameters: z.object({}),
  strict: true,
  execute: async (_input, runContext: Ctx) =>
    executeLoggedTool("get_current_context", {}, runContext, (context) =>
      context.services.getCurrentContext(context),
    ),
});

export const getProjectContextTool = tool({
  name: "get_project_context",
  description:
    "Load a project by id, including instructions, source summaries, and candidate action items.",
  parameters: z.object({
    projectId: z.string().describe("Project id. Use proj_launch_prep_001 for the seed project."),
  }),
  strict: true,
  execute: async ({ projectId }, runContext: Ctx) =>
    executeLoggedTool("get_project_context", { projectId }, runContext, (context) =>
      context.services.getProjectContext(projectId),
    ),
});

export const searchPersonalKnowledgeTool = tool({
  name: "search_personal_knowledge",
  description:
    "Search project personal knowledge / sources for relevant excerpts. Prefer this before guessing project facts.",
  parameters: z.object({
    query: z.string().describe("Search query in Chinese or English."),
    projectId: z
      .string()
      .nullable()
      .describe("Optional project id. Defaults to the seed launch project when null."),
  }),
  strict: true,
  execute: async ({ query, projectId }, runContext: Ctx) =>
    executeLoggedTool(
      "search_personal_knowledge",
      { query, projectId },
      runContext,
      (context) =>
        context.services.searchPersonalKnowledge(query, projectId ?? context.projectId),
    ),
});

export const searchWebTool = tool({
  name: "search_web",
  description: "Search the web via the configured adapter (Mock in PoC).",
  parameters: z.object({
    query: z.string().describe("Web search query."),
  }),
  strict: true,
  execute: async ({ query }, runContext: Ctx) =>
    executeLoggedTool("search_web", { query }, runContext, (context) =>
      context.services.searchWeb(query),
    ),
});

export const getMeetingContextTool = tool({
  name: "get_meeting_context",
  description:
    "Load meeting details including agenda, participants, and history summary. Use meeting_product_review_001 for the seed product review meeting.",
  parameters: z.object({
    meetingId: z
      .string()
      .nullable()
      .describe("Meeting id. Null selects the default seed product review meeting."),
  }),
  strict: true,
  execute: async ({ meetingId }, runContext: Ctx) =>
    executeLoggedTool("get_meeting_context", { meetingId }, runContext, (context) =>
      context.services.getMeetingContext(meetingId ?? undefined),
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
  needsApproval: true,
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
          idempotencyKey: idempotencyKey ?? undefined,
        }),
    ),
});
