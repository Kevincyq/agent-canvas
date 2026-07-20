#!/usr/bin/env node
/**
 * M5 Approval + RunState Resume spike
 *
 * Exit criteria: after refresh/restart, approve Mock ToDo and resume the
 * original task (interruptions → serialize → reopen DB → approve → resume).
 *
 * Usage:
 *   pnpm run spike:m5
 */

import { randomUUID } from "node:crypto";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  Agent,
  Runner,
  RunContext,
  RunState,
  setDefaultOpenAIClient,
  setOpenAIAPI,
  setTracingDisabled,
  tool,
} from "@openai/agents";
import OpenAI from "openai";
import { z } from "zod";

const results = [];

function record(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`\n[${ok ? "PASS" : "FAIL"}] ${name}`);
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

const OutputSchema = z.object({
  message: z.string(),
  status: z.enum(["ok", "needs_input", "needs_approval", "failed"]),
  blocks: z.array(
    z.object({
      id: z.string(),
      type: z.enum(["markdown", "table", "mermaid", "latex", "graph", "media"]),
      title: z.string().nullable(),
      sourceFormat: z.string().nullable(),
      source: z.string().nullable(),
      diagramType: z.string().nullable(),
      columns: z.array(z.string()).nullable(),
      rows: z.array(z.array(z.string())).nullable(),
      nodes: z
        .array(
          z.object({
            id: z.string(),
            label: z.string(),
            x: z.number().nullable(),
            y: z.number().nullable(),
          }),
        )
        .nullable(),
      edges: z
        .array(
          z.object({
            source: z.string(),
            target: z.string(),
            label: z.string().nullable(),
          }),
        )
        .nullable(),
      alt: z.string().nullable(),
    }),
  ),
  evidence: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      source: z.string(),
    }),
  ),
  artifacts: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      artifactType: z.string(),
    }),
  ),
  suggestedActions: z.array(
    z.object({
      type: z.enum(["open_handwriting_canvas", "render_chart", "reply", "none"]),
      mode: z.enum(["general", "structure"]).nullable(),
      language: z.string().nullable(),
      prompt: z.string().nullable(),
      forceNew: z.boolean().nullable(),
      chartKind: z.enum(["function", "line", "bar", "scatter"]).nullable(),
      chartTitle: z.string().nullable(),
      chartExpression: z.string().nullable(),
      replyMessage: z.string().nullable(),
    }),
  ),
});

function extractCallId(item) {
  const raw = item?.rawItem ?? {};
  if (raw.callId) return raw.callId;
  if (raw.id) return raw.id;
  return `${item?.name ?? "tool"}_${String(item?.arguments ?? "args").slice(0, 24)}`;
}

function openDb(path) {
  const db = new DatabaseSync(path);
  db.exec(`
    CREATE TABLE conversations (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE run_states (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      state_json TEXT NOT NULL,
      reason TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      resolved_at TEXT
    );
    CREATE TABLE approvals (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      run_state_id TEXT NOT NULL,
      call_id TEXT NOT NULL,
      tool_name TEXT NOT NULL,
      arguments_json TEXT NOT NULL,
      risk_level TEXT NOT NULL,
      decision TEXT,
      decision_message TEXT,
      created_at TEXT NOT NULL,
      decided_at TEXT
    );
  `);
  return db;
}

function persistInterruption(db, conversationId, stateJson, interruption) {
  const now = new Date().toISOString();
  const runStateId = randomUUID();
  const approvalId = randomUUID();
  const callId = extractCallId(interruption);
  const toolName = interruption.name ?? interruption.toolName ?? "create_todo";

  db.prepare(
    `INSERT INTO run_states (
      id, conversation_id, state_json, reason, status, created_at, resolved_at
    ) VALUES (?, ?, ?, 'tool_approval', 'pending', ?, NULL)`,
  ).run(runStateId, conversationId, stateJson, now);

  db.prepare(
    `INSERT INTO approvals (
      id, conversation_id, run_state_id, call_id, tool_name, arguments_json,
      risk_level, decision, decision_message, created_at, decided_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'L2', NULL, NULL, ?, NULL)`,
  ).run(
    approvalId,
    conversationId,
    runStateId,
    callId,
    toolName,
    interruption.arguments ?? "{}",
    now,
  );

  db.prepare(`UPDATE conversations SET status = 'waiting_for_approval' WHERE id = ?`).run(
    conversationId,
  );

  return { runStateId, approvalId, callId, toolName };
}

async function main() {
  const config = getConfig();
  const client = new OpenAI({ apiKey: config.apiKey, baseURL: config.baseURL });
  setDefaultOpenAIClient(client);
  setOpenAIAPI(config.apiMode);
  setTracingDisabled(true);

  const workDir = join(tmpdir(), `m5-approval-${randomUUID()}`);
  mkdirSync(workDir, { recursive: true });
  const dbPath = join(workDir, "approval.sqlite");
  let db = openDb(dbPath);

  const conversationId = randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO conversations (id, title, status, created_at) VALUES (?, ?, 'ready', ?)`,
  ).run(conversationId, "M5 Approval Spike", now);

  const todoWrites = [];

  const createTodo = tool({
    name: "create_todo",
    description: "Create a mock ToDo item. Requires human approval before write.",
    parameters: z.object({
      title: z.string(),
      dueAt: z.string().nullable(),
      projectId: z.string().nullable(),
    }),
    strict: true,
    needsApproval: true,
    execute: async ({ title, dueAt, projectId }) => {
      const receipt = {
        ok: true,
        tool: "create_todo",
        executionId: `todo_${randomUUID().slice(0, 8)}`,
        data: {
          written: true,
          title,
          dueAt,
          projectId: projectId || "proj_launch_prep_001",
          todoId: `todo_${randomUUID().slice(0, 8)}`,
        },
        verifiedAt: new Date().toISOString(),
      };
      todoWrites.push(receipt);
      return receipt;
    },
  });

  const runner = new Runner();
  const agent = new Agent({
    name: "M5 Approval Agent",
    model: config.model,
    instructions: `You are Ask AI with a create_todo tool that requires approval.
For this task you MUST call create_todo exactly once with a concrete Chinese title
about preparing the product launch review.
Do not invent a written result before the tool returns.
After the tool succeeds, return structured output with status=ok and mention written=true.
Unused nullable fields = null.`,
    outputType: OutputSchema,
    tools: [createTodo],
  });

  console.log("M5 Approval + RunState Resume spike");
  console.log(`Model: ${config.model} via ${config.apiMode}`);

  try {
    const first = await runner.run(
      agent,
      JSON.stringify({
        task: "Propose one action item and create a Mock ToDo",
        userMessage: "请创建一条待办：准备下午新品发布评审会的行动项清单。",
      }),
      {
        context: { conversationId, requestId: randomUUID() },
        maxTurns: 8,
      },
    );

    const interruptions = first.interruptions ?? [];
    record("Agent paused on needsApproval interruption", interruptions.length > 0, {
      interruptionCount: interruptions.length,
      toolNames: interruptions.map((item) => item.name ?? item.toolName),
    });

    if (interruptions.length === 0) {
      throw new Error("Expected create_todo interruption; got none");
    }

    const serialized = first.state.toString();
    const persisted = persistInterruption(db, conversationId, serialized, interruptions[0]);
    record("RunState + Approval persisted to SQLite", Boolean(persisted.runStateId), persisted);

    // Simulate restart: close DB and reopen from the same file.
    db.close();
    db = new DatabaseSync(dbPath);

    const restoredRun = db
      .prepare(`SELECT * FROM run_states WHERE id = ?`)
      .get(persisted.runStateId);
    const restoredApproval = db
      .prepare(`SELECT * FROM approvals WHERE run_state_id = ? AND decision IS NULL`)
      .get(persisted.runStateId);
    const restoredConversation = db
      .prepare(`SELECT * FROM conversations WHERE id = ?`)
      .get(conversationId);

    record("After reopen: pending RunState + Approval restored", Boolean(restoredRun && restoredApproval), {
      runStateStatus: restoredRun?.status,
      approvalCallId: restoredApproval?.call_id,
      conversationStatus: restoredConversation?.status,
      stateJsonBytes: restoredRun?.state_json?.length ?? 0,
    });

    const agentContext = { conversationId, requestId: randomUUID() };
    const state = await RunState.fromStringWithContext(
      agent,
      restoredRun.state_json,
      new RunContext(agentContext),
    );

    const resumedInterruptions = state.getInterruptions();
    const match = resumedInterruptions.find(
      (item) => extractCallId(item) === restoredApproval.call_id,
    );
    record("Rehydrated RunState exposes matching interruption", Boolean(match), {
      resumedCount: resumedInterruptions.length,
      expectedCallId: restoredApproval.call_id,
      callIds: resumedInterruptions.map(extractCallId),
    });

    if (!match) {
      throw new Error("Could not find interruption after reopen");
    }

    state.approve(match);
    const decidedAt = new Date().toISOString();
    db.prepare(
      `UPDATE approvals SET decision = 'approve', decision_message = ?, decided_at = ? WHERE id = ?`,
    ).run("spike approve", decidedAt, restoredApproval.id);
    db.prepare(`UPDATE run_states SET state_json = ? WHERE id = ?`).run(
      state.toString(),
      restoredRun.id,
    );

    // Idempotency: deciding again must not create a second approval row.
    const approvalCountBefore = db
      .prepare(`SELECT COUNT(*) AS c FROM approvals WHERE run_state_id = ?`)
      .get(restoredRun.id).c;
    const already = db
      .prepare(`SELECT * FROM approvals WHERE id = ?`)
      .get(restoredApproval.id);
    record("Approval decision is idempotent by callId (single row)", approvalCountBefore === 1 && already.decision === "approve", {
      approvalCountBefore,
      decision: already.decision,
    });

    const second = await runner.run(agent, state, {
      context: agentContext,
      maxTurns: 8,
    });

    const written = todoWrites.some((item) => item?.data?.written === true);
    record("After approve+resume: Mock ToDo executed with written=true", written, {
      todoWriteCount: todoWrites.length,
      receipts: todoWrites.map((item) => item.data),
      finalStatus: second.finalOutput?.status,
      messagePreview: second.finalOutput?.message?.slice?.(0, 180),
      remainingInterruptions: second.interruptions?.length ?? 0,
    });

    if ((second.interruptions?.length ?? 0) === 0) {
      db.prepare(
        `UPDATE run_states SET status = 'resolved', resolved_at = ? WHERE id = ?`,
      ).run(new Date().toISOString(), restoredRun.id);
      db.prepare(`UPDATE conversations SET status = 'ready' WHERE id = ?`).run(conversationId);
    }

    const exitOk =
      interruptions.length > 0 &&
      Boolean(restoredRun && restoredApproval) &&
      Boolean(match) &&
      written &&
      Boolean(second.finalOutput?.message);

    record("Exit criterion: restart then approve Mock ToDo and resume", exitOk, {
      interruptionPaused: interruptions.length > 0,
      restoredAfterReopen: Boolean(restoredRun && restoredApproval),
      written,
      finalMessage: Boolean(second.finalOutput?.message),
    });
  } finally {
    try {
      db.close();
    } catch {
      // already closed
    }
    rmSync(workDir, { recursive: true, force: true });
  }

  const failed = results.filter((item) => !item.ok);
  console.log("\n========== M5 SUMMARY ==========");
  for (const item of results) {
    console.log(`${item.ok ? "PASS" : "FAIL"}  ${item.name}`);
  }
  console.log(`Failed: ${failed.length} / ${results.length}`);
  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
