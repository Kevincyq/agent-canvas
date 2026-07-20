#!/usr/bin/env node
/**
 * M6 Project UX + Evidence + Artifact spike
 *
 * Exit criteria (product-facing data path):
 * - Projects API shape: seed project + sources
 * - Artifact can be saved and listed under project
 * - Message evidence/artifacts persist across DB reopen
 * - Tool receipt evidence can be reconstructed from tool_runs
 *
 * Usage:
 *   pnpm run spike:m6
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
    CREATE TABLE projects (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      instructions TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE project_sources (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      title TEXT NOT NULL,
      source_type TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
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
    CREATE TABLE conversation_messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      blocks_json TEXT,
      actions_json TEXT,
      attachments_json TEXT,
      charts_json TEXT,
      document_json TEXT,
      evidence_json TEXT,
      artifacts_json TEXT,
      created_at TEXT NOT NULL,
      sequence_no INTEGER NOT NULL
    );
    CREATE TABLE artifacts (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      project_id TEXT,
      title TEXT NOT NULL,
      artifact_type TEXT NOT NULL,
      blocks_json TEXT NOT NULL,
      evidence_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
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
  `);
}

function main() {
  const workDir = join(tmpdir(), `m6-project-${randomUUID()}`);
  mkdirSync(workDir, { recursive: true });
  const dbPath = join(workDir, "m6.sqlite");
  let db = new DatabaseSync(dbPath);
  migrate(db);

  const now = new Date().toISOString();
  const projectId = "proj_launch_prep_001";
  const conversationId = randomUUID();
  const requestId = randomUUID();
  const artifactId = randomUUID();
  const messageId = randomUUID();

  db.prepare(
    `INSERT INTO projects (id, user_id, name, instructions, created_at, updated_at)
     VALUES (?, 'local-user', '新品发布筹备', 'Focus on launch prep', ?, ?)`,
  ).run(projectId, now, now);

  db.prepare(
    `INSERT INTO project_sources (id, project_id, title, source_type, content, created_at)
     VALUES (?, ?, '客户反馈摘要', 'note', '刷新后继续同一任务', ?)`,
  ).run(randomUUID(), projectId, now);

  db.prepare(
    `INSERT INTO conversations (
      id, user_id, project_id, title, status, current_step, session_id, origin_surface, created_at, updated_at
    ) VALUES (?, 'local-user', ?, 'Launch prep chat', 'ready', NULL, ?, 'askai', ?, ?)`,
  ).run(conversationId, projectId, randomUUID(), now, now);

  const evidence = [
    { id: "ev1", label: "客户反馈", source: "pkb:src_customer_feedback_001" },
    {
      id: "ev2",
      label: "save_artifact_to_project 完成",
      source: "tool_receipt:save_artifact_to_project",
    },
  ];
  const artifacts = [
    { id: artifactId, title: "发布评审摘要", artifactType: "typed_blocks" },
  ];

  db.prepare(
    `INSERT INTO conversation_messages (
      id, conversation_id, role, content, blocks_json, actions_json, attachments_json,
      charts_json, document_json, evidence_json, artifacts_json, created_at, sequence_no
    ) VALUES (?, ?, 'assistant', '已保存摘要', NULL, NULL, NULL, NULL, NULL, ?, ?, ?, 1)`,
  ).run(messageId, conversationId, JSON.stringify(evidence), JSON.stringify(artifacts), now);

  db.prepare(
    `INSERT INTO artifacts (
      id, conversation_id, project_id, title, artifact_type, blocks_json, evidence_json, created_at, updated_at
    ) VALUES (?, ?, ?, '发布评审摘要', 'typed_blocks', ?, ?, ?, ?)`,
  ).run(
    artifactId,
    conversationId,
    projectId,
    JSON.stringify([{ id: "b1", type: "markdown", source: "# 摘要" }]),
    JSON.stringify(evidence),
    now,
    now,
  );

  db.prepare(
    `INSERT INTO tool_runs (
      id, conversation_id, request_id, tool_name, arguments_json, result_json, status, started_at, completed_at
    ) VALUES (?, ?, ?, 'save_artifact_to_project', '{}', ?, 'completed', ?, ?)`,
  ).run(
    randomUUID(),
    conversationId,
    requestId,
    JSON.stringify({
      ok: true,
      tool: "save_artifact_to_project",
      executionId: "exec_1",
      data: { artifactId, projectId },
      verifiedAt: now,
    }),
    now,
    now,
  );

  const project = db.prepare("SELECT * FROM projects WHERE id = ?").get(projectId);
  const sources = db
    .prepare("SELECT * FROM project_sources WHERE project_id = ?")
    .all(projectId);
  record("GET project shape: seed project + sources", Boolean(project) && sources.length >= 1, {
    projectName: project?.name,
    sourceCount: sources.length,
  });

  const listedArtifacts = db
    .prepare("SELECT * FROM artifacts WHERE project_id = ? ORDER BY created_at DESC")
    .all(projectId);
  record("Artifact saved and listable under project", listedArtifacts.length >= 1, {
    artifactIds: listedArtifacts.map((row) => row.id),
  });

  db.close();
  db = new DatabaseSync(dbPath);

  const restoredMessage = db
    .prepare("SELECT * FROM conversation_messages WHERE id = ?")
    .get(messageId);
  const restoredEvidence = JSON.parse(restoredMessage.evidence_json);
  const restoredArtifacts = JSON.parse(restoredMessage.artifacts_json);
  record(
    "After reopen: message evidence/artifacts restored",
    restoredEvidence.length === 2 && restoredArtifacts.length === 1,
    { evidence: restoredEvidence, artifacts: restoredArtifacts },
  );

  const toolRun = db.prepare("SELECT * FROM tool_runs WHERE request_id = ?").get(requestId);
  const receipt = JSON.parse(toolRun.result_json);
  const reconstructed = {
    id: receipt.executionId,
    label: "save_artifact_to_project 完成",
    source: `tool_receipt:${toolRun.tool_name}`,
  };
  record(
    "Tool receipt reconstructable from tool_runs",
    reconstructed.source === "tool_receipt:save_artifact_to_project",
    { reconstructed, artifactId: receipt.data.artifactId },
  );

  const navShape = {
    newChat: true,
    projects: [{ id: projectId, name: project.name, sourceCount: sources.length }],
    recent: [
      {
        id: conversationId,
        title: "Launch prep chat",
        status: "ready",
        projectId,
      },
    ],
  };
  record(
    "Nav data shape ready for Project/Recent UI",
    navShape.projects.length === 1 && navShape.recent.length === 1,
    navShape,
  );

  const exitOk =
    Boolean(project) &&
    sources.length >= 1 &&
    listedArtifacts.length >= 1 &&
    restoredEvidence.length === 2 &&
    restoredArtifacts.length === 1 &&
    Boolean(receipt.data?.artifactId);

  record("Exit criterion: Project UX + Evidence + Artifact data path", exitOk, {
    projectOk: Boolean(project),
    sourcesOk: sources.length >= 1,
    artifactListOk: listedArtifacts.length >= 1,
    messagePersistOk: restoredEvidence.length === 2,
    receiptOk: Boolean(receipt.data?.artifactId),
  });

  db.close();
  rmSync(workDir, { recursive: true, force: true });

  const failed = results.filter((item) => !item.ok);
  console.log("\n========== M6 SUMMARY ==========");
  for (const item of results) {
    console.log(`${item.ok ? "PASS" : "FAIL"}  ${item.name}`);
  }
  console.log(`Failed: ${failed.length} / ${results.length}`);
  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

console.log("M6 Project UX + Evidence + Artifact spike");
main();
