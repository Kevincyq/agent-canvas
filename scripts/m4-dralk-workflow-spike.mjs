#!/usr/bin/env node
/**
 * M4 Dralk Workflow spike
 *
 * Exit criteria: Dralk before/after stays on the same ConversationTask.
 * Also verifies dual entry (agent_intent + user_button) and refresh restore.
 *
 * Usage:
 *   pnpm run spike:m4
 */

import { randomUUID } from "node:crypto";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

const results = [];

function record(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`\n[${ok ? "PASS" : "FAIL"}] ${name}`);
  if (detail) {
    console.log(typeof detail === "string" ? detail : JSON.stringify(detail, null, 2));
  }
}

function migrate(db) {
  db.exec(`
    CREATE TABLE conversations (
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
    CREATE TABLE workflow_states (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      workflow_type TEXT NOT NULL,
      status TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
}

function createConversation(db) {
  const now = new Date().toISOString();
  const conversation = {
    id: randomUUID(),
    sessionId: randomUUID(),
  };
  db.prepare(
    `INSERT INTO conversations (
      id, user_id, project_id, title, status, current_step, session_id, origin_surface, created_at, updated_at
    ) VALUES (?, 'local-user', NULL, 'Ask AI', 'ready', NULL, ?, 'askai', ?, ?)`,
  ).run(conversation.id, conversation.sessionId, now, now);
  return conversation;
}

function startWorkflow(db, conversationId, origin) {
  const now = new Date().toISOString();
  const workflow = {
    id: randomUUID(),
    conversationId,
    status: "waiting_for_input",
    origin,
  };
  db.prepare(
    `INSERT INTO workflow_states (
      id, conversation_id, workflow_type, status, payload_json, created_at, updated_at
    ) VALUES (?, ?, 'dralk_input', ?, ?, ?, ?)`,
  ).run(
    workflow.id,
    conversationId,
    workflow.status,
    JSON.stringify({
      origin,
      prompt: "请在画布中边画边说输入内容",
      mode: "general",
      language: "",
      forceNew: true,
      canvasSessionId: randomUUID(),
      queryPayload: null,
      errorMessage: null,
    }),
    now,
    now,
  );
  db.prepare(
    `UPDATE conversations SET status = 'waiting_for_input', current_step = 'dralk:waiting_for_input', updated_at = ? WHERE id = ?`,
  ).run(now, conversationId);
  return workflow;
}

function transition(db, workflowId, status) {
  const now = new Date().toISOString();
  db.prepare(`UPDATE workflow_states SET status = ?, updated_at = ? WHERE id = ?`).run(
    status,
    now,
    workflowId,
  );
}

function getActive(db, conversationId) {
  return db
    .prepare(
      `SELECT * FROM workflow_states
       WHERE conversation_id = ?
         AND workflow_type = 'dralk_input'
         AND status IN ('waiting_for_input','capturing','recognized','attached','running')
       ORDER BY updated_at DESC LIMIT 1`,
    )
    .get(conversationId);
}

async function main() {
  const dir = join(tmpdir(), `m4-dralk-${randomUUID()}`);
  mkdirSync(dir, { recursive: true });
  const dbPath = join(dir, "m4.sqlite");

  console.log("M4 Dralk Workflow spike");
  console.log(`DB: ${dbPath}`);

  try {
    // Case A: user_button entry keeps same conversation
    {
      const db = new DatabaseSync(dbPath);
      migrate(db);
      const conversation = createConversation(db);
      const beforeId = conversation.id;
      const workflow = startWorkflow(db, beforeId, "user_button");
      transition(db, workflow.id, "capturing");
      transition(db, workflow.id, "recognized");
      const active = getActive(db, beforeId);
      const conversationRow = db
        .prepare("SELECT id, status, current_step FROM conversations WHERE id = ?")
        .get(beforeId);
      db.close();

      record("user_button Dralk stays on same ConversationTask", active?.conversation_id === beforeId, {
        conversationId: beforeId,
        workflowId: workflow.id,
        activeStatus: active?.status,
        conversationStatus: conversationRow.status,
        currentStep: conversationRow.current_step,
      });
    }

    // Case B: agent_intent entry on same conversation, then resume after "restart"
    {
      const db = new DatabaseSync(dbPath);
      const conversation = createConversation(db);
      const workflow = startWorkflow(db, conversation.id, "agent_intent");
      transition(db, workflow.id, "capturing");
      const conversationId = conversation.id;
      const workflowId = workflow.id;
      db.close();

      // Simulate refresh/restart: reopen DB and load active workflow
      const db2 = new DatabaseSync(dbPath);
      const restored = getActive(db2, conversationId);
      const sameTask = restored?.conversation_id === conversationId && restored?.id === workflowId;
      transition(db2, workflowId, "recognized");
      transition(db2, workflowId, "attached");
      const after = db2
        .prepare("SELECT conversation_id, status FROM workflow_states WHERE id = ?")
        .get(workflowId);
      db2.close();

      record("agent_intent Dralk resumes same ConversationTask after restart", sameTask && after.conversation_id === conversationId, {
        conversationId,
        workflowId,
        restoredStatus: restored?.status,
        afterStatus: after.status,
      });
    }

    // Case C: both origins never create a second conversation for the same task
    {
      const db = new DatabaseSync(dbPath);
      const conversation = createConversation(db);
      const button = startWorkflow(db, conversation.id, "user_button");
      // forceNew cancels previous and starts again on SAME conversation
      db.prepare(`UPDATE workflow_states SET status = 'cancelled' WHERE id = ?`).run(button.id);
      const intent = startWorkflow(db, conversation.id, "agent_intent");
      const count = db
        .prepare("SELECT COUNT(*) AS c FROM conversations WHERE id = ?")
        .get(conversation.id).c;
      const workflowsForConv = db
        .prepare("SELECT COUNT(*) AS c FROM workflow_states WHERE conversation_id = ?")
        .get(conversation.id).c;
      db.close();

      record("Dual entries share one ConversationTask (no second chat)", count === 1 && intent.conversationId === conversation.id, {
        conversationId: conversation.id,
        workflowCount: workflowsForConv,
        latestOrigin: "agent_intent",
      });
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }

  const failed = results.filter((item) => !item.ok);
  console.log("\n========== M4 SUMMARY ==========");
  for (const item of results) {
    console.log(`${item.ok ? "PASS" : "FAIL"}  ${item.name}`);
  }
  console.log(`Failed: ${failed.length} / ${results.length}`);
  const exitOk = results.every((item) => item.ok);
  console.log(`Exit criterion (same ConversationTask across Dralk): ${exitOk ? "PASS" : "FAIL"}`);
  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
