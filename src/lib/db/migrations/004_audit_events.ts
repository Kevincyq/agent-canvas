export const MIGRATION_004_AUDIT_EVENTS = `
CREATE TABLE IF NOT EXISTS audit_events (
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

CREATE INDEX IF NOT EXISTS idx_audit_events_request
  ON audit_events(request_id);

CREATE INDEX IF NOT EXISTS idx_audit_events_created
  ON audit_events(created_at DESC);
`;
