# Control Plane Review — 2026-09-22

## Scope and authority

This review covers the temporary-session implementation executed through the linked Codex task. The latest user-authored request is the controlling scope: exercise every testable local, fixture, browser, package, migration, replay, recovery, privacy, and container path; skip real Agent continuation and real-user observation. The attached handoff planning document is treated as background material and explicitly says it is a writing handoff, not implementation authorization. It does not override the later user request.

The checkout is intentionally dirty because the linked task and this review are the same development line. Current HEAD is `c3f9a2c1a920104c45ca0e0e2ef6db7629efafe5` on `codex/report-refresh`. No commit, tag, publish, external Agent call, or user study was performed. The package version remains `0.3.0-dev.0`.

## Findings closed in this review

- Agent-reported `verified-complete` transitions now fail with `RECEIPT_VERIFICATION_REQUIRED` and cannot be shown as confirmed.
- Direct persistence of a `verified-complete` receipt is rejected until an evidence-backed transition exists.
- Receipts require an immutable prepared manifest, matching digest, and explicit prepared target session/run. Untargeted manifests cannot accept arbitrary receipt targets; conflicting nonce retries remain visible as conflicts.
- The deterministic reducer keeps receipt confirmations unknown when the manifest/digest/target binding is absent and opens an explicit unverified-completion attention item.
- Task control projections now merge persisted manifests and receipts, and task detail renders stage, status, target, evidence IDs, and coverage semantics.
- Expired pending receipts are projected as `expired` after reopen, preserving the fact that the receipt existed without turning expiry into completion.
- The installed-package browser smoke test now selects the task link by accessible role/name instead of assuming that a task title occurs only once. This closes the regression exposed by the new home page, where the same task is intentionally visible in the hero, card, and list.

## Verification evidence

| Check | Result | Fresh evidence |
| --- | --- | --- |
| `npm run check:format` | PASS | Source, web, tests, and scripts passed the newline/trailing-whitespace gate. |
| `npm run typecheck` | PASS | Server and web TypeScript projects compiled. |
| `npm run build` | PASS | TypeScript build and Vite production build completed. |
| `npm test` | PASS | 83 files, 524 tests passed on Windows Node 24.19.0. |
| `npm run test:coverage` | PASS | 83 files/524 tests; statements 84.40%, branches 78.42%, functions 85.26%, lines 93.33%. |
| Control-plane focused tests | PASS | 6 files, 30 tests passed. |
| `npm run check:docs` | PASS | 314 local destinations in 115 Markdown files. |
| `npm run check:redaction` | PASS | 4 exported artifacts scanned. |
| `npm run check:pack` | PASS | 264 files; public exports, UI/continue CLI, workspace verification, local server, and 3 Cursor roundtrips; archive SHA-256 `b1d4b59ac8796308014e87364ca8a4549ab644c19ef38ce70e0c6b1a403cea60`. |
| `npm run test:e2e` | PASS | 10/10 fixture-only Playwright tests passed in 39 seconds. |
| `npm run test:package` | PASS | Installed browser smoke passed task edit, reload persistence, and loopback-only access; package smoke also passed. |
| Linux Node 24 container (base image) | PASS | `node:24-bookworm` ran the full `npm run check`; 83 files passed, with 521 passed and 3 optional SQLite-CLI tests skipped by their fixture prerequisite. |
| Linux Node 24 container with SQLite CLI | PASS | Fresh isolated `node:24-bookworm` run installed SQLite CLI 3.40.1 and completed the full `npm run check`; 83 files, 524 tests passed, 0 skipped, 0 failed. Evidence: `docs/verification/linux-container-sqlite-2026-09-22.json`. |
| `npm run check:local -- --json --output docs/verification/local-validation-final-2026-09-22.json` | INCOMPLETE BY PROBE | Source check passed. Final runner summary: 2 passed, 0 failed, 2 skipped. Browser/package are skipped because its host probe requires `chrome.exe`, even though the direct bundled Playwright runs above passed; Docker probe and the Linux container step passed. |

The one initial local-validation source failure was reproduced as a transient run during the linked task's concurrent edits. A fresh source check and the Linux container check both passed after the worktree settled; the failed digest-only record is retained as historical evidence rather than rewritten.

## Explicitly skipped gates

| Gate | Status | Reason |
| --- | --- | --- |
| Real Agent continuation/authentication | `skipped-by-request` / HOLD | The user explicitly requested that real Agent testing be skipped. No external Agent was called. |
| Real-user observation/usability study | `skipped-by-request` / HOLD | The user explicitly requested that real-user testing be skipped. No participant or external user was contacted. |

These gates are neither passes nor failures and cannot support a stable cross-agent release claim.

## Remaining risks and boundaries

- Claude/Codex adapters remain observe-only where the source does not expose a trusted parent/run or control receipt. Missing, partial, stale, and unknown coverage remain visible rather than inferred.
- Takeover state is readable for a live process but is still in-memory; after restart it must surface a coverage gap until durable takeover events are added.
- Cross-agent authentication, real continuation semantics, and permission changes are not proven by fixture tests. They require the skipped real-Agent gate and a separately authorized security review.
- The local runner's `chrome.exe` probe is narrower than the bundled Playwright capability. The direct E2E/package results are valid evidence; improving probe detection is a follow-up quality task.
- The base Linux validation image did not include an external SQLite CLI, but the follow-up isolated Linux run provisioned SQLite 3.40.1 and completed all 524 tests with zero skips. CI should keep the CLI provisioned so the complete matrix remains reproducible.

## Release decision

The non-real Observe-gate checks are green, so `0.3.0-dev.0` is a reviewable development prerelease. Stable release remains **HOLD** until the explicitly skipped real-Agent/real-user gates, durable takeover recovery, and cross-agent authentication/continuation evidence are completed and reviewed. No stable tag, npm publish, or external rollout is authorized by this review.
