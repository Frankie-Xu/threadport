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

The current release is protocol-first. The first session adapter is available as a library call; the handoff CLI is the next layer. The core remains local-only, deterministic, and read-only.

```ts
import { createClaudeAdapter, createCodexAdapter, createCursorAdapter } from "threadport";

const capsule = await createCursorAdapter().extract({
  sessionPath: "./tests/fixtures/cursor/session-basic.jsonl",
  project: { name: "my-app", root: process.cwd() }
});
```

`createClaudeAdapter` and `createCodexAdapter` take the same input. Pass a local session file or already-read text. Adapters map observable traces onto Capsule v1; they do not execute `next_action`, and they do not treat the session file as a published vendor schema.

## Handoff CLI

Read-only local commands. After `npm run build`, `threadport` writes Capsules under `.threadport/` (gitignored):

```bash
npx threadport extract --from claude --session ./session.jsonl --project .
npx threadport validate .threadport/<id>.json
npx threadport render .threadport/<id>.json
```

The CLI validates before writing and does not run `next_action`. `--from` accepts `claude`, `codex`, and `cursor`.

## Safety boundary

ThreadPort does not transfer hidden chain-of-thought, does not upload session data, and does not automatically run the next action. Consumers must validate the Capsule and ask for user confirmation before modifying a repository.
