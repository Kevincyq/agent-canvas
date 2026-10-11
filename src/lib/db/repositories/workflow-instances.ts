import { randomUUID } from "node:crypto";

import { getDb } from "@/lib/db/client";
import {
  WorkflowInstanceSchema,
  WorkflowResultSchema,
  type RegisteredWorkflowType,
  type WorkflowExecutionMode,
  type WorkflowInstance,
  type WorkflowResumePolicy,
  type WorkflowResult,
  type WorkflowRuntimeStatus,
} from "@/types/workflow-runtime";

type WorkflowInstanceRow = {
  id: string;
  conversation_id: string;
  workflow_type: string;
  status: string;
  payload_json: string;
  execution_mode: string;
  runtime_status: string;
  version: string;
  input_json: string;
  result_json: string | null;
  error_json: string | null;
  resume_policy: string;
  correlation_id: string | null;
  parent_workflow_id: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

function parseRecord(value: string | null): Record<string, unknown> | null {
  if (!value) {
    return null;
  }
  const parsed = JSON.parse(value) as unknown;
  return parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : {};
}

function mapRow(row: WorkflowInstanceRow): WorkflowInstance {
  return WorkflowInstanceSchema.parse({
    id: row.id,
    conversationId: row.conversation_id,
    workflowType: row.workflow_type,
    version: row.version,
    executionMode: row.execution_mode,
    status: row.status,
    runtimeStatus: row.runtime_status,
    resumePolicy: row.resume_policy,
    input: parseRecord(row.input_json) ?? {},
    domainState: parseRecord(row.payload_json) ?? {},
    result: row.result_json
      ? WorkflowResultSchema.parse(JSON.parse(row.result_json))
      : null,
    error: parseRecord(row.error_json),
    correlationId: row.correlation_id ?? row.id,
    parentWorkflowId: row.parent_workflow_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
  });
}

export function getWorkflowInstance(id: string): WorkflowInstance | null {
  const row = getDb()
    .prepare("SELECT * FROM workflow_states WHERE id = ?")
    .get(id) as WorkflowInstanceRow | undefined;
  return row ? mapRow(row) : null;
}

export function listWorkflowInstances(input: {
  conversationId: string;
  workflowType?: RegisteredWorkflowType;
}): WorkflowInstance[] {
  const rows = input.workflowType
    ? (getDb()
        .prepare(
          `SELECT * FROM workflow_states
           WHERE conversation_id = ? AND workflow_type = ?
           ORDER BY updated_at DESC`,
        )
        .all(input.conversationId, input.workflowType) as WorkflowInstanceRow[])
    : (getDb()
        .prepare(
          `SELECT * FROM workflow_states
           WHERE conversation_id = ?
           ORDER BY updated_at DESC`,
        )
        .all(input.conversationId) as WorkflowInstanceRow[]);
  return rows.map(mapRow);
}

export function insertWorkflowInstance(input: {
  conversationId: string;
  workflowType: RegisteredWorkflowType;
  version: string;
  executionMode: WorkflowExecutionMode;
  status: string;
  runtimeStatus: WorkflowRuntimeStatus;
  resumePolicy: WorkflowResumePolicy;
  workflowInput: Record<string, unknown>;
  domainState?: Record<string, unknown>;
  correlationId?: string;
  parentWorkflowId?: string | null;
}): WorkflowInstance {
  const id = randomUUID();
  const now = new Date().toISOString();
  const correlationId = input.correlationId ?? id;
  getDb()
    .prepare(
      `INSERT INTO workflow_states (
        id, conversation_id, workflow_type, status, payload_json,
        execution_mode, runtime_status, version, input_json, resume_policy,
        correlation_id, parent_workflow_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      input.conversationId,
      input.workflowType,
      input.status,
      JSON.stringify(input.domainState ?? {}),
      input.executionMode,
      input.runtimeStatus,
      input.version,
      JSON.stringify(input.workflowInput),
      input.resumePolicy,
      correlationId,
      input.parentWorkflowId ?? null,
      now,
      now,
    );
  const inserted = getWorkflowInstance(id);
  if (!inserted) {
    throw new Error("Failed to insert workflow instance");
  }
  return inserted;
}

export function updateWorkflowRuntimeMetadata(
  id: string,
  patch: {
    executionMode?: WorkflowExecutionMode;
    runtimeStatus?: WorkflowRuntimeStatus;
    version?: string;
    workflowInput?: Record<string, unknown>;
    resumePolicy?: WorkflowResumePolicy;
    correlationId?: string;
    parentWorkflowId?: string | null;
  },
): WorkflowInstance {
  const existing = getWorkflowInstance(id);
  if (!existing) {
    throw new Error(`Workflow instance not found: ${id}`);
  }
  const updatedAt = new Date().toISOString();
  getDb()
    .prepare(
      `UPDATE workflow_states
       SET execution_mode = ?, runtime_status = ?, version = ?, input_json = ?,
           resume_policy = ?, correlation_id = ?, parent_workflow_id = ?, updated_at = ?
       WHERE id = ?`,
    )
    .run(
      patch.executionMode ?? existing.executionMode,
      patch.runtimeStatus ?? existing.runtimeStatus,
      patch.version ?? existing.version,
      JSON.stringify(patch.workflowInput ?? existing.input),
      patch.resumePolicy ?? existing.resumePolicy,
      patch.correlationId ?? existing.correlationId,
      patch.parentWorkflowId === undefined
        ? existing.parentWorkflowId
        : patch.parentWorkflowId,
      updatedAt,
      id,
    );
  const updated = getWorkflowInstance(id);
  if (!updated) {
    throw new Error(`Failed to update workflow instance: ${id}`);
  }
  return updated;
}

export function persistWorkflowResult(
  id: string,
  result: WorkflowResult,
): { instance: WorkflowInstance; accepted: boolean } {
  const existing = getWorkflowInstance(id);
  if (!existing) {
    throw new Error(`Workflow instance not found: ${id}`);
  }
  const completedAt = result.provenance.completedAt;
  const write = getDb()
    .prepare(
      `UPDATE workflow_states
       SET status = ?, runtime_status = ?, result_json = ?, error_json = ?,
           completed_at = ?, updated_at = ?
       WHERE id = ? AND result_json IS NULL`,
    )
    .run(
      result.status,
      result.status,
      JSON.stringify(result),
      result.error ? JSON.stringify(result.error) : null,
      completedAt,
      completedAt,
      id,
    );
  const instance = getWorkflowInstance(id);
  if (!instance) {
    throw new Error(`Failed to persist workflow result: ${id}`);
  }
  return { instance, accepted: Number(write.changes) === 1 };
}
