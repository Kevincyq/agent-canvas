# openai-agents-js reference checkout

The workspace may contain an `openai-agents-js/` directory as a **reference-only** checkout of the OpenAI Agents JS monorepo. That directory is gitignored and must not be treated as an app dependency.

## Rules

- Do **not** import runtime code from `openai-agents-js/` into the Next.js app.
- Do **not** copy APIs from that tree unless they exist in the installed package version.
- The app depends on the npm package `@openai/agents` pinned in root `package.json`.
- Current app pin: `@openai/agents@0.13.2`.
- The local checkout package version may lag (historically `0.11.x`) and is not the source of truth.

## Allowed uses

- Reading examples and docs for design ideas.
- Comparing concepts against official guides: https://openai.github.io/openai-agents-js/

## Disallowed uses

- Vendoring that tree as a dependency.
- Assuming types/APIs match the installed `@openai/agents` version.
