# Cursor Follow-up Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate current main without losing Cursor evidence safeguards, fix reproducible adapter gaps and report the exact remaining certification boundaries.

**Architecture:** Keep Capsule v1 unchanged. Preserve upstream exact command/session/cwd identity and latest-user derived task rules; layer Cursor-specific conversion and conservative evidence warnings on that model.

**Tech Stack:** TypeScript, Zod, Vitest, Node 24, optional SQLite CLI.

## Global Constraints

- Baseline: `8a1a225` (PR #29 and #30). Existing feature branch and task-owned uncommitted edits preserved in a recovery stash.
- Related T03/T04, F05, Q03/Q05/Q15; legacy manual extraction only, not native Cursor continuation.
- No source log mutation, global session discovery, account setup, publication, commits or changes to Cursor approval settings.
- Execute inline as already requested by the user; referenced superpowers execution skills are unavailable.
- Self-review, not independent audit. Live shell rejection is not file-edit rejection certification.

## Task 1: Reconcile upstream contracts

Files: `src/adapters/common.ts`, `src/adapters/message-events.ts`, `tests/adapters/cursor.test.ts`.

- [x] Resolve stash conflicts retaining upstream `sourceTimestamp`, exact command text/cwd/session identity, latest-user objective, and local sparse-evidence warnings.
- [x] Preserve upstream direct-invocation regex and add Node `--test` invocations, including unquoted absolute executable paths required by the existing regression. Shell compositions remain excluded.
- [x] Run `env PATH="/opt/homebrew/opt/node@24/bin:$PATH" npm run check`; inspect every failure against new contracts before changing assertions. Initial integrated baseline had 217 passing/2 failing checks: compound shell was no longer an inner test; absolute Node invocation needed restoration.

## Task 2: Native evidence regressions

Files: `src/adapters/cursor-native.ts`, `tests/adapters/cursor-native.test.ts`.

Interfaces: `cursorNativeRecords(value: unknown): SessionRecord[]` converts selected evidence; `createCursorAdapter().extract(input)` returns the existing Capsule.

- [x] Add synthetic fail/pass calls of the same command in different `cwd` values and assert the failure is unresolved. Add a same-cwd retry control that resolves it.
- [x] Verify native conversion preserves exact command bytes and cwd using:

```ts
const records = cursorNativeRecords(envelope([tool]));
const call = records.flatMap(r => Array.isArray(r.content) ? r.content : []).find(b => b.type === 'tool_use');
expect(call?.input).toEqual({ command: 'node --test', cwd: '/synthetic/a' });
```

- [x] Run `npx vitest run tests/adapters/cursor-native.test.ts tests/adapters/cursor.test.ts` before the fix: missing-cwd assertion failed and the extra preceding-result regression falsely reported a completed edit.
- [x] Preserve cwd in shell input and in normalized inner commands:

```ts
input = { command: params?.command ?? '', cwd: params?.cwd ?? null };
// Once the exact observed wrapper is recognized:
input = { command: 'node --test', cwd: params?.cwd ?? null };
```

- [x] Add pending and misleading `notInterrupted: true` partial-output regressions; both must keep the exit unknown. No inference of interruption from assistant prose.
- [x] Inspect correlation ordering and exporter fail-closed behavior; preceding-result false completion reproduced and fixed by requiring `candidate.order > order`. Existing real-SQLite selected export/overwrite/missing-session tests pass. Added CLI native/sparse warning round trips.

## Task 3: Verification and handoff

Files: `docs/verification/cursor-native-evidence.md`, `docs/compatibility-evidence.md`, `docs/adr/0008-cursor-selected-evidence.md` and references.

- [x] Resolve duplicate ADR 0007 number introduced by upstream using 0008; update local references.
- [x] Run Node 24 `npm run check` (223 tests/26 files), `npm run check:pack` (59 files), `npm audit` (0 vulnerabilities), `git diff --check`.
- [x] Re-import three previously authorized private test snapshots with fresh output filenames and verify fail/pass/fail, rejected and unknown commands, no leaked local paths, and latest-user objective semantics.
- [x] Record passed checks and remaining live file-edit rejection, versions/platforms, native continuation and publication gaps separately. Source tests and restored approval mode were not changed during this review.

Final documentation check: 39 local destinations in 30 Markdown files. Implementation and documentation remain local and uncommitted. See `docs/verification/cursor-native-evidence.md` for the evidence-based completion boundary.

Self-review: scoped contracts and interfaces are explicit; the user requested execution, so no further execution-choice pause is needed. No commits are planned because this repository delegates local commits to the maintainer.
