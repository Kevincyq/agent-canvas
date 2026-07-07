# Agent Canvas Memory

## Project Identity

- Project name: `agent-canvas-mvp`.
- Workspace root: `/Users/kc/Documents/Agent_Canvas`.
- Date initialized: 2026-07-07.
- Purpose from README: embeddable Canvas Agent MVP for a company Portal, combining chat and a handwriting canvas with a server-side OpenAI Agents JS intent layer and cloud MCP server connectivity.

## Current Technical Shape

- Frontend: Next.js, React, TypeScript, native `<canvas>` handwriting UI.
- Backend: Next.js API routes.
- Agent layer: OpenAI Agents JS wrapper in `src/lib/agent/`.
- MCP layer: cloud MCP server connection wrapper in `src/lib/mcp/`.
- Shared protocol types live in `src/types/agent.ts`.
- The workspace also contains `openai-agents-js/`, an embedded OpenAI Agents JS monorepo/reference checkout with its own `AGENTS.md`.

## Durable Decisions

- Project-root `AGENTS.md` and `MEMORY.md` were created because they were missing and `~/.codex/templates` was not present.
- Credential values must not be written here. Relevant environment variable names can be documented when needed.
- Current root app is effectively a standalone copy/adaptation of `openai-agents-js/examples/canvas-agent-mvp/`, while `openai-agents-js/` remains a separate Git repo with its own contribution rules.
- The native canvas in `src/components/canvas/HandwritingCanvas.tsx` is a local sketch surface; the FluxInk MCP PDF describes separate MCP App resources for hosted HWR/NTI widgets loaded by MCP-capable clients.
- Current MCP integration has two modes: `/api/mcp/inspect` probes tools/resources, and `/api/agent` can execute the first `call_mcp` action; production still needs a tool allowlist and audit boundary.
- Kevin clarified the immediate demo goal: connect to the TCL FluxInk MCP server, let AI Chat open the handwriting canvas in the conversation flow, and auto-recognize handwritten content after the user stops writing. The preferred reference is the Claude custom connector flow in `TCL_MCP Document.pdf`.
- The HWR demo implementation now uses a narrow action model: `/api/agent` only decides whether to open `open_handwriting_canvas`; `/api/mcp/hwr/open` calls FluxInk `show_handwriting_canvas`; `/api/mcp/hwr/recognize` submits local canvas strokes to `recognize_handwriting`.
- The default MCP URL is the TCL integration endpoint from the PDF: `https://mcp.fluxink.ai/servers/d706699b03524ba6aa84423954c43f3f/mcp`.
- The root app excludes `openai-agents-js/` from its `tsconfig.json` because that directory is a separate SDK repo/reference checkout, not part of this Next.js app typecheck scope.
- FluxInk HWR recognition expects the widget payload shape `Array<Array<{ x, y, t }>>` for `strokes`. Do not submit the app-level wrapper object `{ strokes, canvas }` directly to MCP; transform local strokes to the widget-compatible two-dimensional point array first.
- Kevin wants the HWR demo UX to follow Claude/Dralk-style conversational embedding: the canvas is opened by chat intent, anchored under the triggering assistant message, supports fullscreen/back-to-chat display modes, and auto-recognizes after the user stops writing for more than 1 second instead of requiring a manual submit.
- Dralk reference for this interaction lives at `/Users/kc/Documents/Dralk产品设计/Dralk-chat-demo-v2.html`; relevant principles are in-flow canvas, no second input box inside the canvas, and returning completion back to the bottom composer.
- Kevin clarified from the Claude reference screenshots that recognized structured HWR output should be sent into the bottom AskAI composer, not written as an assistant message. The user should be able to add instructions and explicitly send the combined prompt to the cloud AI.
- Kevin pointed out UI cleanup issues: do not show duplicate canvas send controls, do not expose the internal action/debug strip such as "reply", and make AskAI composer Enter send while Shift+Enter inserts a newline.
- Current implementation boundary: the visible handwriting surface is a local React/native canvas, while structured recognition is submitted to FluxInk MCP `recognize_handwriting`. It is not a full visual embedding of FluxInk's MCP App widget, so it will not perfectly match Claude's widget UI or preprocessing behavior.
- `/api/agent` must not remain only an intent router. When `OPENAI_API_KEY` is configured, non-canvas user prompts, including prompts containing HWR structured output, should be answered by the cloud AskAI model. Without the key, fallback should say cloud AskAI is unavailable instead of pretending to answer.

## Open Questions

- Production Portal origin and deployment target are not confirmed.
- Whether `openai-agents-js/` is intended as a vendored source dependency, a reference checkout, or both is not yet confirmed.
- Whether the MVP should eventually embed FluxInk's MCP App widgets directly, or keep the local native canvas as the primary Portal UI and use MCP only behind the server, is not yet confirmed.
