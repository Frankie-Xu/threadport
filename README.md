# ThreadPort

[![CI](https://github.com/Frankie-Xu/threadport/actions/workflows/ci.yml/badge.svg)](https://github.com/Frankie-Xu/threadport/actions/workflows/ci.yml)

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
npm ci
npm run check
```

Requires Node `>=20`. CI runs that gate on Node 20 and Node 24. Session adapters and the handoff CLI are available. The core remains local-only, deterministic, and read-only. See [CONTRIBUTING.md](CONTRIBUTING.md) for branch names, pull requests, and the quality gate.

```ts
import { createClaudeAdapter, createCodexAdapter, createCursorAdapter, createGeminiAdapter } from "threadport";

const capsule = await createGeminiAdapter().extract({
  sessionPath: "./tests/fixtures/gemini/session-basic.json",
  project: { name: "my-app", root: process.cwd() }
});
```

`createClaudeAdapter`, `createCodexAdapter`, and `createCursorAdapter` take the same input. Pass a local session file or already-read text. Adapters map observable traces onto Capsule v1; they do not execute `next_action`, and they do not treat the session file as a published vendor schema.

## Handoff CLI

Read-only local commands. After `npm run build`, `threadport` writes Capsules under `.threadport/` (gitignored):

```bash
npx threadport extract --from claude --session ./session.jsonl --project .
npx threadport validate .threadport/<id>.json
npx threadport render .threadport/<id>.json
```

The CLI validates before writing and does not run `next_action`. `--from` accepts `claude`, `codex`, `cursor`, and `gemini`.

## Safety boundary

ThreadPort does not transfer hidden chain-of-thought, does not upload session data, and does not automatically run the next action. Consumers must validate the Capsule and ask for user confirmation before modifying a repository.
