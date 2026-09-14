# Cursor Native Evidence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close observable Cursor compatibility bugs and execute available real scenarios without fabricating missing results or certifying unavailable products.

**Architecture:** Keep the existing structured adapter for correlated results. Add a Cursor-only evidence-gap path for native sparse JSONL and preserve conservative Markdown import. Validate on only the authorized synthetic project's native transcript and independent UI/Git/test observations.

**Tech Stack:** TypeScript, Vitest, Node, Cursor 3.20.10 This Mac.

## Global Constraints

- Synced HEAD: `6a28a41cc4142e4225b38e5a99e4472a68e00dd2` (PR #28, following PR #27). Prior task-owned edits preserved and recovery stashes retained.
- Existing branch continues; no commits, pushes, new accounts, installations, global session scan or source-log mutation.
- Original logs remain outside Git; fixtures are independently synthetic. Core never runs transcript commands.
- Capsule v1 remains unchanged. Missing IDs/results cannot certify edit success, process exit or concurrency ordering.
- This covers legacy Cursor extraction, not v0.2 T18 native continuation or all four vendors/platforms.
- Execute inline; referenced superpowers execution skills are unavailable.

## Local issue draft

Problem: native Cursor JSONL has Shell/StrReplace calls without IDs or results. It parses but lacks a clear incomplete-evidence warning and loses the final handoff item.

Task: legacy Cursor compatibility follow-up; related T03/T04, F05, Q03/Q05/Q15. This does not complete their broader v0.2 contracts.

Acceptance: preserve observed attempted operations as unknown, retain final visible review context and later user instructions, never infer success from prose/turn_ended, warn in CLI and artifacts, preserve fully correlated JSONL behavior, and record every uncovered live scenario.

### Task 1: Sparse JSONL repair

Files: `src/adapters/cursor.ts`, `src/adapters/message-events.ts`, `src/adapters/cursor-markdown.ts`, `src/cli.ts`, `tests/adapters/cursor.test.ts`, `tests/cli.test.ts`.

- [x] Add a synthetic native-style JSONL test with idless `Shell`, `StrReplace`, final assistant pending item, `turn_ended`, and no results. Assert paused + warning, unknown edit/test outcome, no completed work.
- [x] Run the test before the fix; three new tests failed on the missing evidence warning/pending item.
- [x] Detect tool calls without a unique matching ID/result before extraction. For affected Cursor sessions add an evidence warning and a review-only next action. Never pair missing IDs by an empty-string key.
- [x] Preserve a blocked status if correlated failures exist; otherwise pause incomplete sessions. Retain observed successful evidence only when a result is uniquely correlated.
- [x] Keep JSONL fully correlated regression expectations unchanged; add mixed/missing/duplicate-ID and latest user instruction tests.

### Task 2: Live scenarios and final gate

Files: existing private evidence directory; `docs/compatibility-evidence.md`; local verification handoff.

- [x] Inspect only the test project's native transcript structure; no full database extraction.
- [x] In the test session request a deliberately failed exact edit, a test regression and a final instruction to stop; independently verify source and test outcome. Leave the disposable failure explicit.
- [x] Re-extract the native sample and run validate. Check unknown outcomes, evidence-gap warning and pending/review context against UI and Git. Also fixed native timestamp/user-query wrappers replacing the objective.
- [x] Run `npm run check`, `npm run check:pack`, `npm audit`, and `git diff --check`; record actual runtime/platform.
- [x] Record remaining blockers for complete tool evidence, rejected-permission edits, interrupted/concurrent results and uninstalled vendors. Do not replace a failed edit with a rejected-permission certification.

### Task 3: Selected database evidence (discovery-driven extension)

Only after finding richer data for the exact authorized test-session ID, implement ADR 0008 (renumbered after upstream claimed 0007). No full database scan/export.

Files: `scripts/export-cursor-session.mjs`, `src/adapters/cursor-native.ts`, `tests/adapters/cursor-native.test.ts`, developer export documentation.

- [x] Export a transactional allowlist projection from exact composer/bubble keys with explicit database/session/output arguments, read-only SQLite, bounded output and exclusive destination creation.
- [x] Validate the ThreadPort-owned versioned input envelope. Sort calls/results by observed timestamps; emit only visible dialogue and recognized tool evidence. Never read hidden text or interpret completed as successful.
- [x] Normalize only the exact observed Node test exit-capture wrapper, using its final marker, into an inner test event; malformed/interrupted/unrecognized results stay unknown.
- [x] Run synthetic and selected live evidence tests; report actual result pairing, edit failure/recovery, fail/pass/fail and latest user constraints. Keep permission-rejection and other-vendor gates separate.

## Live gate follow-up — Cursor 3.20.17

- [x] Recover reliable UI access and recheck the actual product version (3.20.17).
- [x] Temporarily change to Allowlist (with Sandbox), capture a pending request and reject that shell command via Skip.
- [x] Capture a running timer, stop the individual command, and validate selected native exports without inferring a successful exit. Native `notInterrupted: true` contradicted the observed stop; this limitation is documented.
- [x] Restore and visibly verify the original Auto-Review (with Sandbox) mode after the requested action-time confirmation (2026-09-14).

User approved the temporary change and then asked the assistant to operate the UI. Control recovered; the selected test session was safely used. After explicit restoration confirmation, the original Auto-Review (with Sandbox) mode was restored and visibly verified. Rejected file-edit permission and other-vendor/OS certification are not supplied by this shell-command-only follow-up.

Verification checkpoint after PR #28 synchronization: Node 24.18.1/macOS arm64, 154 tests in 21 files, docs links, isolated package smoke (51 files), audit zero vulnerabilities. Selected real-evidence extraction and validation were rerun. See `docs/verification/cursor-native-evidence.md`. Source and selected evidence remain outside Git. Self-review only; no remote CI or publication.
