# Agent format compatibility evidence

This is an evidence register, not a promise that an adapter supports all releases of an agent. Fixture version strings are synthetic test data; they do not certify a real vendor version.

| Adapter | Committed evidence | Live version certification |
| --- | --- | --- |
| Claude | [Native source boundary and limits](../compatibility/claude-source.md); Synthetic `tests/fixtures/claude/session-basic.jsonl` and regression records | Not certified — no permitted, versioned live sample supplied |
| Codex | [Native source boundary and limits](../compatibility/codex-source.md); Synthetic `tests/fixtures/codex/session-basic.jsonl` and regression records | Not certified — no permitted, versioned live sample supplied |
| Cursor | Synthetic JSONL, Copy Transcript Markdown, selected-native conversion and SQLite exporter regressions | Cursor 3.20.17 / build September 12, 2026 11:16 displayed local time / Agents This Mac / macOS 26.6.2 arm64: fresh basic edits, actual edit rejection, shell pending/rejected/Stop, same-command overlap/reverse completion and three input paths. Effective cross-cwd execution not certified; native numeric exits unknown. Experimental, partial compatibility only. |
| Gemini | Synthetic `tests/fixtures/gemini/session-basic.json` and regression records | Not certified — no permitted, versioned live sample supplied |

The September 14 acceptance follow-up fixes path normalization and Markdown rendering and closes filesystem-fault and Windows-symlink test gaps. Those changes do not close this sample-dependent gate. An installed binary, a schema-valid export or green synthetic tests alone is insufficient evidence of live format compatibility.

## Required input for certification

Supply the exact agent product/build version, OS and export mechanism with a deliberately generated, sanitized session that the reviewer is permitted to inspect. Preserve structural field names and call/result relationships. Replace credentials, personal paths, session identifiers and proprietary content; do not upload private historical conversations as a shortcut.

For each supported version, evidence should include a successful file edit, a rejected edit, a missing result, a test failure followed by success, and visible user instructions. Include concurrent result ordering if that version supports concurrency. Hidden reasoning must not be retained as fixture content.

## Verification and retention

1. Check only the supplied sample paths. Record the permitted sample provenance and version privately; never commit the original transcript or a sensitive local path.
2. Run extraction against a disposable synthetic Git project and compare objective, file outcomes, command/test exits, unresolved failures, timestamps and tool-result pairing with the permitted source evidence. Schema validation alone is not acceptance.
3. Inspect the serialized JSON and Markdown for hidden content and synthetic sensitive markers. Do not execute extracted commands or launch an agent from the handoff.
4. If parsing fails, minimize a synthetic structural reproduction and add it to the normal regression suite before changing the adapter. Keep real logs outside the repository.
5. Update the register with the exact tested version, date, relevant regression test and observed limitations only after this comparison passes. Do not infer compatibility with adjacent or future versions.

## Cursor Copy Transcript follow-up — September 14

The sections below retain historical 3.20.10 and early 3.20.17 checkpoints. The [latest same-version verification](verification/cursor-release-candidate.md) supersedes their uncompleted-gate and uncommitted-delivery statements: actual external-file edit rejection and same-cwd concurrency/reverse completion have now been exercised in a fresh 3.20.17 session. Cross-cwd requests were recorded but not honored in actual execution; that gate remains unverified. The candidate integrates main through `d3c439d` (PR #38). Settings were restored to Auto-Review (with Sandbox) after explicit confirmation, with external-file protection still on. No full certification, main merge or release is claimed.

The user authorized one new, isolated synthetic project session in their installed Cursor desktop. About showed version 3.20.10 and build date September 11, 2026, 05:04; the session environment showed **This Mac**. macOS was 26.6.2 (25G83). An update was available but not installed during this run. This is not a Cursor CLI or Cloud sample and does not certify other desktop modes.

The session repaired one client file while preserving a same-named server file and test assertions. Independent Node test runs went from two failures (exit 1) to two passes (exit 0); local Git diff confirmed the single-line client change. The final visible answer left a README usage example pending. Those independent checks describe the smoke task, not extra information available in the exported transcript.

`Chat actions → Copy → Copy Transcript` produced Markdown with User/Assistant headings and sparse tool headings. Terminal commands and edit results lacked complete structured arguments, exit-code fields and call/result links. Original extraction failed at line 1 as JSONL. The repaired importer successfully extracted and validated a paused, explicitly transcript-only Capsule from the same local export. Manual comparison verified preservation of the objective and pending example, no invented tool evidence, a current independent Git snapshot, portable paths, and warnings in JSON/Markdown.

Repository regression material is newly authored synthetic data, not the live transcript. `tests/adapters/cursor.test.ts` covers conservative dialogue parsing, code-fence boundaries, skipped hidden/tool sections, privacy, malformed input, structured-format preservation and structured Node fail/pass/fail ordering. `tests/cli.test.ts` checks warning propagation through extract, validate and handoff. The original transcript and live outputs remain local, outside this repository.

**Limits:** Code and unsupported sections are omitted, unfenced role headings are unauthenticated, and long assistant context is truncated with a notice. Rejected edits, missing/concurrent results, later real user turns and failure/pass/failure sequences were not exercised in this live session. Synthetic regressions are not live evidence for those scenarios. No full Cursor version certification is claimed; Claude, Codex and Gemini still lack permitted versioned live samples.

## Extended native evidence follow-up

The subsequent authorized run added a failed exact replacement, a successful regression edit, a final failing test, and a later user instruction to stop. A read-only query restricted to this test session found native tool IDs/results in local storage that the JSONL and Copy Transcript paths omit. The developer-only selected-session exporter and adapter now verify those richer records; see the [executed matrix and limits](verification/cursor-native-evidence.md).

The selected evidence path preserves observed edit outcomes, completion ordering and the latest user instruction. The initial build inferred inner Node test exits 1/0/1 from output markers; that inference has been removed. Those historical test observations do not certify numeric exits in the current converter: native shell results now remain unknown, including exact wrappers. Sparse JSONL also keeps absent results unknown and warns; native timestamp wrappers no longer replace the task objective. Neither a JSON file nor a terminal tool marked completed is automatically considered complete evidence. See the [current release-candidate verification](verification/cursor-release-candidate.md).

Cursor 3.20.17 subsequently supplied live pending-approval, rejected-shell and stop-command evidence in the same isolated test session. The stopped command still reported `notInterrupted: true`; the adapter correctly keeps its exit unknown instead of treating that flag as proof of uninterrupted success. The original Auto-Review (with Sandbox) mode was restored and verified after user confirmation. At that historical checkpoint file-edit permission rejection and broader same-command concurrency were uncompleted; the later fresh-session results are linked above. Other tools/modes/platforms and other vendors remain separate, uncompleted live gates.

After integrating main through PR #30 (`8a1a225`), the Cursor follow-up preserved native command cwd, prevented a result preceding its call from confirming success, and respected the shared direct-test and latest-user objective rules. Node 24 checks passed 223 tests; isolated packaging and three saved live-snapshot reimports passed. See the historical [review checkpoint](verification/cursor-native-evidence.md#post-integration-review--pr-29-and-pr-30). Its local/uncommitted state and test counts describe that checkpoint, not the current candidate or a published compatibility release.
