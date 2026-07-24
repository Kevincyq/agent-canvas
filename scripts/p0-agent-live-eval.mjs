#!/usr/bin/env node

import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

const port = Number(process.env.AGENT_EVAL_PORT || "3317");
const baseUrl = `http://127.0.0.1:${port}`;
const workDir = join(tmpdir(), `agent-canvas-p0-eval-${randomUUID()}`);
const dbPath = join(workDir, "eval.sqlite");
const principalHeaders = {
  "Content-Type": "application/json",
  "x-portal-user-id": "eval-user",
  "x-portal-tenant-id": "eval-tenant",
};
const serverOutput = [];

function assert(condition, message, detail) {
  if (!condition) {
    const suffix = detail === undefined ? "" : `\n${JSON.stringify(detail, null, 2)}`;
    throw new Error(`${message}${suffix}`);
  }
  console.log(`[PASS] ${message}`);
}

async function waitForServer() {
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) {
        return;
      }
    } catch {
      // Server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  throw new Error(`Next.js eval server did not start.\n${serverOutput.slice(-20).join("")}`);
}

async function post(path, body, headers = principalHeaders) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(`${path} returned ${response.status}: ${JSON.stringify(payload)}`);
  }
  return payload;
}

async function runAgent(message, conversationId) {
  return post("/api/agent/run", {
    conversationId,
    message,
    attachments: [],
  });
}

async function createConversation(title) {
  const created = await post("/api/conversations", { title, originSurface: "askai" });
  return created.conversation.id;
}

function toolRuns(db, conversationId) {
  return db
    .prepare(
      `SELECT tool_name, status, arguments_json, result_json
       FROM tool_runs
       WHERE conversation_id = ?
       ORDER BY started_at ASC`,
    )
    .all(conversationId);
}

async function main() {
  mkdirSync(workDir, { recursive: true });
  const server = spawn(
    join(process.cwd(), "node_modules", ".bin", "next"),
    ["dev", "-p", String(port)],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        SQLITE_PATH: dbPath,
        AGENT_EVAL_MODE: "1",
        AGENT_MAX_TURNS: "8",
        AGENT_MAX_TOOL_CALLS: "12",
        AGENT_MAX_CALLS_PER_TOOL: "4",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  server.stdout.on("data", (chunk) => serverOutput.push(String(chunk)));
  server.stderr.on("data", (chunk) => serverOutput.push(String(chunk)));

  try {
    await waitForServer();
    await post("/api/admin/reset-mock", {});

    const dralkConversationId = await createConversation("P0 Eval · Dralk");
    const dralk = await runAgent(
      "这是 Agent P0 自动化回归。必须调用 start_dralk_workflow 工具，在当前任务启动一个 general 模式的手写画布，prompt 为“画出系统架构”。不要只返回打开画布的建议。",
      dralkConversationId,
    );
    assert(
      dralk.workflowRequest?.type === "dralk_input",
      "Dralk 由真实工具启动并返回持久化 workflowRequest",
      dralk,
    );

    const meetingConversationId = await createConversation("P0 Eval · Meeting");
    const meeting = await runAgent(
      "这是 Agent P0 自动化回归。必须调用 start_meeting_workflow 工具启动默认会议工作流，不要只返回建议。",
      meetingConversationId,
    );
    assert(
      meeting.actions?.some((action) => action.type === "open_meeting_workflow"),
      "Meeting 由真实工具启动并回传 UI 唤起信号",
      meeting,
    );

    const approvalConversationId = await createConversation("P0 Eval · Approval");
    const approval = await runAgent(
      "这是 Agent P0 自动化回归。必须调用 create_todo 工具创建待办，标题是“验证 P0 Agent 闭环”，dueAt 和 projectId 传 null。不要改用普通回复。",
      approvalConversationId,
    );
    assert(
      approval.status === "waiting_for_approval" &&
        approval.approvals?.some((item) => item.toolName === "create_todo"),
      "L2 写入在执行前中断并生成审批卡",
      approval,
    );

    const todoApproval = approval.approvals.find((item) => item.toolName === "create_todo");
    const resumed = await post("/api/agent/resume", {
      conversationId: approvalConversationId,
      runStateId: approval.runStateId,
      decisions: [{ callId: todoApproval.callId, decision: "approve" }],
    });
    assert(resumed.status === "ready", "审批后从持久化 RunState 恢复并完成");

    const db = new DatabaseSync(dbPath, { readOnly: true });
    const dralkRuns = toolRuns(db, dralkConversationId);
    const meetingRuns = toolRuns(db, meetingConversationId);
    const approvalRuns = toolRuns(db, approvalConversationId);
    assert(
      dralkRuns.some(
        (run) => run.tool_name === "start_dralk_workflow" && run.status === "completed",
      ),
      "Dralk 工具调用被记录为 completed",
      dralkRuns,
    );
    assert(
      meetingRuns.some(
        (run) => run.tool_name === "start_meeting_workflow" && run.status === "completed",
      ),
      "Meeting 工具调用被记录为 completed",
      meetingRuns,
    );
    assert(
      approvalRuns.some((run) => run.tool_name === "create_todo" && run.status === "completed"),
      "审批通过后 create_todo 才真正执行",
      approvalRuns,
    );
    const todoCount = db.prepare("SELECT COUNT(*) AS count FROM mock_todos").get().count;
    assert(Number(todoCount) === 1, "幂等写入只产生一条待办", { todoCount });

    for (const conversationId of [
      dralkConversationId,
      meetingConversationId,
      approvalConversationId,
    ]) {
      const rows = toolRuns(db, conversationId);
      const counts = new Map();
      for (const row of rows) {
        counts.set(row.tool_name, (counts.get(row.tool_name) || 0) + 1);
      }
      assert(rows.length <= 12, `运行预算限制总工具调用数：${conversationId}`, rows);
      assert(
        [...counts.values()].every((count) => count <= 4),
        `运行预算限制单工具调用数：${conversationId}`,
        Object.fromEntries(counts),
      );
    }
    db.close();

    const denied = await fetch(`${baseUrl}/api/conversations/${dralkConversationId}`, {
      headers: {
        "x-portal-user-id": "other-user",
        "x-portal-tenant-id": "other-tenant",
      },
    });
    assert(denied.status === 403, "跨用户/租户读取任务被拒绝", {
      status: denied.status,
    });

    console.log("\nP0 live Agent eval completed successfully.");
  } finally {
    server.kill("SIGTERM");
    await new Promise((resolve) => {
      const timer = setTimeout(resolve, 3_000);
      server.once("exit", () => {
        clearTimeout(timer);
        resolve();
      });
    });
    rmSync(workDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(`\n[FAIL] ${error instanceof Error ? error.stack : error}`);
  process.exitCode = 1;
});
