# Cursor Transcript Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Import the observed Cursor Copy Transcript Markdown conservatively and recognize Node's built-in test command.

**Architecture:** Add a Cursor-only text parser before the existing structured-message adapter. Preserve visible user messages and label the latest assistant message as unverified context; never infer tool results from Markdown. Reuse Capsule v1 assembly, Git snapshot and privacy protection.

**Tech Stack:** TypeScript, Node >=20, Vitest; no new dependencies.

## Global Constraints

- Frozen Capsule v1 schema; no execution, uploads, hidden reasoning, live logs in Git or changes to other remote branches.
- Work on `fix/Frankie-Xu/cursor-transcript-import`; do not push or merge without a request.
- Markdown yields paused, transcript-only capsules with no confirmed files, commands, tests, completed work or decisions. Git remains an independent current snapshot.
- JSON/JSONL behavior remains unchanged. Reject malformed Markdown with a Cursor-specific error.
- Native Markdown headings are not authenticated role boundaries; warnings must disclose this limitation.
- Execute inline under the user's repair request. The named superpowers execution skills are unavailable; use local test-first checkpoints.

### Task 1: Test and implement transcript-only import

**Files:** Create `src/adapters/cursor-markdown.ts`, `tests/fixtures/cursor/session-copy-transcript.md`; modify `src/adapters/cursor.ts`, `tests/adapters/cursor.test.ts`, `tests/cli.test.ts`.

**Interfaces:** `parseCursorMarkdown(text: string): TraceEvent[]` accepts the observed `# title`, `## User`, `## Assistant` layout and returns only visible dialogue events. `CURSOR_TRANSCRIPT_WARNING` is a constant constraint used by the adapter and CLI.

- [x] Add synthetic fixture with false assistant success claims, tool headings, a pending documentation item and a secret marker.
- [x] Run `npx vitest run tests/adapters/cursor.test.ts`; 12 new adapter assertions failed before implementation; CLI coverage was added with implementation and passed with the adapter suite.
- [x] Parse exact role headings outside backtick/tilde fences. Skip tool and reasoning sections, indented code, fenced blocks, unknown headings and HTML blocks conservatively. Reject missing title/user, unclosed fences and unsupported document shape. Role headings inside fenced content cannot become instructions.
- [x] Dispatch JSON/JSONL unchanged. Assemble only user traces, force paused status, attach warning and put the latest visible assistant message in a clearly unverified review instruction; a later user message takes precedence. Reuse redaction before assembly.
- [x] Add CLI stderr warning while preserving path-only stdout and valid output artifacts; test extract, validate and handoff warning propagation.
- [x] Verify synthetic JSON/JSONL behavior, redaction, LF/CRLF/CR, fenced role spoofing, skipped tool/hidden sections, incomplete input and pinned-clock determinism.

### Task 2: Recognize native Node tests and verify delivery

**Files:** Modify `src/adapters/common.ts`, `tests/adapters/cursor.test.ts`, `README.md`, `docs/compatibility-evidence.md`.

**Interfaces:** Existing `TEST_COMMAND: RegExp` additionally recognizes `node --test` and `node.exe --test` with whitespace/end after the flag, not `node --test-reporter` or `node --testing`.

- [x] Test structured calls with exits 1, 0, 1 and verify `failed, passed, failed`; ensure unresolved failure remains blocked.
- [x] Extend the expression with `node(?:\.exe)?\s+--test(?=\s|$)` without changing other runners.
- [x] Run `npm run check`, `npm run check:pack`, `npm audit`, and `git diff --check`.
- [x] Re-extract only the already authorized local live sample into a new evidence output, validate it, and compare objective/pending item, warning, empty inferred tool arrays and current Git state. Scan JSON and Markdown for the private project root and secret markers.
- [x] Document exact tested Cursor 3.20.10 / This Mac / Copy Transcript scope as transcript-only, not full certification. Keep the live source and generated evidence outside Git.
- [x] Leave reviewed changes on the feature branch for user-directed publication.

## Verification outcome

112 tests pass in 19 files, no skips. Package smoke passes with 45 files and isolated CLI/public exports. Dependency audit reports zero vulnerabilities. The previously failing live export now extracts with a warning and validates; semantic/privacy assertions verify pending context, paused status, empty inferred tool arrays, normalized paths and an independently matching Git snapshot. Changes remain local and uncommitted; no remote CI, push or merge is claimed.
