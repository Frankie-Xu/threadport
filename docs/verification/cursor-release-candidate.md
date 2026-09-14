# Cursor release-candidate verification

## Current delivery status — 2026-09-15

**CURSOR-CERT-01 is merged**, not a draft: [PR #41](https://github.com/Frankie-Xu/threadport/pull/41), squash **`d35c70c2946785aa1538de1bf7bd2049522f57ce`**. Its [main CI](https://github.com/Frankie-Xu/threadport/actions/runs/34874139236) passed all three platforms and the aggregate check. Self-review and user-authorized merge are recorded; no independent reviewer or release is claimed. Current verification hardening and newer-main artifact evidence are in [CURSOR-CERT-02](cursor-validation-hardening.md).

The dated sections below preserve historical verification checkpoints and their then-current integration/permission state. They do not override the merged state above. The latest actual Cursor execution remains the 3.20.17 sequential/parallel comparison below; later package replays and synthetic CI are not new live tests. Effective cross-cwd execution remains an observed vendor limitation.

## Historical work package: CURSOR-CERT-01

User-visible result: conservative manual Cursor import with version-specific evidence and explicit unknown outcomes. Related T03/T04, F05, Q03/Q04/Q05/Q15/Q24. Existing feature branch is retained by request. Latest integration baseline is `2f46ea5` (through PR #40); runtime candidate `e6cfe5f` includes fixes `e162fde`, `519e36f`, requested-directory context from `cd8d1b2` and upstream explicit workspace verification CLI/local server, retaining search, workspace capture/verification and all three Cursor package roundtrips. No public schema or automatic Cursor source is added. No downstream package is known to require this manual Cursor converter; recheck consumers before any rollback.

Follow-up file allowlist: modify `src/adapters/cursor-native.ts` (requested-cwd warning and cancelled-edit reason), `src/adapters/message-events.ts` (Cursor directory alias and visible context), `tests/adapters/cursor-native.test.ts`, `tests/adapters/cursor.test.ts`, `tests/cli.test.ts` (outcome, directory identity, privacy and handoff regressions), `docs/adr/0008-cursor-selected-evidence.md` (evidence boundary), this file, `docs/compatibility-evidence.md`, `docs/verification/cursor-native-evidence.md` and `docs/superpowers/plans/2026-09-14-cursor-certification-closure.md` (acceptance/delivery records). The resolved integration conflict in `scripts/pack-smoke.mjs` retains upstream search/workspace and Cursor checks. Other merge files are unchanged upstream integration, not new Cursor features. Private synthetic projects/evidence are outside the commit scope.

New live finding: in 3.20.17, both cross-cwd calls recorded distinct requested directories (JSONL `working_directory`, native `params.cwd`) but both failed looking up the script at the repository root. They overlap in time, but do not certify effective cross-directory execution or reverse completion. Preserve the requested context without inferring a different cwd from error prose; add a warning that recorded cwd is not a verified execution location. This is an observed limitation, not a repaired Cursor runtime bug.

Checks required: targeted native regression, unchanged standard `npm run check`, `npm run check:pack`, five historical and eight fresh authorized installed-CLI replays; raw inputs remain private. Rollback trigger: a reproducible manual-import regression or false confirmed outcome. Rollback unit is the Cursor feature package after its eventual squash SHA is verified, not the upstream SQLite/search/workspace merges. Prefer a forward fix if a rollback would restore text-marker success inference; no database schema is changed by this package and existing user data must be retained. Upstream storage/search/workspace must remain intact. Re-run native/exporter tests, full check and package roundtrips after any rollback. Rollback is planned, not executed. PR, remote CI and squash SHA are not yet available.

Date: 2026-09-14. Self-review, not an independent audit. Scope: legacy manual extraction (T03/T04, F05, Q03/Q05/Q15); not automatic discovery, indexing or native continuation.

## Latest integration checkpoint — main PR #40

On September 15, while PR #41 checks were being resolved, remote main advanced to **`2f46ea547b3aa19dcb69a96028cc803b15888028`** (local server lifecycle, PR #40). GitHub marked the PR conflicted and did not start checks for the Windows assertion-fix commit. Integration commit **`e6cfe5f32ae731695a30aeee5bd3b165c8bc733f`** resolves the package-smoke conflict by retaining both upstream authenticated local-server lifecycle checks and Cursor roundtrips. No upstream server behavior was changed.

Node 24.18.1 `npm ci` succeeded with zero reported vulnerabilities. Standard **`npm run check` passed 317 tests / 41 files**, typecheck/build and **110 local destinations / 50 Markdown files**. **`npm run check:pack` passed 123 files**, public exports, workspace verification, local server and three synthetic Cursor installed-CLI roundtrips. The Windows assertion fix below is included; no timeout, worker or skip settings were changed.

Latest retained **123-file** artifact SHA-256: **`ec20c221c031a47b2de108a277647db2815a4c963bda9fe6b47e8f409c7e4415`**. Normal installation into a new private consumer passed extract → validate → handoff for all three saved inputs from the live checkpoint below. Commands, tests, completed work, failures, next action, constraints and status exactly match the preceding accepted import. Input hashes and synthetic project bytes/Git state remain unchanged. This is a revalidation of the new integrated artifact, not another Cursor execution. It supersedes the pre-#40 artifact for current integration acceptance; the earlier artifact remains historical evidence.

At that checkpoint PR #41 was a draft; it has since merged with passing main CI as recorded above. No independent review, release or full vendor compatibility certification is claimed.

## Latest live checkpoint — sequential and parallel cwd comparison

Executed **2026-09-14, 23:56–23:58 Asia/Singapore**; recorded and final checks completed September 15. The user authorized fresh read-only Cursor operations and PR creation/CI inspection, not main merge or release. About was rechecked: **Cursor 3.20.17**, build **September 12, 2026, 11:16 displayed local time**, **Agents / This Mac**, macOS **26.6.2 (25G83), arm64**. Only the previously authorized synthetic project and selected test session were used. No approval or protection settings changed. Final UI recheck confirmed **Auto-Review (with Sandbox)**, **External-File Protection on**, **File-Deletion Protection off**; the test conversation is stopped.

Three sequential native Shell calls used the identical command `node -e "console.log('TP_CWD_SEQUENTIAL', process.cwd())"`, requesting the synthetic repository root, `client` and `server` in that order. A separate batch used two independent native Shell calls requesting `client` and `server`, with the identical command `node -e "console.log('TP_CWD_PARALLEL_START', process.cwd()); setTimeout(() => console.log('TP_CWD_PARALLEL_END', process.cwd()), 2000)"`.

| Probe | Requested cwd | Actual process.cwd() | Timing evidence |
| --- | --- | --- | --- |
| Sequential control | Repository root | Repository root | Non-overlapping native intervals |
| Sequential child 1 | client | Repository root | Non-overlapping native intervals |
| Sequential child 2 | server | Repository root | Non-overlapping native intervals |
| Parallel child 1 | client | Repository root, at start and end | Distinct call ID; overlaps its peer |
| Parallel child 2 | server | Repository root, at start and end | Distinct call ID; overlaps its peer |

All five requested arguments, unchanged command strings, raw output and native start/end timestamps were cross-checked against the selected read-only export. **Four of five requested directories differ from actual execution; the root control matches.** This reproduces the limitation in both sequential and parallel calls, not only concurrent execution. It does not identify Cursor's internal implementation cause or certify other modes. No shell `cd`, retry, background-process simulation or application patch was used to turn it into a pass. Effective cross-cwd execution and the planned cross-cwd fail/pass recovery remain uncertified; this is not an importer defect that ThreadPort can repair.

Independent before/after hashes and Git status confirm the synthetic project is unchanged, including its two pre-existing untracked probe files. The final read-only README instruction is preserved as the next action, and the conversation stopped without further commands, edits, commits or pushes. No external test file was accessed in this follow-up.

### Installed artifact and standard gates

Runtime **`0e065e44bfbfb17228bbae68310723f79939ea30`**, based on main **`6512975f7ee4fc4fdd1e936ab1eddcca211e3207`** (PR #39), was normally packed and installed into a fresh private consumer under **Node 24.18.1**. The **113-file** tarball SHA-256 is **`32ef3493ecf21b47eab0167602cd2bd1d9b40e2166842f2841ce553a61dd0d6c`**. Integration preserves the new workspace verification CLI smoke alongside the three Cursor installed-package roundtrips. Later documentation-only commits do not change this tested runtime.

Fresh genuine UI Copy Transcript, project JSONL and selected SQLite inputs each passed installed CLI **extract → validate → handoff** plus semantic checks. Native and sparse inputs each retain 18 command attempts; the five new commands show requested-directory labels `.`, `client`, `server`, `client`, `server`. Unreported numeric exits and test results remain unknown. Native status remains blocked by the previously observed unresolved edit rejection; sparse status is paused. Markdown remains dialogue-only with zero commands and paused status. All three retain the final README/review instruction, expected warnings and portable paths without the local home prefix. Input hashes and source project bytes remain unchanged. Raw evidence, identifiers and per-input hashes stay private outside Git.

The unchanged default-worker **`npm run check` passed 311 tests in 40 files**, typecheck/build and **105 local destinations in 47 Markdown files**. **`npm run check:pack` passed 113 files**, public exports, workspace verification and three synthetic installed-CLI roundtrips. `npm ci` succeeded with zero reported audit vulnerabilities. An earlier run during live Cursor activity timed out in two five-second tests (309 passed); a host load sample was 115.94 / 47.58 / 21.73. The standard rerun after the conversation stopped passed without increasing timeouts or changing workers; contention is a plausible contributor, not a proven sole cause.

Delivery at this documentation checkpoint: PR publication and CI are now authorized and are the next step. Their actual results belong to the PR check run, not this local gate. Independent review, main merge and release are not complete. Support remains **experimental / partially verified manual import**, not full Cursor certification.

### PR #41 — Windows CI assertion follow-up

The package was first published as draft [PR #41](https://github.com/Frankie-Xu/threadport/pull/41), subsequently merged. Initial [CI run 34866919537](https://github.com/Frankie-Xu/threadport/actions/runs/34866919537) passed Linux and macOS but failed one Windows assertion: a local-mode summary contains a JSON-quoted directory, while the test searched for the unescaped raw Windows path. The observed summary correctly retained the directory; changing production output to satisfy the assertion would break the intended quoting contract.

`tests/adapters/cursor.test.ts` now checks the complete `JSON.stringify(cwd)` label in both command and direct-test summaries, retaining unknown-outcome assertions. It exercises the host-native path and a fixed synthetic Windows path containing spaces on every platform. No production code, timeout, worker count or skip condition changes. The tested runtime artifact above remains valid; the CI correction is test/documentation only. The first Windows run passed 307 tests, failed one and skipped three optional-SQLite-CLI exporter tests. Those skips are a stated coverage limit, not real Windows exporter certification. Final rerun status must be read from the PR's check results; no green result is assumed here.

## Historical follow-up — requested directory identity and handoff visibility

The permission-pending and delivery statements in this section describe the earlier checkpoint; the live comparison above supersedes them.

Source commit **`cd8d1b28c24c2c05a3207714d1bd3aef275ea958`**, retaining main `d3c439d`; remote main was rechecked and unchanged. No new live Cursor operation or setting change was performed in this follow-up: permission to resume occupying the window and to create a PR was requested separately and is still pending.

Two remaining importer defects were reproduced and repaired:

1. **Cross-directory false recovery:** the observed sparse JSONL `working_directory` alias was ignored. A synthetic explicit-result regression proved the old code incorrectly changed blocked to active when a different directory succeeded. Cursor-only alias handling now retains distinct identity, with existing explicit workdir/cwd precedence and null semantics. Actual sparse live logs still have no numeric results; this failure/recovery proof is synthetic, not a new live exit-code claim.
2. **Invisible directory context:** internal cwd was not serialized by Capsule v1, leaving identical command rows indistinguishable. Commands and direct-test summaries now include `Requested cwd (execution unverified): "client"` or the corresponding portable directory. Raw command text and result ordering stay unchanged. Local mode retains its path policy; portable mode hashes external paths and does not expose the source root. This does not assert Cursor honored the request.

Before implementation, **4 targeted cases failed** (including the wrong active status); after implementation, the targeted Cursor/Claude/CLI suite passed. Additional coverage verifies alias precedence, explicit null, pending unknown results, interleaved non-test commands, external Windows paths, secrets, local/portable modes and completion-order labels.

Final default-worker **`npm run check`: 307 tests / 39 files passed**, typecheck/build and 103 local link destinations / 46 Markdown files passed. **`npm run check:pack`: 111 files**, normal isolated installation, public exports and three synthetic Cursor roundtrips passed. No timeout/worker setting was relaxed.

Retained tarball SHA-256: **`5aa6960ea6a016eae7e06c04f0e39e1b8b82721f7cb088198561b0ddd9170e74`**. A new private consumer installed this exact artifact and passed **13 saved real-input extract → validate → handoff replays** (eight recent and five historical). Both recent native and sparse exports now distinguish the client/server requests. Unknown numeric outcomes, rejection, confirmed edit, final README instruction, source/input hashes and unchanged synthetic external file were retained. These are replays, not new Cursor executions.

Remaining: fresh read-only single-call/parallel `process.cwd()` comparison in Cursor after window permission; actual cross-cwd execution remains unverified until then. PR creation/CI and independent review/main delivery are not complete. No direct application-binary patch, approval weakening, shell-cd workaround presented as certification, PR publication or release was performed. The handoff fix can ship as experimental manual-import behavior without representing the vendor limitation as solved.

## Earlier same-version live checkpoint

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
