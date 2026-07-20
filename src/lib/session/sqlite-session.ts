import { randomUUID } from "node:crypto";
import type { AgentInputItem, Session } from "@openai/agents";

import { getDb } from "@/lib/db/client";

type SessionItemRow = {
  id: string;
  session_id: string;
  sequence_no: number;
  item_json: string;
  created_at: string;
};

export type SqliteSessionOptions = {
  sessionId: string;
};

/**
 * OpenAI Agents JS Session backed by SQLite `session_items`.
 * Implements the 0.13.2 Session contract used by `run(..., { session })`.
 */
export class SqliteSession implements Session {
  private readonly sessionId: string;

  constructor(options: SqliteSessionOptions) {
    if (!options.sessionId) {
      throw new Error("SqliteSession requires sessionId");
    }
    this.sessionId = options.sessionId;
  }

  async getSessionId(): Promise<string> {
    return this.sessionId;
  }

  async getItems(limit?: number): Promise<AgentInputItem[]> {
    const db = getDb();

    if (limit !== undefined && limit <= 0) {
      return [];
    }

    if (limit === undefined) {
      const rows = db
        .prepare(
          `SELECT item_json FROM session_items
           WHERE session_id = ?
           ORDER BY sequence_no ASC`,
        )
        .all(this.sessionId) as Array<{ item_json: string }>;

      return rows.map((row) => JSON.parse(row.item_json) as AgentInputItem);
    }

    const rows = db
      .prepare(
        `SELECT item_json FROM (
           SELECT item_json, sequence_no FROM session_items
           WHERE session_id = ?
           ORDER BY sequence_no DESC
           LIMIT ?
         )
         ORDER BY sequence_no ASC`,
      )
      .all(this.sessionId, limit) as Array<{ item_json: string }>;

    return rows.map((row) => JSON.parse(row.item_json) as AgentInputItem);
  }

  async addItems(items: AgentInputItem[]): Promise<void> {
    if (items.length === 0) {
      return;
    }

    const db = getDb();
    const now = new Date().toISOString();

    db.exec("BEGIN");
    try {
      const maxRow = db
        .prepare(
          "SELECT COALESCE(MAX(sequence_no), 0) AS max_seq FROM session_items WHERE session_id = ?",
        )
        .get(this.sessionId) as { max_seq: number };

      let sequenceNo = Number(maxRow.max_seq);
      const insert = db.prepare(
        `INSERT INTO session_items (id, session_id, sequence_no, item_json, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      );

      for (const item of items) {
        sequenceNo += 1;
        insert.run(
          randomUUID(),
          this.sessionId,
          sequenceNo,
          JSON.stringify(item),
          now,
        );
      }

      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }

  async popItem(): Promise<AgentInputItem | undefined> {
    const db = getDb();

    db.exec("BEGIN");
    try {
      const row = db
        .prepare(
          `SELECT id, item_json FROM session_items
           WHERE session_id = ?
           ORDER BY sequence_no DESC
           LIMIT 1`,
        )
        .get(this.sessionId) as SessionItemRow | undefined;

      if (!row) {
        db.exec("COMMIT");
        return undefined;
      }

      db.prepare("DELETE FROM session_items WHERE id = ?").run(row.id);
      db.exec("COMMIT");
      return JSON.parse(row.item_json) as AgentInputItem;
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }

  async clearSession(): Promise<void> {
    getDb()
      .prepare("DELETE FROM session_items WHERE session_id = ?")
      .run(this.sessionId);
  }
}
