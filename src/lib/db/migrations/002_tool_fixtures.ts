export const MIGRATION_002_TOOL_FIXTURES = `
CREATE TABLE IF NOT EXISTS project_sources (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  title TEXT NOT NULL,
  source_type TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_project_sources_project
  ON project_sources(project_id);

CREATE TABLE IF NOT EXISTS mock_todos (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  due_at TEXT,
  project_id TEXT,
  provider TEXT NOT NULL,
  idempotency_key TEXT UNIQUE,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_mock_todos_created
  ON mock_todos(created_at DESC);
`;
