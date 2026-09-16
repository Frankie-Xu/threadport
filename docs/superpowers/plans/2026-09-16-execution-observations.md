# Execution observations Implementation Plan

**Goal:** Produce R06 evidence from actual, authorized ThreadPort process launches, retaining unknown inner-Agent test scope.

**Architecture:** Add observation rows sealed after completion linked to launch attempts. Persist before-snapshot and narrow environment at claim; the OS spawn callback establishes start, and observed exit plus after-snapshot establishes completion. Project the outer process into preparation without rewriting native source history.

**Tech Stack:** Existing Node 24 / TypeScript / SQLite; no dependencies or automatic Agent runs.

- [x] Add protocol/storage with migration 007, immutable approved-plan references and nullable test counts.
- [x] Integrate start/spawn/finish in `src/targets/launch.ts`; retain unknown workspace reservations on evidence-persistence ambiguity.
- [x] Project observations through `src/handoff/evidence.ts` and `src/handoff/prepare.ts`; unknown or incomplete environment never becomes current.
- [x] Actual-process regression: approved Node fixture executes, observation saves pre/post snapshot, a later file edit makes the historical result stale. Crash/missing completion stays unverified; null count stays null.
- [x] Validate migration failure rollback, full checks and Node24 final candidate installation; document outer-process scope before pushing.

Final Node24 verification: clean commit `44a23b5`, 432 tests, 7 browser workflows and the 217-file isolated installed package passed. See the remediation evidence record for limits and exact artifact digest.
