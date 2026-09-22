# ThreadPort `0.3.0-dev.0`

## Release boundary

This development prerelease delivers the control-plane Observe slice for temporary-session handoffs. Task detail can show run state, responsibility, persisted manifests, receipt stage/status, evidence IDs, coverage gaps, and unresolved verification attention without treating agent self-report as completion.

Receipt writes are bound to an immutable prepared manifest digest and explicit target session/run. Direct `verified-complete` writes and agent-reported verified transitions are rejected. Runtime receipt events without a matching prepared manifest remain `unknown`. Expired receipts remain visible as expired rather than being reclassified as completed.

Takeover status is readable for the live process and preserves the owner when stop control is unavailable. Takeover records are still in-memory; a restart must be shown as a coverage gap until durable takeover events are implemented.

## Compatibility and privacy

Claude/Codex source adapters remain observe-only. They report partial or none coverage when parent/run relationships are absent and never fabricate lineage or completion. Real cross-agent authentication and continuation remain unverified. Receipt payloads continue to use the existing safe payload and manifest redaction boundaries.

The installed-package browser smoke test uses an accessible task link selector that tolerates the intentional duplicate task title in the home hero, task card, and list.

## Verification evidence

- `npm run check:format` passed.
- `npm run typecheck` passed.
- `npm run build` passed.
- `npm test` passed: 83 test files, 524 tests.
- `npm run test:coverage` passed: statements 84.40%, branches 78.42%, functions 85.26%, lines 93.33%.
- Control-plane focused tests passed: 6 files, 30 tests.
- `npm run check:docs` passed: 314 local destinations in 115 Markdown files.
- `npm run check:redaction` passed: 4 exported artifacts scanned.
- `npm run check:pack` passed: 264 files and archive SHA-256 `b1d4b59ac8796308014e87364ca8a4549ab644c19ef38ce70e0c6b1a403cea60`.
- `npm run test:e2e` passed 10/10 using synthetic/fixture data.
- `npm run test:package` passed the installed browser smoke and package smoke.
- A Node 24 Linux container with SQLite CLI 3.40.1 ran the full `npm run check` successfully: 83 files, 524 tests passed, 0 skipped, 0 failed. Evidence: `docs/verification/linux-container-sqlite-2026-09-22.json`.
- The base `node:24-bookworm` image was also exercised; its three SQLite-CLI fixture skips are retained as environment evidence, not as a release gap.
- The local validation report records source-check passed and browser/package probe skips; Docker passed. Direct Playwright, package, and Docker runs above provide the corresponding evidence after the host probes were evaluated.

## Explicitly skipped gates

Real Agent continuation/authentication and real-user observation/usability testing are `skipped-by-request` per the latest user request. They were not attempted and are not counted as passing or failing. No stable cross-agent release claim can be made from this prerelease.

## Release status

The non-real Observe gate is reviewable as `0.3.0-dev.0`. Stable release remains **HOLD** pending authorized real-Agent/real-user validation, durable takeover recovery, and cross-agent authentication/continuation evidence. No tag or publish was performed.
