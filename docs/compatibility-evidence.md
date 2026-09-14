# Agent format compatibility evidence

This is an evidence register, not a promise that an adapter supports all releases of an agent. Fixture version strings are synthetic test data; they do not certify a real vendor version.

| Adapter | Committed evidence | Live version certification |
| --- | --- | --- |
| Claude | [Native source boundary and limits](../compatibility/claude-source.md); Synthetic `tests/fixtures/claude/session-basic.jsonl` and regression records | Not certified — no permitted, versioned live sample supplied |
| Codex | Synthetic `tests/fixtures/codex/session-basic.jsonl` and regression records | Not certified — no permitted, versioned live sample supplied |
| Cursor | Synthetic `tests/fixtures/cursor/session-basic.jsonl` and regression records | Not certified — no permitted, versioned live sample supplied |
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

Status at this follow-up: samples and desired version targets have been requested from the user; none have been supplied in scope. Live-format certification remains blocked on that input, not silently checked off.
