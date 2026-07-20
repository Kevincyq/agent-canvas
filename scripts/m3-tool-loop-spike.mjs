#!/usr/bin/env node
/**
 * M3 Tool Registry + Mock Services spike
 *
 * Exit criteria: Agent completes at least two Read tools and one Write tool
 * in a single combined task (tool result loop).
 *
 * Usage:
 *   pnpm run spike:m3
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
  tool,
} from "@openai/agents";
import OpenAI from "openai";
import { z } from "zod";

const results = [];
const SEED_PROJECT_ID = "proj_launch_prep_001";
const SEED_MEETING_ID = "meeting_product_review_001";

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

function receipt(toolName, data) {
  return {
    ok: true,
    tool: toolName,
    executionId: `toolrun_${toolName}_${randomUUID().slice(0, 8)}`,
    data,
    verifiedAt: new Date().toISOString(),
  };
}

function openArtifactDb(path) {
  const db = new DatabaseSync(path);
  db.exec(`
    CREATE TABLE artifacts (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      title TEXT NOT NULL,
      blocks_json TEXT NOT NULL
    );
  `);
  return db;
}

function extractToolNames(result) {
  const names = [];
  for (const item of result.newItems ?? []) {
    const raw = item?.rawItem ?? item;
    if (raw?.type === "function_call" && raw?.name) {
      names.push(raw.name);
    }
    if (item?.type === "tool_call_item" && item?.rawItem?.name) {
      names.push(item.rawItem.name);
    }
  }
  // Also scan serialized form for robustness across SDK item shapes.
  const blob = JSON.stringify(result.newItems ?? []);
  for (const name of [
    "search_personal_knowledge",
    "get_meeting_context",
    "get_project_context",
    "search_web",
    "get_current_context",
    "save_artifact_to_project",
  ]) {
    if (blob.includes(`"name":"${name}"`) || blob.includes(`"name": "${name}"`)) {
      names.push(name);
    }
  }
  return [...new Set(names)];
}

async function main() {
  const config = getConfig();
  const client = new OpenAI({ apiKey: config.apiKey, baseURL: config.baseURL });
  setDefaultOpenAIClient(client);
  setOpenAIAPI(config.apiMode);
  setTracingDisabled(true);

  const workDir = join(tmpdir(), `m3-tools-${randomUUID()}`);
  mkdirSync(workDir, { recursive: true });
  const dbPath = join(workDir, "artifacts.sqlite");
  const db = openArtifactDb(dbPath);

  const called = [];

  const searchPersonalKnowledge = tool({
    name: "search_personal_knowledge",
    description: "Search project PKB sources.",
    parameters: z.object({
      query: z.string(),
      projectId: z.string().nullable(),
    }),
    strict: true,
    execute: async ({ query, projectId }) => {
      called.push("search_personal_knowledge");
      return receipt("search_personal_knowledge", {
        projectId: projectId || SEED_PROJECT_ID,
        query,
        hits: [
          {
            sourceId: "src_customer_feedback_001",
            title: "客户反馈摘要",
            excerpt: "客户希望刷新后能继续同一任务；写入待办必须有明确回执。",
          },
        ],
      });
    },
  });

  const getMeetingContext = tool({
    name: "get_meeting_context",
    description: "Load meeting fixture.",
    parameters: z.object({
      meetingId: z.string().nullable(),
    }),
    strict: true,
    execute: async ({ meetingId }) => {
      called.push("get_meeting_context");
      return receipt("get_meeting_context", {
        meeting: {
          id: meetingId || SEED_MEETING_ID,
          title: "下午产品评审会",
          agenda: ["方案风险回顾", "评审修改项确认", "行动项拆分"],
          participants: ["产品经理 A", "设计 C", "研发 D", "市场 B"],
        },
      });
    },
  });

  const saveArtifactToProject = tool({
    name: "save_artifact_to_project",
    description: "Persist an artifact and return a Tool Receipt.",
    parameters: z.object({
      projectId: z.string(),
      title: z.string(),
      artifactType: z.string().nullable(),
      blocksJson: z.string(),
    }),
    strict: true,
    execute: async ({ projectId, title, artifactType, blocksJson }) => {
      called.push("save_artifact_to_project");
      const artifactId = `artifact_${randomUUID().slice(0, 8)}`;
      db.prepare(
        `INSERT INTO artifacts (id, project_id, title, blocks_json) VALUES (?, ?, ?, ?)`,
      ).run(artifactId, projectId, title, blocksJson);
      return receipt("save_artifact_to_project", {
        artifactId,
        projectId,
        artifactType: artifactType || "typed_blocks",
      });
    },
  });

  const runner = new Runner();
  const agent = new Agent({
    name: "M3 Tool Loop Agent",
    model: config.model,
    instructions: `You are Ask AI with tools.
For this task you MUST:
1) call search_personal_knowledge for 客户反馈
2) call get_meeting_context for the product review meeting
3) call save_artifact_to_project to save a short markdown summary
Then return structured output.
Put tool receipts into evidence with source like tool_receipt:<tool>.
Do NOT call create_todo.
status=ok. unused nullable fields = null.`,
    outputType: OutputSchema,
    tools: [searchPersonalKnowledge, getMeetingContext, saveArtifactToProject],
  });

  console.log("M3 Tool Registry spike");
  console.log(`Model: ${config.model} via ${config.apiMode}`);

  try {
    const result = await runner.run(
      agent,
      JSON.stringify({
        task: "Combine two reads and one write",
        userMessage:
          "请检索新品发布筹备项目中关于客户反馈的知识，再读取下午产品评审会上下文，然后把一份简短中文摘要保存为项目 Artifact。完成后告诉我 artifactId。",
      }),
      {
        context: {
          conversationId: randomUUID(),
          requestId: randomUUID(),
          projectId: SEED_PROJECT_ID,
        },
        maxTurns: 12,
      },
    );

    const toolNames = extractToolNames(result);
    const readTools = ["search_personal_knowledge", "get_meeting_context"].filter((name) =>
      called.includes(name),
    );
    const writeTools = ["save_artifact_to_project"].filter((name) => called.includes(name));
    const artifactCount = db.prepare("SELECT COUNT(*) AS c FROM artifacts").get().c;
    const output = result.finalOutput;

    record("Read tools executed (>=2)", readTools.length >= 2, {
      called,
      readTools,
      toolNamesFromItems: toolNames,
    });
    record("Write tool executed (>=1)", writeTools.length >= 1, {
      writeTools,
      artifactCount,
    });
    record("Tool result loop produced structured final output", Boolean(output?.message), {
      status: output?.status,
      messagePreview: output?.message?.slice?.(0, 160),
      evidenceCount: output?.evidence?.length ?? 0,
    });
    record("Artifact persisted in SQLite", artifactCount >= 1, { artifactCount });

    const exitOk = readTools.length >= 2 && writeTools.length >= 1 && Boolean(output?.message);
    record("Exit criterion: 2 reads + 1 write combined task", exitOk, {
      readTools,
      writeTools,
      finalStatus: output?.status,
    });
  } finally {
    db.close();
    rmSync(workDir, { recursive: true, force: true });
  }

  const failed = results.filter((item) => !item.ok);
  console.log("\n========== M3 SUMMARY ==========");
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
