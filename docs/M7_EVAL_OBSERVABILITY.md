# M7 Eval, Observability & Deploy Readiness Report

- Date: 2026-07-20
- Branch: `feature/askai-agent-runtime`
- Baseline: M6 commit `4b1a260`
- Script: `pnpm run spike:m7` → `scripts/m7-eval-observability-spike.mjs`

## Exit criterion

**PASS:** P0 eval fixtures cover cases 1–7; audit payloads redact credentials; tool success rate/latency are queryable; Portal user headers resolve; staging compose mounts `agent-canvas-data` for SQLite.

This unlocks repeatable staging diagnosis: failures can be located via `requestId` → audit events + tool metrics, without credential leakage.

## What shipped

| Area | Implementation |
|---|---|
| Eval fixtures | `src/lib/eval/p0-fixtures.ts` + `GET /api/eval/fixtures` |
| Audit log | `audit_events` migration `004` + `writeAuditEvent` on run/resume/tool |
| Redaction | `src/lib/observability/redact.ts` applied to audit + tool_runs JSON |
| Tool metrics | `summarizeToolMetrics` + `GET /api/metrics/tools` |
| Portal context | `resolvePortalUserContext` via `X-Portal-User-Id` / `X-Portal-Tenant-Id` |
| Docker volume | Confirmed in `deploy/docker-compose.local.yml` (`agent-canvas-data` → `/app/data`) |

## Spike results

| Check | Result |
|---|---|
| P0 fixtures cases 1–7 | **PASS** |
| Credential redaction | **PASS** |
| Portal header context | **PASS** |
| Tool success/latency metrics | **PASS** |
| Audit persistence without secrets | **PASS** |
| SQLite Docker volume | **PASS** |
| Exit criterion | **PASS** |

Failed: **0 / 7**

## Notes

- SDK Tracing remains disabled by default (`setTracingDisabled(true)`); product audit is the P0 observability path.
- Portal header trust is a PoC placeholder; production must authenticate upstream.

## How to re-run

```bash
pnpm run spike:m7
```
