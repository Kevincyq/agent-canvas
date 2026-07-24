import { randomUUID } from "node:crypto";

import { getDb } from "@/lib/db/client";
import type {
  ConversationStatus,
  ConversationTask,
  CreateConversationRequest,
  PatchConversationRequest,
} from "@/types/task";

type ConversationRow = {
  id: string;
  user_id: string;
  tenant_id: string;
  project_id: string | null;
  title: string;
  status: string;
  current_step: string | null;
  session_id: string;
  origin_surface: string | null;
  created_at: string;
  updated_at: string;
};

function mapConversation(row: ConversationRow): ConversationTask {
  return {
    id: row.id,
    userId: row.user_id,
    tenantId: row.tenant_id,
    projectId: row.project_id,
    title: row.title,
    status: row.status as ConversationStatus,
    currentStep: row.current_step,
    sessionId: row.session_id,
    originSurface: row.origin_surface,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createConversation(
  input: CreateConversationRequest = {},
): ConversationTask {
  const db = getDb();
  const now = new Date().toISOString();
  const conversation: ConversationTask = {
    id: randomUUID(),
    userId: input.userId ?? "local-user",
    tenantId: input.tenantId ?? "local-tenant",
    projectId: input.projectId ?? null,
    title: input.title ?? "New task",
    status: "ready",
    currentStep: null,
    sessionId: randomUUID(),
    originSurface: input.originSurface ?? "askai",
    createdAt: now,
    updatedAt: now,
  };

  db.prepare(
    `INSERT INTO conversations (
      id, user_id, tenant_id, project_id, title, status, current_step, session_id, origin_surface, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    conversation.id,
    conversation.userId,
    conversation.tenantId,
    conversation.projectId,
    conversation.title,
    conversation.status,
    conversation.currentStep,
    conversation.sessionId,
    conversation.originSurface,
    conversation.createdAt,
    conversation.updatedAt,
  );

  return conversation;
}

export function getConversationById(id: string): ConversationTask | null {
  const row = getDb()
    .prepare("SELECT * FROM conversations WHERE id = ?")
    .get(id) as ConversationRow | undefined;

  return row ? mapConversation(row) : null;
}

export function listConversations(
  userId = "local-user",
  tenantId = "local-tenant",
  limit = 50,
): ConversationTask[] {
  const rows = getDb()
    .prepare(
      `SELECT * FROM conversations
       WHERE user_id = ? AND tenant_id = ?
       ORDER BY updated_at DESC
       LIMIT ?`,
    )
    .all(userId, tenantId, limit) as ConversationRow[];

  return rows.map(mapConversation);
}

export function updateConversation(
  id: string,
  patch: PatchConversationRequest & { status?: ConversationStatus; currentStep?: string | null },
): ConversationTask | null {
  const existing = getConversationById(id);
  if (!existing) {
    return null;
  }

  const updated: ConversationTask = {
    ...existing,
    title: patch.title ?? existing.title,
    status: patch.status ?? existing.status,
    currentStep:
      patch.currentStep !== undefined ? patch.currentStep : existing.currentStep,
    projectId: patch.projectId !== undefined ? patch.projectId : existing.projectId,
    updatedAt: new Date().toISOString(),
  };

  getDb()
    .prepare(
      `UPDATE conversations
       SET title = ?, status = ?, current_step = ?, project_id = ?, updated_at = ?
       WHERE id = ?`,
    )
    .run(
      updated.title,
      updated.status,
      updated.currentStep,
      updated.projectId,
      updated.updatedAt,
      updated.id,
    );

  return updated;
}

export function touchConversation(id: string, status?: ConversationStatus): ConversationTask | null {
  return updateConversation(id, status ? { status } : {});
}

export function ensureConversation(
  conversationId: string | undefined,
  options: CreateConversationRequest = {},
): ConversationTask {
  if (conversationId) {
    const existing = getConversationById(conversationId);
    if (!existing) {
      throw new Error(`Conversation not found: ${conversationId}`);
    }
    if (options.userId && existing.userId !== options.userId) {
      throw new Error("Conversation access denied for current user");
    }
    if (options.tenantId && existing.tenantId !== options.tenantId) {
      throw new Error("Conversation access denied for current tenant");
    }
    return existing;
  }

  return createConversation(options);
}
