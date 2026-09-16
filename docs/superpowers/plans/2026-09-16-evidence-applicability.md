# Historical evidence applicability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Preserve each recorded command outcome while explaining whether its recorded workspace has changed in the frozen handoff.

**Architecture:** Reuse the existing workspace fingerprint and immutable handoff. A pure snapshot comparator and a pure command-evidence evaluator separate historical exit results from workspace comparison and overall applicability. The compiler evaluates all selected-session commands once, preserves aggregate uncertainty even when older excerpts are omitted, and renders per-command evidence into the existing frozen prompt.

**Tech Stack:** Existing TypeScript, Zod, Fastify, SQLite, Vitest; no new dependencies.

## Global Constraints

- Capsule v1 fields and existing CLI output formats stay compatible.
- Source logs, source code, and Git history remain read-only to the ThreadPort core.
- Never execute commands or `next_action` taken from a log.
- No raw-session upload, telemetry, accounts, LLM summarization, embedded terminal, or multi-Agent orchestration is in scope.
- The implementation is one local work package; the maintainer reviews and commits it. No remote publication is part of this task.
- Existing environment/argv/test-count evidence is incomplete: do not invent it or claim current test certification.

## Delivery card / local Issue draft

R04-EVIDENCE-01, guided by report sections 7, 9.2 and 18; extends existing T10-B/T12-B behavior. Base: `7f57a7917130014870a478951e4b650f97f3dd41`. Branch: `codex/r04-evidence-applicability`. Proposed subject: `feat(R04): retain per-command evidence applicability in handoffs`. Commit/PR: not created.

Dependencies: existing workspace snapshots, task revisions, handoff digest/confirmation. Consumers: preview, export and terminal continuation use the exact existing prompt. Exclusions: assertion ledger, environment capture, automatic test execution, runner transport redesign, database migration, UI redesign, real Agent certification. Those require separate work packages after this verified increment.

The optional execution helper skills named by the template are not installed. Execute directly in this task using the repository's native work-package and verification workflow; no delegation is needed.

## Files and responsibilities

- Create `src/evidence/command.ts`: versioned Zod output contract, pure per-event evaluation, human-readable outcome summary.
- Create `src/handoff/evidence.ts`: cached historical snapshot reads and aggregate warnings covering all selected-session commands.
- Modify `src/workspace/verify.ts`: expose comparison of two validated snapshots while retaining the capture-based API.
- Modify `src/handoff/prepare.ts`: evaluate each command against the same reviewed snapshot; preserve aggregate warning counts and selected per-command details in prompt JSON.
- Modify `src/domain/errors.ts`, `src/server/app.ts`, `src/cli.ts`, `web/src/api.ts`: actionable `CONTEXT_BUDGET_EXCEEDED` error, HTTP 422, CLI exit 2, user-facing explanation.
- Create `tests/evidence/command.test.ts`: applicability truth table, missing evidence and contract validation.
- Modify `tests/handoff/prepare.test.ts`, `tests/handoff/api-cli.test.ts`: real temporary Git/SQLite integration and stable budget errors. Reuse the existing `tests/handoff/confirm.test.ts` regression suite unchanged.
- Create `docs/verification/report-v0.2-audit.md` and `docs/adr/0009-command-evidence-applicability.md`; update `docs/v0.2/README.md`, `README.md` with the implemented boundary and follow-up work.

### Task 1: Evaluate recorded commands without running them

**Interfaces:** `compareWorkspaceSnapshots(snapshot: WorkspaceSnapshot, current: WorkspaceSnapshot): VerificationReport`; `evaluateCommandEvidence(event: NormalizedEvent, historical: WorkspaceSnapshot | null, current: WorkspaceSnapshot): CommandEvidence | null`; `commandEvidenceSummary(evidence: CommandEvidence): string`. Zod is the type source for `CommandEvidence`.

- [x] Add and run a failing truth-table test against synthetic snapshots. Key assertion:

```ts
const result = evaluateCommandEvidence(event, historical, { ...historical, id: 'review', digest: 'b'.repeat(64) });
expect(result).toMatchObject({
  historical: { result: 'succeeded', exitCode: 0 },
  applicability: 'stale',
  workspace: { status: 'drifted' },
});
```

- [x] Implement snapshot comparison without filesystem/process access, checking workspace identity before content. Preserve the current `verifyWorkspace` behavior by calling the same comparator after capture.
- [x] Implement conservative command evaluation: no command yields null; missing/incomplete execution evidence yields unverified; absent/wrong snapshot yields unknown; changed workspace with a recorded exit yields stale; matching workspace still yields unknown because runtime and external conditions were not observed. Do not emit current.
- [x] Validate generated structures with a strict, versioned Zod schema. Retain explicit null exit/times and unknown test scope/environment; never tokenize historical shell text into invented argv.
- [x] Run `npx vitest run tests/evidence/command.test.ts tests/workspace/verify.test.ts` and require all scenarios to pass.

### Task 2: Freeze applicability into the actual transfer

**Interfaces:** Existing `HandoffService.prepareHandoff` and `TaskHandoff` envelope remain compatible. `evidence[].commandEvidence` is new content inside prompt JSON; no envelope, Capsule v1 or database schema change.

- [x] Add failing integration tests for two commands with different snapshots, an older stale command outside the 20-event excerpt window, a missing historical snapshot and approval acknowledgement.
- [x] Cache snapshot lookups during preparation. Compare all selected-session commands against one capture and verify that capture again before persistence. The aggregate workspace report must not let a later match hide earlier drift or uncertainty.
- [x] Render retained evidence details plus count-based warnings that survive excerpt budgeting. Use per-command summaries for Capsule command rows. Preserve exit codes and leave test certification empty.
- [x] Replace generic overflow failure with `CONTEXT_BUDGET_EXCEEDED`, HTTP 422 and CLI exit 2. API/CLI regression assertion:

```ts
expect(response.status).toBe(422);
expect((await response.json()).error).toMatchObject({code: 'CONTEXT_BUDGET_EXCEEDED', retryable: false});
expect(await runCli(args, io)).toBe(2);
expect(errors).toContain('CONTEXT_BUDGET_EXCEEDED');
```

- [x] Run `npx vitest run tests/evidence/command.test.ts tests/workspace/verify.test.ts tests/handoff/prepare.test.ts tests/handoff/confirm.test.ts tests/handoff/api-cli.test.ts`.

### Task 3: Verify and document the delivery

- [x] Write the module/gap audit with baseline evidence and dependency-ordered next work packages, distinguish implementations from designs and real certification.
- [x] Document additive prompt semantics and rollback: revert this entire code package together; existing frozen prompts remain readable, no schema downgrade or user-data restoration is necessary. Rollback is planned, not performed.
- [x] Run `npm run check`, `npm run check:pack`, `npm run test:e2e` and `git diff --check`; record actual outcomes and environment. Review code paths for accidental command execution, source writes, missing redaction, stale-result promotion, and lost warnings.
- [x] Leave tested changes for maintainer review and commit, following CONTRIBUTING.md. Do not stage pre-existing work.

## Execution evidence

Completed locally on 2026-09-16: 57 files / 395 Vitest tests, typecheck/build/docs checks, isolated package installation, and 6 browser regressions using the existing `THREADPORT_TEST_CHROME=1` option. Default Playwright Chromium was unavailable; no page assertions ran in that first attempt. See the [delivery audit](../../verification/report-v0.2-audit.md) for exact environment, artifact digest, limitations and next work packages. No commit or PR created; this package remains ready for maintainer review.
