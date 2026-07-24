export const MIGRATION_006_RUNTIME_GOVERNANCE = `
ALTER TABLE projects ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'local-tenant';
ALTER TABLE conversations ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'local-tenant';
ALTER TABLE artifacts ADD COLUMN idempotency_key TEXT;

CREATE INDEX IF NOT EXISTS idx_projects_principal
  ON projects(tenant_id, user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_conversations_principal
  ON conversations(tenant_id, user_id, updated_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_artifacts_idempotency
  ON artifacts(idempotency_key)
  WHERE idempotency_key IS NOT NULL;
`;
