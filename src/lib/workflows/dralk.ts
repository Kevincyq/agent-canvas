import { randomUUID } from "node:crypto";

import {
  getActiveDralkWorkflow,
  getWorkflowById,
  insertDralkWorkflow,
  updateDralkWorkflow,
} from "@/lib/db/repositories/workflows";
import { conversationTaskStore } from "@/lib/task/task-store";
import {
  DralkWorkflowPayloadSchema,
  type DralkOrigin,
  type DralkQueryPayload,
  type DralkWorkflowEvent,
  type DralkWorkflowRecord,
  type DralkWorkflowStatus,
  type StartDralkWorkflowRequest,
  type WorkflowRequest,
} from "@/types/workflow";

const EVENT_TRANSITIONS: Record<
  DralkWorkflowEvent,
  { from: DralkWorkflowStatus[]; to: DralkWorkflowStatus }
> = {
  canvas_opened: {
    from: ["waiting_for_input", "capturing"],
    to: "capturing",
  },
  recognized: {
    from: ["capturing", "recognized"],
    to: "recognized",
  },
  attached: {
    from: ["recognized", "capturing", "attached"],
    to: "attached",
  },
  cancelled: {
    from: ["waiting_for_input", "capturing", "recognized"],
    to: "cancelled",
  },
  failed: {
    from: ["waiting_for_input", "capturing", "recognized", "attached", "running"],
    to: "failed",
  },
  completed: {
    from: ["attached", "running", "recognized"],
    to: "completed",
  },
};

function toWorkflowRequest(record: DralkWorkflowRecord): WorkflowRequest {
  return {
    type: "dralk_input",
    workflowId: record.id,
    conversationId: record.conversationId,
    origin: record.payload.origin,
    status: record.status,
    prompt: record.payload.prompt,
    mode: record.payload.mode,
    language: record.payload.language,
    forceNew: record.payload.forceNew,
  };
}

function syncConversationStatus(
  conversationId: string,
  workflowStatus: DralkWorkflowStatus,
): void {
  if (
    workflowStatus === "waiting_for_input" ||
    workflowStatus === "capturing" ||
    workflowStatus === "recognized"
  ) {
    conversationTaskStore.update(conversationId, {
      status: "waiting_for_input",
      currentStep: `dralk:${workflowStatus}`,
    });
    return;
  }

  if (workflowStatus === "attached" || workflowStatus === "running") {
    conversationTaskStore.update(conversationId, {
      status: "running",
      currentStep: `dralk:${workflowStatus}`,
    });
    return;
  }

  if (workflowStatus === "failed") {
    conversationTaskStore.update(conversationId, {
      status: "failed",
      currentStep: "dralk:failed",
    });
    return;
  }

  if (workflowStatus === "completed" || workflowStatus === "cancelled") {
    conversationTaskStore.update(conversationId, {
      status: "ready",
      currentStep: null,
    });
  }
}

export function startDralkWorkflow(input: StartDralkWorkflowRequest): {
  conversationId: string;
  workflow: DralkWorkflowRecord;
  workflowRequest: WorkflowRequest;
} {
  const conversation = conversationTaskStore.ensure(input.conversationId, {
    userId: input.userId,
    title: "Dralk 输入",
    originSurface: "dralk",
  });

  const existing = getActiveDralkWorkflow(conversation.id);
  if (existing && !input.forceNew) {
    syncConversationStatus(conversation.id, existing.status);
    return {
      conversationId: conversation.id,
      workflow: existing,
      workflowRequest: toWorkflowRequest(existing),
    };
  }

  if (existing && input.forceNew) {
    updateDralkWorkflow(existing.id, { status: "cancelled" });
  }

  const payload = DralkWorkflowPayloadSchema.parse({
    origin: input.origin,
    prompt: input.prompt?.trim() || "请在画布中边画边说输入内容",
    mode: input.mode ?? "general",
    language: input.language ?? "",
    forceNew: input.forceNew ?? true,
    canvasSessionId: randomUUID(),
    queryPayload: null,
    errorMessage: null,
  });

  const workflow = insertDralkWorkflow({
    conversationId: conversation.id,
    status: "waiting_for_input",
    payload,
  });

  syncConversationStatus(conversation.id, workflow.status);

  return {
    conversationId: conversation.id,
    workflow,
    workflowRequest: toWorkflowRequest(workflow),
  };
}

export function transitionDralkWorkflow(input: {
  conversationId: string;
  workflowId?: string;
  event: DralkWorkflowEvent;
  canvasSessionId?: string;
  queryPayload?: Partial<DralkQueryPayload>;
  errorMessage?: string;
}): DralkWorkflowRecord {
  const workflow =
    (input.workflowId ? getWorkflowById(input.workflowId) : null) ??
    getActiveDralkWorkflow(input.conversationId);

  if (!workflow || workflow.conversationId !== input.conversationId) {
    throw new Error("Active Dralk workflow not found for conversation");
  }

  const transition = EVENT_TRANSITIONS[input.event];
  if (!transition.from.includes(workflow.status)) {
    throw new Error(
      `Invalid Dralk transition ${input.event} from status ${workflow.status}`,
    );
  }

  const nextPayload = {
    ...workflow.payload,
    canvasSessionId: input.canvasSessionId ?? workflow.payload.canvasSessionId,
    errorMessage: input.errorMessage ?? workflow.payload.errorMessage,
    queryPayload: input.queryPayload
      ? {
          recognitionType: input.queryPayload.recognitionType ?? null,
          structuredContent: input.queryPayload.structuredContent ?? null,
          displaySummary: input.queryPayload.displaySummary ?? null,
          strokesRef: input.queryPayload.strokesRef ?? null,
          voiceTranscriptRef: input.queryPayload.voiceTranscriptRef ?? null,
          startMs: input.queryPayload.startMs ?? null,
          endMs: input.queryPayload.endMs ?? null,
          canvasSessionId:
            input.queryPayload.canvasSessionId ??
            input.canvasSessionId ??
            workflow.payload.canvasSessionId,
          confidence: input.queryPayload.confidence ?? null,
          sourceMetadata: input.queryPayload.sourceMetadata ?? null,
        }
      : workflow.payload.queryPayload,
  };

  const updated = updateDralkWorkflow(workflow.id, {
    status: transition.to,
    payload: DralkWorkflowPayloadSchema.parse(nextPayload),
  });

  if (!updated) {
    throw new Error("Failed to update Dralk workflow");
  }

  syncConversationStatus(input.conversationId, updated.status);
  return updated;
}

export function markDralkAttachedAndRunning(conversationId: string): void {
  const active = getActiveDralkWorkflow(conversationId);
  if (!active) {
    return;
  }

  if (active.status === "recognized" || active.status === "capturing") {
    transitionDralkWorkflow({
      conversationId,
      workflowId: active.id,
      event: "attached",
    });
  }

  const afterAttach = getActiveDralkWorkflow(conversationId);
  if (afterAttach && afterAttach.status === "attached") {
    updateDralkWorkflow(afterAttach.id, { status: "running" });
    syncConversationStatus(conversationId, "running");
  }
}

export function completeDralkWorkflow(conversationId: string): void {
  const active = getActiveDralkWorkflow(conversationId);
  if (!active) {
    return;
  }
  if (active.status === "running" || active.status === "attached" || active.status === "recognized") {
    transitionDralkWorkflow({
      conversationId,
      workflowId: active.id,
      event: "completed",
    });
  }
}

export function startDralkFromAgentIntent(input: {
  conversationId: string;
  prompt: string;
  mode?: "general" | "structure";
  language?: string;
  forceNew?: boolean;
}): WorkflowRequest {
  const started = startDralkWorkflow({
    conversationId: input.conversationId,
    origin: "agent_intent",
    prompt: input.prompt,
    mode: input.mode,
    language: input.language,
    forceNew: input.forceNew ?? true,
  });
  return started.workflowRequest;
}

export { getActiveDralkWorkflow };
export type { DralkOrigin };
