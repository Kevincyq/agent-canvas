import { z } from "zod";

export const DralkOriginSchema = z.enum(["agent_intent", "user_button"]);
export type DralkOrigin = z.infer<typeof DralkOriginSchema>;

export const DralkWorkflowStatusSchema = z.enum([
  "idle",
  "waiting_for_input",
  "capturing",
  "recognized",
  "attached",
  "running",
  "completed",
  "cancelled",
  "failed",
]);
export type DralkWorkflowStatus = z.infer<typeof DralkWorkflowStatusSchema>;

export const DralkQueryPayloadSchema = z.object({
  recognitionType: z.string().nullable(),
  structuredContent: z.unknown().nullable(),
  displaySummary: z.string().nullable(),
  strokesRef: z.string().nullable(),
  voiceTranscriptRef: z.string().nullable(),
  startMs: z.number().nullable(),
  endMs: z.number().nullable(),
  canvasSessionId: z.string().nullable(),
  confidence: z.number().nullable(),
  sourceMetadata: z.record(z.string(), z.unknown()).nullable(),
});
export type DralkQueryPayload = z.infer<typeof DralkQueryPayloadSchema>;

export const DralkWorkflowPayloadSchema = z.object({
  origin: DralkOriginSchema,
  prompt: z.string(),
  mode: z.enum(["general", "structure"]).default("general"),
  language: z.string().default(""),
  forceNew: z.boolean().default(true),
  canvasSessionId: z.string().nullable().default(null),
  queryPayload: DralkQueryPayloadSchema.nullable().default(null),
  errorMessage: z.string().nullable().default(null),
});
export type DralkWorkflowPayload = z.infer<typeof DralkWorkflowPayloadSchema>;

export const DralkWorkflowRecordSchema = z.object({
  id: z.string().min(1),
  conversationId: z.string().min(1),
  workflowType: z.literal("dralk_input"),
  status: DralkWorkflowStatusSchema,
  payload: DralkWorkflowPayloadSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type DralkWorkflowRecord = z.infer<typeof DralkWorkflowRecordSchema>;

export const StartDralkWorkflowRequestSchema = z.object({
  conversationId: z.string().min(1).optional(),
  origin: DralkOriginSchema,
  prompt: z.string().optional(),
  mode: z.enum(["general", "structure"]).optional(),
  language: z.string().optional(),
  forceNew: z.boolean().optional(),
  userId: z.string().optional(),
});
export type StartDralkWorkflowRequest = z.infer<typeof StartDralkWorkflowRequestSchema>;

export const DralkWorkflowEventSchema = z.enum([
  "canvas_opened",
  "recognized",
  "attached",
  "cancelled",
  "failed",
  "completed",
]);
export type DralkWorkflowEvent = z.infer<typeof DralkWorkflowEventSchema>;

export const TransitionDralkWorkflowRequestSchema = z.object({
  conversationId: z.string().min(1),
  workflowId: z.string().min(1).optional(),
  event: DralkWorkflowEventSchema,
  canvasSessionId: z.string().optional(),
  queryPayload: DralkQueryPayloadSchema.partial().optional(),
  errorMessage: z.string().optional(),
});
export type TransitionDralkWorkflowRequest = z.infer<
  typeof TransitionDralkWorkflowRequestSchema
>;

export const WorkflowRequestSchema = z.object({
  type: z.literal("dralk_input"),
  workflowId: z.string().min(1),
  conversationId: z.string().min(1),
  origin: DralkOriginSchema,
  status: DralkWorkflowStatusSchema,
  prompt: z.string(),
  mode: z.enum(["general", "structure"]),
  language: z.string(),
  forceNew: z.boolean(),
});
export type WorkflowRequest = z.infer<typeof WorkflowRequestSchema>;
