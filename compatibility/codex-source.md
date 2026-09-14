# Codex native source — synthetic compatibility evidence

Parser: codex-jsonl-v1. [Committed fixture](../tests/fixtures/codex/source-visible.jsonl) and tests/sources/codex-source.test.ts are synthetic; no installed vendor release is certified.

The source shares Claude's allowed-root discovery, bounded JSONL reader, cancellation, fingerprints, diagnostics and cursor validation. Agent and configured source ID are part of session identity; equal filenames never merge Claude and Codex sessions.

Recognized structure: session_meta.payload (id, cwd, cli_version), turn_context.payload.cwd, and response_item.payload. Visible message input_text/output_text/text blocks are normalized; reasoning fields are omitted. exec_command, shell_command and shell function_call arguments carry cmd/command and workdir/cwd. function_call_output uses call_id for bounded cross-page correlation. Explicit integer exit_code in structured output is observed; prose-only status stays unknown. Unsupported custom tools/event_msg layouts remain explicit unknown records; no shell command is executed.

The full cursor retains only bounded redacted context, including cwd; restart resumes without losing the call/result relationship. Conflicting session metadata is unsupported rather than merging histories. [Common source boundaries](claude-source.md) still apply. [Indexing and recovery](../docs/v0.2/08-indexing.md) describes transactional cursor persistence and the scope beyond parsing.
