export const MIGRATION_005_MEETING_CALENDAR = `
CREATE TABLE IF NOT EXISTS mock_calendar_events (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  start_at TEXT NOT NULL,
  end_at TEXT NOT NULL,
  notes TEXT,
  source_id TEXT,
  provider TEXT NOT NULL,
  idempotency_key TEXT UNIQUE,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_mock_calendar_events_start
  ON mock_calendar_events(start_at ASC);
`;
