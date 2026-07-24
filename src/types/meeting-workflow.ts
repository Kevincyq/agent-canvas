import { z } from "zod";

export const MeetingActionItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  owner: z.string(),
  dueAt: z.string(),
});

export const MeetingWorkflowPayloadSchema = z.object({
  origin: z.enum(["agent_intent", "user_button"]),
  meetingId: z.string(),
  title: z.string(),
  participants: z.array(z.string()),
  startedAt: z.string(),
  endedAt: z.string().nullable(),
  transcript: z.string().nullable(),
  summary: z.string().nullable(),
  actionItems: z.array(MeetingActionItemSchema),
  storedSourceIds: z.array(z.string()),
});

export const MeetingWorkflowStatusSchema = z.enum([
  "running",
  "completed",
  "cancelled",
  "failed",
]);

export const MeetingWorkflowRecordSchema = z.object({
  id: z.string(),
  conversationId: z.string(),
  workflowType: z.literal("meeting"),
  status: MeetingWorkflowStatusSchema,
  payload: MeetingWorkflowPayloadSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const StartMeetingWorkflowRequestSchema = z.object({
  conversationId: z.string().min(1).optional(),
  origin: z.enum(["agent_intent", "user_button"]).default("user_button"),
  meetingId: z.string().min(1).optional(),
  userId: z.string().min(1).optional(),
  tenantId: z.string().min(1).optional(),
});

export const FinishMeetingWorkflowRequestSchema = z.object({
  conversationId: z.string().min(1),
  workflowId: z.string().min(1),
});

export type MeetingActionItem = z.infer<typeof MeetingActionItemSchema>;
export type MeetingWorkflowPayload = z.infer<typeof MeetingWorkflowPayloadSchema>;
export type MeetingWorkflowStatus = z.infer<typeof MeetingWorkflowStatusSchema>;
export type MeetingWorkflowRecord = z.infer<typeof MeetingWorkflowRecordSchema>;
export type StartMeetingWorkflowRequest = z.infer<typeof StartMeetingWorkflowRequestSchema>;
