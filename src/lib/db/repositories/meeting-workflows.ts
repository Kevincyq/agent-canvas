import { randomUUID } from "node:crypto";

import { getDb } from "@/lib/db/client";
import {
  MeetingWorkflowPayloadSchema,
  type MeetingWorkflowPayload,
  type MeetingWorkflowRecord,
  type MeetingWorkflowStatus,
} from "@/types/meeting-workflow";

type WorkflowRow = {
  id: string;
  conversation_id: string;
  workflow_type: string;
  status: string;
  payload_json: string;
  created_at: string;
  updated_at: string;
};

function mapRow(row: WorkflowRow): MeetingWorkflowRecord {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    workflowType: "meeting",
    status: row.status as MeetingWorkflowStatus,
    payload: MeetingWorkflowPayloadSchema.parse(JSON.parse(row.payload_json)),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function getMeetingWorkflowById(id: string): MeetingWorkflowRecord | null {
  const row = getDb()
    .prepare("SELECT * FROM workflow_states WHERE id = ? AND workflow_type = 'meeting'")
    .get(id) as WorkflowRow | undefined;
  return row ? mapRow(row) : null;
}

export function getLatestMeetingWorkflow(
  conversationId: string,
): MeetingWorkflowRecord | null {
  const row = getDb()
    .prepare(
      `SELECT * FROM workflow_states
       WHERE conversation_id = ? AND workflow_type = 'meeting'
       ORDER BY updated_at DESC
       LIMIT 1`,
    )
    .get(conversationId) as WorkflowRow | undefined;
  return row ? mapRow(row) : null;
}

export function getRunningMeetingWorkflow(
  conversationId: string,
): MeetingWorkflowRecord | null {
  const row = getDb()
    .prepare(
      `SELECT * FROM workflow_states
       WHERE conversation_id = ? AND workflow_type = 'meeting' AND status = 'running'
       ORDER BY updated_at DESC
       LIMIT 1`,
    )
    .get(conversationId) as WorkflowRow | undefined;
  return row ? mapRow(row) : null;
}

export function insertMeetingWorkflow(input: {
  conversationId: string;
  payload: MeetingWorkflowPayload;
}): MeetingWorkflowRecord {
  const now = new Date().toISOString();
  const record: MeetingWorkflowRecord = {
    id: randomUUID(),
    conversationId: input.conversationId,
    workflowType: "meeting",
    status: "running",
    payload: MeetingWorkflowPayloadSchema.parse(input.payload),
    createdAt: now,
    updatedAt: now,
  };
  getDb()
    .prepare(
      `INSERT INTO workflow_states (
        id, conversation_id, workflow_type, status, payload_json, created_at, updated_at
      ) VALUES (?, ?, 'meeting', ?, ?, ?, ?)`,
    )
    .run(
      record.id,
      record.conversationId,
      record.status,
      JSON.stringify(record.payload),
      record.createdAt,
      record.updatedAt,
    );
  return record;
}

export function updateMeetingWorkflow(
  id: string,
  patch: {
    status?: MeetingWorkflowStatus;
    payload?: MeetingWorkflowPayload;
  },
): MeetingWorkflowRecord | null {
  const existing = getMeetingWorkflowById(id);
  if (!existing) {
    return null;
  }
  const updated: MeetingWorkflowRecord = {
    ...existing,
    status: patch.status ?? existing.status,
    payload: patch.payload
      ? MeetingWorkflowPayloadSchema.parse(patch.payload)
      : existing.payload,
    updatedAt: new Date().toISOString(),
  };
  getDb()
    .prepare(
      `UPDATE workflow_states
       SET status = ?, payload_json = ?, updated_at = ?
       WHERE id = ? AND workflow_type = 'meeting'`,
    )
    .run(updated.status, JSON.stringify(updated.payload), updated.updatedAt, id);
  return updated;
}
