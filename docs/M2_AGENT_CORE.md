# M2 Ask AI Agent Core Report

- Date: 2026-07-20
- Branch: `feature/askai-agent-runtime`
- Baseline: M1 commit `0c65336`
- Script: `pnpm run spike:m2` → `scripts/m2-agent-core-spike.mjs`

## Exit criterion

**PASS:** Agent completes multi-turn Q&A through Shared `Runner` + `Session` without assembling a client-side last-8 `history` window.

## What shipped

| Area | Implementation |
|---|---|
| Provider Adapter | `src/lib/agent/provider.ts` — model/apiMode/baseUrl/apiKeyEnvName/capability flags |
| AgentContext | `src/lib/agent/context.ts` — per-request context with stub `ServiceAdapters` |
| Shared Runner | `src/lib/agent/runner.ts` — reusable `Runner`, `runAskAiTurn`, current-turn prompt builder |
| Ask AI Agent | `src/lib/agent/ask-ai-agent.ts` — singleton Agent with Zod `outputType` |
| Structured Output | `src/lib/agent/result.ts` — `AskAiStructuredOutputSchema` (+ status/evidence/artifacts/suggestedActions) |
| Guardrails | `src/lib/agent/guardrails.ts` — empty/oversized input; reject unverified write claims |
| Tool Receipt | `src/types/tool-receipt.ts` — shared receipt contract for M3 tools |
| Service stubs | `src/lib/services/adapters.ts` — Mock/Real boundary (NOT_IMPLEMENTED until M3) |
| API wiring | `runAgentTurn` uses Runner + Session + Context; no client history |

## Spike results

| Check | Result |
|---|---|
| Provider adapter config surface | **PASS** |
| SQLite session_items still available | **PASS** |
| Output guardrail rejects unverified write claims | **PASS** |
| Shared Runner + Zod outputType | **PASS** |
| Multi-turn via Runner + Session without client history | **PASS** |

Failed: **0 / 5**

## Notes

- Frontend already stopped sending `history` in M1; M2 removes remaining prompt dependence on `recentHistory` for the run path (`buildCurrentTurnPrompt`).
- Canvas/chart intents map from `suggestedActions` → existing `AgentAction` for UI compatibility.
- Real tools arrive in M3; write-claim guardrail prepares the Tool Receipt verification rule early.

## How to re-run

```bash
pnpm run spike:m2
```

Requires `.env.local` with `TURING_API_KEY`.
