# M1 SQLite + Conversation Session Report

- Date: 2026-07-20
- Branch: `feature/askai-agent-runtime`
- Script: `pnpm run spike:m1` → `scripts/m1-session-resume.mjs`

## Exit criterion

**PASS:** After closing and reopening the SQLite database (simulated process restart), the same `conversationId` continued Q&A and recalled a prior project codename via Agents SDK `Session`.

## What shipped

| Area | Implementation |
|---|---|
| SQLite | Node built-in `node:sqlite` (`DatabaseSync`), default path `./data/agent-canvas.sqlite` (`SQLITE_PATH`) |
| Migrations | `001_init` creates projects, conversations, session_items, conversation_messages, run_states, approvals, tool_runs, artifacts, workflow_states |
| Session | `src/lib/session/sqlite-session.ts` implements Agents SDK `Session` (`getSessionId`, `getItems`, `addItems`, `popItem`, `clearSession`) |
| ConversationTask APIs | `POST/GET /api/conversations`, `GET/PATCH /api/conversations/[id]` |
| Agent Runtime API | Hard cut: `POST /api/agent/run`; `POST /api/agent` returns **410** |
| UI restore | `CanvasAgentApp` stores `askai.conversationId` in `localStorage` and hydrates messages from GET conversation |
| Staging persistence | Docker named volume `agent-canvas-data` → `/app/data` |

## Spike results

| Check | Result |
|---|---|
| SqliteSession CRUD | **PASS** |
| Turn 1 persisted before restart | **PASS** |
| Conversation survives restart | **PASS** |
| Session items reload after restart | **PASS** |
| Turn 2 continues same conversationId after restart | **PASS** |

Failed: **0 / 5**

## Notes

- UI chat history uses `conversation_messages` (typed blocks/actions). SDK replay history uses `session_items`.
- Client no longer sends a manual 8-message `history` window to the agent run API.
- `node:sqlite` is experimental in Node 22; acceptable for this PoC.
- Spike initially failed when asking the model to remember a “one-time password”; switched to a neutral project codename. Persistence itself was already working.

## How to re-run

```bash
pnpm run spike:m1
```

Requires `.env.local` with `TURING_API_KEY` (and optional `TURING_API_BASE` / `TURING_MODEL`).
