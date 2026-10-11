# Agent Canvas Project Guide

## User Context

- User: Kevin.
- Role: AI product manager, solution architect, and developer.
- Default language: Chinese for explanations; English for code, commands, variables, and identifiers.
- Decision style: lead with conclusions, explain why and user impact, and call out flawed assumptions directly.
- Work philosophy: automate or AI-enable anything repeated three times.

## First Principles

- Start from the actual problem and the shortest defensible path to solve it.
- Do not copy patterns only because they are common; explain why a choice fits this project.
- For product and technical decisions, state both implementation impact and user-facing impact.
- Prefer concrete repo evidence over generic framework claims.

## Required Project Setup

Before doing any substantive work in this workspace:

1. Check project-root `AGENTS.md` and `MEMORY.md`.
2. Read both files completely when they exist.
3. If either file is missing, create it first from available project context before making other file or external-state changes.
4. If required fields cannot be inferred, ask for all missing fields at once.
5. Do not modify project files or external state before the two files exist, except to create these two files.

## MEMORY.md Rules

- Read `MEMORY.md` at the start of work.
- Actively append durable project learnings: architecture decisions, pitfalls, user corrections, and external resource locations.
- Do not store credential values. Store only credential locations or variable names.
- Do not duplicate code facts that can be cheaply read from source.
- Before ending a task, state what was newly added to `MEMORY.md`, or state that nothing was added.
- When changing `AGENTS.md` or `MEMORY.md` conventions, update documentation before changing practice.

## Project Snapshot

- Project name: `agent-canvas-mvp`.
- Workspace root: `/Users/kc/Documents/Agent_Canvas`.
- Created/confirmed date: 2026-07-07.
- Stack: Next.js, React, TypeScript, OpenAI Agents JS, SQLite Session, FluxInk MCP App widget, Azure realtime ASR. Canonical human snapshot: root `README.md`.
- Main app: `src/`.
- Embedded SDK/reference repo: `openai-agents-js/`.

## Local Commands

- `npm install`: install app dependencies.
- `npm run dev`: start Next.js development server.
- `npm run typecheck`: run TypeScript checking.
- `npm run build`: build the app.

## Engineering Guidelines

- Keep server-only secrets in environment variables and server routes.
- Browser code should call same-origin Next.js APIs, not MCP servers directly.
- Keep shared request/response contracts in `src/types/`.
- Keep agent orchestration in `src/lib/agent/` and MCP transport concerns in `src/lib/mcp/`.
- Validate user-facing behavior after runtime changes with focused typecheck/build or manual UI verification, depending on the changed surface.

