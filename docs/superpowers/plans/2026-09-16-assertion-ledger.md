# Assertion ledger Implementation Plan

> **For agentic workers:** Execute this plan inline, task by task. The user requested continued implementation, so no execution-choice pause is needed.

**Goal:** Deliver R05 as a traceable, revision-checked decision ledger with conflict blocking and an editable workbench.

**Architecture:** Append immutable assertion revisions alongside existing task fields. Group active confirmations by explicit topic and overlapping scope; never use timestamps to choose a winner. Only explicit confirmation and replacement can supersede an entry. Task revision advances atomically with every ledger mutation, invalidating prepared handoffs.

**Tech Stack:** Existing TypeScript/Zod/SQLite/Fastify/React, Node 24. No new dependencies.

## Global Constraints

- Preserve Capsule v1 and existing manual fields. Ledger constraints are additional; assistant suggestions cannot remove manual constraints.
- No semantic contradiction classifier is claimed. Users name a decision topic; different topics can be marked as conflicting through an explicit two-entry declaration when their scopes overlap.
- Indexing cannot write assertion revisions. Source references survive source loss and report unavailable; confirmed manual text survives reindexing.
- Append-only ledger, additive migration 006, previous binaries reject schema 6. No downgrade rewriting.
- Keep inherited user files untouched. Push only verified task commits to the already authorized branch.

## Task 1 — Contract/storage and regression

Files: `src/assertions/contracts.ts`, `src/assertions/compile.ts`, `src/storage/assertion-store.ts`, `migrations/006-assertions.sql`, `src/storage/sqlite-store.ts`, `src/storage/migrations.ts`, `tests/assertions/ledger.test.ts`.

Interfaces: `AssertionStore.view(taskId)` returns latest entries, immutable history, conflict groups and source availability. `append(taskId, expectedRevision, input)` adds a candidate or explicitly confirmed assertion and optional supersedes IDs. `transition(taskId, expectedRevision, id, state)` appends a confirmation/rejection revision; retired entries cannot revive. Each write invokes `saveTask({...task,revision:expectedRevision+1},expectedRevision)` inside the same immediate transaction.

- [ ] Write failures for explicit A→B replacement, candidate non-replacement, conflicts, wrong revision/task/scope and backwards replacement; run targeted Vitest.
- [ ] Add strict schemas and bounded append-only storage; new IDs may reference only existing confirmed/candidate entries in the same task and scope. This construction cannot create a cycle.
- [ ] Preserve revisions after index clearing and expose unavailable references; verify migration backup/rollback and reopen.

## Task 2 — Compile/API

Files: `src/handoff/prepare.ts`, `src/tasks/service.ts`, `src/tasks/export.ts`, `src/server/assertion-routes.ts`, `src/server/business-routes.ts`, `src/domain/errors.ts`, `src/server/app.ts`, `tests/assertions/handoff.test.ts`, `tests/server/assertions.test.ts`.

`compileAssertions(entries, workspaceId)` selects confirmed applicable decisions/constraints, keeps candidates separate, and returns explicit conflicts. Unresolved overlapping confirmations with different text block preparation with `ASSERTION_CONFLICT`; uncertain applicability also blocks. Mandatory confirmed content cannot be removed by the prompt budget loop.

- [ ] Test conflict refusal, only B compiled after explicit replacement, candidate marked unconfirmed, workspace scope and task-revision invalidation.
- [ ] Add authenticated list/append/transition routes using strict bodies and existing safe error mapping.
- [ ] Include ledger metadata in task export and prompt, keeping Capsule fields unchanged.

## Task 3 — Workbench and acceptance

Files: `web/src/features/task/assertions.tsx`, `web/src/features/task/detail.tsx`, `web/src/api.ts`, `tests/e2e/assertions.spec.ts`, `docs/adr/0013-assertion-ledger.md`, remediation status.

- [ ] Add labeled topic/type/scope/text/confirmation controls, candidate/confirmed/superseded history, explicit replacement selection, conflict messages and source-unavailable labels.
- [ ] Retain a failed/conflicting draft; refresh the baseline only on explicit user action and require another save.
- [ ] Browser scenario creates two conflicting decisions, sees preparation blocked, explicitly replaces both, and confirms only the replacement enters current decisions. Exercise concurrent draft preservation.
- [ ] Run full checks, Node24 browser and installed-package validation; record exact tested commit and publish verified commits. R06–R09 remain individually tracked; implement subsequent packages without inventing external certification.
