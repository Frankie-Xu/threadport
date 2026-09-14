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

Requires Node `>=24.0.0` for this v0.2 development checkout. CI runs Node 24. See [runtime and storage migration](docs/v0.2/07-storage-migration.md). Session adapters and the handoff CLI are available. Processing is local-only: source sessions and project contents are read, while exported artifacts are written to explicit or temporary destinations. See [CONTRIBUTING.md](CONTRIBUTING.md) for branch names, pull requests, and the quality gate.

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
- Portable mode is the default for every adapter. Nested repository paths stay relative; external filesystem paths receive opaque `external/<hash>` locators. These hashes are identifiers, not encryption. Recognizable complete paths in display text use the same containment checks, including sibling-name prefixes, traversal and quoted paths containing spaces. Source-aware normalization uses explicit POSIX or Windows rules. Windows drive-relative paths (such as `C:notes.txt`), paths without a drive, device namespaces, and paths with an unknown source root receive opaque locators. External relative locators include their source-root context, so they may differ from earlier exports. Relative SDK session-file locators are resolved from the same working directory used to read them. Path extraction from arbitrary prose remains heuristic. Use `--privacy local` or SDK `privacy: 'local'` only when retaining local paths is intentional.
- Command attempts remain chronological. A successful retry resolves only earlier failures with the same session, observed cwd, and exact command text; missing cwd stays unknown and never matches a known cwd. Redacted command/cwd identities cannot establish a successful retry. Explicit null exit codes stay unknown. Conventional direct npm/pnpm/yarn and supported test-runner invocations are classified as tests; unrecognized commands and shell compositions remain general commands. A legacy extraction accepts one session identity; split concatenated sessions into separate inputs.
- The latest visible user message supplies a **derived objective candidate**, which may only be a follow-up; confirm it before continuing. Earlier user messages and assistant plans remain message evidence, not adopted decisions. Chinese and English prohibition lines are retained as candidate constraints. Historical test results keep their observed outcome and explicitly mark current workspace validity unknown. Capsule v1 fields are unchanged. The internal task model preserves saved manual fields during derivation; persistent editing is planned for T08.
- Complete visible record strings are secret-redacted before summaries are truncated. Metadata also passes an output privacy boundary. Secret scanning is heuristic, not a guarantee that arbitrary credentials, encoded secrets, or personal information have been removed. Inspect artifacts before sharing.
- File tool calls without a recognized successful result remain attempts, not completed work. Unsupported/empty session formats are rejected. The adapters support the observed fixture formats, not every vendor version; result IDs are used where available, and ambiguous ID-less concurrent Gemini results remain unknown. See [compatibility evidence](docs/compatibility-evidence.md): Cursor has a narrowly tested transcript-only import; no live vendor version has full tool-evidence certification.

### Cursor Copy Transcript (limited import)

Cursor 3.20.10, Agents / **This Mac**, `Chat actions → Copy → Copy Transcript` was tested on macOS 26.6.2. Save the copied text as UTF-8 plain text (`.txt` or `.md`), then use the same extraction command:

```bash
node dist/src/cli.js extract --from cursor --session /path/to/cursor-transcript.txt --project /path/to/project --out /path/outside/project/capsule.json
```

The observed export is Markdown, not JSONL. It omits complete structured tool results. ThreadPort therefore imports it as **transcript-only**, writes a warning to stderr and into Capsule constraints, and sets `status: paused`. Visible user instructions and the latest visible assistant context are retained for review; assistant context is explicitly unverified. `files`, `commands`, `tests`, `failures`, `completed` and `decisions` remain empty. Current Git changes are independently recorded under `git`, not attributed to the session.

This narrow parser recognizes a title and `## User` / `## Assistant` sections. Fenced/indented code, quoted lines, tool bodies, hidden sections and unsupported sections are conservatively omitted; empty-user and unclosed-fence inputs fail. Markdown headings cannot authenticate roles and literal, unfenced role-like headings are ambiguous. Review the original export before acting. Long assistant review context is capped at 4,000 characters after secret redaction and explicitly marked when truncated. This is not lossless conversation migration, historical Git reconstruction or a promise of Cloud/IDE/CLI compatibility.

Structured JSON/JSONL inputs follow the shared evidence rules: objectives are candidates from the latest visible user message; command outcomes are scoped to the observed session, exact command and working directory. Structured command events recognize direct `node --test` / `node.exe --test` invocations (including following file arguments), not shell compositions; this does **not** recover missing test evidence from Markdown summaries.

Cursor's project-local native JSONL can also omit call IDs/results. Those sessions now warn about incomplete evidence, retain attempted operations as unknown and preserve the latest review instruction. An existing confirmed failure stays blocked; otherwise incomplete sessions are paused. Native timestamp/user-query wrappers are removed from the objective, not mistaken for task text. Blank or duplicated call IDs, or results preceding their calls, cannot supply a successful outcome.

For explicitly permitted single-session database evidence, a developer-only read-only exporter is available; see [Cursor evidence verification](docs/verification/cursor-native-evidence.md). It is experimental, requires the SQLite CLI, is not included in the npm package and does not discover sessions automatically. This richer path has been checked against the isolated test session, but does not certify every tool or release.

### Allowed Claude source discovery

The v0.2 `threadport/sources` SDK exposes `createSourceRegistry` and `createClaudeSource`. Configure explicit `roots` and a `sourceId`; the adapter never discovers roots from HOME. Iterate `discover(roots, signal)`, then call `read({candidate, cursor, maxEvents, signal})`, persisting its whole cursor. Continue while `hasMore` is true, including pages with zero events. Inspect warnings for partial lines, limits and reset requirements. The old extract API is unchanged. See [native source compatibility and limits](compatibility/claude-source.md); indexing is available through IndexService; UI integration follows in later tasks.

### Incremental indexing

`threadport/sources` now registers Claude and Codex. `threadport/indexing` provides `IndexService` for manual refresh, cancellation and optional 15-second refresh while a local service runs. Full cursors and event batches commit atomically; rescans preserve manual tasks and links. Database schema v2 adds durable cursor state and two scan lease slots. See [indexing and recovery](docs/v0.2/08-indexing.md) and [Codex format evidence](compatibility/codex-source.md).

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

`npm pack` builds through `prepack`; only runtime build files, SQL migrations, schemas, examples and package documentation are distributed. `check:pack` installs the tarball into an isolated directory and checks the CLI, public exports and native SQLite creation. CI runs these gates on Ubuntu, macOS and Windows with Node 24. The Git regression suite requires real file symlinks on every platform, including Windows; missing privileges fail the test instead of skipping it. Parsed Markdown assertions cover LF/CRLF/CR, and publication tests inject filesystem errors after preflight. Vitest 4.1.11 and Vite 6.4.3 are pinned together to fix the mocker advisory without unrelated dependency upgrades.

## Safety boundary

ThreadPort does not transfer hidden chain-of-thought, does not upload session data, and does not automatically run the next action. Consumers must validate the Capsule and ask for user confirmation before modifying a repository.

### Editable tasks SDK

The `threadport/tasks` entry supports manual task fields, revision conflicts, session associations and reversible lifecycle/archive changes. See [task management](docs/v0.2/09-task-management.md) for redaction preview, project boundaries and completion activity semantics. UI integration follows in the implementation plan.
