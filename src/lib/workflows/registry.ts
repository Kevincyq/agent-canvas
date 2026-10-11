import { randomUUID } from "node:crypto";
import { z } from "zod";

import {
  getWorkflowInstance,
  insertWorkflowInstance,
  persistWorkflowResult,
  updateWorkflowRuntimeMetadata,
} from "@/lib/db/repositories/workflow-instances";
import { conversationTaskStore } from "@/lib/task/task-store";
import { startDralkWorkflow } from "@/lib/workflows/dralk";
import {
  finishMeetingWorkflow,
  startMeetingWorkflow,
} from "@/lib/workflows/meeting";
import {
  RegisteredWorkflowRequestSchema,
  WorkflowResultSchema,
  type RegisteredWorkflowRequest,
  type RegisteredWorkflowType,
  type StartRegisteredWorkflowRequest,
  type SubmitWorkflowResultRequest,
  type WorkflowExecutionMode,
  type WorkflowInstance,
  type WorkflowResult,
  type WorkflowRuntimeStatus,
} from "@/types/workflow-runtime";

const DralkInputSchema = z.object({
  prompt: z.string().min(1).default("请在画布中边画边说输入内容"),
  mode: z.enum(["general", "structure"]).default("general"),
  language: z.string().default(""),
  forceNew: z.boolean().default(false),
});

const MeetingInputSchema = z.object({
  meetingId: z.string().min(1).optional(),
});

const WritingAssistInputSchema = z.object({
  goal: z.string().min(1),
  instructions: z.string().default(""),
  sourceIds: z.array(z.string()).default([]),
  audience: z.string().nullable().default(null),
  format: z.string().nullable().default(null),
});

const TranslationInputSchema = z.object({
  content: z.string().min(1),
  targetLanguage: z.string().min(1),
  sourceLanguage: z.string().nullable().default(null),
  preserveFormatting: z.boolean().default(true),
});

const DralkOutputSchema = z.object({
  recognitionType: z.string().nullable().optional(),
  structuredContent: z.unknown().optional(),
  displaySummary: z.string().nullable().optional(),
});

const MeetingOutputSchema = z.object({
  transcript: z.string(),
  summary: z.string(),
  actionItems: z.array(z.record(z.string(), z.unknown())).default([]),
  storedSourceIds: z.array(z.string()).default([]),
});

const WritingAssistOutputSchema = z.object({
  draft: z.string().min(1),
  title: z.string().nullable().default(null),
  format: z.string().nullable().default(null),
});

const TranslationOutputSchema = z.object({
  translatedText: z.string().min(1),
  sourceLanguage: z.string().nullable().default(null),
  targetLanguage: z.string().min(1),
});

type WorkflowDefinition = {
  type: RegisteredWorkflowType;
  displayName: string;
  version: string;
  executionMode: WorkflowExecutionMode;
  adapterId: string;
  available: boolean;
  realIntegration: boolean;
  inputSchema: z.ZodType<Record<string, unknown>>;
  outputSchema: z.ZodType<Record<string, unknown>>;
  description: string;
};

const WORKFLOW_DEFINITIONS: Record<RegisteredWorkflowType, WorkflowDefinition> = {
  dralk_input: {
    type: "dralk_input",
    displayName: "Dralk",
    version: "1.0",
    executionMode: "native",
    adapterId: "dralk.native.v1",
    available: true,
    realIntegration: true,
    inputSchema: DralkInputSchema,
    outputSchema: DralkOutputSchema,
    description: "真实手写/语音输入闭环；由 Canvas 与 HWR 流程采集结果。",
  },
  meeting: {
    type: "meeting",
    displayName: "Meeting",
    version: "1.0",
    executionMode: "fixture",
    adapterId: "meeting.fixture.v1",
    available: true,
    realIntegration: false,
    inputSchema: MeetingInputSchema,
    outputSchema: MeetingOutputSchema,
    description: "完整状态逻辑，当前转写、纪要和知识沉淀由 Fixture Adapter 提供。",
  },
  writing_assist: {
    type: "writing_assist",
    displayName: "Writing Assist",
    version: "1.0",
    executionMode: "external_pending",
    adapterId: "writing.external-pending.v1",
    available: false,
    realIntegration: false,
    inputSchema: WritingAssistInputSchema,
    outputSchema: WritingAssistOutputSchema,
    description: "工作流协议已就绪；等待真实写作服务 Adapter 回传结果。",
  },
  translation: {
    type: "translation",
    displayName: "Translation",
    version: "1.0",
    executionMode: "external_pending",
    adapterId: "translation.external-pending.v1",
    available: false,
    realIntegration: false,
    inputSchema: TranslationInputSchema,
    outputSchema: TranslationOutputSchema,
    description: "工作流协议已就绪；等待真实翻译服务 Adapter 回传结果。",
  },
};

function toRuntimeStatus(
  workflowType: RegisteredWorkflowType,
  domainStatus: string,
): WorkflowRuntimeStatus {
  if (
    domainStatus === "completed" ||
    domainStatus === "failed" ||
    domainStatus === "cancelled"
  ) {
    return domainStatus;
  }
  if (
    workflowType === "dralk_input" &&
    ["waiting_for_input", "capturing", "recognized"].includes(domainStatus)
  ) {
    return "waiting_for_input";
  }
  if (
    workflowType === "writing_assist" ||
    workflowType === "translation"
  ) {
    return "waiting_external";
  }
  return "running";
}

function toWorkflowRequest(
  instance: WorkflowInstance,
  origin: StartRegisteredWorkflowRequest["origin"],
  contextRefs: StartRegisteredWorkflowRequest["contextRefs"],
): RegisteredWorkflowRequest {
  return RegisteredWorkflowRequestSchema.parse({
    workflowId: instance.id,
    workflowType: instance.workflowType,
    version: instance.version,
    executionMode: instance.executionMode,
    status: instance.runtimeStatus,
    origin,
    input: instance.input,
    contextRefs,
    returnTo: {
      conversationId: instance.conversationId,
      taskId: instance.conversationId,
      stepId: `workflow:${instance.id}`,
      resumePolicy: instance.resumePolicy,
    },
    createdAt: instance.createdAt,
  });
}

export function listWorkflowDefinitions() {
  return Object.values(WORKFLOW_DEFINITIONS).map((definition) => ({
    type: definition.type,
    displayName: definition.displayName,
    version: definition.version,
    executionMode: definition.executionMode,
    adapterId: definition.adapterId,
    available: definition.available,
    realIntegration: definition.realIntegration,
    description: definition.description,
  }));
}

export function getWorkflowDefinition(type: RegisteredWorkflowType) {
  return WORKFLOW_DEFINITIONS[type];
}

export async function startRegisteredWorkflow(
  request: StartRegisteredWorkflowRequest,
): Promise<{
  instance: WorkflowInstance;
  workflowRequest: RegisteredWorkflowRequest;
}> {
  const definition = getWorkflowDefinition(request.workflowType);
  const workflowInput = definition.inputSchema.parse(request.input);
  const correlationId = request.correlationId ?? randomUUID();
  let instance: WorkflowInstance;

  if (request.workflowType === "dralk_input") {
    const input = DralkInputSchema.parse(workflowInput);
    const started = startDralkWorkflow({
      conversationId: request.conversationId,
      origin: request.origin === "user_button" ? "user_button" : "agent_intent",
      prompt: input.prompt,
      mode: input.mode,
      language: input.language,
      forceNew: input.forceNew,
      userId: request.userId,
      tenantId: request.tenantId,
    });
    instance = updateWorkflowRuntimeMetadata(started.workflow.id, {
      executionMode: definition.executionMode,
      runtimeStatus: toRuntimeStatus(request.workflowType, started.workflow.status),
      version: definition.version,
      workflowInput,
      resumePolicy: "ui_submit",
      correlationId,
      parentWorkflowId: request.parentWorkflowId ?? null,
    });
  } else if (request.workflowType === "meeting") {
    const input = MeetingInputSchema.parse(workflowInput);
    const started = startMeetingWorkflow({
      conversationId: request.conversationId,
      origin: request.origin === "user_button" ? "user_button" : "agent_intent",
      meetingId: input.meetingId,
      userId: request.userId,
      tenantId: request.tenantId,
    });
    instance = updateWorkflowRuntimeMetadata(started.workflow.id, {
      executionMode: definition.executionMode,
      runtimeStatus: toRuntimeStatus(request.workflowType, started.workflow.status),
      version: definition.version,
      workflowInput,
      resumePolicy: "agent_on_result",
      correlationId,
      parentWorkflowId: request.parentWorkflowId ?? null,
    });
  } else {
    const conversation = conversationTaskStore.ensure(request.conversationId, {
      userId: request.userId,
      tenantId: request.tenantId,
      title:
        request.workflowType === "writing_assist"
          ? "AskAI · Writing Assist"
          : "AskAI · Translation",
      originSurface: "askai",
    });
    instance = insertWorkflowInstance({
      conversationId: conversation.id,
      workflowType: request.workflowType,
      version: definition.version,
      executionMode: definition.executionMode,
      status: "waiting_external",
      runtimeStatus: "waiting_external",
      resumePolicy: "agent_on_result",
      workflowInput,
      domainState: {
        adapterStatus: "not_connected",
        adapterId: definition.adapterId,
      },
      correlationId,
      parentWorkflowId: request.parentWorkflowId ?? null,
    });
    conversationTaskStore.update(conversation.id, {
      status: "waiting_for_input",
      currentStep: `workflow:${request.workflowType}:waiting_external`,
    });
  }

  return {
    instance,
    workflowRequest: toWorkflowRequest(
      instance,
      request.origin,
      request.contextRefs,
    ),
  };
}

export function submitRegisteredWorkflowResult(input: {
  workflowId: string;
  result: SubmitWorkflowResultRequest;
}): {
  instance: WorkflowInstance;
  workflowResult: WorkflowResult;
  accepted: boolean;
} {
  const existing = getWorkflowInstance(input.workflowId);
  if (!existing) {
    throw new Error(`Workflow instance not found: ${input.workflowId}`);
  }
  if (existing.result) {
    return {
      instance: existing,
      workflowResult: existing.result,
      accepted: false,
    };
  }

  const definition = getWorkflowDefinition(existing.workflowType);
  const output =
    input.result.status === "completed"
      ? definition.outputSchema.parse(input.result.output)
      : input.result.output;
  const completedAt = new Date().toISOString();
  const workflowResult = WorkflowResultSchema.parse({
    workflowId: existing.id,
    workflowType: existing.workflowType,
    conversationId: existing.conversationId,
    status: input.result.status,
    output,
    evidence: input.result.evidence,
    artifacts: input.result.artifacts,
    actions: input.result.actions,
    error: input.result.error,
    provenance: {
      adapter: definition.adapterId,
      executionMode: definition.executionMode,
      completedAt,
    },
  });
  const persisted = persistWorkflowResult(existing.id, workflowResult);
  if (!persisted.accepted) {
    if (!persisted.instance.result) {
      throw new Error(`Workflow result race could not be resolved: ${existing.id}`);
    }
    return {
      instance: persisted.instance,
      workflowResult: persisted.instance.result,
      accepted: false,
    };
  }
  const instance = persisted.instance;
  const shouldResumeAgent =
    input.result.continueAgent && existing.resumePolicy === "agent_on_result";
  conversationTaskStore.update(existing.conversationId, {
    status:
      workflowResult.status === "failed"
        ? "partially_completed"
        : workflowResult.status === "cancelled"
          ? "cancelled"
          : shouldResumeAgent
            ? "running"
            : "ready",
    currentStep:
      workflowResult.status === "completed" && shouldResumeAgent
        ? `workflow:${existing.workflowType}:returning_to_agent`
        : null,
  });
  return { instance, workflowResult, accepted: true };
}

export function finishRegisteredMeeting(workflowId: string): {
  instance: WorkflowInstance;
  workflowResult: WorkflowResult;
  accepted: boolean;
} {
  const existing = getWorkflowInstance(workflowId);
  if (!existing || existing.workflowType !== "meeting") {
    throw new Error("Meeting workflow not found");
  }
  const completed = finishMeetingWorkflow({
    conversationId: existing.conversationId,
    workflowId,
  });
  return submitRegisteredWorkflowResult({
    workflowId,
    result: {
      status: "completed",
      output: {
        transcript: completed.payload.transcript ?? "",
        summary: completed.payload.summary ?? "",
        actionItems: completed.payload.actionItems,
        storedSourceIds: completed.payload.storedSourceIds,
      },
      evidence: completed.payload.storedSourceIds.map((sourceId) => ({
        id: sourceId,
        label: sourceId.includes("transcript") ? "会议转写" : "会议纪要",
        source: `pkb:${sourceId}`,
      })),
      artifacts: [],
      actions: [],
      error: null,
      continueAgent: true,
    },
  });
}
