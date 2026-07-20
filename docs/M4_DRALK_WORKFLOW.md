# M4 Dralk Workflow Report

- Date: 2026-07-20
- Branch: `feature/askai-agent-runtime`
- Baseline: M3 commit `9c6fc5d`
- Script: `pnpm run spike:m4` → `scripts/m4-dralk-workflow-spike.mjs`

## Exit criterion

**PASS:** Dralk before/after stays on the same `ConversationTask`. Dual entries (`user_button` / `agent_intent`) do not create a second chat. Active workflow can be restored after DB reopen (refresh/restart).

## What shipped

| Area | Implementation |
|---|---|
| Types | `src/types/workflow.ts` — Dralk status machine, Query Payload, WorkflowRequest |
| Workflow core | `src/lib/workflows/dralk.ts` — `startDralkWorkflow`, transitions, attach/running/complete |
| Persistence | `workflow_states` via `src/lib/db/repositories/workflows.ts` |
| APIs | `POST /api/workflows/dralk/start`, `POST /api/workflows/dralk/event` |
| Agent wiring | `open_handwriting_canvas` → `workflowRequest` on same conversation |
| Conversation GET | returns `activeWorkflow` for refresh restore |
| UI | Composer **Dralk** button + workflow status label; hydrate restores canvas |

## Spike results

| Check | Result |
|---|---|
| user_button stays on same ConversationTask | **PASS** |
| agent_intent resumes same task after restart | **PASS** |
| Dual entries share one ConversationTask | **PASS** |

Failed: **0 / 3**

## Notes

- State machine: `waiting_for_input → capturing → recognized → attached → running → completed` (+ cancelled/failed).
- Button and agent intent both call `startDralkWorkflow` with the same `conversationId`.
- Structured `dralkContext` can be sent with `/api/agent/run` when recognition is attached.

## How to re-run

```bash
pnpm run spike:m4
```
