#!/usr/bin/env node

import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

const port = Number(process.env.P05_EVAL_PORT || "3327");
const baseUrl = `http://127.0.0.1:${port}`;
const workDir = join(tmpdir(), `agent-canvas-p05-eval-${randomUUID()}`);
const dbPath = join(workDir, "eval.sqlite");
const headers = {
  "Content-Type": "application/json",
  "x-portal-user-id": "p05-eval-user",
  "x-portal-tenant-id": "p05-eval-tenant",
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
  throw new Error(
    `Next.js P0.5 eval server did not start.\n${serverOutput.slice(-20).join("")}`,
  );
}

async function post(path, body, expectedStatus = 200) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const payload = await response.json();
  if (response.status !== expectedStatus) {
    throw new Error(
      `${path} returned ${response.status}, expected ${expectedStatus}: ${JSON.stringify(payload)}`,
    );
  }
  return payload;
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
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  server.stdout.on("data", (chunk) => serverOutput.push(String(chunk)));
  server.stderr.on("data", (chunk) => serverOutput.push(String(chunk)));

  try {
    await waitForServer();

    const registry = await fetch(`${baseUrl}/api/workflows/registry`, {
      headers,
    }).then((response) => response.json());
    const byType = new Map(
      registry.workflows.map((definition) => [definition.type, definition]),
    );
    assert(byType.size === 4, "Workflow Registry 注册四类业务工作流", registry);
    assert(
      byType.get("dralk_input")?.realIntegration === true &&
        byType.get("dralk_input")?.executionMode === "native",
      "Dralk 明确标记为 native 真实闭环",
      byType.get("dralk_input"),
    );
    assert(
      byType.get("meeting")?.executionMode === "fixture" &&
        byType.get("writing_assist")?.executionMode === "external_pending" &&
        byType.get("translation")?.executionMode === "external_pending",
      "未接真实接口的 Workflow 不冒充生产集成",
      registry.workflows,
    );
    assert(
      registry.serviceBoundaries?.pkb?.component === "tool_service_adapter",
      "PKB 保持 Tool/Service Adapter 边界，不误注册为 Workflow",
      registry.serviceBoundaries,
    );

    await post(
      "/api/workflows/start/translation",
      {
        origin: "api",
        input: { content: "missing target language" },
      },
      400,
    );
    console.log("[PASS] Workflow input 在进入 Adapter 前经过 Schema 校验");

    const started = await post(
      "/api/workflows/start/translation",
      {
        origin: "api",
        input: {
          content: "Hello Agent",
          sourceLanguage: "en",
          targetLanguage: "zh-CN",
          preserveFormatting: true,
        },
      },
      201,
    );
    assert(
      started.instance.runtimeStatus === "waiting_external" &&
        started.workflowRequest.returnTo.conversationId ===
          started.instance.conversationId,
      "Translation 生成持久化 WorkflowRequest 与同任务 return target",
      started,
    );

    const completed = await post(
      `/api/workflows/result/${started.instance.id}`,
      {
        status: "completed",
        output: {
          translatedText: "你好，Agent",
          sourceLanguage: "en",
          targetLanguage: "zh-CN",
        },
        continueAgent: true,
      },
    );
    assert(
      completed.accepted === true &&
        completed.workflowResult.provenance.executionMode === "external_pending",
      "WorkflowResult 被持久化并保留 Adapter provenance",
      completed,
    );
    assert(
      completed.agentRun?.conversationId === started.instance.conversationId &&
        completed.agentRun?.assistantMessageId,
      "WorkflowResult 回到同一 Session，AskAI 自动继续推理",
      completed.agentRun,
    );

    const duplicate = await post(
      `/api/workflows/result/${started.instance.id}`,
      {
        status: "completed",
        output: {
          translatedText: "重复结果不应再次续跑",
          sourceLanguage: "en",
          targetLanguage: "zh-CN",
        },
        continueAgent: true,
      },
    );
    assert(
      duplicate.accepted === false && duplicate.agentRun === null,
      "重复 WorkflowResult 幂等拒绝且不会重复续跑 Agent",
      duplicate,
    );

    const meetingStarted = await post(
      "/api/workflows/start/meeting",
      {
        origin: "api",
        input: {},
      },
      201,
    );
    await post(
      "/api/workflows/meeting/finish",
      {
        conversationId: started.instance.conversationId,
        workflowId: meetingStarted.instance.id,
      },
      404,
    );
    console.log("[PASS] Meeting workflowId 不能跨 Conversation 拼接执行");
    const meetingCompleted = await post("/api/workflows/meeting/finish", {
      conversationId: meetingStarted.instance.conversationId,
      workflowId: meetingStarted.instance.id,
    });
    assert(
      meetingCompleted.accepted === true &&
        meetingCompleted.workflowResult.provenance.executionMode === "fixture" &&
        meetingCompleted.workflowResult.evidence.length === 2 &&
        meetingCompleted.agentRun?.conversationId ===
          meetingStarted.instance.conversationId,
      "Meeting Fixture 产出 Result/Evidence 后交回同一 AskAI Session",
      meetingCompleted,
    );
    const meetingDuplicate = await post("/api/workflows/meeting/finish", {
      conversationId: meetingStarted.instance.conversationId,
      workflowId: meetingStarted.instance.id,
    });
    assert(
      meetingDuplicate.accepted === false &&
        meetingDuplicate.agentRun === null,
      "Meeting 完成事件同样保持 exactly-once continuation",
      meetingDuplicate,
    );

    const dralk = await post(
      "/api/workflows/start/dralk_input",
      {
        origin: "api",
        input: {
          prompt: "画一个二次函数",
          mode: "general",
          language: "zh-CN",
          forceNew: false,
        },
      },
      201,
    );
    assert(
      dralk.instance.executionMode === "native" &&
        dralk.instance.runtimeStatus === "waiting_for_input",
      "Dralk 已迁移到统一 Registry 且保留真实 Canvas 状态",
      dralk,
    );

    const db = new DatabaseSync(dbPath, { readOnly: true });
    const translationRow = db
      .prepare(
        `SELECT execution_mode, runtime_status, result_json, resume_policy
         FROM workflow_states WHERE id = ?`,
      )
      .get(started.instance.id);
    const messages = db
      .prepare(
        `SELECT role, COUNT(*) AS count
         FROM conversation_messages
         WHERE conversation_id = ?
         GROUP BY role`,
      )
      .all(started.instance.conversationId);
    db.close();
    assert(
      translationRow.runtime_status === "completed" &&
        translationRow.resume_policy === "agent_on_result" &&
        Boolean(translationRow.result_json),
      "Workflow Instance 状态、结果与 resume policy 可恢复",
      translationRow,
    );
    assert(
      !messages.some((row) => row.role === "user") &&
        messages.some((row) => row.role === "assistant"),
      "运行时续跑不伪造用户消息，只追加 AskAI 结果",
      messages,
    );

    console.log("\nP0.5 Workflow Registry eval completed successfully.");
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
