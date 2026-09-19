# Code Quality Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve ThreadPort's maintainability and search/runtime quality without changing public Capsule, handoff, or CLI contracts.

**Architecture:** Refactor by stable boundaries. First centralize request/domain contracts and make the existing format gate honest; then make in-memory job lifecycles explicit; then optimize search behind the existing `SearchService` interface; finally split the largest adapter module into focused pure helpers. Every stage keeps the current API surface and is validated by focused tests plus the full quality gate.

**Tech Stack:** TypeScript 5.9, Node.js 24+, Zod, Fastify, better-sqlite3, React, Vitest, Playwright.

## Global Constraints

- Preserve Capsule v1, handoff v1, database compatibility, public package exports, and CLI behavior.
- Keep Node `>=24.0.0` as the supported runtime and retain the locked dependency graph.
- Do not weaken redaction, loopback authentication, workspace boundary checks, or fail-closed evidence semantics.
- Do not claim performance improvement without running the fixed-capacity benchmark and recording p95 results.
- Keep each stage independently testable and revertible; do not mix generated artifacts or unrelated working-tree files into commits.

---

### Task 1: Establish a clean refactor baseline and document the actual format gate

**Files:**
- Modify: `CONTRIBUTING.md:18-20`
- Modify: `scripts/check-format.mjs:1-30`
- Test: `tests/scripts/check-format.test.ts` (create)

**Interfaces:**
- Consumes: existing `npm run check:format` command.
- Produces: a documented whitespace/line-ending gate and focused regression tests for it.

- [x] **Step 1: Add focused format-gate tests**

Create a test that runs the script against a temporary fixture tree by invoking the exported checker function. The checker must return the same failure messages currently printed by the CLI and must detect trailing whitespace, carriage returns, and missing directories without failing on absent roots.

- [x] **Step 2: Refactor the script into a testable function**

Export `checkFormat(root: string, roots = ['src', 'web/src', 'tests', 'scripts']): Promise<string[]>` and keep the CLI behavior under an `if (import.meta.url === pathToFileURL(process.argv[1]).href)` guard. Preserve the existing output and exit code.

- [x] **Step 3: Update contributor documentation**

Replace the claim that no automated format gate exists with the exact scope: the gate checks trailing whitespace and carriage returns only; it does not enforce indentation, wrapping, or lint rules. Keep `npm run check:format` and `git diff --check` documented separately.

- [x] **Step 4: Run focused and full checks**

Run `npm test -- tests/scripts/check-format.test.ts`, then `npm run check`. Expected: focused tests pass and the full gate remains green.

- [x] **Step 5: Commit** — implemented in `26e5f48` (`chore: make format gate testable and accurately documented`)

```bash
git add CONTRIBUTING.md scripts/check-format.mjs tests/scripts/check-format.test.ts
git commit -m "chore: make format gate testable and accurately documented"
```

### Task 2: Centralize task and API validation contracts

**Files:**
- Create: `src/contracts/identifiers.ts`
- Create: `src/contracts/task.ts`
- Modify: `src/tasks/contracts.ts`
- Modify: `src/storage/sqlite-store.ts:18-24`
- Modify: `src/server/business-routes.ts:17-22,44-49`
- Test: `tests/tasks/contracts.test.ts` (create)
- Test: `tests/public-api-compatibility.test.ts`

**Interfaces:**
- Consumes: existing `Task`, `TaskPatch`, `CreateTaskInput`, and `DomainError` behavior.
- Produces: shared `idSchema`, `taskSchema`, `taskWriteSchema`, `taskPatchSchema`, and `createTaskSchema` exports used by API and storage layers.

- [x] **Step 1: Write contract compatibility tests**

Cover title trimming rejection, field length limits, revision positivity, lifecycle enum values, strict unknown-field rejection, and the exact `INVALID_INPUT` error code returned by `validateTaskInput`.

- [x] **Step 2: Move shared schemas without changing limits**

Move only duplicated primitives and task shapes into `src/contracts`. Keep persistence-only validation separate where it validates stored `body_json`; do not broaden accepted input.

- [x] **Step 3: Replace inline route schemas**

Import shared identifiers and task input schemas in `business-routes.ts`; retain route-specific schemas for query/path parameters.

- [x] **Step 4: Replace storage duplicates**

Use the shared persisted task schema in `sqlite-store.ts`. Keep storage error translation and transaction boundaries unchanged.

- [x] **Step 5: Run focused and full checks**

Run `npm test -- tests/tasks/contracts.test.ts tests/public-api-compatibility.test.ts`, then `npm run check`.

- [x] **Step 6: Commit** — implemented in `2fc5e80` (`refactor: centralize task validation contracts`)

```bash
git add src/contracts src/tasks/contracts.ts src/storage/sqlite-store.ts src/server/business-routes.ts tests/tasks/contracts.test.ts tests/public-api-compatibility.test.ts
git commit -m "refactor: centralize task validation contracts"
```

### Task 3: Make indexing job retention explicit

**Files:**
- Modify: `src/server/business-routes.ts:26,36-43`
- Modify: `src/indexing/service.ts:11-29`
- Test: `tests/server/routes.test.ts`
- Test: `tests/indexing/service.test.ts`

**Interfaces:**
- Consumes: existing index-job HTTP endpoints and `IndexService.refresh/cancelAndWait`.
- Produces: terminal job cleanup with a bounded retention window; active jobs continue to coalesce by source.

- [x] **Step 1: Add tests for terminal cleanup and cancellation**

Verify that a completed job remains readable during its retention window, that deleting a job cancels unfinished sources, and that the job is removed after deletion. Verify that two concurrent requests for the same active source return the same job.

- [x] **Step 2: Add explicit job timestamps and retention**

Store `createdAt` and `finishedAt` on the in-memory job record. Add a private `pruneJobs(now = Date.now())` that removes terminal jobs older than a fixed 10-minute retention period and invoke it before creating or reading jobs.

- [x] **Step 3: Delete cancelled jobs after cancellation**

After `Promise.all` completes in the DELETE route, remove the job only if all requested sources are terminal. Preserve the existing response shape.

- [x] **Step 4: Run focused and full checks**

Run `npm test -- tests/server/routes.test.ts tests/indexing/service.test.ts`, then `npm run check`.

- [x] **Step 5: Commit** — implemented in `38a976e` (`refactor: bound index job retention`)

```bash
git add src/server/business-routes.ts src/indexing/service.ts tests/server/routes.test.ts tests/indexing/service.test.ts
git commit -m "refactor: bound index job retention"
```

### Task 4: Optimize search behind the existing service contract

**Files:**
- Modify: `src/storage/migrations.ts`
- Modify: `src/storage/index-store.ts`
- Modify: `src/storage/search-store.ts`
- Modify: `src/search/contracts.ts`
- Test: `tests/search/service.test.ts`
- Test: `tests/storage/migrations.test.ts`
- Test: `tests/indexing/service.test.ts`

**Interfaces:**
- Consumes: `SearchService.search(SearchInput): Promise<SearchPage>` and existing cursor semantics.
- Produces: equivalent literal search results, highlights, redaction behavior, stale-cursor behavior, and measurable lower p95 on the fixed dataset.

- [x] **Step 1: Freeze behavioral fixtures**

Add cases for Chinese text, ASCII case folding, literal `%`, `_`, backslash, NUL, multiple terms, pagination, redaction, and stale generations. Record expected item IDs and match offsets.

- [x] **Step 2: Add a schema-versioned search projection**

Add only the minimal migration needed for a normalized search projection. Populate it atomically from indexed events and task fields; preserve the current source-of-truth JSON columns.

- [x] **Step 3: Route candidate selection through the projection**

Keep the current `SearchPage` assembly and `snippet` behavior. Change only candidate selection so the query no longer applies a correlated event scan once per term.

- [x] **Step 4: Run correctness checks before measuring**

Run focused search, migration, and indexing tests. Expected: all existing and new fixtures pass with identical cursor and match semantics.

- [ ] **Step 5: Run the fixed benchmark**

Run `npm run bench --silent > /tmp/threadport-search-refactor.json`. Compare API p95, indexing time, RSS, and cancellation against the current baseline. Keep the refactor only if correctness is unchanged and the measured search p95 improves without violating memory or capacity limits.

- [x] **Step 6: Commit** — implemented in `4450ced`, refined in `953d23b`

```bash
git add src/storage/migrations.ts src/storage/index-store.ts src/storage/search-store.ts src/search/contracts.ts tests/search/service.test.ts tests/storage/migrations.test.ts tests/indexing/service.test.ts
git commit -m "perf: optimize literal history search projection"
```

### Task 5: Split adapter normalization into focused modules

**Files:**
- Create: `src/adapters/session-records.ts`
- Create: `src/adapters/trace-normalizer.ts`
- Create: `src/adapters/command-evidence.ts`
- Modify: `src/adapters/common.ts`
- Modify: `src/adapters/claude.ts`
- Modify: `src/adapters/codex.ts`
- Modify: `src/adapters/gemini.ts`
- Modify: `src/adapters/cursor.ts`
- Test: existing adapter and trace regression suites

**Interfaces:**
- Consumes: current `TraceEvent`, `SessionTraces`, `ToolResult`, and capsule assembly functions.
- Produces: identical exported adapter behavior and stable IDs, command outcomes, privacy notes, and historical evidence semantics.

- [x] **Step 1: Characterize current behavior**

Run all adapter and trace regression suites and record the baseline test count and package build hash.

- [x] **Step 2: Extract pure record parsing**

Move `parseSessionRecords`, `loadSessionText`, `isRecord`, `asString`, timestamp helpers, and exit-code parsing into `session-records.ts` without changing signatures.

- [x] **Step 3: Extract trace normalization**

Move `tracesFromEvents`, acceptance extraction, failure collapsing, and completion helpers into `trace-normalizer.ts`.

- [x] **Step 4: Extract command evidence helpers**

Move command grouping, test classification, and command result conversion into `command-evidence.ts`. Keep `TEST_COMMAND` and historical notes exported from the same module to preserve imports.

- [x] **Step 5: Keep `common.ts` as a compatibility façade**

Re-export the existing public helper names from `common.ts` so adapters and downstream imports do not change.

- [x] **Step 6: Run focused validation**

Run `npm run check`, `npm run test:e2e`, and `npm run test:package`. Expected: no snapshot, schema, CLI, or package-export changes.

- [x] **Step 7: Commit** — implemented in `7ddb792`

```bash
git add src/adapters tests
git commit -m "refactor: split adapter normalization responsibilities"
```

### Task 6: Tighten quality gates and close documentation drift

**Files:**
- Modify: `tsconfig.json`
- Modify: `package.json`
- Modify: `.github/workflows/ci.yml`
- Modify: `CONTRIBUTING.md`
- Create: `vitest.coverage.config.ts`
- Test: CI validation and coverage configuration

**Interfaces:**
- Consumes: current TypeScript, Vitest, and CI commands.
- Produces: explicit formatter/lint scope, coverage reporting, and incremental strictness flags.

- [x] **Step 1: Add coverage configuration**

Add a coverage command that reports text, JSON, and HTML output. Start with a documented threshold for lines/functions/statements and raise it only after measuring the current baseline.

- [x] **Step 2: Evaluate incremental strictness; defer `noUncheckedIndexedAccess` because it produces a separate large migration**

Enable `noUncheckedIndexedAccess` first, fix only resulting type errors, then evaluate `exactOptionalPropertyTypes` in a separate commit.

- [x] **Step 3: Align CI and contributor docs**

Run the same quality commands locally and in CI; document which checks are mandatory and which are diagnostic.

- [x] **Step 4: Run typecheck, coverage, e2e, package, and audit gates**

Run `npm run check`, `npm run test:e2e`, `npm run test:package`, and `npm audit`.

- [x] **Step 5: Commit** — implemented in `3553014`

```bash
git add tsconfig.json package.json .github/workflows/ci.yml CONTRIBUTING.md vitest.coverage.config.ts
git commit -m "chore: strengthen type and coverage quality gates"
```
