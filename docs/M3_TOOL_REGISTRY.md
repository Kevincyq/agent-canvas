# M3 Tool Registry + Mock Services Report

- Date: 2026-07-20
- Branch: `feature/askai-agent-runtime`
- Baseline: M2 commit `267e15c`
- Script: `pnpm run spike:m3` → `scripts/m3-tool-loop-spike.mjs`

## Exit criterion

**PASS:** In one Agent run, the model called two Read tools (`search_personal_knowledge`, `get_meeting_context`) and one Write tool (`save_artifact_to_project`), consumed tool results, persisted an artifact, and produced structured final output.

## What shipped

| Area | Implementation |
|---|---|
| Seed fixtures | Fixed IDs for `新品发布筹备` project, 4 sources, product review meeting, action candidates (`src/lib/services/mock/fixtures.ts`) |
| Migration | `002_tool_fixtures` → `project_sources`, `mock_todos` |
| Mock adapters | `createMockServiceAdapters()` behind `ServiceAdapters` |
| Tool logging | `tool_runs` via `withToolRunLogging` |
| P0 tools | `get_current_context`, `get_project_context`, `search_personal_knowledge`, `search_web`, `get_meeting_context`, `save_artifact_to_project`, `create_todo` (`needsApproval: true` for M5) |
| Registry | Wired into Ask AI Agent (`tools: createAskAiTools()`) |
| Projects API | `GET /api/projects` returns seed project + sources |

## Spike results

| Check | Result |
|---|---|
| Read tools executed (>=2) | **PASS** |
| Write tool executed (>=1) | **PASS** |
| Tool result loop + structured output | **PASS** |
| Artifact persisted in SQLite | **PASS** |
| Exit criterion: 2 reads + 1 write | **PASS** |

Failed: **0 / 5**

## Notes

- M3 write path for the exit criterion is `save_artifact_to_project` (L1, no approval).
- `create_todo` is registered with `needsApproval: true` and will interrupt until M5 approval/resume.
- Models must attach Tool Receipts into `evidence` before claiming write success (guardrail updated).

## How to re-run

```bash
pnpm run spike:m3
```
