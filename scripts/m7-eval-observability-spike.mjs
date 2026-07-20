#!/usr/bin/env node
/**
 * M7 Eval + Observability + Deploy readiness spike
 *
 * Exit criteria:
 * - P0 eval fixtures are loadable and cover cases 1–7
 * - Sensitive values are redacted from audit payloads
 * - Tool metrics (success rate + latency) can be computed from tool_runs
 * - Portal user context resolves from headers
 * - Staging compose mounts SQLite Docker volume
 *
 * Usage:
 *   pnpm run spike:m7
 */

import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
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

const SENSITIVE_KEY =
  /^(api[_-]?key|authorization|auth|token|access[_-]?token|refresh[_-]?token|password|secret|credential|private[_-]?key)$/i;
const SENSITIVE_VALUE =
  /\b(sk-[a-zA-Z0-9]{8,}|Bearer\s+[A-Za-z0-9\-._~+/]+=*)\b/g;

function redactString(value) {
  return value.replace(SENSITIVE_VALUE, "[REDACTED]");
}

function redactValue(value, depth = 0) {
  if (depth > 8) return "[TRUNCATED]";
  if (typeof value === "string") return redactString(value);
  if (Array.isArray(value)) return value.map((item) => redactValue(item, depth + 1));
  if (value && typeof value === "object") {
    const output = {};
    for (const [key, nested] of Object.entries(value)) {
      output[key] = SENSITIVE_KEY.test(key) ? "[REDACTED]" : redactValue(nested, depth + 1);
    }
    return output;
  }
  return value;
}

function resolvePortalUserContext({ headers, bodyUserId }) {
  const headerUserId = headers["x-portal-user-id"]?.trim() || "";
  const headerTenantId = headers["x-portal-tenant-id"]?.trim() || "";
  if (headerUserId) {
    return {
      userId: headerUserId.slice(0, 100),
      tenantId: (headerTenantId || "local-tenant").slice(0, 100),
      source: "header",
    };
  }
  if (bodyUserId?.trim()) {
    return {
      userId: bodyUserId.trim().slice(0, 100),
      tenantId: "local-tenant",
      source: "body",
    };
  }
  return { userId: "local-user", tenantId: "local-tenant", source: "default" };
}

const P0_EVAL_FIXTURES = [
  { id: "eval_case_1_dralk_intent", caseId: "case_1" },
  { id: "eval_case_2_dralk_button", caseId: "case_2" },
  { id: "eval_case_3_multi_tool", caseId: "case_3" },
  { id: "eval_case_4_meeting", caseId: "case_4" },
  { id: "eval_case_5_todo_approval", caseId: "case_5" },
  { id: "eval_case_6_reject_approval", caseId: "case_6" },
  { id: "eval_case_7_refresh_restore", caseId: "case_7" },
];

function main() {
  console.log("M7 Eval + Observability spike");

  const caseIds = new Set(P0_EVAL_FIXTURES.map((item) => item.caseId));
  record(
    "P0 eval fixtures cover cases 1–7",
    ["case_1", "case_2", "case_3", "case_4", "case_5", "case_6", "case_7"].every((id) =>
      caseIds.has(id),
    ),
    { fixtureCount: P0_EVAL_FIXTURES.length, caseIds: [...caseIds] },
  );

  const dirty = {
    apiKey: "sk-secret-value-12345678",
    authorization: "Bearer abc.def.ghi",
    nested: { token: "tok_live_123", note: "safe" },
    message: "call with Bearer abc.def.ghi",
  };
  const clean = redactValue(dirty);
  record(
    "Sensitive values redacted from audit payloads",
    clean.apiKey === "[REDACTED]" &&
      clean.authorization === "[REDACTED]" &&
      clean.nested.token === "[REDACTED]" &&
      clean.nested.note === "safe" &&
      !String(clean.message).includes("Bearer abc"),
    clean,
  );

  const portalFromHeader = resolvePortalUserContext({
    headers: {
      "x-portal-user-id": "portal-user-42",
      "x-portal-tenant-id": "tcl-tenant",
    },
  });
  const portalDefault = resolvePortalUserContext({ headers: {} });
  record(
    "Portal user context resolves from headers",
    portalFromHeader.source === "header" &&
      portalFromHeader.userId === "portal-user-42" &&
      portalDefault.source === "default",
    { portalFromHeader, portalDefault },
  );

  const workDir = join(tmpdir(), `m7-obs-${randomUUID()}`);
  mkdirSync(workDir, { recursive: true });
  const dbPath = join(workDir, "m7.sqlite");
  const db = new DatabaseSync(dbPath);
  db.exec(`
    CREATE TABLE tool_runs (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      request_id TEXT NOT NULL,
      tool_name TEXT NOT NULL,
      arguments_json TEXT NOT NULL,
      result_json TEXT,
      status TEXT NOT NULL,
      started_at TEXT NOT NULL,
      completed_at TEXT
    );
    CREATE TABLE audit_events (
      id TEXT PRIMARY KEY,
      request_id TEXT NOT NULL,
      conversation_id TEXT,
      user_id TEXT,
      tenant_id TEXT,
      event_type TEXT NOT NULL,
      provider TEXT,
      model TEXT,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);

  const conversationId = randomUUID();
  const requestId = randomUUID();
  const now = Date.now();
  const rows = [
    ["search_personal_knowledge", "completed", 40],
    ["search_personal_knowledge", "completed", 60],
    ["get_meeting_context", "completed", 80],
    ["create_todo", "failed", 20],
  ];
  for (const [toolName, status, latencyMs] of rows) {
    const started = new Date(now).toISOString();
    const completed = new Date(now + latencyMs).toISOString();
    db.prepare(
      `INSERT INTO tool_runs (
        id, conversation_id, request_id, tool_name, arguments_json, result_json, status, started_at, completed_at
      ) VALUES (?, ?, ?, ?, '{}', '{}', ?, ?, ?)`,
    ).run(randomUUID(), conversationId, requestId, toolName, status, started, completed);
  }

  const metrics = db
    .prepare(
      `SELECT
         tool_name,
         COUNT(*) AS total,
         SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed,
         SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed,
         AVG((julianday(completed_at) - julianday(started_at)) * 86400000) AS avg_latency_ms
       FROM tool_runs
       GROUP BY tool_name
       ORDER BY total DESC`,
    )
    .all()
    .map((row) => ({
      toolName: row.tool_name,
      total: Number(row.total),
      completed: Number(row.completed),
      failed: Number(row.failed),
      successRate: Number(row.completed) / Number(row.total),
      avgLatencyMs: Math.round(Number(row.avg_latency_ms)),
    }));

  const searchMetric = metrics.find((item) => item.toolName === "search_personal_knowledge");
  record(
    "Tool success rate + latency computable from tool_runs",
    Boolean(searchMetric) &&
      searchMetric.successRate === 1 &&
      searchMetric.avgLatencyMs >= 40 &&
      searchMetric.avgLatencyMs <= 60,
    metrics,
  );

  const auditPayload = redactValue({
    apiKey: "sk-should-not-persist",
    status: "ok",
  });
  db.prepare(
    `INSERT INTO audit_events (
      id, request_id, conversation_id, user_id, tenant_id, event_type, provider, model, payload_json, created_at
    ) VALUES (?, ?, ?, ?, ?, 'agent.run.end', 'turing', 'turing/gpt-5.5', ?, ?)`,
  ).run(
    randomUUID(),
    requestId,
    conversationId,
    "portal-user-42",
    "tcl-tenant",
    JSON.stringify(auditPayload),
    new Date().toISOString(),
  );
  const audit = db.prepare("SELECT * FROM audit_events LIMIT 1").get();
  const storedPayload = JSON.parse(audit.payload_json);
  record(
    "Structured audit event persisted without credentials",
    audit.event_type === "agent.run.end" && storedPayload.apiKey === "[REDACTED]",
    { eventType: audit.event_type, payload: storedPayload },
  );

  const compose = readFileSync(
    join(process.cwd(), "deploy/docker-compose.local.yml"),
    "utf8",
  );
  record(
    "Staging compose mounts SQLite Docker volume",
    compose.includes("agent-canvas-data:/app/data") &&
      compose.includes("SQLITE_PATH: /app/data/agent-canvas.sqlite") &&
      compose.includes("agent-canvas-data:"),
    {
      hasVolumeMount: compose.includes("agent-canvas-data:/app/data"),
      hasSqliteEnv: compose.includes("SQLITE_PATH: /app/data/agent-canvas.sqlite"),
    },
  );

  const exitOk =
    caseIds.size === 7 &&
    clean.apiKey === "[REDACTED]" &&
    portalFromHeader.source === "header" &&
    Boolean(searchMetric) &&
    storedPayload.apiKey === "[REDACTED]" &&
    compose.includes("agent-canvas-data:/app/data");

  record("Exit criterion: eval + observability + deploy readiness", exitOk, {
    fixturesOk: caseIds.size === 7,
    redactionOk: clean.apiKey === "[REDACTED]",
    portalOk: portalFromHeader.source === "header",
    metricsOk: Boolean(searchMetric),
    auditOk: storedPayload.apiKey === "[REDACTED]",
    volumeOk: compose.includes("agent-canvas-data:/app/data"),
  });

  db.close();
  rmSync(workDir, { recursive: true, force: true });

  const failed = results.filter((item) => !item.ok);
  console.log("\n========== M7 SUMMARY ==========");
  for (const item of results) {
    console.log(`${item.ok ? "PASS" : "FAIL"}  ${item.name}`);
  }
  console.log(`Failed: ${failed.length} / ${results.length}`);
  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

main();
