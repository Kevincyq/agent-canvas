export const MIGRATION_003_MESSAGE_EVIDENCE = `
ALTER TABLE conversation_messages ADD COLUMN evidence_json TEXT;
ALTER TABLE conversation_messages ADD COLUMN artifacts_json TEXT;
`;
