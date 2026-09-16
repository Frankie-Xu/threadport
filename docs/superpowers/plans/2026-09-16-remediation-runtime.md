# Remediation runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the report's baseline and runtime/reading stage in separately verified local commits.

**Architecture:** Keep existing task handoffs and Capsule v1. Freeze a terminal-only launch plan before consent, bind it to single-use approval, coordinate runs by canonical workspace inside the data store, and represent lost observers as unknown. Version workspace reading policy and conservatively reject incomplete captures. Keep external certification gates explicit.

**Tech Stack:** TypeScript, Node 24, existing SQLite/Fastify/React and test infrastructure. No new dependencies.

## Global Constraints

- Preserve unrelated working-tree changes. Source logs and user repositories remain read-only to ThreadPort inspection.
- No automatic target execution or real-user recruitment as part of implementation tests.
- Maintain `shell:false`, explicit TTY confirmation and byte-exact context.
- No destructive database downgrade; additive migration must keep backups and fail transactionally.
- Execute inline with the repository workflow; optional helper skills in the template are unavailable.

## Ordered work packages

1. **R01:** Commit only the already verified evidence increment and its report. Check out that exact commit in a detached temporary worktree; run locked installation, `npm run check`, and `THREADPORT_TEST_CHROME=1 npm run test:package` with `/opt/homebrew/opt/node@24/bin` first in PATH. Retain manifest and tarball outside the source tree. Commit checks never include unrelated user files.
2. **R02:** Add `src/targets/review.ts` with `freezeLaunchPlan` and `verifyLaunchPlan`; modify `src/targets/launch.ts` to prepare before review and compare again before consumption. Record the plan in `src/storage/handoff-store.ts` approval and require it in `src/storage/launch-store.ts`. Add `tests/targets/review.test.ts` and extend launch tests for executable replacement, argument/version/cwd/transport changes, cancellation and one-use consumption.
3. **R03:** Add migration `005-launch-coordination.sql`, process identity observation, workspace reservation and immutable recovery records. Extend launch storage and process gateway; unknown never frees the reservation automatically. Add CLI inspection/recovery with typed terminal phrase and expected run nonce. Keep data deletion/retention from bypassing unknown runs. Test multiple handoffs, independent worktrees, dead observers, identity reuse and explicit recovery. Coordination is within one application data directory; using multiple independent stores for a workspace remains unsupported and must be stated.
4. **R04:** Add versioned scope policy and snapshot metadata. Deny sensitive-file content reads before opening, classify special cases explicitly, preserve old snapshots but forbid cross-policy matching. Keep unsupported non-UTF8/unborn/submodule/symlink cases explicit rather than claiming coverage. Test intercepted file reads, tracked secrets, missing files, scope version mismatch and prepare refusal.
5. **R10:** Update the documentation entry, quality-gate script descriptions, release/compatibility/development handoff and a single remediation status page. Preserve historical results; R05–R09 remain individually tracked with acceptance prerequisites, not marked complete by this runtime stage.

## Test-first checks and completion records

- [x] R01 exact-commit Node24 baseline and installed-browser check pass.
- [x] R02 tests fail when confirmation can change the executable or arguments; freeze/compare fix makes them pass.
- [x] R03 tests fail when separate handoffs overlap; transactional coordination and unknown recovery make them pass. Test migration failure rollback.
- [x] R04 tests prove synthetic secret files are never opened for content; old/new policies cannot match.
- [ ] Run targeted tests for each package, then full checks and Node24 installed-browser package checks on the final runtime commit.
- [ ] Update status with actual commits, test results, remaining platform/real-Agent/user requirements, and rollback constraints.

## Review and rollback

R02 retains schema 4; its consumers must be reverted with it. R03 increases the schema version; older code refuses the upgraded database. Prefer a forward fix and retain run/recovery history. R04 keeps old snapshot records readable but requires new preparation before launch. All runtime changes receive a local self-review; this is not external certification. No push, PR, tag or publication is performed.
