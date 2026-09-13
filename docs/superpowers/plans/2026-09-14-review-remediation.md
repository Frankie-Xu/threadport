# Review Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> Session exception: neither execution skill is installed. Execute inline using test-first checkpoints; do not delegate or pause for an execution choice already supplied by the user.

**Goal:** Repair F01–F15 from the 2026-09-14 review without adding automatic agent execution or changing Capsule v1 fields.

**Architecture:** Keep adapter parsing separate from one shared evidence reducer and one privacy boundary. Bind local output identity independently of portable display paths, publish artifacts with exclusive writes, and formalize handoff consumption without launching agents.

**Tech Stack:** TypeScript, Node >=20, Zod 3, Vitest, Git, npm.

## Global Constraints

- Capsule v1 fields are frozen.
- Do not execute `next_action`, upload session data, or add an MCP server.
- Synthetic fixtures only; never read live sessions for tests.
- Start at `31ae677`; preserve unrelated work and fetch before publishing.
- Each batch: failing regression, implementation, `npm run check`, separate commit.
- No main push, history rewrite, force push, or protection bypass.

## File boundaries

`src/privacy.ts`: path and metadata privacy. `src/adapters/common.ts`: evidence reducer/assembler. Adapter files: vendor-specific parsing only. `src/git.ts`: bounded normalized snapshot. `src/storage.ts`: exclusive publication. `src/cli.ts`: strict argument routing. `src/handoff.ts`: envelope schema. `src/targets.ts`: filesystem-only discovery. `src/markdown.ts`: escaped presentation. `scripts/pack-smoke.mjs`: installable artifact check.

### Batch 1 — Privacy and stable output identity (F01–F03)

Files: create `src/privacy.ts`, `tests/privacy.test.ts`; modify `src/adapters/common.ts`, `src/redact.ts`, `src/cli.ts`; add `tests/helpers.ts`.

Interfaces: `portablePath(value: string, root: string): string`; `protectCapsule(capsule: Capsule, privacy: 'local' | 'portable', roots: string[]): Capsule`. Preserve nested repo-relative paths, map external paths to hashed placeholders, redact all metadata and complete visible records before truncation. Redaction counts must include processing before assembly.

- [x] Add a synthetic project helper and a failing all-adapter test with absolute `src/a.ts` and `other/a.ts`, expecting two different relative paths and no source root anywhere in serialized output.
- [x] Run `npm test -- tests/privacy.test.ts`; expect failures for path identity and metadata leakage.
- [x] Apply path containment using `relative` + `isAbsolute`, never `resolve(rel)`; transform all display strings with known root mappings, sanitize session identifiers before schema validation, strip URL credentials. Use pre-parse redaction on visible record strings before reducers summarize them.

```ts
const rel = api.relative(root, api.resolve(root, value));
const inside = rel !== '..' && !rel.startsWith(`..${api.sep}`) && !api.isAbsolute(rel);
// inside -> rel normalized with '/', outside -> stable opaque external locator.
```

- [x] Test full private-key blocks crossing the 180-character summary limit and synthetic token session IDs; expect neither token nor key material in JSON or Markdown.
- [x] Run `npm run check`, commit `fix: preserve portable identity and redact before summarizing`.

### Batch 2 — Evidence and snapshot truthfulness (F04–F06, F08, F11)

Files: all `src/adapters/*.ts`, `src/git.ts`; create `tests/trace-regressions.test.ts`; extend `tests/git.test.ts`.

Interfaces: file `TraceEvent` carries `outcome: 'succeeded' | 'failed' | 'unknown'` and optional output. Shared reducer consumes ordered events; result association uses call IDs. Snapshot hashes index and worktree separately; `gitStateMatches` compares state, not project identity when a root is portable.

- [x] Add failed-edit, missing-result and fail/pass/fail regression cases.

```ts
const traces = tracesFromEvents([1, 0, 1].map(exitCode => ({
  type: 'command' as const, command: 'npm test', exitCode
})));
expect(traces.failures.some(f => !f.resolution)).toBe(true);
```

- [x] Run targeted tests and confirm failures.
- [x] Reduce attempts by result: only confirmed success enters completed; preserve and reopen failure history, retain latest confirmed file action. Reject transcripts with no observable events. Resolve source timestamps before calling assembler. Share shell exit parsing and use IDs for Gemini responses, rejecting ambiguous ID-less concurrency rather than guessing.
- [x] Add temporary Git repos for different indexes/same worktree, `RM` rename, detached HEAD, untracked content, outside/broken symlinks. Fingerprint staged and unstaged diffs separately, use lstat/readlink for symlinks, and enforce bounded reads.
- [x] Run `npm run check`, commit `fix: derive work state from verified results and complete git snapshots`.

### Batch 3 — Publication and CLI validation (F07, F09, F10)

Files: create `src/storage.ts`, `tests/storage.test.ts`; modify `src/cli.ts`, `tests/cli.test.ts`.

Interfaces: `writeArtifact(path: string, content: string, force: boolean): Promise<void>`; strict parser returns named values, flags, positional arguments. Default outputs live in an OS temp-backed ThreadPort directory outside the project, namespaced by canonical project path and agent; `--out` remains explicit.

- [x] Add positional-order, unknown/repeated option, missing-value and concurrent-output tests.

```ts
const outcomes = await Promise.allSettled([
  writeArtifact(path, 'first', false), writeArtifact(path, 'second', false)
]);
expect(outcomes.filter(x => x.status === 'fulfilled')).toHaveLength(1);
```

- [x] Confirm new tests fail before implementing.
- [x] Publish complete temp files with an atomic no-clobber hard link for no-force; rename only for explicit force, rejecting non-files. Validate all CLI arguments before writes. JSON is authoritative; emit Markdown as a separately rebuildable cache and report cache failures explicitly without pretending the JSON failed. Reject invalid destination types before extract writes.
- [x] Namespace by real project identity before path privacy; add `--privacy local|portable`; map markdown to `.md`. Ensure exporting from a fresh user repo does not dirty it.
- [x] Run `npm run check`, commit `fix: validate CLI inputs and publish artifacts without clobbering`.

### Batch 4 — Protocol and display contracts (F12–F14)

Files: create `src/handoff.ts`, `schema/handoff-v1.schema.json`, `tests/handoff.test.ts`, `tests/targets.test.ts`; modify `src/capsule.ts`, `src/targets.ts`, `src/markdown.ts`, `src/index.ts`, example Markdown and schema tests.

Interfaces: `handoffSchema`, `createHandoff`, `parseHandoff`; target discovery reports existence separately from launch support. No guessed shell launch string: the legacy suggestion API rejects unsupported automatic launch.

- [x] Add Zod/AJV shared valid/invalid corpus, malformed envelope, target discovery with a synthetic PATH, and rendered three-column-table regressions.

```ts
expect(() => parseHandoff(JSON.stringify({ protocol: 'threadport.handoff.v2' }))).toThrow();
expect(renderCapsuleMarkdown(capsule)).toContain('| --- | --- | --- |');
```

- [x] Confirm failures; align SHA casing with the existing JSON Schema. Define an envelope referencing Capsule v1 and literal false safety flags; route envelope validation explicitly.
- [x] Resolve executables from platform-specific PATH/PATHEXT using filesystem APIs; do not execute `which`, agent binaries or guessed commands. Escape Markdown data separately from trusted product headings and safety instructions.
- [x] Run `npm run check`, commit `fix: formalize handoff validation and safe presentation`.

### Batch 5 — Reproducible release and documentation (F15)

Files: `tsconfig.build.json`, `package.json`, lockfile only if dependencies change, `.github/workflows/ci.yml`, `scripts/pack-smoke.mjs`, README, SECURITY, remediation progress document.

- [x] Reproduce a clean archive pack lacking `dist/src/cli.js`; verify existing build includes `dist/tests`.
- [x] Build only `src` into a fresh output directory; add prepack build and `check:pack`. Install the produced tarball into a temporary directory, verify CLI help and public library import, and assert tests are absent from the package.
- [x] Add Ubuntu/macOS/Windows CI with Node 20/24 and keep the required aggregate `check` job intact.
- [x] Document the experimental adapter formats, output path/identity contract, hash migration, local privacy limitations, explicit launch non-support, and JSON/cache failure semantics. Run `npm audit`; handle dependency major updates separately if Node floor conflicts.
- [x] Run all checks, re-fetch remote, inspect staged diff, commit `build: verify clean package installation across platforms`, then publish a PR. Do not claim Windows or remote checks passed before observing results.

## Progress

Batches 1–5 are implemented, locally verified and published in PR #25. Final self-review also added result-arrival ordering and normalized Git diff configuration regressions. The first remote run passed Ubuntu/macOS and exposed Windows fixture line endings; a repository-local LF rule fixes that checkout issue, with the updated matrix pending. See `docs/review-remediation-2026-09-14.md` for evidence and limitations. The original review report is outside the repository at `../reports/threadport-deep-review-2026-09-14.md`. No runtime automation/launch is part of this remediation.
