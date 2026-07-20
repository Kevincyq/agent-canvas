import { z } from "zod";

import { AgentActionSchema, AgentAttachmentSchema } from "@/types/agent";
import { ContentBlocksSchema } from "@/types/content-block";
import { ConversationStatusSchema } from "@/types/task";
import {
  DralkQueryPayloadSchema,
  WorkflowRequestSchema,
  type DralkQueryPayload,
  type WorkflowRequest,
} from "@/types/workflow";

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

export const ApprovalCardSchema = z.object({
  id: z.string(),
  runStateId: z.string(),
  callId: z.string(),
  toolName: z.string(),
  argumentsJson: z.string(),
  riskLevel: z.string(),
  createdAt: z.string(),
});

export type ApprovalCard = z.infer<typeof ApprovalCardSchema>;

export const AgentRunDralkContextSchema = DralkQueryPayloadSchema.partial();

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
  dralkContext: AgentRunDralkContextSchema.optional(),
  userId: z.string().min(1).max(100).optional(),
});

export type AgentRunRequest = {
  conversationId?: string;
  message: string;
  canvas?: {
    isOpen: boolean;
    strokeCount: number;
    textCount: number;
    selectedElementId: string | null;
  };
  attachments: z.infer<typeof AgentAttachmentSchema>[];
  dralkContext?: Partial<DralkQueryPayload>;
  userId?: string;
};

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
  workflowRequest: WorkflowRequestSchema.optional(),
  runStateId: z.string().optional(),
  approvals: z.array(ApprovalCardSchema).optional(),
});

export type AgentRunResponse = {
  conversationId: string;
  sessionId: string;
  status: z.infer<typeof ConversationStatusSchema>;
  message: string;
  blocks: z.infer<typeof ContentBlocksSchema>;
  actions: z.infer<typeof AgentActionSchema>[];
  userMessageId: string;
  assistantMessageId: string;
  outputStatus?: "ok" | "needs_input" | "needs_approval" | "failed";
  evidence?: z.infer<typeof AgentRunEvidenceSchema>[];
  artifacts?: z.infer<typeof AgentRunArtifactRefSchema>[];
  requestId?: string;
  workflowRequest?: WorkflowRequest;
  runStateId?: string;
  approvals?: ApprovalCard[];
};

export const AgentResumeRequestSchema = z.object({
  conversationId: z.string().min(1),
  runStateId: z.string().min(1).optional(),
  decisions: z
    .array(
      z.object({
        callId: z.string().min(1),
        decision: z.enum(["approve", "reject"]),
        message: z.string().optional(),
      }),
    )
    .min(1),
  userId: z.string().min(1).max(100).optional(),
});

export type AgentResumeRequest = z.infer<typeof AgentResumeRequestSchema>;
