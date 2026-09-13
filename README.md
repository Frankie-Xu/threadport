# ThreadPort

[![CI](https://github.com/Frankie-Xu/threadport/actions/workflows/ci.yml/badge.svg)](https://github.com/Frankie-Xu/threadport/actions/workflows/ci.yml)

Portable, verifiable work state for coding agents.

> Move the work, not the conversation.

This repository contains the first implementation of the ThreadPort Context Capsule v1 format. A Capsule records observable work state — objective, decisions, files, commands, tests, Git identity, evidence, and the next action — so a task can move between Claude Code, Codex, Cursor, and Gemini without copying hidden reasoning or silently executing code.

## Current implementation

The planned task workspace is specified in the [v0.2 development documentation](docs/v0.2/README.md) (Chinese), including phased implementation and acceptance criteria. It describes planned behavior; the implementation below remains the current CLI foundation.

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

Requires Node `>=20`. CI runs that gate on Node 20 and Node 24. Session adapters and the handoff CLI are available. Processing is local-only: source sessions and project contents are read, while exported artifacts are written to explicit or temporary destinations. See [CONTRIBUTING.md](CONTRIBUTING.md) for branch names, pull requests, and the quality gate.

```ts
import { createClaudeAdapter, createCodexAdapter, createCursorAdapter, createGeminiAdapter } from "threadport";

const capsule = await createGeminiAdapter().extract({
  sessionPath: "./tests/fixtures/gemini/session-basic.json",
  project: { name: "my-app", root: process.cwd() }
});
```

`createClaudeAdapter`, `createCodexAdapter`, and `createCursorAdapter` take the same input. Pass a local session file or already-read text. Adapters map observable traces onto Capsule v1; they do not execute `next_action`, and they do not treat the session file as a published vendor schema.

## Handoff CLI

Local artifact commands. After `npm run build`, invoke the built CLI directly:

```bash
node dist/src/cli.js extract --from claude --session ./session.jsonl --project .
node dist/src/cli.js validate /path/printed/by/extract.json
node dist/src/cli.js render /path/printed/by/extract.json
node dist/src/cli.js handoff --to codex /path/to/capsule.json --format json --out ./handoff.json
node dist/src/cli.js validate --handoff ./handoff.json
node dist/src/cli.js targets
```

The CLI validates before writing and does not run `next_action`. `--from` accepts `claude`, `codex`, `cursor`, and `gemini`. After installing a built package, `threadport` is the equivalent executable. Do not use `npx threadport` as a substitute for building this checkout: it can resolve a registry package.

### Output and privacy contracts

- Default output is under the operating-system temporary directory, in a user-specific `threadport-*` directory, outside the source project. The namespace includes the canonical local project path hash and source agent; session IDs are scoped to this namespace. It is not a global cross-device repository identifier. Temporary artifacts may be cleaned by the OS; choose `--out` outside the project for durable storage.
- The CLI prints successful output paths. `--out` selects an explicit destination; no file is replaced without `--force`. JSON is authoritative. Markdown is a rebuildable cache: a cache failure after JSON publication emits a warning and retains the saved JSON. This is not a two-file transaction.
- Portable mode is the default for every adapter. Nested repository paths stay relative; external filesystem paths receive opaque `external/<hash>` locators. These hashes are identifiers, not encryption. Recognizable complete paths in display text use the same containment checks, including sibling-name prefixes, traversal and quoted paths containing spaces. Path extraction from arbitrary prose remains heuristic. Use `--privacy local` or SDK `privacy: 'local'` only when retaining local paths is intentional.
- Complete visible record strings are secret-redacted before summaries are truncated. Metadata also passes an output privacy boundary. Secret scanning is heuristic, not a guarantee that arbitrary credentials, encoded secrets, or personal information have been removed. Inspect artifacts before sharing.
- File tool calls without a recognized successful result remain attempts, not completed work. Unsupported/empty session formats are rejected. The adapters support the observed fixture formats, not every vendor version; result IDs are used where available, and ambiguous ID-less concurrent Gemini results remain unknown. See [compatibility evidence](docs/compatibility-evidence.md): no live vendor version is currently certified.

### Git fingerprints and handoff boundary

Snapshots distinguish HEAD-to-index, index-to-worktree, and untracked contents, including symlinks as links. They use a new domain-separated hash algorithm, so capsules exported by the old incomplete algorithm must be re-extracted before comparing. No Capsule v1 fields were added. Git output is capped at 32 MiB per command with a 30-second timeout; aggregate untracked regular-file content is capped at 64 MiB. Ignore generated data before extraction. Snapshot consistency checks are best-effort; no repository lock or atomic filesystem snapshot is claimed.

`gitStateMatches` compares work state, not repository identity. A portable `root: '.'` does not fail solely because the local path differs. Consumers must independently bind the intended repository before using this result; matching hashes alone do not authorize edits.

`handoff` exports Markdown (`.md`) or a strict `threadport.handoff.v1` envelope. The public `createHandoff`, `parseHandoff`, and `handoffSchema` APIs and `schema/handoff-v1.schema.json` define this envelope. Register `schema/capsule-v1.schema.json` with offline JSON Schema validators to resolve its reference. Consumers must validate both the envelope and capsule. Safety flags declare a no-execution workflow; they are not a sandbox.

`targets` only locates candidates using PATH/PATHEXT. It does not run agents or lookup utilities. Every candidate reports `launch_supported: false`; existence does not establish vendor identity or a compatible CLI version. The old `suggestedLaunch` API now rejects automatic launching rather than returning an unverified shell command. There is no resume/apply/launch command.

### Release verification

```bash
npm ci
npm run check
npm run check:pack
npm audit
```

`npm pack` builds through `prepack`; only runtime build files, schemas, examples and package documentation are distributed. `check:pack` installs the tarball into an isolated directory and checks the CLI and public exports. CI runs these gates on Ubuntu, macOS and Windows with Node 20 and 24. The Git regression suite requires real file symlinks on every platform, including Windows; missing privileges fail the test instead of skipping it. Parsed Markdown assertions cover LF/CRLF/CR, and publication tests inject filesystem errors after preflight. Vitest 4.1.11 and Vite 6.4.3 are pinned together to fix the mocker advisory while retaining Node 20 support.

## Safety boundary

ThreadPort does not transfer hidden chain-of-thought, does not upload session data, and does not automatically run the next action. Consumers must validate the Capsule and ask for user confirmation before modifying a repository.
