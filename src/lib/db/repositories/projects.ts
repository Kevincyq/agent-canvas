import { randomUUID } from "node:crypto";

import { getDb } from "@/lib/db/client";

export type ProjectRecord = {
  id: string;
  userId: string;
  name: string;
  instructions: string;
  createdAt: string;
  updatedAt: string;
};

export type ProjectSourceRecord = {
  id: string;
  projectId: string;
  title: string;
  sourceType: string;
  content: string;
  createdAt: string;
};

type ProjectRow = {
  id: string;
  user_id: string;
  name: string;
  instructions: string;
  created_at: string;
  updated_at: string;
};

type SourceRow = {
  id: string;
  project_id: string;
  title: string;
  source_type: string;
  content: string;
  created_at: string;
};

export function getProjectById(id: string): ProjectRecord | null {
  const row = getDb().prepare("SELECT * FROM projects WHERE id = ?").get(id) as
    | ProjectRow
    | undefined;
  if (!row) {
    return null;
  }
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    instructions: row.instructions,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listProjectSources(projectId: string): ProjectSourceRecord[] {
  const rows = getDb()
    .prepare(
      `SELECT * FROM project_sources
       WHERE project_id = ?
       ORDER BY created_at ASC`,
    )
    .all(projectId) as SourceRow[];

  return rows.map((row) => ({
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    sourceType: row.source_type,
    content: row.content,
    createdAt: row.created_at,
  }));
}

export function searchProjectSources(projectId: string, query: string, limit = 5) {
  const sources = listProjectSources(projectId);
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return sources.slice(0, limit);
  }

  return sources
    .map((source) => {
      const haystack = `${source.title}\n${source.content}`.toLowerCase();
      const score = normalized
        .split(/\s+/)
        .filter(Boolean)
        .reduce((sum, token) => sum + (haystack.includes(token) ? 1 : 0), 0);
      return { source, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((item) => item.source);
}

export function insertArtifact(input: {
  conversationId: string;
  projectId: string;
  title: string;
  artifactType: string;
  blocks: unknown[];
  evidence?: unknown;
}): { artifactId: string; projectId: string } {
  const artifactId = randomUUID();
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `INSERT INTO artifacts (
        id, conversation_id, project_id, title, artifact_type, blocks_json, evidence_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      artifactId,
      input.conversationId,
      input.projectId,
      input.title,
      input.artifactType,
      JSON.stringify(input.blocks),
      input.evidence ? JSON.stringify(input.evidence) : null,
      now,
      now,
    );

  return { artifactId, projectId: input.projectId };
}

export type ArtifactRecord = {
  id: string;
  conversationId: string;
  projectId: string | null;
  title: string;
  artifactType: string;
  blocks: unknown[];
  evidence: unknown | null;
  createdAt: string;
  updatedAt: string;
};

type ArtifactRow = {
  id: string;
  conversation_id: string;
  project_id: string | null;
  title: string;
  artifact_type: string;
  blocks_json: string;
  evidence_json: string | null;
  created_at: string;
  updated_at: string;
};

function mapArtifact(row: ArtifactRow): ArtifactRecord {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    projectId: row.project_id,
    title: row.title,
    artifactType: row.artifact_type,
    blocks: JSON.parse(row.blocks_json) as unknown[],
    evidence: row.evidence_json ? (JSON.parse(row.evidence_json) as unknown) : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listArtifactsByProject(projectId: string, limit = 50): ArtifactRecord[] {
  const rows = getDb()
    .prepare(
      `SELECT * FROM artifacts
       WHERE project_id = ?
       ORDER BY created_at DESC
       LIMIT ?`,
    )
    .all(projectId, Math.min(Math.max(limit, 1), 100)) as ArtifactRow[];
  return rows.map(mapArtifact);
}

export function getArtifactById(id: string): ArtifactRecord | null {
  const row = getDb()
    .prepare("SELECT * FROM artifacts WHERE id = ?")
    .get(id) as ArtifactRow | undefined;
  return row ? mapArtifact(row) : null;
}

export function listProjects(userId?: string): ProjectRecord[] {
  const rows = (
    userId
      ? getDb()
          .prepare(
            `SELECT * FROM projects WHERE user_id = ? ORDER BY updated_at DESC`,
          )
          .all(userId)
      : getDb().prepare(`SELECT * FROM projects ORDER BY updated_at DESC`).all()
  ) as ProjectRow[];

  return rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    name: row.name,
    instructions: row.instructions,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export function insertMockTodo(input: {
  title: string;
  dueAt?: string;
  projectId?: string;
  idempotencyKey?: string;
}): { todoId: string; title: string; dueAt?: string; written: true; provider: "mock" } {
  if (input.idempotencyKey) {
    const existing = getDb()
      .prepare("SELECT id, title, due_at FROM mock_todos WHERE idempotency_key = ?")
      .get(input.idempotencyKey) as
      | { id: string; title: string; due_at: string | null }
      | undefined;
    if (existing) {
      return {
        todoId: existing.id,
        title: existing.title,
        dueAt: existing.due_at ?? undefined,
        written: true,
        provider: "mock",
      };
    }
  }

  const todoId = `mock_todo_${randomUUID().slice(0, 8)}`;
  getDb()
    .prepare(
      `INSERT INTO mock_todos (
        id, title, due_at, project_id, provider, idempotency_key, created_at
      ) VALUES (?, ?, ?, ?, 'mock', ?, ?)`,
    )
    .run(
      todoId,
      input.title,
      input.dueAt ?? null,
      input.projectId ?? null,
      input.idempotencyKey ?? null,
      new Date().toISOString(),
    );

  return {
    todoId,
    title: input.title,
    dueAt: input.dueAt,
    written: true,
    provider: "mock",
  };
}
