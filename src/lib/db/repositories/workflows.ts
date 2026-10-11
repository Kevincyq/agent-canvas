import { randomUUID } from "node:crypto";

import { getDb } from "@/lib/db/client";
import {
  DralkWorkflowPayloadSchema,
  type DralkWorkflowPayload,
  type DralkWorkflowRecord,
  type DralkWorkflowStatus,
} from "@/types/workflow";

type WorkflowRow = {
  id: string;
  conversation_id: string;
  workflow_type: string;
  status: string;
  payload_json: string;
  created_at: string;
  updated_at: string;
};

const ACTIVE_STATUSES: DralkWorkflowStatus[] = [
  "waiting_for_input",
  "capturing",
  "recognized",
  "attached",
  "running",
];

function mapRow(row: WorkflowRow): DralkWorkflowRecord {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    workflowType: "dralk_input",
    status: row.status as DralkWorkflowStatus,
    payload: DralkWorkflowPayloadSchema.parse(JSON.parse(row.payload_json)),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toRuntimeStatus(status: DralkWorkflowStatus): string {
  if (status === "completed" || status === "failed" || status === "cancelled") {
    return status;
  }
  if (
    status === "waiting_for_input" ||
    status === "capturing" ||
    status === "recognized"
  ) {
    return "waiting_for_input";
  }
  return "running";
}

export function getWorkflowById(id: string): DralkWorkflowRecord | null {
  const row = getDb()
    .prepare("SELECT * FROM workflow_states WHERE id = ? AND workflow_type = 'dralk_input'")
    .get(id) as WorkflowRow | undefined;
  return row ? mapRow(row) : null;
}

export function getActiveDralkWorkflow(
  conversationId: string,
): DralkWorkflowRecord | null {
  const placeholders = ACTIVE_STATUSES.map(() => "?").join(", ");
  const row = getDb()
    .prepare(
      `SELECT * FROM workflow_states
       WHERE conversation_id = ?
         AND workflow_type = 'dralk_input'
         AND status IN (${placeholders})
       ORDER BY updated_at DESC
       LIMIT 1`,
    )
    .get(conversationId, ...ACTIVE_STATUSES) as WorkflowRow | undefined;

  return row ? mapRow(row) : null;
}

export function insertDralkWorkflow(input: {
  conversationId: string;
  status: DralkWorkflowStatus;
  payload: DralkWorkflowPayload;
}): DralkWorkflowRecord {
  const now = new Date().toISOString();
  const record: DralkWorkflowRecord = {
    id: randomUUID(),
    conversationId: input.conversationId,
    workflowType: "dralk_input",
    status: input.status,
    payload: input.payload,
    createdAt: now,
    updatedAt: now,
  };

  getDb()
    .prepare(
      `INSERT INTO workflow_states (
        id, conversation_id, workflow_type, status, payload_json,
        execution_mode, runtime_status, version, input_json, resume_policy,
        correlation_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 'native', ?, '1.0', ?, 'ui_submit', ?, ?, ?)`,
    )
    .run(
      record.id,
      record.conversationId,
      record.workflowType,
      record.status,
      JSON.stringify(record.payload),
      toRuntimeStatus(record.status),
      JSON.stringify({
        prompt: record.payload.prompt,
        mode: record.payload.mode,
        language: record.payload.language,
        forceNew: record.payload.forceNew,
      }),
      record.id,
      record.createdAt,
      record.updatedAt,
    );

  return record;
}

export function updateDralkWorkflow(
  id: string,
  patch: {
    status?: DralkWorkflowStatus;
    payload?: DralkWorkflowPayload;
  },
): DralkWorkflowRecord | null {
  const existing = getWorkflowById(id);
  if (!existing) {
    return null;
  }

  const updated: DralkWorkflowRecord = {
    ...existing,
    status: patch.status ?? existing.status,
    payload: patch.payload ?? existing.payload,
    updatedAt: new Date().toISOString(),
  };

  getDb()
    .prepare(
      `UPDATE workflow_states
       SET status = ?, runtime_status = ?, payload_json = ?,
           completed_at = CASE WHEN ? IN ('completed', 'failed', 'cancelled') THEN ? ELSE completed_at END,
           updated_at = ?
       WHERE id = ?`,
    )
    .run(
      updated.status,
      toRuntimeStatus(updated.status),
      JSON.stringify(updated.payload),
      updated.status,
      updated.updatedAt,
      updated.updatedAt,
      updated.id,
    );

  return updated;
}
