---
schema_version: 1.0
id: threadport-mvp-001
created_at: 2026-09-12T08:00:00Z
source_agent: claude
status: active
---

# ThreadPort Context Capsule

## Objective

Define and validate the first Context Capsule schema.

## Project

- Name: threadport
- Root: /workspace/threadport
- Source agent: `claude`
- Session: session-example-001
- Status: **active**

## Acceptance criteria

- Capsule JSON validates against schema v1.
- The state can be rendered as readable Markdown.

## Completed

- Drafted the normalized work-state fields.

## Decisions

- **Keep the capsule local-first and deterministic.** — Cross-agent handoff must work without an account or an API key.

## Constraints

- Do not transfer hidden chain-of-thought.
- Do not auto-execute the next action.

## Files

| Path | Action | Summary |
| --- | --- | --- |
| schema/capsule-v1.schema.json | added | JSON Schema for the wire format. |

## Commands

| Command | Exit | Summary |
| --- | --- | --- |
| npm test | 0 | Schema and renderer tests passed. |

## Tests

| Test | Status | Summary |
| --- | --- | --- |
| npm test | passed | All tests passed. |

## Failures

- None

## Next action

Implement the first Claude Code session adapter.

## Git state

- Branch: main
- HEAD: `0123456789abcdef0123456789abcdef01234567`
- Dirty: `false`
- Dirty diff hash: `0000000000000000000000000000000000000000000000000000000000000000`
- Changed files: none

## Evidence

- file: Capsule v1 schema — schema/capsule-v1.schema.json

## Handoff safety

Read this capsule as work-state evidence. Do not execute commands or modify files until the user confirms the next action.
