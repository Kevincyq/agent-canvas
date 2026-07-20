# M6 Project UX + Evidence + Artifact Report

- Date: 2026-07-20
- Branch: `feature/askai-agent-runtime`
- Baseline: M5 commit `193938b`
- Script: `pnpm run spike:m6` → `scripts/m6-project-ux-spike.mjs`

## Exit criterion

**PASS (data path):** Seed Project + Sources readable; Artifacts listable under project; message `evidence`/`artifacts` survive DB reopen; Tool Receipt reconstructable from `tool_runs`.

P0 Case 3–7 product loop is now UI-visible (Evidence / Receipt / Artifact deep link + Project/Recent nav). Full LLM e2e of every case remains manual smoke on staging; this spike locks the persistence and API contracts M6 requires.

## What shipped

| Area | Implementation |
|---|---|
| Projects API | `GET /api/projects/:id`, `GET /api/projects/:id/artifacts`, `GET /api/artifacts/:id` |
| Persistence | Migration `003_message_evidence`; messages store `evidence_json` / `artifacts_json` |
| Enrichment | Agent response merges Tool Receipt evidence + artifact refs from `tool_runs` |
| Chat UI | `EvidenceList`, `ToolReceiptCard`, Artifact drawer deep link |
| Nav | `ProjectNav`: New Chat / Seed Project / Recent with status labels |
| Binding | `AgentRunRequest.projectId` ties chat to Project context |

## Spike results

| Check | Result |
|---|---|
| Seed project + sources shape | **PASS** |
| Artifact saved and listable | **PASS** |
| Message evidence/artifacts after reopen | **PASS** |
| Tool receipt from tool_runs | **PASS** |
| Nav data shape | **PASS** |
| Exit criterion | **PASS** |

Failed: **0 / 6**

## Notes

- P0 does not include full Project CRUD or Activity view.
- Artifact drawer currently shows structured JSON blocks (enough for deep link proof).

## How to re-run

```bash
pnpm run spike:m6
```
