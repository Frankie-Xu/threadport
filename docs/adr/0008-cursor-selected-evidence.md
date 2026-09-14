# ADR 0008: Explicit single-session Cursor evidence export

Status: experimental, local verification only (2026-09-14).

## Context

Cursor 3.20.10 Copy Transcript and project JSONL omit result links. Read-only inspection scoped to the authorized synthetic session found `cursorDiskKV` composer headers and per-bubble tool IDs, parameters, results, errors and times. The user requested complete compatibility testing. A whole-database export would unnecessarily expose other sessions, hidden reasoning and credentials.

## Decision

Add an opt-in developer script requiring an explicit database path, UUID session ID and fresh output path. Use `sqlite3 -readonly`, no shell, a read transaction, only exact composer/bubble keys and an allowlisted JSON projection. Exclude thinking, attachments, encryption keys, account data, raw tool binary and source contents. The script is not packaged into the CLI and does not auto-discover or scan sessions.

The resulting `threadport.cursor-native.v1` envelope is a ThreadPort verification input, **not a Cursor vendor export schema**. The adapter validates it, preserves times and correlates calls/results before existing Capsule v1 assembly. Unknown tools/outcomes remain explicitly incomplete. Terminal `completed`, `notInterrupted: true`, and output text such as `EXIT_CODE=0` do not establish a process exit. Preserve the original command and cwd; emit an explicit null exit for observed result text so shared parsing cannot guess one. Keep result timestamps for call pairing and ordering. Rejected and explicitly interrupted records retain their conservative descriptions.

This supersedes the initial exact-wrapper marker inference. The observed stopped command in Cursor 3.20.17 still reported `notInterrupted: true`; child-controlled text cannot supply independent exit evidence. Existing numeric structured-JSONL outcomes remain supported. Any future native numeric mapping requires a version-sourced fixture and a new decision, not a guessed field.

Capsule v1 and handoff formats stay unchanged. Database access is read-only; no source mutation, account access, network transmission or Agent launch is added to the core.

## Alternatives and costs

- Markdown/JSONL only: smaller, but cannot verify result pairing.
- Full database dump: rejected due to unnecessary data exposure.
- Hooks/instrumentation: not equivalent evidence for already-recorded native sessions; requires separate permission/version validation.

The script depends on an installed SQLite CLI with JSON functions. Internal Cursor formats may change; reject incompatible shape rather than fabricate success. Read transactions protect DB consistency, not concurrent workspace changes. Exported visible text/tool output may still be sensitive: keep local and inspect before sharing.

## Validation and reevaluation

Synthetic fixtures cover selected-record conversion, malformed IDs/times, missing/error/interrupted outcomes and hidden-field omission. A temporary SQLite integration fixture includes another-session decoys and a hidden marker; the exported projection must exclude both. Revisit on Cursor version changes or before productizing automatic discovery. None of this certifies other agents, operating systems or native continuation.
