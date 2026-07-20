# M5 Approval + RunState Resume Report

- Date: 2026-07-20
- Branch: `feature/askai-agent-runtime`
- Baseline: M4 commit `0bebd6d`
- Script: `pnpm run spike:m5` → `scripts/m5-approval-resume-spike.mjs`

## Exit criterion

**PASS:** After DB reopen (refresh/restart simulation), pending `create_todo` approval can be approved and the original RunState resumed. Mock ToDo returns `written=true` with a Tool Receipt; conversation leaves `waiting_for_approval`.

## What shipped

| Area | Implementation |
|---|---|
| Persistence | `run_states` + `approvals` via `src/lib/db/repositories/approvals.ts` |
| Runner | `runAskAiTurn` detects `interruptions`, serializes `state.toString()`, returns `waiting_for_approval`; `resumeAskAiRun` uses `RunState.fromStringWithContext` + approve/reject |
| Agent API | `resumeAgentTurn` → `POST /api/agent/resume` |
| Conversation GET | returns pending `approvals` for hydrate |
| UI | `ApprovalCardList` above composer; approve/reject calls resume |
| Types | `ApprovalCardSchema`, `AgentResumeRequestSchema` on `agent-runtime` |
| Tool | `create_todo` keeps `needsApproval: true` (L2) |

## Spike results

| Check | Result |
|---|---|
| Agent pauses on needsApproval interruption | **PASS** |
| RunState + Approval persisted | **PASS** |
| After reopen: pending state restored | **PASS** |
| Rehydrated RunState matches callId | **PASS** |
| Approval decision idempotent by callId | **PASS** |
| Approve+resume executes Mock ToDo (`written=true`) | **PASS** |
| Exit criterion | **PASS** |

Failed: **0 / 7**

## Notes

- Do not read `finalOutput` while interruptions exist (SDK warns).
- Resume reattaches a fresh `AgentContext` / services; do not rely on serialized credentials.
- Reject path is wired in API/UI; spike covers the approve + restart exit path.

## How to re-run

```bash
pnpm run spike:m5
```
