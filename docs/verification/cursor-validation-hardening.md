# Cursor validation hardening — CURSOR-CERT-02

Date: 2026-09-15. Baseline/runtime **`3ce8f2ee9ec64e9f06f64dafe6f3cf4bee0d7125`** (main through PR #46). Tests, CI configuration and documentation only; no production adapter, public schema, dependency manifest or vendor application changes. Implementation follows the [work-package plan](../superpowers/plans/2026-09-15-cursor-validation-hardening.md).

## Delivery and scope

The original manual-import package is merged: [PR #41](https://github.com/Frankie-Xu/threadport/pull/41), squash **`d35c70c2946785aa1538de1bf7bd2049522f57ce`**. Its [main CI passed](https://github.com/Frankie-Xu/threadport/actions/runs/34874139236). Older reports retain their dated pre-merge observations, not the current delivery state. The user has authorized committing, pushing and creating this follow-up PR. Its actual publication and remote CI results will be recorded in that PR; no new merge/release or independent review is claimed. Main advanced to #47 before publication; the local #46 artifact evidence below is not a claim of a new #47 real-input replay.

The latest actual Cursor run remains **3.20.17 / build September 12, 2026 11:16 displayed local time / Agents This Mac / macOS 26.6.2 arm64**, collected September 14. This turn did not occupy Cursor, change approvals or generate a new conversation. Saved-input replay does not certify a later vendor build.

## Repairs and verification

| Gap | Change and evidence | Boundary |
| --- | --- | --- |
| Windows test timeout | The [#45 main run](https://github.com/Frankie-Xu/threadport/actions/runs/34879646980) timed out in a five-scenario native test after 5 seconds, not a failed semantic assertion. The test now creates one read-only synthetic Git fixture instead of five; each scenario still creates independent records and keeps every original assertion. The two-case rejected/unknown-tool test likewise reuses its fixture. | The subsequent [#46 main run](https://github.com/Frankie-Xu/threadport/actions/runs/34881314912) already passed before this optimization; do not claim a deterministic adapter bug or a permanently red main. No timeout/worker changes. |
| Leaked temporary fixtures | Native test roots, including the selected SQLite fixture, are registered immediately after creation and cleaned after each test, including assertion failure paths. | Only roots created by these tests are removed; no existing user/test-evidence directory is deleted. |
| Three skipped Windows exporter cases | CI provisions official Windows SQLite **3.53.4**, checks SHA3-256 before extraction/execution and adds its temporary directory to PATH. All platform jobs require the CLI; `THREADPORT_REQUIRE_SQLITE=1` also fails module setup if it is absent. | Until this follow-up's Windows CI actually runs, zero-skip Windows coverage is pending, not certified. Local optional-tool behavior and the explicit missing-CLI fail-closed test remain. |
| New-main artifact drift | A new normal install of the 157-file package at #46 replayed the three authorized saved real sources. Full semantic comparison with previously accepted imports passed. | Replays use the legacy Cursor extract/validate/handoff path; new Claude/Codex prepare/launch specs are not Cursor continuation support. |
| Stale delivery checklist | #41 merge/main CI are now explicit; completed PR tasks are checked, historical checkpoints labeled, and the unpassed cross-cwd combination remains open. | No fabricated external review, release or full vendor certification. |

SQLite is a CI-only public-domain tool, not a new ThreadPort runtime dependency. [Official SQLite download metadata](https://sqlite.org/download.html) provides archive `2026/sqlite-tools-win-x64-3530400.zip` and SHA3-256 **`88b4659fe747896b853af10157316b4ade143553efb89c1c8ca7423a278dcc8b`**. The downloaded archive independently matched that digest and contains `sqlite3.exe` at its root. No Windows binary was executed on this Mac; only a real Windows CI run can verify that installation/execution path.

Local environment: **Node 24.18.1, macOS 26.6.2 arm64**.

- Pre-change native/exporter suite: 15 tests passed; no locally invented timeout reproduction.
- Strict post-change suite: 15 tests passed, no skipped exporter cases.
- Separate child Vitest with empty PATH and strict mode: failed with the required missing-CLI error, as intended. The parent environment was not changed.
- Native suite repeated three times: 11/11 passed each time with default settings. Whole-run durations were 10.15s, 3.79s and 5.74s; these include setup and scheduling, are not individual test deadlines or performance guarantees.
- `npm ci`: success, zero reported vulnerabilities.
- Strict standard `npm run check`: **347 tests / 48 files passed**, typecheck/build and documentation checks passed. The initial gate checked 120 local destinations in 57 Markdown files; documentation additions are checked again before handoff.
- `npm run check:pack`: **157 files**, normal isolated install, public exports, UI CLI, workspace verification, local server and three synthetic Cursor roundtrips passed.

## Retained installed-artifact evidence

Runtime SHA above; tarball SHA-256 **`2f705f4dee6104959af55d676c08a086fff75e514c4a30993182a1466efcf408`**. This work package does not change packaged runtime files; its later test/CI/docs edits do not invalidate that runtime reference.

The installed CLI completed **extract → validate → handoff** for genuine saved Copy Transcript, project JSONL and selected-native evidence. Commands, tests, completed work, failures, next action, constraints and status exactly match the preceding accepted outputs. Native and sparse sources each retain 18 command attempts with unknown numeric outcomes; native remains blocked by the evidenced edit rejection, sparse is paused. Markdown is paused with zero command evidence. Requested directory labels, the final README/review instruction and evidence warnings remain. Input and synthetic project hashes/Git state are unchanged, and portable output contains no local home prefix. Raw sources, identifiers, per-input hashes and replay scripts remain private outside Git.

## Vendor limitation: reproduction and reopening criteria

This is a sanitized reproduction specification based on the existing live record, not a claim of another test or a submitted vendor issue. Use only an explicitly authorized disposable repository with existing `client` and `server` directories.

1. Record About version/build, OS/architecture, mode and original approvals. Do not weaken permissions for these read-only probes.
2. Ask for three sequential native Shell calls with the identical command below, using tool `working_directory` values for the repository root, `client`, then `server`. Do not add shell `cd` or retry:

```sh
node -e "console.log('TP_CWD_SEQUENTIAL', process.cwd())"
```

3. Ask for two independent native Shell calls in one parallel batch, requesting `client` and `server`, using the identical command:

```sh
node -e "console.log('TP_CWD_PARALLEL_START', process.cwd()); setTimeout(() => console.log('TP_CWD_PARALLEL_END', process.cwd()), 2000)"
```

4. Compare requested parameters with tool output and distinct native call IDs/start/end timestamps. Original observation: root control matched, all four child-directory requests printed the root. Sequential calls did not overlap; the parallel pair did. Verify source file hashes remain unchanged.

Reopen effective-cwd certification only when a recorded version/mode honors both child directories in sequential and parallel calls. Then exercise the still-missing cross-cwd identical-command fail/pass and completion-order combination with independent process evidence. If native numeric result fields remain absent, the importer must still report unknown; a successful external probe is not permission to infer exits from text. Preserve requested context without rewriting it from output prose.

Remaining boundaries: effective cross-cwd execution is not repaired; other desktop modes/versions, Windows/Linux live Cursor, CLI/Cloud, automatic discovery, native continuation and lossless migration are not certified or added. No vendor report was published. A version/permission change must be explicitly scoped before further live tests.

## Rollback and handoff

One reviewable test-evidence package, CURSOR-CERT-02; no data/schema migration and no known downstream runtime dependency. If the new CI prerequisite or fixture reuse regresses verification, prefer a forward fix preserving no-false-success coverage. If reverting, first verify the eventual package squash SHA and dependants; retain #41 and upstream server/handoff/runner work. Never delete user data or downgrade the database. Rerun full check/pack and the missing-CLI failure case. Rollback is planned, not exercised. Final head/PR/CI status belongs to the handoff or PR rather than a recursive self-SHA commit.
