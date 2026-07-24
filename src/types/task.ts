import { z } from "zod";

export const ConversationStatusSchema = z.enum([
  "ready",
  "running",
  "waiting_for_input",
  "waiting_for_approval",
  "completed",
  "partially_completed",
  "failed",
  "cancelled",
]);

export type ConversationStatus = z.infer<typeof ConversationStatusSchema>;

export const ConversationMessageSchema = z.object({
  id: z.string().min(1),
  conversationId: z.string().min(1),
  role: z.enum(["user", "assistant", "system"]),
  content: z.string(),
  blocksJson: z.string().nullable().optional(),
  actionsJson: z.string().nullable().optional(),
  attachmentsJson: z.string().nullable().optional(),
  chartsJson: z.string().nullable().optional(),
  documentJson: z.string().nullable().optional(),
  evidenceJson: z.string().nullable().optional(),
  artifactsJson: z.string().nullable().optional(),
  createdAt: z.string(),
  sequenceNo: z.number().int().nonnegative(),
});

export type ConversationMessageRecord = z.infer<typeof ConversationMessageSchema>;

export const ConversationTaskSchema = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
  tenantId: z.string().min(1),
  projectId: z.string().nullable(),
  title: z.string(),
  status: ConversationStatusSchema,
  currentStep: z.string().nullable(),
  sessionId: z.string().min(1),
  originSurface: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type ConversationTask = z.infer<typeof ConversationTaskSchema>;

export const CreateConversationRequestSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  projectId: z.string().min(1).nullable().optional(),
  originSurface: z.string().min(1).max(100).optional(),
  userId: z.string().min(1).max(100).optional(),
  tenantId: z.string().min(1).max(100).optional(),
});

export type CreateConversationRequest = z.infer<typeof CreateConversationRequestSchema>;

export const PatchConversationRequestSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  status: ConversationStatusSchema.optional(),
  currentStep: z.string().nullable().optional(),
  projectId: z.string().min(1).nullable().optional(),
});

export type PatchConversationRequest = z.infer<typeof PatchConversationRequestSchema>;
