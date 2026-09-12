# ThreadPort

Portable, verifiable work state for coding agents.

> Move the work, not the conversation.

This repository contains the first implementation of the ThreadPort Context Capsule v1 format. A Capsule records observable work state — objective, decisions, files, commands, tests, Git identity, evidence, and the next action — so a task can move between Claude Code, Codex, Cursor, and Gemini without copying hidden reasoning or silently executing code.

## Current implementation

- JSON Schema: `schema/capsule-v1.schema.json`
- TypeScript validator and serializer: `src/capsule.ts`
- Readable Markdown renderer: `src/markdown.ts`
- Git state model and dirty-diff hash: `src/git.ts`
- Secret redaction: `src/redact.ts`
- Example Capsule: `examples/capsule-v1.json`

## Run

```bash
npm install
npm test
npm run build
```

The current release is protocol-first. Agent session adapters and the handoff CLI are the next layer; the core remains local-only, deterministic, and read-only.

## Safety boundary

ThreadPort does not transfer hidden chain-of-thought, does not upload session data, and does not automatically run the next action. Consumers must validate the Capsule and ask for user confirmation before modifying a repository.
