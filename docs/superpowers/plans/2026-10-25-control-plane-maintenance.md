# Control-plane maintenance: ten independently validated changes

Base `7c0b1a0`; branch `codex/control-plane-maintenance`. Implement and push each numbered change, create one PR, require all hosted checks, then squash-merge and synchronize main. No schema migration, dependency update or release. The original untracked planning file is excluded.

Acceptance: targeted regressions for each item; final Node 24 `npm run check`, `npm run test:e2e`, `npm run test:package`; Ubuntu/macOS/Windows CI and aggregate `check` must pass on the final PR head before merge. Synthetic controller/import tests do not certify real Agent execution.

1. [x] Read all control events correctly across noncontiguous SQLite sequence values (`src/storage/control-plane-store.ts`; storage regression).
2. [x] Filter task/run control events in SQLite rather than materializing unrelated event bodies (`src/storage/control-plane-store.ts`, service, HTTP routes, status CLI; scope tests).
3. [x] Fetch global receipt state in one query instead of one query per manifest (`src/storage/control-plane-store.ts`, service; query-count regression).
4. [x] Make payload validation bounded, consistent with Zod safeParse, and correct for repeated acyclic containers (`src/control-plane/contracts.ts`; contract tests).
5. [x] Dispose takeover timeout handles and preserve state advanced while a stop request is pending (`src/control-plane/takeover.ts`; fake timers/deferred controller tests).
6. [x] Validate takeover identities, timeout bounds and successor identity before state mutation (`src/control-plane/takeover.ts`; invalid-input regression).
7. [x] Strict control status/ingest arguments, bounded JSON imports and preflight validation before opening storage (`src/cli-control.ts`, shared argument/import helpers; CLI tests).
8. [x] Strict receipt CLI arguments and schema preflight with predictable exit codes (`src/cli-control.ts`; CLI tests; depends on 7's parser).
9. [x] Strict takeover CLI arguments before touching the in-memory manager (`src/cli-control.ts`; CLI tests; depends on 7's parser).
10. [x] Honor cancellation before discovery/read and before committing imported control events (`src/control-plane/ingest.ts`; synthetic-source cancellation tests).

Items 2 and 3 add store read methods without changing existing read APIs. Invalid payloads/arguments become explicit input errors; valid stored wire formats remain compatible. Rollback: revert the squash merge as a unit, or revert individual commits in reverse dependency order. No persisted data is rewritten. Record final CI URL and merge SHA in the PR. Rollback is planned, not exercised.

1: Node 24 storage suite passed, 10 tests; 1,005 surviving events across sequence gaps are returned exactly once in insertion order.

2: Node 24 storage/API suites passed, 12 tests; scoped reads preserve order and ignore unrelated malformed event bodies before decoding. SQL still scans the event table; no indexed-query speedup is claimed.

3: Node 24 storage suite passed, 12 tests; three manifests retain all receipts while global state executes one receipt SELECT instead of one per manifest.

4: Node 24 contracts/storage/reducer suites passed, 30 tests. Payloads are limited to depth 32 and 4,096 visited values; invalid payloads return Zod issues. Shared acyclic arrays and own JSON keys round-trip without prototype changes. This deliberately tightens oversized/non-JSON input acceptance.

5: Node 24 takeover suite passed, 7 tests. Fake timers verify cleanup after success/refusal/failure/timeout; late controller completion cannot reopen an explicitly closed takeover.

6: Node 24 takeover/API suites passed, 9 tests. Invalid IDs, non-finite/fractional/out-of-range timeouts and invalid successors fail before mutation or controller invocation.

7: Node 24 CLI/storage suites passed, 14 tests. Unknown/duplicate/missing options, invalid JSON, empty batches, invalid events, oversized files and invalid UTF-8 fail before creating storage. Valid single-event import/status succeeds. Manual imports are capped at 1 MiB and 1,000 events.

8: Node 24 CLI/receipt suites passed, 6 tests. Receipt argument/schema errors do not create storage; identical retries retain output, manifest conflicts/forged completion return conflict exit code 4 and missing manifests return input exit code 2.

9: Node 24 CLI/takeover suites passed, 13 tests. Malformed/duplicate options and invalid identities are rejected before calling the manager; unavailable stop remains a conflict and missing takeover IDs return exit code 2.

10: Node 24 ingestion suite passed, 3 tests. Pre-cancelled operations do not discover/read; sources ignoring cancellation cannot commit; discovery closes and valid imports still succeed.

## Combined local acceptance

Node 24.18.1 / macOS: `npm run check` passed, 86 files / 557 tests, including types/build/format/docs/redaction. `npm run test:e2e` passed all 11 browser flows. `npm run test:package` passed with 272 files, isolated public exports/CLI/server/workspace verification, three Cursor roundtrips and installed-browser smoke. Runtime candidate: `8c356cfd9aa095af257d8ab418bf8646f736b0dd`. Archive SHA-256: `12a887e99c37123080cf775fbbf9d1aae1e94942fae760ffda608f38d9ba81dd`. The subsequent evidence commit changes only this plan.

| Item | Independently pushed implementation |
| --- | --- |
| 1. Sequence-gap replay | [9c115e4](https://github.com/Frankie-Xu/threadport/commit/9c115e4) |
| 2. Scoped event decoding | [4653c5d](https://github.com/Frankie-Xu/threadport/commit/4653c5d) |
| 3. Bulk receipt query | [5ca02cd](https://github.com/Frankie-Xu/threadport/commit/5ca02cd) |
| 4. Bounded payload validation | [16e4893](https://github.com/Frankie-Xu/threadport/commit/16e4893) |
| 5. Takeover timeout/state lifecycle | [3e98acc](https://github.com/Frankie-Xu/threadport/commit/3e98acc) |
| 6. Takeover input validation | [5e319bc](https://github.com/Frankie-Xu/threadport/commit/5e319bc) |
| 7. Strict control CLI/import | [ffe0b44](https://github.com/Frankie-Xu/threadport/commit/ffe0b44) |
| 8. Strict receipt CLI | [f9eef61](https://github.com/Frankie-Xu/threadport/commit/f9eef61) |
| 9. Strict takeover CLI | [a0323a7](https://github.com/Frankie-Xu/threadport/commit/a0323a7) |
| 10. Import cancellation | [8c356cf](https://github.com/Frankie-Xu/threadport/commit/8c356cf) |

Hosted CI and merge outcome will be recorded in the PR after all checks pass. These local results do not substitute for that gate.
