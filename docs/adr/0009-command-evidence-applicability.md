# ADR 0009: Separate historical command results from current applicability

Date: 2026-09-16. Status: implemented locally, subject to maintainer review.

## Problem

The original handoff compiler chose the last command carrying a snapshot ID. A later matching command could hide an earlier changed workspace. A missing or foreign historical snapshot fell back to checking the current preparation snapshot. Every retained command then received the same unknown-validity summary, regardless of its own evidence.

## Decision

Evaluate every command in the explicitly selected source session against the same preparation snapshot. A snapshot lookup is cached by ID; the evaluator does not execute commands or capture the workspace again. Preparation still independently verifies its review snapshot before saving. Existing confirmation and terminal checks remain in place.

`src/evidence/command.ts` owns the strict Zod contract `threadport.command-evidence.v1` and derives its TypeScript type from that contract. Each item separates:

- Historical command outcome and exact recorded exit code, including null; success means command exit 0, not a certified test suite.
- Workspace comparison: matched, drifted, unverifiable, historical/reference snapshot IDs, declared scope and reasons.
- Overall applicability: stale, unknown, unverified. Current is intentionally unsupported while environment and test-scope evidence are unavailable.
- Unknown environment and test scope. No argv, test counts or timestamps are invented from a command string.

Missing result, incomplete source excerpt or inconsistent event/run identity yields unverified. A known exit result with a changed recorded workspace yields stale. Missing snapshots, wrong workspace identity, incomplete captures, or matching workspace with unobserved environment yield unknown. Stale does not change the historical success/failure result.

The summary workspace status is conservative across all commands: unverifiable takes precedence over drifted, which takes precedence over matched. Reasons include all encountered workspace problems. Its snapshot ID identifies a representative comparison, not a certification of all commands. When no historical reference exists, the required legacy summary ID points to the reviewed snapshot with an explicit unavailable-history reason; per-command `snapshotId` remains null. When there are no recorded commands, the summary refers only to the preparation snapshot.

Count-based applicability warnings survive the 20-event selection and the 32 KiB UTF-8 prompt budget. An omitted command is still counted, but its full details are not promised. Every retained command contains the detailed object at `evidence[].commandEvidence` inside the prompt JSON. Existing Capsule command summaries also distinguish stale and unknown outcomes.

## Compatibility and privacy

No Capsule v1 field, task-handoff envelope field, database table, schema version, runtime or dependency is changed. The prompt already carries compiler-produced JSON with selected evidence; this adds versioned evidence inside that text. Old saved handoffs remain readable and are never rewritten or promoted retroactively. Full text continues through the same privacy validation, digest, persistence, preview, export and terminal transport. This is evidence evaluation, not execution authorization.

Overflow now returns `CONTEXT_BUDGET_EXCEEDED`, HTTP 422 and CLI exit 2. Existing integrations that assumed `INVALID_INPUT` for this specific case should recognize the more precise code. The workbench and CLI explain how to narrow scope while retaining constraints. No partial handoff is saved.

## Limits and rollback

Native source adapters currently have no trustworthy historical snapshot association and keep `snapshotId: null`; those results remain unknown or unverified. Real command-to-snapshot/environment capture is a separate producer work package. Current test certification, assertion-level revision history, target permission binding and transport changes are out of scope.

Revert the entire work package, including error consumers and tests, together. No database downgrade is required; old code treats new evidence as frozen prompt text. Existing prepared artifacts remain reviewable. Rollback is a documented procedure, not a performed recovery test. Real Agent/platform certification and the existing release HOLD remain separate.
