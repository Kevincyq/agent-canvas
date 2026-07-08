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
- Kevin chose to keep the native canvas implementation on `main` and develop the FluxInk MCP App widget host on branch `feature/mcp-app-widget-host`.
- Widget branch architecture: browser MCP Apps Host (`FluxInkWidgetHost`) renders `ui://fluxink/fluxink-hwr-canvas.html` in a sandboxed iframe; `/api/mcp/host` proxies allowlisted MCP JSON-RPC (`tools/call`, `resources/read`, `resources/list`, `tools/list`) to FluxInk via server BFF; `/api/mcp/ui-resource` fetches widget HTML for initial mount.
- FluxInk widget HTML loads ES modules from `https://unpkg.com` and canvas bundles from `https://mcp.fluxink.ai/servers/<id>/assets/*`; parent page CSP must allow those origins in `script-src`, `style-src`, `connect-src`, and `img-src`, or the iframe stays blank even when `/api/mcp/ui-resource` returns 200.
- MCP App Host must call `AppBridge.connect()` before setting iframe `srcdoc`, otherwise the widget's `app.connect()` handshake can miss the parent bridge and remain stuck in loading.
- `HandwritingCanvas.tsx` remains in the repo for the native-canvas path on `main`; widget branch swaps `CanvasAgentApp` to `FluxInkWidgetHost` instead of deleting the native canvas component.
- Widget host UI should not duplicate FluxInk native toolbar actions (no React fullscreen button, no bottom Structured Result strip). Recognition send flows through AppBridge `onmessage` / `onupdatemodelcontext` into the bottom AskAI composer.
- FluxInk widget fullscreen uses `app.requestDisplayMode({ mode: "fullscreen" })`; host must implement `onrequestdisplaymode`, update `canvas-fullscreen` layout, and call `setHostContext({ displayMode, containerDimensions })` so the widget sets `body[data-display-mode="fullscreen"]`.
- MCP App Host `message` / `updateModelContext` capabilities must use empty objects per modality (e.g. `text: {}`), not booleans; `@modelcontextprotocol/ext-apps` Zod schema rejects `text: true` and breaks widget `app.connect()`.
- AppBridge `oncalltool` / `onreadresource` handlers receive MCP params directly (`{ name, arguments }`, `{ uri }`), not wrapped in `request.params`; passing the wrong shape yields `Tool is not allowed ... unknown` on recognition.
- `FluxInkWidgetHost` mount effect must not depend on `displayMode` or callback props; remounting the iframe on fullscreen toggles causes repeated `ui/initialize` warnings and flaky Send/handshake in dev.
- Widget branch should not block canvas open on `/api/mcp/hwr/open` (`show_handwriting_canvas`); mount FluxInk UI resource directly from agent action. MCP `clientSessionTimeoutSeconds` defaults to 5s in `@openai/agents` and causes `-32001 Request timed out` when FluxInk connect takes longer.
- `src/lib/mcp/client.ts` reuses a shared FluxInk MCP session across `/api/mcp/host` and ui-resource calls; reconnect only after timeout/transport errors. AppBridge tool handlers must return `{ isError: true }` instead of throwing to avoid browser `unhandledRejection`.
- Without `OPENAI_API_KEY`, `/api/agent` uses keyword fallback in `createFallbackResponse` (`画布`, `canvas`, `手写`, etc.) to emit `open_handwriting_canvas`; LLM intent routing only runs when the key is set.
- PoC LLM config prefers `TURING_API_KEY` + `TURING_API_BASE` (OpenAI-compatible proxy); default model id is `turing/gpt-5.5` via `chat.completions`. Agent path no longer connects MCP on each `/api/agent` call; canvas/recognition stay on `/api/mcp/host`.
- Assistant chat messages render via `ChatMessageContent` (`react-markdown` + `remark-math` + `rehype-katex` + KaTeX CSS). Legacy `\\(...\\)` / `\\[...\\]` delimiters are normalized to `$...$` / `$$...$$` before render.
- Chart rendering uses unified `PlotSpec` (`src/types/plot.ts`) with `render_chart` agent action. Phase 1: `kind=function` renders via `function-plot` in `PlotCard`; `line|bar|scatter` show structured placeholder pending ECharts (Phase 2). Spec lives on `ChatMessage.charts[]`.
- Staging deploy uses GitLab CI (`.gitlab-ci.yml`): validate → Docker build → push to GitLab Container Registry → SSH `deploy/scripts/remote-deploy.sh` on demo server. Docs: `docs/DEPLOYMENT.md`. Required CI vars: `STAGING_HOST`, `STAGING_USER`, `STAGING_DEPLOY_PATH`, `STAGING_SSH_PRIVATE_KEY`, `STAGING_PUBLIC_URL`, `TURING_API_KEY`. Auto-deploy branches: `main`, `feature/mcp-app-widget-host`.

## Open Questions

- Production Portal origin and deployment target are not confirmed beyond demo/staging GitLab CI flow.
- Whether `openai-agents-js/` is intended as a vendored source dependency, a reference checkout, or both is not yet confirmed.
- Whether the MVP should eventually embed FluxInk's MCP App widgets directly, or keep the local native canvas as the primary Portal UI and use MCP only behind the server, is not yet confirmed. Active PoC work on `feature/mcp-app-widget-host` pursues the widget host path while `main` keeps the native canvas baseline.
