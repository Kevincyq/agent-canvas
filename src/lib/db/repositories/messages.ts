import { randomUUID } from "node:crypto";

import { getDb } from "@/lib/db/client";
import type { AgentAction, AgentAttachment, ChatMessage } from "@/types/agent";
import type { ContentBlock } from "@/types/content-block";
import type { PlotSpec } from "@/types/plot";
import type { ConversationMessageRecord } from "@/types/task";

type MessageRow = {
  id: string;
  conversation_id: string;
  role: string;
  content: string;
  blocks_json: string | null;
  actions_json: string | null;
  attachments_json: string | null;
  charts_json: string | null;
  document_json: string | null;
  evidence_json: string | null;
  artifacts_json: string | null;
  created_at: string;
  sequence_no: number;
};

function parseJson<T>(value: string | null | undefined): T | undefined {
  if (!value) {
    return undefined;
  }
  return JSON.parse(value) as T;
}

function mapMessage(row: MessageRow): ConversationMessageRecord {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    role: row.role as ConversationMessageRecord["role"],
    content: row.content,
    blocksJson: row.blocks_json,
    actionsJson: row.actions_json,
    attachmentsJson: row.attachments_json,
    chartsJson: row.charts_json,
    documentJson: row.document_json,
    evidenceJson: row.evidence_json,
    artifactsJson: row.artifacts_json,
    createdAt: row.created_at,
    sequenceNo: row.sequence_no,
  };
}

export function messageRecordToChatMessage(record: ConversationMessageRecord): ChatMessage {
  return {
    id: record.id,
    role: record.role,
    content: record.content,
    blocks: parseJson<ContentBlock[]>(record.blocksJson ?? null),
    charts: parseJson<PlotSpec[]>(record.chartsJson ?? null),
    attachments: parseJson<AgentAttachment[]>(record.attachmentsJson ?? null),
    document: parseJson<ChatMessage["document"]>(record.documentJson ?? null),
    evidence: parseJson<ChatMessage["evidence"]>(record.evidenceJson ?? null),
    artifacts: parseJson<ChatMessage["artifacts"]>(record.artifactsJson ?? null),
  };
}

export type AppendMessageInput = {
  conversationId: string;
  role: ChatMessage["role"];
  content: string;
  blocks?: ContentBlock[];
  actions?: AgentAction[];
  attachments?: AgentAttachment[];
  charts?: PlotSpec[];
  document?: ChatMessage["document"];
  evidence?: ChatMessage["evidence"];
  artifacts?: ChatMessage["artifacts"];
  id?: string;
};

export function appendConversationMessage(input: AppendMessageInput): ConversationMessageRecord {
  const db = getDb();
  const now = new Date().toISOString();
  const id = input.id ?? randomUUID();

  db.exec("BEGIN");
  try {
    const maxRow = db
      .prepare(
        "SELECT COALESCE(MAX(sequence_no), 0) AS max_seq FROM conversation_messages WHERE conversation_id = ?",
      )
      .get(input.conversationId) as { max_seq: number };
    const sequenceNo = Number(maxRow.max_seq) + 1;

    db.prepare(
      `INSERT INTO conversation_messages (
        id, conversation_id, role, content, blocks_json, actions_json,
        attachments_json, charts_json, document_json, evidence_json, artifacts_json,
        created_at, sequence_no
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      input.conversationId,
      input.role,
      input.content,
      input.blocks ? JSON.stringify(input.blocks) : null,
      input.actions ? JSON.stringify(input.actions) : null,
      input.attachments ? JSON.stringify(input.attachments) : null,
      input.charts ? JSON.stringify(input.charts) : null,
      input.document ? JSON.stringify(input.document) : null,
      input.evidence ? JSON.stringify(input.evidence) : null,
      input.artifacts ? JSON.stringify(input.artifacts) : null,
      now,
      sequenceNo,
    );

    db.prepare("UPDATE conversations SET updated_at = ? WHERE id = ?").run(
      now,
      input.conversationId,
    );

    db.exec("COMMIT");

    return {
      id,
      conversationId: input.conversationId,
      role: input.role,
      content: input.content,
      blocksJson: input.blocks ? JSON.stringify(input.blocks) : null,
      actionsJson: input.actions ? JSON.stringify(input.actions) : null,
      attachmentsJson: input.attachments ? JSON.stringify(input.attachments) : null,
      chartsJson: input.charts ? JSON.stringify(input.charts) : null,
      documentJson: input.document ? JSON.stringify(input.document) : null,
      evidenceJson: input.evidence ? JSON.stringify(input.evidence) : null,
      artifactsJson: input.artifacts ? JSON.stringify(input.artifacts) : null,
      createdAt: now,
      sequenceNo,
    };
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function listConversationMessages(conversationId: string): ConversationMessageRecord[] {
  const rows = getDb()
    .prepare(
      `SELECT * FROM conversation_messages
       WHERE conversation_id = ?
       ORDER BY sequence_no ASC`,
    )
    .all(conversationId) as MessageRow[];

  return rows.map(mapMessage);
}

export function listConversationChatMessages(conversationId: string): ChatMessage[] {
  return listConversationMessages(conversationId).map(messageRecordToChatMessage);
}
