import { randomUUID } from "node:crypto";

import { getDb } from "@/lib/db/client";
import { redactValue } from "@/lib/observability/redact";

export type AuditEventType =
  | "agent.run.start"
  | "agent.run.end"
  | "agent.resume.start"
  | "agent.resume.end"
  | "tool.run"
  | "approval.decide"
  | "eval.check";

export type AuditEventInput = {
  requestId: string;
  conversationId?: string | null;
  userId?: string | null;
  tenantId?: string | null;
  eventType: AuditEventType;
  provider?: string | null;
  model?: string | null;
  payload?: Record<string, unknown>;
};

export type AuditEventRecord = {
  id: string;
  requestId: string;
  conversationId: string | null;
  userId: string | null;
  tenantId: string | null;
  eventType: string;
  provider: string | null;
  model: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
};

export function writeAuditEvent(input: AuditEventInput): AuditEventRecord {
  const id = randomUUID();
  const createdAt = new Date().toISOString();
  const payload = (redactValue(input.payload ?? {}) ?? {}) as Record<string, unknown>;

  getDb()
    .prepare(
      `INSERT INTO audit_events (
        id, request_id, conversation_id, user_id, tenant_id, event_type,
        provider, model, payload_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      input.requestId,
      input.conversationId ?? null,
      input.userId ?? null,
      input.tenantId ?? null,
      input.eventType,
      input.provider ?? null,
      input.model ?? null,
      JSON.stringify(payload),
      createdAt,
    );

  // Structured console line for staging log aggregation.
  console.info(
    JSON.stringify({
      level: "info",
      kind: "audit",
      id,
      requestId: input.requestId,
      conversationId: input.conversationId ?? null,
      userId: input.userId ?? null,
      tenantId: input.tenantId ?? null,
      eventType: input.eventType,
      provider: input.provider ?? null,
      model: input.model ?? null,
      payload,
      createdAt,
    }),
  );

  return {
    id,
    requestId: input.requestId,
    conversationId: input.conversationId ?? null,
    userId: input.userId ?? null,
    tenantId: input.tenantId ?? null,
    eventType: input.eventType,
    provider: input.provider ?? null,
    model: input.model ?? null,
    payload,
    createdAt,
  };
}

export function listAuditEvents(
  principal: { userId: string; tenantId: string },
  limit = 50,
): AuditEventRecord[] {
  const rows = getDb()
    .prepare(
      `SELECT * FROM audit_events
       WHERE user_id = ? AND tenant_id = ?
       ORDER BY created_at DESC
       LIMIT ?`,
    )
    .all(
      principal.userId,
      principal.tenantId,
      Math.min(Math.max(limit, 1), 200),
    ) as Array<{
    id: string;
    request_id: string;
    conversation_id: string | null;
    user_id: string | null;
    tenant_id: string | null;
    event_type: string;
    provider: string | null;
    model: string | null;
    payload_json: string;
    created_at: string;
  }>;

  return rows.map((row) => ({
    id: row.id,
    requestId: row.request_id,
    conversationId: row.conversation_id,
    userId: row.user_id,
    tenantId: row.tenant_id,
    eventType: row.event_type,
    provider: row.provider,
    model: row.model,
    payload: JSON.parse(row.payload_json) as Record<string, unknown>,
    createdAt: row.created_at,
  }));
}
