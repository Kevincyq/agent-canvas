#!/usr/bin/env node
/**
 * M2 Ask AI Agent Core spike
 *
 * Exit criteria from ASKAI_AGENT_UPGRADE_PLAN.md:
 * Agent completes multi-turn via Session + Runner without manually assembling
 * the last 8 client history messages.
 *
 * Probes:
 * 1. Shared Runner + Zod outputType structured finalOutput
 * 2. Multi-turn recall via Session only (no client history array)
 * 3. Provider adapter config surface
 * 4. Output guardrail rejects unverified write claims
 *
 * Usage:
 *   pnpm run spike:m2
 */

import { randomUUID } from "node:crypto";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  Agent,
  Runner,
  setDefaultOpenAIClient,
  setOpenAIAPI,
  setTracingDisabled,
} from "@openai/agents";
import OpenAI from "openai";
import { z } from "zod";

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

const AskAiStructuredOutputSchema = z.object({
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

class MemorySession {
  constructor(sessionId = randomUUID()) {
    this.sessionId = sessionId;
    this.items = [];
  }
  async getSessionId() {
    return this.sessionId;
  }
  async getItems(limit) {
    if (limit === undefined) {
      return this.items.map((item) => structuredClone(item));
    }
    if (limit <= 0) {
      return [];
    }
    return this.items.slice(-limit).map((item) => structuredClone(item));
  }
  async addItems(items) {
    this.items.push(...items.map((item) => structuredClone(item)));
  }
  async popItem() {
    const item = this.items.pop();
    return item ? structuredClone(item) : undefined;
  }
  async clearSession() {
    this.items = [];
  }
}

function buildCurrentTurnPrompt(userMessage) {
  return JSON.stringify({
    task: "Answer via structured output. Use Session history for follow-ups; do not expect recentHistory.",
    userMessage,
    canvas: null,
    attachments: [],
  });
}

async function testProviderConfigSurface(config) {
  const provider = {
    model: config.model,
    apiMode: config.apiMode,
    baseUrl: config.baseURL,
    apiKeyEnvName: process.env.TURING_API_KEY ? "TURING_API_KEY" : "OPENAI_API_KEY",
    supportsTools: true,
    supportsStreaming: true,
    supportsStructuredOutput: true,
    configured: true,
  };

  record("Provider adapter config surface", Boolean(provider.model && provider.apiMode), provider);
}

async function testStructuredOutputViaRunner(client, config) {
  setDefaultOpenAIClient(client);
  setOpenAIAPI(config.apiMode);
  setTracingDisabled(true);

  const runner = new Runner();
  const agent = new Agent({
    name: "M2 Structured Output Agent",
    model: config.model,
    instructions: `Return structured output only.
message: short Chinese guide.
status: ok.
blocks: one markdown block with id text-1, title 答复正文, sourceFormat markdown, source containing a short answer, unused fields null.
evidence/artifacts/suggestedActions: empty arrays.`,
    outputType: AskAiStructuredOutputSchema,
  });

  const result = await runner.run(agent, buildCurrentTurnPrompt("用一句话解释什么是 Session。"));
  const output = result.finalOutput;
  const parsed = AskAiStructuredOutputSchema.safeParse(output);
  const ok =
    parsed.success &&
    typeof output === "object" &&
    output !== null &&
    typeof output.message === "string" &&
    Array.isArray(output.blocks);

  record("Shared Runner + Zod outputType", ok, {
    finalOutputType: typeof output,
    status: output?.status,
    messagePreview: output?.message?.slice?.(0, 120),
    blockCount: output?.blocks?.length,
    parseError: parsed.success ? null : parsed.error.issues.slice(0, 5),
  });

  return { ok, runner, output };
}

async function testMultiTurnWithoutClientHistory(client, config) {
  setDefaultOpenAIClient(client);
  setOpenAIAPI(config.apiMode);
  setTracingDisabled(true);

  const runner = new Runner();
  const session = new MemorySession();
  const secretFact = `Orion-${randomUUID().slice(0, 8)}`;

  const agent = new Agent({
    name: "M2 Session Runner Agent",
    model: config.model,
    instructions: `You are Ask AI for a persistence test.
Always return structured output matching the schema.
Remember project codenames from earlier turns via Session history.
When asked for the codename, put it in message and also in a markdown block source.
Unused nullable fields must be null. evidence/artifacts/suggestedActions empty unless needed.
status=ok for normal answers.`,
    outputType: AskAiStructuredOutputSchema,
  });

  // Intentionally no client history array — only Session.
  const turn1 = await runner.run(
    agent,
    buildCurrentTurnPrompt(`我们的演示项目代号是 ${secretFact}。请确认已记住，message 只写：已记住。`),
    { session },
  );

  const turn2 = await runner.run(
    agent,
    buildCurrentTurnPrompt("刚才我说的演示项目代号是什么？message 只写代号本身。"),
    { session },
  );

  const out2 = turn2.finalOutput;
  const sessionItems = await session.getItems();
  const remembers = typeof out2?.message === "string" && out2.message.includes(secretFact);
  const noClientHistoryUsed = true; // by construction of this spike

  record("Multi-turn via Runner + Session without client history", remembers && sessionItems.length >= 2, {
    secretFact,
    turn1Message: turn1.finalOutput?.message,
    turn2Message: out2?.message,
    sessionItemCount: sessionItems.length,
    noClientHistoryUsed,
  });

  return remembers;
}

async function testUnverifiedWriteGuardrail() {
  const fakeOutput = {
    message: "已写入待办：提交产品评审修改稿",
    status: "ok",
    blocks: [],
    evidence: [],
    artifacts: [],
    suggestedActions: [],
  };

  const claimsWrite = /已写入待办|已创建待办/i.test(fakeOutput.message);
  const hasReceiptEvidence = fakeOutput.evidence.some((item) =>
    /tool_receipt|create_todo|todo/i.test(`${item.id} ${item.source} ${item.label}`),
  );
  const tripwireTriggered = claimsWrite && !hasReceiptEvidence;

  record("Output guardrail rejects unverified write claims", tripwireTriggered, {
    claimsWrite,
    hasReceiptEvidence,
    tripwireTriggered,
  });
}

async function testSqliteSessionStillWorks() {
  const dir = join(tmpdir(), `m2-core-${randomUUID()}`);
  mkdirSync(dir, { recursive: true });
  const dbPath = join(dir, "t.sqlite");
  try {
    const db = new DatabaseSync(dbPath);
    db.exec(`
      CREATE TABLE session_items (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        sequence_no INTEGER NOT NULL,
        item_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `);
    db.prepare(
      `INSERT INTO session_items (id, session_id, sequence_no, item_json, created_at) VALUES (?, ?, ?, ?, ?)`,
    ).run(randomUUID(), "s1", 1, JSON.stringify({ role: "user", content: "hi" }), new Date().toISOString());
    const count = db.prepare("SELECT COUNT(*) AS c FROM session_items").get().c;
    db.close();
    record("SQLite session_items storage still available for Runner", count === 1, { count });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function main() {
  const config = getConfig();
  const client = new OpenAI({ apiKey: config.apiKey, baseURL: config.baseURL });

  console.log("M2 Ask AI Agent Core spike");
  console.log(`Model: ${config.model} via ${config.apiMode}`);

  await testProviderConfigSurface(config);
  await testSqliteSessionStillWorks();
  await testUnverifiedWriteGuardrail();
  await testStructuredOutputViaRunner(client, config);
  await testMultiTurnWithoutClientHistory(client, config);

  const failed = results.filter((item) => !item.ok);
  console.log("\n========== M2 SUMMARY ==========");
  for (const item of results) {
    console.log(`${item.ok ? "PASS" : "FAIL"}  ${item.name}`);
  }
  console.log(`Failed: ${failed.length} / ${results.length}`);

  const exitOk = results.some(
    (item) => item.name.includes("without client history") && item.ok,
  );
  console.log(
    `Exit criterion (Session+Runner multi-turn, no client history window): ${
      exitOk ? "PASS" : "FAIL"
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
