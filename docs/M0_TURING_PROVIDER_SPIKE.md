# M0 Turing Provider Spike Report

- Date: 2026-07-20
- Branch: `feature/askai-agent-runtime`
- Baseline commit before M0 work: `bda74cc`
- Script: `pnpm run spike:m0` → `scripts/m0-turing-spike.mjs`

## Environment under test

| Item | Value |
|---|---|
| Provider | Turing OpenAI-compatible proxy |
| Base URL | `https://live-turing.cn.llm.tcljd.com/api/v1` |
| Model | `turing/gpt-5.5` |
| SDK API mode | `chat_completions` |
| App SDK pin | `@openai/agents@0.13.2` |
| OpenAI client | `openai@6.46.0` |

## Results

| Capability | Result | Notes |
|---|---|---|
| Raw `chat.completions` function calling | **PASS** | Returned `tool_calls` with stable `call_id` (`call_…`) |
| Raw tool-result follow-up loop | **PASS** | Tool message with `tool_call_id` produced `TOOL_OK` |
| SDK Agent `echo_tool` call + result loop + final output | **PASS** | Exit criterion met: `TOOL_OK ECHO:hello-m0` |
| SDK multi-tool sequential calls | **PASS** | `echo_tool` then `add_tool`; final `MULTI_OK ECHO:step1 5` |
| SDK structured `outputType` (Zod) | **PASS** | Parsed `{ status: "ok", note: "ready" }` |
| SDK tool error propagation | **PASS** | Intentional tool throw returned to model; reply started with `ERROR_HANDLED` |
| SDK streaming | **PASS** | 10 events; types included `raw_model_stream_event`, `run_item_stream_event` |

**Exit criterion:** PASS  
**Failed:** 0 / 7

## Dependency pinning

Root `package.json` no longer uses `latest` for runtime packages. Critical pins:

- `@openai/agents`: `0.13.2`
- `openai`: `6.46.0`
- `next`: `16.2.10`
- `react` / `react-dom`: `19.2.7`
- `zod`: `4.4.3`

`openai-agents-js/` is documented as **reference-only** in `openai-agents-js/REFERENCE_ONLY.md`. Do not import it at runtime; installed npm package is the source of truth.

## Decision

**Proceed with Turing as the Agent Runtime provider for M1+.**

Native OpenAI Responses fallback remains available if a future regression appears, but M0 does **not** require switching now.

## How to re-run

```bash
pnpm run spike:m0
```

Requires `.env.local` with `TURING_API_KEY` (and optional `TURING_API_BASE` / `TURING_MODEL`).
