import { randomUUID } from "node:crypto";

import { getDb } from "@/lib/db/client";

export type RunStateStatus = "pending" | "resolved" | "cancelled";
export type ApprovalDecision = "approve" | "reject";

export type RunStateRecord = {
  id: string;
  conversationId: string;
  stateJson: string;
  reason: string;
  status: RunStateStatus;
  createdAt: string;
  resolvedAt: string | null;
};

export type ApprovalRecord = {
  id: string;
  conversationId: string;
  runStateId: string;
  callId: string;
  toolName: string;
  argumentsJson: string;
  riskLevel: string;
  decision: ApprovalDecision | null;
  decisionMessage: string | null;
  createdAt: string;
  decidedAt: string | null;
};

type RunStateRow = {
  id: string;
  conversation_id: string;
  state_json: string;
  reason: string;
  status: string;
  created_at: string;
  resolved_at: string | null;
};

type ApprovalRow = {
  id: string;
  conversation_id: string;
  run_state_id: string;
  call_id: string;
  tool_name: string;
  arguments_json: string;
  risk_level: string;
  decision: string | null;
  decision_message: string | null;
  created_at: string;
  decided_at: string | null;
};

function mapRunState(row: RunStateRow): RunStateRecord {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    stateJson: row.state_json,
    reason: row.reason,
    status: row.status as RunStateStatus,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
  };
}

function mapApproval(row: ApprovalRow): ApprovalRecord {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    runStateId: row.run_state_id,
    callId: row.call_id,
    toolName: row.tool_name,
    argumentsJson: row.arguments_json,
    riskLevel: row.risk_level,
    decision: (row.decision as ApprovalDecision | null) ?? null,
    decisionMessage: row.decision_message,
    createdAt: row.created_at,
    decidedAt: row.decided_at,
  };
}

export function insertRunState(input: {
  conversationId: string;
  stateJson: string;
  reason: string;
}): RunStateRecord {
  const now = new Date().toISOString();
  const record: RunStateRecord = {
    id: randomUUID(),
    conversationId: input.conversationId,
    stateJson: input.stateJson,
    reason: input.reason,
    status: "pending",
    createdAt: now,
    resolvedAt: null,
  };

  getDb()
    .prepare(
      `INSERT INTO run_states (
        id, conversation_id, state_json, reason, status, created_at, resolved_at
      ) VALUES (?, ?, ?, ?, ?, ?, NULL)`,
    )
    .run(
      record.id,
      record.conversationId,
      record.stateJson,
      record.reason,
      record.status,
      record.createdAt,
    );

  return record;
}

export function getRunStateById(id: string): RunStateRecord | null {
  const row = getDb()
    .prepare("SELECT * FROM run_states WHERE id = ?")
    .get(id) as RunStateRow | undefined;
  return row ? mapRunState(row) : null;
}

export function getPendingRunState(conversationId: string): RunStateRecord | null {
  const row = getDb()
    .prepare(
      `SELECT * FROM run_states
       WHERE conversation_id = ? AND status = 'pending'
       ORDER BY created_at DESC
       LIMIT 1`,
    )
    .get(conversationId) as RunStateRow | undefined;
  return row ? mapRunState(row) : null;
}

export function updateRunStateJson(id: string, stateJson: string): void {
  getDb()
    .prepare(`UPDATE run_states SET state_json = ? WHERE id = ?`)
    .run(stateJson, id);
}

export function resolveRunState(id: string, status: Exclude<RunStateStatus, "pending">): void {
  getDb()
    .prepare(
      `UPDATE run_states SET status = ?, resolved_at = ? WHERE id = ?`,
    )
    .run(status, new Date().toISOString(), id);
}

export function insertApprovals(
  items: Array<{
    conversationId: string;
    runStateId: string;
    callId: string;
    toolName: string;
    argumentsJson: string;
    riskLevel: string;
  }>,
): ApprovalRecord[] {
  const db = getDb();
  const insert = db.prepare(
    `INSERT INTO approvals (
      id, conversation_id, run_state_id, call_id, tool_name, arguments_json,
      risk_level, decision, decision_message, created_at, decided_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, NULL)`,
  );
  const now = new Date().toISOString();
  const records: ApprovalRecord[] = [];

  db.exec("BEGIN");
  try {
    for (const item of items) {
      // Idempotency: skip if same call_id already pending/decided for this run.
      const existing = db
        .prepare(
          `SELECT * FROM approvals WHERE run_state_id = ? AND call_id = ? LIMIT 1`,
        )
        .get(item.runStateId, item.callId) as ApprovalRow | undefined;
      if (existing) {
        records.push(mapApproval(existing));
        continue;
      }

      const record: ApprovalRecord = {
        id: randomUUID(),
        conversationId: item.conversationId,
        runStateId: item.runStateId,
        callId: item.callId,
        toolName: item.toolName,
        argumentsJson: item.argumentsJson,
        riskLevel: item.riskLevel,
        decision: null,
        decisionMessage: null,
        createdAt: now,
        decidedAt: null,
      };
      insert.run(
        record.id,
        record.conversationId,
        record.runStateId,
        record.callId,
        record.toolName,
        record.argumentsJson,
        record.riskLevel,
        record.createdAt,
      );
      records.push(record);
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  return records;
}

export function listPendingApprovals(conversationId: string): ApprovalRecord[] {
  const rows = getDb()
    .prepare(
      `SELECT a.* FROM approvals a
       INNER JOIN run_states r ON r.id = a.run_state_id
       WHERE a.conversation_id = ?
         AND a.decision IS NULL
         AND r.status = 'pending'
       ORDER BY a.created_at ASC`,
    )
    .all(conversationId) as ApprovalRow[];
  return rows.map(mapApproval);
}

export function getApprovalByCallId(
  runStateId: string,
  callId: string,
): ApprovalRecord | null {
  const row = getDb()
    .prepare(
      `SELECT * FROM approvals WHERE run_state_id = ? AND call_id = ? LIMIT 1`,
    )
    .get(runStateId, callId) as ApprovalRow | undefined;
  return row ? mapApproval(row) : null;
}

export function decideApproval(input: {
  runStateId: string;
  callId: string;
  decision: ApprovalDecision;
  decisionMessage?: string;
}): ApprovalRecord {
  const existing = getApprovalByCallId(input.runStateId, input.callId);
  if (!existing) {
    throw new Error(`Approval not found for callId=${input.callId}`);
  }
  if (existing.decision) {
    // Already decided — idempotent return.
    return existing;
  }

  const decidedAt = new Date().toISOString();
  getDb()
    .prepare(
      `UPDATE approvals
       SET decision = ?, decision_message = ?, decided_at = ?
       WHERE id = ?`,
    )
    .run(
      input.decision,
      input.decisionMessage ?? null,
      decidedAt,
      existing.id,
    );

  return {
    ...existing,
    decision: input.decision,
    decisionMessage: input.decisionMessage ?? null,
    decidedAt,
  };
}
