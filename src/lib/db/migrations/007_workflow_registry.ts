export const MIGRATION_007_WORKFLOW_REGISTRY = `
ALTER TABLE workflow_states ADD COLUMN execution_mode TEXT NOT NULL DEFAULT 'fixture';
ALTER TABLE workflow_states ADD COLUMN runtime_status TEXT NOT NULL DEFAULT 'running';
ALTER TABLE workflow_states ADD COLUMN version TEXT NOT NULL DEFAULT '1.0';
ALTER TABLE workflow_states ADD COLUMN input_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE workflow_states ADD COLUMN result_json TEXT;
ALTER TABLE workflow_states ADD COLUMN error_json TEXT;
ALTER TABLE workflow_states ADD COLUMN resume_policy TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE workflow_states ADD COLUMN correlation_id TEXT;
ALTER TABLE workflow_states ADD COLUMN parent_workflow_id TEXT;
ALTER TABLE workflow_states ADD COLUMN completed_at TEXT;

UPDATE workflow_states
SET execution_mode = 'native',
    resume_policy = 'ui_submit',
    runtime_status = CASE
      WHEN status IN ('completed', 'failed', 'cancelled') THEN status
      WHEN status IN ('waiting_for_input', 'capturing', 'recognized') THEN 'waiting_for_input'
      ELSE 'running'
    END
WHERE workflow_type = 'dralk_input';

UPDATE workflow_states
SET execution_mode = 'fixture',
    resume_policy = 'agent_on_result',
    runtime_status = CASE
      WHEN status IN ('completed', 'failed', 'cancelled') THEN status
      ELSE 'running'
    END
WHERE workflow_type = 'meeting';

UPDATE workflow_states
SET correlation_id = id
WHERE correlation_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_workflow_states_runtime
ON workflow_states(conversation_id, workflow_type, runtime_status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_workflow_states_correlation
ON workflow_states(correlation_id);
`;
