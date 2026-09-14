# Cursor release-candidate verification

Date: 2026-09-14. Self-review, not an independent audit. Scope: legacy manual extraction (T03/T04, F05, Q03/Q05/Q15); not automatic discovery, indexing or native continuation.

## Candidate and completed repairs

Candidate starts from feature commit `dcdb0960071bb0f4b9b362138b8d882af1eb7273` and integrates main `7c13034` (PR #31–#34), plus the closure changes recorded with this document. Node 24.18.1; macOS 26.6.2 (25G83), arm64. A document cannot contain its own commit hash; use the Git commit containing this report and the recorded package digest for reproducibility.

- Removed native output-marker exit inference; original wrapper/cwd and result ordering remain intact. An explicit null exit prevents shared parsing from interpreting result prose as success. Completed or not-interrupted flags do not certify process completion.
- Retained independent edit outcomes, rejected/unknown-tool warnings and numeric structured-JSONL regressions.
- Integrated Node 24, SQLite storage/migrations, Claude/Codex sources, indexing and task management from main. No Cursor source is registered for automatic discovery.
- Added selected-export fault tests: missing bubble, malformed JSON, missing timestamp, duplicate headers, oversized output, unavailable SQLite CLI and invalid output destination. Existing coverage retains exclusive-output and unknown-session checks.
- Added a WAL transaction test: an export during an incomplete write sees the prior committed snapshot; after commit it sees the complete new snapshot. Integrity remains valid. This is not a byte-hash claim about a concurrently running Cursor database.
- Expanded isolated package smoke to run installed CLI extract → validate → handoff for synthetic Markdown, sparse JSONL and selected-native input, asserting warnings, conservative outcomes and unchanged source files/Git state.

The first oversized-source assertion exhausted the test worker heap by comparing large Buffers. It was replaced by SHA-256 comparison; the same 17 MiB rejection case then passed without increasing heap limits.

## Verification checkpoints

- `npm ci`: success; actual better-sqlite3 in-memory query succeeds under Node 24.
- Targeted native/exporter tests: **13 passed in 2 files**. SQLite CLI is installed on this host, so WAL and source-fault cases actually executed. Other hosts without it must not infer those cases are certified.
- Expanded `npm run check:pack`: **94 package files**, isolated installation, public exports and three synthetic full CLI roundtrips passed.
- Typecheck and build passed in the standard gate before test timing failures. Documentation links: **71 local destinations in 39 Markdown files**; `npm audit`: **0 vulnerabilities**; whitespace/conflict checks passed.
- Full suite with `--maxWorkers=2`: **276 passed in 35 files**, no skipped tests. This is a passed checkpoint, not a stable final gate: default-worker runs timed out in different tests, and a subsequent standard gate with two workers also timed out in three adapter/trace cases. A targeted single-worker run passed 35/36 but timed out in a different command-context case. No semantic assertion failed in these runs. A worker-cap-only fix was therefore rejected and the temporary configuration change reverted; deadlines and test coverage remain unchanged.
- Host diagnostics during failures: load averages 39.56 / 43.82 / 29.39; Cursor renderer approximately 101% CPU, very little free memory and substantial compression/swap activity. Resource contention is a plausible contributor, not a proved sole cause. Final clean standard gate remains blocked pending a usable host; passing targeted checks or raising deadlines cannot replace it.
- Retained tarball SHA-256: `111544160ead3cbe143c277c5e737c3a05db066f26517d159dcd28a262f91658` (94 packaged files). Installed into a fresh private consumer with normal dependency installation; developer exporter is not packaged.
- Installed CLI completed extract → validate → handoff on five authorized historical inputs: Copy Transcript Markdown, sparse project JSONL, final selected-native, pending approval, and running command snapshots. All retain unknown numeric exits and no inferred test results. Markdown/sparse completed lists are empty; native inputs retain the independently evidenced file edit. All are paused, not certified as task completion. Input hashes and tracked project bytes/Git state are unchanged. Raw samples, per-input hashes and replay results remain private.

The first replay assertion incorrectly required an empty completed list even for native file edits; it was corrected to require the observed edit while forbidding command/test success. No product code was weakened to satisfy that assertion. Replays are not new live tests.

## Live certification boundary

About Cursor was checked again on 2026-09-14: **3.20.17**, displayed build date **12 September 2026, 11:16**. No update or configuration change was performed. A fresh isolated synthetic project was created and opened in Agents / **This Mac**. The user explicitly yielded the window and authorized temporary stricter approvals. However, sending the scoped prompt through the button and keyboard did not start a conversation: the draft and “No agents yet” remained visible. Settings were never changed. No unrelated session was operated on, and permission to normally restart Cursor was requested before attempting recovery.

Existing 3.20.10 edit/test observations and 3.20.17 pending/rejected-shell/stop observations remain historical evidence. Replaying them does not certify a new same-version suite. Outstanding live gates: same-version basic edits and three input paths, genuine native-edit approval rejection, same-command cross-cwd overlapping calls/reverse completion, same-cwd overlap and a stopped/missing result. A failed replacement, rejected shell write or Undo is not an edit-permission rejection.

Settings changes, if needed, require the scoped approval described in the [closure plan](../superpowers/plans/2026-09-14-cursor-certification-closure.md); restoring automatic approval requires action-time confirmation. An external synthetic edit target requires separate explicit scope approval. Raw sessions stay private and outside Git.

No PR CI, maintainer review, main delivery or release is claimed. PR creation requires explicit authorization. Cursor CLI/Cloud, other desktop modes, other OS/version combinations, automatic discovery and native resume remain outside this certification.
