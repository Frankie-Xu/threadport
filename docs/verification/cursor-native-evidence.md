# Cursor selected native evidence verification

Current behavior update (2026-09-14): [release-candidate verification](cursor-release-candidate.md) supersedes the historical text-marker mappings and delivery state below. Native terminal outputs no longer establish numeric exits, including the exact Node wrapper. Old fail/pass/fail observations are historical evidence, not outcomes certified by the current converter.

Delivery note (2026-09-14): the user authorized committing and pushing this reviewed change on `fix/Frankie-Xu/cursor-transcript-import`. Historical checkpoints below describe the local/uncommitted state at their verification time. The delivery retains the verified `8a1a225` baseline; a fresh fetch found main at `0d00f6d` (PR #31–#33), which is not integrated or certified by this change. No direct main push, PR creation or release is included.

## Scope and workflow

Legacy Cursor manual extraction follow-up; related v0.2 T03/T04, F05, Q03/Q05/Q15. This is not T18 native Agent continuation certification. See [ADR 0008](../adr/0008-cursor-selected-evidence.md).

Use only a session you are authorized to inspect. The developer exporter requires an explicit database path, one session UUID, and a new local output path. It uses an installed SQLite CLI with JSON support (public-domain SQLite; no new npm dependency), `-readonly`, a read transaction and exact composer/bubble keys. Other sessions are never enumerated or exported. Selected metadata is allowlisted; thinking, attachments, encryption keys, raw tool binaries and source contents are omitted. Visible text and tool output can still contain sensitive data: keep exports local and inspect them before sharing.

```bash
node scripts/export-cursor-session.mjs /path/to/state.vscdb SESSION_UUID /private/output/selected.json
npm run build
node dist/src/cli.js extract --from cursor --session /private/output/selected.json --project /path/to/test-repo --out /private/output/capsule.json
node dist/src/cli.js validate /private/output/capsule.json
```

The input envelope `threadport.cursor-native.v1` is a ThreadPort verification artifact, **not an official Cursor export format**. The script is not distributed in the npm package. It refuses existing output files, unknown/missing sessions and incomplete header-to-bubble snapshots; it does not modify the database. Selected fields were observed in Cursor 3.20.10 and the scoped 3.20.17 follow-up. Unknown shapes are not certified; invalid supported input is rejected.

## Mapping boundaries

- Calls use native `toolCallId`; results use completion timestamps, not array order. Duplicate IDs and results preceding calls are rejected.
- `edit_file_v2` with distinct before/after content references is an observed edit; a client-visible native error is a failed edit. A later successful operation can resolve that same-file operation error, not a separate test failure.
- Native `status: completed`, `notInterrupted: true` and terminal text markers do not establish a process exit. Original commands and cwd are preserved; all unreported numeric exits stay unknown. Numeric outcomes in explicit structured JSONL are a separate supported path.
- Unsupported tools/results stay unknown with an evidence warning. No assistant success claim supplies a missing result.
- Git is read at extraction time. Historical test success is not certification of the current workspace.

## Executed evidence — 2026-09-14

Self-review by the implementation assistant; not an independent audit. Synced baseline `6a28a41cc4142e4225b38e5a99e4472a68e00dd2` (PR #28, following PR #27), retaining pre-existing task-owned changes. The incoming portable-path changes merged without conflicts; all checks and the selected live-evidence import were rerun on this baseline. Actual verification platform: macOS 26.6.2 (25G83), arm64; Node 24.18.1. Native source comes only from the deliberately generated Cursor 3.20.10 / Agents This Mac test session; no live logs are committed.

| Scenario | Evidence/result | Remaining boundary |
| --- | --- | --- |
| Successful edit | Native before/after references plus independent single-file Git diff | Only observed edit tool/version |
| Failed exact replacement | Native client-visible error; later successful same-file edit resolves it | Not equivalent to user rejecting permission |
| Failure → pass → failure | Three native terminal outputs yield inner test exits 1, 0, 1; Capsule is blocked | Exact observed wrapper only |
| Later user instruction | Original user instruction to stop and review README becomes next action | No automatic continuation performed |
| Same filename, distinct directory | Client was changed; server and assertions preserved | Broader path matrix remains synthetic |
| Sparse project JSONL | Attempts stay unknown, missing evidence warning, objective wrapper corrected | Cannot recover results absent from this file |
| Copy Transcript Markdown | Paused dialogue-only import and warning | Not lossless migration |
| Concurrent call timing | Native initial shell/read overlap and finish in opposite order; exporter preserves timestamps | Same-command concurrent race covered synthetically, not live |
| Missing/rejected/interrupted results | Synthetic regression rejects false success; live pending, command rejection and stop-command checks added below | Rejected file-edit permission is still not live-tested |
| Other vendors / platforms | Existing synthetic regressions only | No full four-agent or cross-platform certification |

Checks after PR #28 synchronization: `npm run check` under Node 24 passed 154 tests in 21 files, including documentation checks (34 local destinations in 26 Markdown files); `npm run check:pack` passed (51 package files); `npm audit` reported zero vulnerabilities. The optional exporter integration test uses a real temporary SQLite DB on this Mac, with another-session decoy, hidden text and encryption-key markers. It verifies read-only source bytes, allowlisting, exclusive output, and missing-session rejection. On systems without the optional SQLite CLI, that test verifies a clear failure without output; it does not claim exporter support there.

Live selected export/import/validate and semantic assertions confirm `[failed, passed, failed]`, blocked status, the client path, the resolved edit-operation error, unresolved final test failure and latest user instruction. Initial exporter testing exposed JSON-encoded `params`/`result` fields; this was corrected and added to the real-SQLite regression. The incorrect initial local output is retained as historical test evidence, not used for acceptance.

## Handoff

All changes remain local and uncommitted on the existing feature branch. Recovery stashes preserve edits from before each main synchronization. No remote CI, PR publication, merge or release of these local changes is claimed. Original logs, selected exports and generated Capsules remain in the private local evidence directory, outside this repository. The disposable test project is deliberately left failing for the handoff scenario; this is not a ThreadPort test-suite failure.

### Live approval and interruption follow-up — Cursor 3.20.17

On 2026-09-14 UI control recovered. About Cursor showed **3.20.17**, build 12 September 2026 11:16 in the displayed local time. These new scenarios must not be attributed to the earlier 3.20.10 runtime. The same explicitly selected local synthetic test session was used; other projects were not operated on.

- Original Run Mode: **Auto-Review (with Sandbox)**. Temporarily changed to **Allowlist (with Sandbox)** with the user's authorization; verified the effective value. No allowlist entries, network settings, deletion protections or external-file protections were changed. This mode still automatically runs sandbox-safe commands; it is not an ask-every-time mode.
- Pending approval: requested a harmless marker-printing Node command with explicit approval. UI showed Pending approval. The selected snapshot had tool status `loading`, no start/completion timestamps and no result. Import retained an unknown exit code and an incomplete-evidence warning.
- Rejection: clicked **Skip**, not Run or Always Run. UI showed Skipped; native result had `rejected: true` and `Rejected: User chose to skip`. Imported command summary correctly says it was not executed, without inventing an exit code. This verifies a rejected **shell command**, not rejection of a file edit.
- Interruption: started one sandboxed Node timer, visibly observed its start marker, and clicked **Stop command** before its 45-second finish. UI showed Skipped, with no finish marker. A running snapshot had no result. The completed native record unexpectedly had `status: completed`, `rejected: false`, **`notInterrupted: true`**, and only the start marker. Thus this field is not reliable positive evidence of uninterrupted completion. The adapter correctly leaves this arbitrary command's exit unknown; it does not certify interruption from the native flags alone. The visible assistant acknowledgment is explicitly unverified review context.
- Final selected export/import/validate passed. Semantic assertions confirm exactly one call per new scenario, no retries, no fabricated exit codes, the earlier `[failed, passed, failed]` test history and blocked status preserved, and README review retained in the next-action context. Tracked test-project files remain unchanged; the pre-existing untracked `docs/` directory remains. No commit/push or unrelated project action was taken.

Restoration completed on 2026-09-14 after the user explicitly confirmed. Changed Run Mode from Allowlist (with Sandbox) back to **Auto-Review (with Sandbox)** and verified that exact effective value in Cursor Settings. File-deletion protection remained off and external-file protection remained on, matching the observed original values. No other settings were changed during restoration.

## Post-integration review — PR #29 and PR #30

Review baseline: `8a1a225` on 2026-09-14, following a fresh remote fetch. Work remains local/uncommitted. A recovery stash retains the pre-integration changes. Self-review, not an independent audit.

### Findings repaired

1. **P1 — Native cwd loss:** conversion discarded an explicitly observed working directory. With the new shared command grouping, successes from another directory could incorrectly clear a failure. Shell conversion now retains cwd both for ordinary commands and for normalized inner Node tests. Regression proves different-cwd success cannot resolve the failure and same-cwd retry can.
2. **P1 — Preceding result accepted:** a structured result before its call could falsely confirm a future edit. Only uniquely matched results after the call in source order now qualify. Earlier/blank/duplicate-call matches stay unknown. The regression failed with a falsely completed edit before the fix.
3. **P2 — Integration drift:** local test-command matching conflicted with upstream direct-invocation semantics. Kept the upstream shell-composition exclusion, added direct Node invocations including unquoted absolute executable paths, retained exact raw command/cwd identity, observed dialogue times and latest-user derived objectives. The old sparse-wrapper test now explicitly asserts no inner test can be extracted from its unknown shell result.
4. **P2 — Coverage/document drift:** added pending and misleading completed-flag regression plus CLI sparse/native warning propagation through validation and handoff. Renumbered the local Cursor ADR to 0008 to avoid upstream 0007. Corrected the live register so shell rejection/interruption is completed, not still listed as pending.

### Verification

- `npm run check` on Node 24.18.1 / macOS arm64: **223 tests in 26 files**, typecheck/build and documentation links passed.
- `npm run check:pack`: **59 packaged files**, isolated CLI/public-export loading passed. `npm audit`: **0 vulnerabilities**. `git diff --check`: passed.
- Reimported three previously permitted private snapshots: selected fail/pass/fail, pending approval, final rejected/interrupted session. New outputs passed schema validation and assertions for preserved `[failed, passed, failed]`, blocked status, no invented marker-command exit and no local home-path leak. New latest-user objective semantics are explicitly warned, not silently reverted to the initial task.
- This review did not run a new Cursor conversation or change its restored approvals. Saved version-specific evidence was replayed with the repaired build; a replay is not a new live test or a check of later Cursor releases.

### Completion boundary

The reviewed manual-extraction paths pass the above checks. **The entire Cursor compatibility matrix is not complete.** Live file-edit permission rejection and broad same-command concurrent recovery remain unverified; CLI/Cloud/other desktop modes and other OS/version combinations are not certified. Native launch/resume and lossless conversation migration are explicitly outside current Cursor support. SQLite export remains developer-only and experimental, and no release/remote CI result is claimed for the local changes.
