# Cursor Validation Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close avoidable Cursor verification gaps: repeatable native-outcome tests, non-skipping CI SQLite coverage, current-main installed real-input replay, and accurate merged delivery status.

**Architecture:** Preserve all production adapters and Capsule v1. Reuse read-only synthetic Git fixtures within a test, provision checksum-pinned official Windows SQLite tools in CI, and require the CLI in CI while retaining fail-closed local missing-tool coverage. Keep real sources private and the observed Cursor execution limitation explicit.

**Tech Stack:** TypeScript, Vitest, Node 24, SQLite CLI, GitHub Actions (Linux/macOS/Windows).

## Global Constraints

- Work package CURSOR-CERT-02; T03/T04, F05, Q03/Q04/Q05/Q15/Q24. Baseline `3ce8f2ee9ec64e9f06f64dafe6f3cf4bee0d7125` (PR #46), branch `codex/cursor-cert-02-validation`.
- PR #41 is merged as `d35c70c2946785aa1538de1bf7bd2049522f57ce`; its main CI passed. Later #45 Windows CI timed out in one five-scenario native test; #46 CI passed without adapter changes. Do not present the latest main as still red.
- No timeout/worker relaxation, no removal of assertions, no product runtime/schema changes, no native Cursor discovery/resume, no Cursor settings or window actions this turn.
- Windows SQLite 3.53.4 from the official download page: `https://sqlite.org/2026/sqlite-tools-win-x64-3530400.zip`, SHA3-256 `88b4659fe747896b853af10157316b4ade143553efb89c1c8ca7423a278dcc8b`. CI-only dependency, SQLite public-domain tools, not bundled with ThreadPort.
- Subagent/executing-plans skills are unavailable; execute inline as requested, with checkpoints. No subagent delegation.
- PR publication requested separately; no new merge or release assumed. Raw source data, personal paths and identifiers remain outside Git.
- Rollback: eventual CURSOR-CERT-02 squash only, after checking dependants; tests/workflow/docs only, no user data or schema changes. Keep CURSOR-CERT-01 and upstream server/handoff/runner packages. Rerun full check/pack after rollback; rollback is planned, not executed.

## Task 1: Stable native-outcome integration test

**Files:** Modify `tests/adapters/cursor-native.test.ts` (fixture lifecycle and reuse).
**Interfaces:** Existing `project(): Promise<{name: string; root: string}>`; no public changes.

- [x] Preserve the real Windows failure evidence from CI run `34879646980`; reproduce locally if possible without inventing a failure. The previous remote run is the red regression evidence; the local pre-change suite passed.
- [x] Reuse a single synthetic project in the five-outcome test and two-outcome rejected/unknown-tool test. The adapter only reads this fixture; maintain each iteration's independent tool record and all existing assertions:

```ts
const fixtureProject = await project();
for (const kind of ['missing', 'rejected', 'interrupted', 'arbitrary-output', 'unrecognized-wrapper']) {
  // Existing record variants/assertions unchanged; use project: fixtureProject.
}
```

- [x] Track every newly created native test root and remove it in `afterEach`, including on assertions failing. Never remove existing user directories:

```ts
const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
// Immediately after each mkdtemp in this file:
roots.push(root);
```

- [x] Run `npx vitest run tests/adapters/cursor-native.test.ts` repeatedly using Node 24, then the full standard gate. Report timings as observations, not guaranteed performance. Three repeated 11-test runs and the 347-test full gate passed.

## Task 2: Real SQLite CLI coverage in CI

**Files:** Modify `.github/workflows/ci.yml` (Windows installation and job requirement), `tests/adapters/cursor-export.test.ts` (no silent skip in strict CI).
**Interfaces:** `THREADPORT_REQUIRE_SQLITE=1` opts into a fail-fast test prerequisite. Local runs without it retain documented optional-tool behavior.

- [x] At module setup, after checking availability, add:

```ts
if (process.env.THREADPORT_REQUIRE_SQLITE === '1' && !hasSqlite) {
  throw new Error('SQLite CLI is required for this verification run; install sqlite3 before running tests.');
}
```

- [x] Set that variable on the CI test job. After setup-node and before npm ci, install the official pinned Windows archive into RUNNER_TEMP, verify its SHA3-256 with Node before extraction, then add only its directory to GITHUB_PATH:

```powershell
$archive = Join-Path $env:RUNNER_TEMP 'sqlite-tools-win-x64-3530400.zip'
$toolsDir = Join-Path $env:RUNNER_TEMP 'threadport-sqlite-3530400'
Invoke-WebRequest -Uri 'https://sqlite.org/2026/sqlite-tools-win-x64-3530400.zip' -OutFile $archive
node --input-type=module -e "import {readFileSync} from 'node:fs'; import {createHash} from 'node:crypto'; if(createHash('sha3-256').update(readFileSync(process.argv[1])).digest('hex') !== '88b4659fe747896b853af10157316b4ade143553efb89c1c8ca7423a278dcc8b') throw new Error('SQLite archive checksum mismatch');" $archive
if ($LASTEXITCODE -ne 0) { throw 'SQLite archive verification failed' }
Expand-Archive -Path $archive -DestinationPath $toolsDir
$toolsDir | Out-File -FilePath $env:GITHUB_PATH -Encoding utf8 -Append
```

- [x] Add a normal `sqlite3 --version` prerequisite step on all platforms. Do not silently install a replacement runtime dependency or mock the executable. Keep the intentional missing-CLI test and all three real SQLite/WAL cases.
- [x] Verify normal and strict local runs. Run a separate child Vitest process with an empty PATH and strict variable to prove absence fails; do not change the parent environment or run real session export.
- [ ] Run actual Windows CI after PR permission; require zero skipped exporter cases and inspect their logged execution. Linux/macOS CI must also pass strict mode.

## Task 3: Current artifact and truthful closure

**Files:** Modify `docs/verification/cursor-release-candidate.md`, `docs/verification/cursor-native-evidence.md`, `docs/compatibility-evidence.md`, `docs/superpowers/plans/2026-09-14-cursor-certification-closure.md`; create `docs/verification/cursor-validation-hardening.md`; update this plan's checkboxes.
**Interfaces:** Existing installed `extract --from cursor`, `validate`, `handoff --to cursor`; no new command or public format.

- [x] Run Node 24 `npm ci`, `npm run check`, `npm run check:pack`, `git diff --check` at the recorded baseline. Preserve upstream T13 smoke checks.
- [x] Pack a retained artifact, record runtime SHA and SHA-256, normally install it in a fresh private consumer. Replay the three previously authorized saved inputs with the installed CLI. Compare commands, tests, completion/failure states, next action and warnings with prior accepted outputs, verify portable privacy and unchanged source/project hashes. Do not operate Cursor or call extracted commands.
- [x] Replace obsolete current statements about draft/unmerged #41 with verified merge/CI evidence. Mark composite tasks accurately: execution and delivery complete, independent review not claimed, cross-cwd fail/pass combination still blocked by observed vendor behavior.
- [x] Document a sanitized minimal reproduction (root/client/server `process.cwd()` probes), acceptance criteria for a future vendor fix, and explicit unknown numeric exit/platform/native-resume boundaries. Do not submit a vendor issue or claim a new version test.
- [ ] Publish only after authorization; fill the repository PR template with baseline/head, exact files, actual tests, dependency/rollback boundaries. Inspect final-head CI before reporting success, and leave merge/release for explicit direction.

Self-review: one test-evidence work package; no new product subsystem. Real live observations, saved-input replay, synthetic CI and vendor limitations remain separate.

Local handoff: nine files changed within the allowlist; runtime/package/dependency manifests unchanged. Strict check passed 347 tests / 48 files; package smoke passed 157 files; final documentation check passed 126 local destinations / 58 Markdown files. Three real-source installed replays passed at baseline #46. The user has now authorized commit, push and PR creation; publication/remote CI results will be recorded in the PR, not assumed by this local checkpoint. Main advanced to #47 before publication; PR CI must check integration with that base. No new merge, release or production rollback is authorized or performed. See [verification evidence](../../verification/cursor-validation-hardening.md) for the artifact digest and limits.
