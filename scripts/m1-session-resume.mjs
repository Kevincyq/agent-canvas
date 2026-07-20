#!/usr/bin/env node
/**
 * M1 SQLite Session + Conversation resume spike
 *
 * Exit criteria from ASKAI_AGENT_UPGRADE_PLAN.md:
 * After service restart, the same conversationId can continue Q&A.
 *
 * This script:
 * 1. Exercises SqliteSession CRUD (add/get/pop/clear) against node:sqlite
 * 2. Runs a real Agent turn with Session persistence
 * 3. Closes the DB (simulates process restart)
 * 4. Reopens the same DB + conversationId and continues a follow-up turn
 *
 * Usage:
 *   pnpm run spike:m1
 */

import { randomUUID } from "node:crypto";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { Agent, run, setDefaultOpenAIClient, setOpenAIAPI, setTracingDisabled } from "@openai/agents";
import OpenAI from "openai";

const results = [];

function record(name, ok, detail) {
  results.push({ name, ok, detail });
  const mark = ok ? "PASS" : "FAIL";
  console.log(`\n[${mark}] ${name}`);
  if (detail) {
    console.log(typeof detail === "string" ? detail : JSON.stringify(detail, null, 2));
  }
}

function getConfig() {
  const apiKey = process.env.TURING_API_KEY || process.env.OPENAI_API_KEY;
  const baseURL = (
    process.env.TURING_API_BASE ||
    process.env.OPENAI_BASE_URL ||
    "https://live-turing.cn.llm.tcljd.com/api/v1"
  ).replace(/\/$/, "");
  const model = process.env.TURING_MODEL || process.env.OPENAI_MODEL || "turing/gpt-5.5";
  const apiMode = process.env.OPENAI_API === "responses" ? "responses" : "chat_completions";

  if (!apiKey) {
    throw new Error("Missing TURING_API_KEY or OPENAI_API_KEY");
  }

  return { apiKey, baseURL, model, apiMode };
}

function migrate(db) {
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      project_id TEXT,
      title TEXT NOT NULL,
      status TEXT NOT NULL,
      current_step TEXT,
      session_id TEXT NOT NULL UNIQUE,
      origin_surface TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS session_items (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      sequence_no INTEGER NOT NULL,
      item_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(session_id, sequence_no)
    );
    CREATE TABLE IF NOT EXISTS conversation_messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      blocks_json TEXT,
      actions_json TEXT,
      attachments_json TEXT,
      charts_json TEXT,
      document_json TEXT,
      created_at TEXT NOT NULL,
      sequence_no INTEGER NOT NULL,
      UNIQUE(conversation_id, sequence_no)
    );
  `);
}

class SqliteSession {
  constructor(db, sessionId) {
    this.db = db;
    this.sessionId = sessionId;
  }

  async getSessionId() {
    return this.sessionId;
  }

  async getItems(limit) {
    if (limit !== undefined && limit <= 0) {
      return [];
    }

    if (limit === undefined) {
      return this.db
        .prepare(
          `SELECT item_json FROM session_items WHERE session_id = ? ORDER BY sequence_no ASC`,
        )
        .all(this.sessionId)
        .map((row) => JSON.parse(row.item_json));
    }

    return this.db
      .prepare(
        `SELECT item_json FROM (
           SELECT item_json, sequence_no FROM session_items
           WHERE session_id = ?
           ORDER BY sequence_no DESC
           LIMIT ?
         ) ORDER BY sequence_no ASC`,
      )
      .all(this.sessionId, limit)
      .map((row) => JSON.parse(row.item_json));
  }

  async addItems(items) {
    if (items.length === 0) {
      return;
    }

    this.db.exec("BEGIN");
    try {
      const maxRow = this.db
        .prepare(
          "SELECT COALESCE(MAX(sequence_no), 0) AS max_seq FROM session_items WHERE session_id = ?",
        )
        .get(this.sessionId);
      let sequenceNo = Number(maxRow.max_seq);
      const insert = this.db.prepare(
        `INSERT INTO session_items (id, session_id, sequence_no, item_json, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      );
      const now = new Date().toISOString();
      for (const item of items) {
        sequenceNo += 1;
        insert.run(randomUUID(), this.sessionId, sequenceNo, JSON.stringify(item), now);
      }
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  async popItem() {
    this.db.exec("BEGIN");
    try {
      const row = this.db
        .prepare(
          `SELECT id, item_json FROM session_items
           WHERE session_id = ?
           ORDER BY sequence_no DESC LIMIT 1`,
        )
        .get(this.sessionId);
      if (!row) {
        this.db.exec("COMMIT");
        return undefined;
      }
      this.db.prepare("DELETE FROM session_items WHERE id = ?").run(row.id);
      this.db.exec("COMMIT");
      return JSON.parse(row.item_json);
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  async clearSession() {
    this.db.prepare("DELETE FROM session_items WHERE session_id = ?").run(this.sessionId);
  }
}

function openDb(path) {
  const db = new DatabaseSync(path);
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec("PRAGMA journal_mode = WAL;");
  migrate(db);
  return db;
}

function createConversation(db) {
  const now = new Date().toISOString();
  const conversation = {
    id: randomUUID(),
    sessionId: randomUUID(),
    title: "M1 resume spike",
  };
  db.prepare(
    `INSERT INTO conversations (
      id, user_id, project_id, title, status, current_step, session_id, origin_surface, created_at, updated_at
    ) VALUES (?, ?, NULL, ?, 'ready', NULL, ?, 'spike', ?, ?)`,
  ).run(conversation.id, "local-user", conversation.title, conversation.sessionId, now, now);
  return conversation;
}

function appendMessage(db, conversationId, role, content) {
  const maxRow = db
    .prepare(
      "SELECT COALESCE(MAX(sequence_no), 0) AS max_seq FROM conversation_messages WHERE conversation_id = ?",
    )
    .get(conversationId);
  const sequenceNo = Number(maxRow.max_seq) + 1;
  const id = randomUUID();
  db.prepare(
    `INSERT INTO conversation_messages (
      id, conversation_id, role, content, blocks_json, actions_json,
      attachments_json, charts_json, document_json, created_at, sequence_no
    ) VALUES (?, ?, ?, ?, NULL, NULL, NULL, NULL, NULL, ?, ?)`,
  ).run(id, conversationId, role, content, new Date().toISOString(), sequenceNo);
  return id;
}

async function testSessionCrud(dbPath) {
  const db = openDb(dbPath);
  const session = new SqliteSession(db, randomUUID());

  await session.addItems([
    { role: "user", content: "one" },
    { role: "assistant", content: "two" },
    { role: "user", content: "three" },
  ]);

  const all = await session.getItems();
  const limited = await session.getItems(2);
  const popped = await session.popItem();
  const afterPop = await session.getItems();
  await session.clearSession();
  const cleared = await session.getItems();
  db.close();

  const ok =
    all.length === 3 &&
    limited.length === 2 &&
    limited[0].content === "two" &&
    limited[1].content === "three" &&
    popped?.content === "three" &&
    afterPop.length === 2 &&
    cleared.length === 0;

  record("SqliteSession CRUD (add/get/pop/clear)", ok, {
    all: all.length,
    limited: limited.map((item) => item.content),
    popped: popped?.content,
    afterPop: afterPop.length,
    cleared: cleared.length,
  });
}

async function testRestartResume(dbPath, config) {
  setTracingDisabled(true);
  setOpenAIAPI(config.apiMode);
  setDefaultOpenAIClient(
    new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL,
    }),
  );

  const secretFact = `Nebula-${randomUUID().slice(0, 8)}`;
  let conversationId;
  let sessionId;

  {
    const db = openDb(dbPath);
    const conversation = createConversation(db);
    conversationId = conversation.id;
    sessionId = conversation.sessionId;
    const session = new SqliteSession(db, sessionId);

    const agent = new Agent({
      name: "M1 Resume Agent",
      model: config.model,
      instructions:
        "You are a concise assistant for a local persistence test. When the user asks you to remember a project codename, store it and recall it later. Reply in plain text only.",
    });

    const turn1Input = `我们的演示项目代号是 ${secretFact}。请确认你已记住，只回复：已记住。`;
    appendMessage(db, conversationId, "user", turn1Input);
    const turn1 = await run(agent, turn1Input, { session });
    const turn1Output = String(turn1.finalOutput ?? "");
    appendMessage(db, conversationId, "assistant", turn1Output);

    const itemCountBeforeClose = (await session.getItems()).length;
    db.close();

    record("Turn 1 persisted before restart", itemCountBeforeClose >= 2, {
      conversationId,
      sessionId,
      itemCount: itemCountBeforeClose,
      outputPreview: turn1Output.slice(0, 120),
    });
  }

  // Simulate process restart: new DB handle + same conversation/session ids.
  {
    const db = openDb(dbPath);
    const conversation = db
      .prepare("SELECT id, session_id FROM conversations WHERE id = ?")
      .get(conversationId);

    if (!conversation) {
      record("Conversation survives restart", false, "conversation row missing after reopen");
      db.close();
      return;
    }

    record("Conversation survives restart", true, {
      conversationId: conversation.id,
      sessionId: conversation.session_id,
    });

    const session = new SqliteSession(db, conversation.session_id);
    const history = await session.getItems();
    record("Session items reload after restart", history.length >= 2, {
      itemCount: history.length,
    });

    const agent = new Agent({
      name: "M1 Resume Agent",
      model: config.model,
      instructions:
        "You are a concise assistant for a local persistence test. When the user asks you to remember a project codename, store it and recall it later. Reply in plain text only.",
    });

    const turn2Input = "刚才我说的演示项目代号是什么？只回复代号本身。";
    appendMessage(db, conversationId, "user", turn2Input);
    const turn2 = await run(agent, turn2Input, { session });
    const turn2Output = String(turn2.finalOutput ?? "");
    appendMessage(db, conversationId, "assistant", turn2Output);

    const messageCount = db
      .prepare("SELECT COUNT(*) AS count FROM conversation_messages WHERE conversation_id = ?")
      .get(conversationId).count;

    const remembers = turn2Output.includes(secretFact);
    record("Turn 2 continues same conversationId after restart", remembers, {
      conversationId,
      secretFact,
      turn2Output,
      messageCount,
    });

    db.close();
  }
}

async function main() {
  const config = getConfig();
  const workDir = join(tmpdir(), `m1-session-${randomUUID()}`);
  mkdirSync(workDir, { recursive: true });
  const dbPath = join(workDir, "agent-canvas.sqlite");

  console.log("M1 SQLite Session resume spike");
  console.log(`DB: ${dbPath}`);
  console.log(`Model: ${config.model} via ${config.apiMode}`);

  try {
    await testSessionCrud(dbPath);
    await testRestartResume(dbPath, config);
  } finally {
    try {
      rmSync(workDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  }

  const failed = results.filter((item) => !item.ok);
  console.log("\n========== M1 SUMMARY ==========");
  for (const item of results) {
    console.log(`${item.ok ? "PASS" : "FAIL"}  ${item.name}`);
  }
  console.log(`Failed: ${failed.length} / ${results.length}`);
  console.log(
    `Exit criterion (same conversationId continues after restart): ${
      results.some((item) => item.name.includes("Turn 2") && item.ok) ? "PASS" : "FAIL"
    }`,
  );

  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
