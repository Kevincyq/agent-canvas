import { z } from "zod";

export const RegisteredWorkflowTypeSchema = z.enum([
  "dralk_input",
  "meeting",
  "writing_assist",
  "translation",
]);
export type RegisteredWorkflowType = z.infer<typeof RegisteredWorkflowTypeSchema>;

export const WorkflowExecutionModeSchema = z.enum([
  "native",
  "fixture",
  "external_pending",
]);
export type WorkflowExecutionMode = z.infer<typeof WorkflowExecutionModeSchema>;

export const WorkflowRuntimeStatusSchema = z.enum([
  "waiting_for_input",
  "waiting_external",
  "running",
  "completed",
  "failed",
  "cancelled",
]);
export type WorkflowRuntimeStatus = z.infer<typeof WorkflowRuntimeStatusSchema>;

export const WorkflowResumePolicySchema = z.enum([
  "agent_on_result",
  "ui_submit",
  "manual",
]);
export type WorkflowResumePolicy = z.infer<typeof WorkflowResumePolicySchema>;

export const WorkflowContextRefSchema = z.object({
  type: z.enum(["project", "source", "artifact", "selection", "attachment"]),
  id: z.string().min(1),
  version: z.string().nullable().default(null),
});

export const WorkflowReturnTargetSchema = z.object({
  conversationId: z.string().min(1),
  taskId: z.string().min(1),
  stepId: z.string().min(1),
  resumePolicy: WorkflowResumePolicySchema,
});

export const RegisteredWorkflowRequestSchema = z.object({
  workflowId: z.string().min(1),
  workflowType: RegisteredWorkflowTypeSchema,
  version: z.string().min(1),
  executionMode: WorkflowExecutionModeSchema,
  status: WorkflowRuntimeStatusSchema,
  origin: z.enum(["agent_intent", "user_button", "api"]),
  input: z.record(z.string(), z.unknown()),
  contextRefs: z.array(WorkflowContextRefSchema),
  returnTo: WorkflowReturnTargetSchema,
  createdAt: z.string(),
});
export type RegisteredWorkflowRequest = z.infer<
  typeof RegisteredWorkflowRequestSchema
>;

export const WorkflowEvidenceSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  source: z.string().min(1),
});

export const WorkflowArtifactSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  artifactType: z.string().min(1),
});

export const WorkflowResultSchema = z.object({
  workflowId: z.string().min(1),
  workflowType: RegisteredWorkflowTypeSchema,
  conversationId: z.string().min(1),
  status: z.enum(["completed", "failed", "cancelled"]),
  output: z.record(z.string(), z.unknown()).default({}),
  evidence: z.array(WorkflowEvidenceSchema).default([]),
  artifacts: z.array(WorkflowArtifactSchema).default([]),
  actions: z.array(z.record(z.string(), z.unknown())).default([]),
  error: z
    .object({
      code: z.string().min(1),
      message: z.string().min(1),
      retryable: z.boolean().default(false),
    })
    .nullable()
    .default(null),
  provenance: z.object({
    adapter: z.string().min(1),
    executionMode: WorkflowExecutionModeSchema,
    completedAt: z.string(),
  }),
});
export type WorkflowResult = z.infer<typeof WorkflowResultSchema>;

export const WorkflowInstanceSchema = z.object({
  id: z.string().min(1),
  conversationId: z.string().min(1),
  workflowType: RegisteredWorkflowTypeSchema,
  version: z.string().min(1),
  executionMode: WorkflowExecutionModeSchema,
  status: z.string().min(1),
  runtimeStatus: WorkflowRuntimeStatusSchema,
  resumePolicy: WorkflowResumePolicySchema,
  input: z.record(z.string(), z.unknown()),
  domainState: z.record(z.string(), z.unknown()),
  result: WorkflowResultSchema.nullable(),
  error: z.record(z.string(), z.unknown()).nullable(),
  correlationId: z.string().min(1),
  parentWorkflowId: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  completedAt: z.string().nullable(),
});
export type WorkflowInstance = z.infer<typeof WorkflowInstanceSchema>;

export const StartRegisteredWorkflowRequestSchema = z.object({
  conversationId: z.string().min(1).optional(),
  workflowType: RegisteredWorkflowTypeSchema,
  origin: z.enum(["agent_intent", "user_button", "api"]).default("api"),
  input: z.record(z.string(), z.unknown()).default({}),
  contextRefs: z.array(WorkflowContextRefSchema).default([]),
  correlationId: z.string().min(1).optional(),
  parentWorkflowId: z.string().min(1).nullable().optional(),
  userId: z.string().min(1).optional(),
  tenantId: z.string().min(1).optional(),
});
export type StartRegisteredWorkflowRequest = z.infer<
  typeof StartRegisteredWorkflowRequestSchema
>;

export const SubmitWorkflowResultRequestSchema = z.object({
  status: z.enum(["completed", "failed", "cancelled"]).default("completed"),
  output: z.record(z.string(), z.unknown()).default({}),
  evidence: z.array(WorkflowEvidenceSchema).default([]),
  artifacts: z.array(WorkflowArtifactSchema).default([]),
  actions: z.array(z.record(z.string(), z.unknown())).default([]),
  error: z
    .object({
      code: z.string().min(1),
      message: z.string().min(1),
      retryable: z.boolean().default(false),
    })
    .nullable()
    .default(null),
  continueAgent: z.boolean().default(true),
});
export type SubmitWorkflowResultRequest = z.infer<
  typeof SubmitWorkflowResultRequestSchema
>;
