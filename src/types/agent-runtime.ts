import { z } from "zod";

import { AgentActionSchema, AgentAttachmentSchema } from "@/types/agent";
import { ContentBlocksSchema } from "@/types/content-block";
import { ConversationStatusSchema } from "@/types/task";

export const AgentRunEvidenceSchema = z.object({
  id: z.string(),
  label: z.string(),
  source: z.string(),
});

export const AgentRunArtifactRefSchema = z.object({
  id: z.string(),
  title: z.string(),
  artifactType: z.string(),
});

export const AgentRunRequestSchema = z.object({
  conversationId: z.string().min(1).optional(),
  message: z.string().min(1),
  canvas: z
    .object({
      isOpen: z.boolean(),
      strokeCount: z.number().int().nonnegative(),
      textCount: z.number().int().nonnegative(),
      selectedElementId: z.string().nullable(),
    })
    .optional(),
  attachments: z.array(AgentAttachmentSchema).default([]),
  userId: z.string().min(1).max(100).optional(),
});

export type AgentRunRequest = z.infer<typeof AgentRunRequestSchema>;

export const AgentRunResponseSchema = z.object({
  conversationId: z.string().min(1),
  sessionId: z.string().min(1),
  status: ConversationStatusSchema,
  message: z.string(),
  blocks: ContentBlocksSchema,
  actions: z.array(AgentActionSchema),
  userMessageId: z.string().min(1),
  assistantMessageId: z.string().min(1),
  outputStatus: z.enum(["ok", "needs_input", "needs_approval", "failed"]).optional(),
  evidence: z.array(AgentRunEvidenceSchema).optional(),
  artifacts: z.array(AgentRunArtifactRefSchema).optional(),
  requestId: z.string().optional(),
});

export type AgentRunResponse = z.infer<typeof AgentRunResponseSchema>;
