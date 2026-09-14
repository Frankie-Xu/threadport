# Cursor release-candidate verification

## Active follow-up work package: CURSOR-CERT-01

User-visible result: conservative manual Cursor import with version-specific evidence and explicit unknown outcomes. Related T03/T04, F05, Q03/Q04/Q05/Q15/Q24. Existing feature branch is retained by request. Final integration baseline is `d3c439d` (through PR #38); runtime candidate `3404a90` includes fixes `e162fde` and `519e36f`, retaining upstream search, workspace capture/verification and all three Cursor package roundtrips. No public schema or automatic Cursor source is added. No downstream package is known to require this manual Cursor converter; recheck consumers before any rollback.

Follow-up file allowlist: modify `src/adapters/cursor-native.ts` (requested-cwd warning and cancelled-edit reason), `tests/adapters/cursor-native.test.ts` (warning/unknown and cancelled-edit regressions), `docs/adr/0008-cursor-selected-evidence.md` (evidence boundary), this file, `docs/compatibility-evidence.md`, `docs/verification/cursor-native-evidence.md` and `docs/superpowers/plans/2026-09-14-cursor-certification-closure.md` (acceptance/delivery records). The resolved integration conflict in `scripts/pack-smoke.mjs` retains upstream search/workspace and Cursor checks. Other merge files are unchanged upstream integration, not new Cursor features. Private synthetic projects/evidence are outside the commit scope.

New live finding: in 3.20.17, both cross-cwd calls recorded distinct requested directories (JSONL `working_directory`, native `params.cwd`) but both failed looking up the script at the repository root. They overlap in time, but do not certify effective cross-directory execution or reverse completion. Preserve the requested context without inferring a different cwd from error prose; add a warning that recorded cwd is not a verified execution location. This is an observed limitation, not a repaired Cursor runtime bug.

Checks required: targeted native regression, unchanged standard `npm run check`, `npm run check:pack`, five historical and eight fresh authorized installed-CLI replays; raw inputs remain private. Rollback trigger: a reproducible manual-import regression or false confirmed outcome. Rollback unit is the Cursor feature package after its eventual squash SHA is verified, not the upstream SQLite/search/workspace merges. Prefer a forward fix if a rollback would restore text-marker success inference; no database schema is changed by this package and existing user data must be retained. Upstream storage/search/workspace must remain intact. Re-run native/exporter tests, full check and package roundtrips after any rollback. Rollback is planned, not executed. PR, remote CI and squash SHA are not yet available.

Date: 2026-09-14. Self-review, not an independent audit. Scope: legacy manual extraction (T03/T04, F05, Q03/Q05/Q15); not automatic discovery, indexing or native continuation.

## Latest same-version live checkpoint

The authorized normal Cursor restart recovered the UI; no force quit was used. About was rechecked: **Cursor 3.20.17**, build **12 September 2026, 11:16 displayed local time**, Agents / **This Mac**, macOS **26.6.2 (25G83), arm64**. The tests below used one fresh isolated synthetic project and one explicitly selected session. The historical host/UI blockage below is superseded, not a current blocker.

| Scenario | Actual observation and importer acceptance |
| --- | --- |
| Edit, same-named files, fail → pass → fail | Client-only edit confirmed by native evidence and independent Git/Node checks; server and assertions preserved. Restored the deliberate client bug for the final failing handoff. Native numeric exits remain unknown despite independently observed process results. |
| Failed exact replacement | Genuine native match error retained; later successful same-file edit resolves that operation error only. |
| Shell pending / rejected / running / Stop | Saved selected pending and running snapshots; clicked Skip for approval and Stop after a start marker. Rejection is not execution; misleading completed/notInterrupted flags never supply an exit code. |
| Same-command, same-cwd overlap | Independent native call IDs and overlapping intervals verified. One call stopped while its peer continued; a snapshot retained one result and the other pending. |
| Reverse completion | In a separate identical-command pair, the second call stopped before the first finished normally. Installed converter result IDs follow actual completion timestamps, not array position. The earlier 45-second pair finished before Stop and is counted only as plain overlap. |
| Cross-cwd overlap | Both calls recorded different requested cwd values, but both failed with MODULE_NOT_FOUND at the repository root. **Effective cross-cwd execution and the intended cross-cwd fail/pass recovery are not certified.** No shell-cd workaround was counted as a pass. |
| Native file-edit permission rejection | With explicit separate authorization, created one new synthetic external file. External-File Protection raised an actual native edit approval; clicked Skip. Before/after file SHA-256 stayed identical. Native status was cancelled with an error and both before/after content references. |
| Latest user instruction | Final read-only README instruction preserved as next action. No Agent continuation, commit or push was run from the test conversation. |
| Three actual input paths | Genuine UI Copy Transcript, project JSONL and selected SQLite export. Markdown is dialogue-only; sparse JSONL retains attempts but no confirmed edits. Selected native input retains the confirmed client edit and unresolved external-edit rejection. All unreported command exits/test results stay unknown. |

The cancellation observation exposed a missing rejection reason, not a previously confirmed successful edit. A reconstructed regression first failed with an empty failures list, then passed after terminal `cancelled` edits were mapped to error evidence. The requested-cwd warning regression likewise failed before its fix. See [ADR 0008](../adr/0008-cursor-selected-evidence.md). Content references alone are not proof that a rejected edit changed bytes.

Settings restoration: after the user's action-time confirmation, restored and visually verified **Auto-Review (with Sandbox)**; **External-File Protection on**, **File-Deletion Protection off**, matching original values. Rechecked at final handoff. No allowlist entries or network settings changed. External-file rejection ran under the restored mode with protection still on. No unrelated existing external file was read or modified.

The synthetic repository's tracked files match its baseline again; two operator-created probe files remain untracked. It is deliberately left with a failing example, not a ThreadPort suite failure. Raw inputs, per-input hashes, UI observations and generated Capsules remain private outside Git; committed fixtures are independently reconstructed. Hidden reasoning was not inspected or copied into fixtures.

### Final integration and artifact checks

The final integration cutoff is main `d3c439d` (PR #37–#38), inspected after the earlier `799acd7` checkpoint. Candidate runtime is `3404a90`. Node **24.18.1** uses normal dependency installation; standard default-worker `npm run check` passed **303 tests / 39 files**, typecheck/build and **99 local link destinations / 46 Markdown files**. No worker-cap or timeout workaround is retained. The earlier `519e36f` artifact independently passed eight live-input roundtrips with 285 tests / 36 files at that earlier baseline; it is not substituted for the final integrated artifact.

Final runtime commit: `3404a9011d0f72c81263538404dc96e7144dd1f3`. Retained **111-file** tarball SHA-256: `c55cbddefa47d4fc2456501595fdaff488d28f03023e5c68b0ba46769e3ec6d2`. `npm ci`, `npm run check:pack` and `npm audit` passed (0 reported vulnerabilities). Normal isolated dependency installation and SQLite/public workspace exports passed; install scripts were not bypassed to claim success.

That exact tarball was installed into a fresh private consumer. Its installed CLI completed **extract → validate → handoff for all 13 authorized inputs**: eight fresh snapshots (Copy Transcript, sparse project JSONL, final selected-native, shell pending, shell running, one-result/one-running, edit pending, edit rejected) and five historical snapshots. Assertions verified warnings, output paths, unchanged input hashes and source project bytes/Git state, portable output without the local home prefix, unknown numeric exits and no invented test pass. The final native Capsule is blocked by the genuine unresolved edit rejection, not by a fabricated numeric test failure; it retains the confirmed client edit and latest README next action. Markdown/sparse imports confirm no edits. Native result-ID ordering and one-result/one-pending behavior were checked with the same installed converter. The rejected external file's SHA-256 was identical before and after extraction as well as before/after the actual approval rejection.

Historical replays remain historical; they do not establish new live behavior. Later changes to this report and the plan do not change packaged runtime files. Final documentation-only check passed **103 local destinations / 46 Markdown files**, with `git diff --check` clean. The developer-only SQLite exporter is not included in the npm package; no automatic Cursor discovery/export capability is implied.

Decision: **experimental / partially verified manual compatibility**, not a full Cursor certification or release. Effective cross-cwd execution remains a vendor-observed limitation; numeric native exits remain unknown. Cursor CLI/Cloud, other desktop modes, other platforms/versions and native launch/resume remain outside scope. PR CI, independent review and main delivery still require the authorized PR workflow; a feature-branch push does not establish them.

## Historical checkpoint — before normal restart and final integration

Everything below describes earlier evidence and blockers. Use the latest checkpoint above for current support, tested baseline and settings state.

### Candidate and completed repairs

Candidate starts from feature commit `dcdb0960071bb0f4b9b362138b8d882af1eb7273` and integrates main `7c13034` (PR #31–#34), plus the closure changes recorded with this document. Node 24.18.1; macOS 26.6.2 (25G83), arm64. A document cannot contain its own commit hash; use the Git commit containing this report and the recorded package digest for reproducibility.

- Removed native output-marker exit inference; original wrapper/cwd and result ordering remain intact. An explicit null exit prevents shared parsing from interpreting result prose as success. Completed or not-interrupted flags do not certify process completion.
- Retained independent edit outcomes, rejected/unknown-tool warnings and numeric structured-JSONL regressions.
- Integrated Node 24, SQLite storage/migrations, Claude/Codex sources, indexing and task management from main. No Cursor source is registered for automatic discovery.
- Added selected-export fault tests: missing bubble, malformed JSON, missing timestamp, duplicate headers, oversized output, unavailable SQLite CLI and invalid output destination. Existing coverage retains exclusive-output and unknown-session checks.
- Added a WAL transaction test: an export during an incomplete write sees the prior committed snapshot; after commit it sees the complete new snapshot. Integrity remains valid. This is not a byte-hash claim about a concurrently running Cursor database.
- Expanded isolated package smoke to run installed CLI extract → validate → handoff for synthetic Markdown, sparse JSONL and selected-native input, asserting warnings, conservative outcomes and unchanged source files/Git state.

The first oversized-source assertion exhausted the test worker heap by comparing large Buffers. It was replaced by SHA-256 comparison; the same 17 MiB rejection case then passed without increasing heap limits.

### Verification checkpoints

- `npm ci`: success; actual better-sqlite3 in-memory query succeeds under Node 24.
- Targeted native/exporter tests: **13 passed in 2 files**. SQLite CLI is installed on this host, so WAL and source-fault cases actually executed. Other hosts without it must not infer those cases are certified.
- Expanded `npm run check:pack`: **94 package files**, isolated installation, public exports and three synthetic full CLI roundtrips passed.
- Typecheck and build passed in the standard gate before test timing failures. Documentation links: **71 local destinations in 39 Markdown files**; `npm audit`: **0 vulnerabilities**; whitespace/conflict checks passed.
- Full suite with `--maxWorkers=2`: **276 passed in 35 files**, no skipped tests. This is a passed checkpoint, not a stable final gate: default-worker runs timed out in different tests, and a subsequent standard gate with two workers also timed out in three adapter/trace cases. A targeted single-worker run passed 35/36 but timed out in a different command-context case. No semantic assertion failed in these runs. A worker-cap-only fix was therefore rejected and the temporary configuration change reverted; deadlines and test coverage remain unchanged.
- Host diagnostics during failures: load averages 39.56 / 43.82 / 29.39; Cursor renderer approximately 101% CPU, very little free memory and substantial compression/swap activity. Resource contention is a plausible contributor, not a proved sole cause. Final clean standard gate remains blocked pending a usable host; passing targeted checks or raising deadlines cannot replace it.
- Retained tarball SHA-256: `111544160ead3cbe143c277c5e737c3a05db066f26517d159dcd28a262f91658` (94 packaged files). Installed into a fresh private consumer with normal dependency installation; developer exporter is not packaged.
- Installed CLI completed extract → validate → handoff on five authorized historical inputs: Copy Transcript Markdown, sparse project JSONL, final selected-native, pending approval, and running command snapshots. All retain unknown numeric exits and no inferred test results. Markdown/sparse completed lists are empty; native inputs retain the independently evidenced file edit. All are paused, not certified as task completion. Input hashes and tracked project bytes/Git state are unchanged. Raw samples, per-input hashes and replay results remain private.

The first replay assertion incorrectly required an empty completed list even for native file edits; it was corrected to require the observed edit while forbidding command/test success. No product code was weakened to satisfy that assertion. Replays are not new live tests.

### Live certification boundary

About Cursor was checked again on 2026-09-14: **3.20.17**, displayed build date **12 September 2026, 11:16**. No update or configuration change was performed. A fresh isolated synthetic project was created and opened in Agents / **This Mac**. The user explicitly yielded the window and authorized temporary stricter approvals. However, sending the scoped prompt through the button and keyboard did not start a conversation: the draft and “No agents yet” remained visible. Settings were never changed. No unrelated session was operated on, and permission to normally restart Cursor was requested before attempting recovery.

Existing 3.20.10 edit/test observations and 3.20.17 pending/rejected-shell/stop observations remain historical evidence. Replaying them does not certify a new same-version suite. Outstanding live gates: same-version basic edits and three input paths, genuine native-edit approval rejection, same-command cross-cwd overlapping calls/reverse completion, same-cwd overlap and a stopped/missing result. A failed replacement, rejected shell write or Undo is not an edit-permission rejection.

Settings changes, if needed, require the scoped approval described in the [closure plan](../superpowers/plans/2026-09-14-cursor-certification-closure.md); restoring automatic approval requires action-time confirmation. An external synthetic edit target requires separate explicit scope approval. Raw sessions stay private and outside Git.

No PR CI, maintainer review, main delivery or release is claimed. PR creation requires explicit authorization. Cursor CLI/Cloud, other desktop modes, other OS/version combinations, automatic discovery and native resume remain outside this certification.
