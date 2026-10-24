# Control-plane maintenance: ten independently validated changes

Base `7c0b1a0`; branch `codex/control-plane-maintenance`. Implement and push each numbered change, create one PR, require all hosted checks, then squash-merge and synchronize main. No schema migration, dependency update or release. The original untracked planning file is excluded.

Acceptance: targeted regressions for each item; final Node 24 `npm run check`, `npm run test:e2e`, `npm run test:package`; Ubuntu/macOS/Windows CI and aggregate `check` must pass on the final PR head before merge. Synthetic controller/import tests do not certify real Agent execution.

1. [x] Read all control events correctly across noncontiguous SQLite sequence values (`src/storage/control-plane-store.ts`; storage regression).
2. [x] Filter task/run control events in SQLite rather than materializing unrelated event bodies (`src/storage/control-plane-store.ts`, service, HTTP routes, status CLI; scope tests).
3. [x] Fetch global receipt state in one query instead of one query per manifest (`src/storage/control-plane-store.ts`, service; query-count regression).
4. [x] Make payload validation bounded, consistent with Zod safeParse, and correct for repeated acyclic containers (`src/control-plane/contracts.ts`; contract tests).
5. [ ] Dispose takeover timeout handles and preserve state advanced while a stop request is pending (`src/control-plane/takeover.ts`; fake timers/deferred controller tests).
6. [ ] Validate takeover identities, timeout bounds and successor identity before state mutation (`src/control-plane/takeover.ts`; invalid-input regression).
7. [ ] Strict control status/ingest arguments, bounded JSON imports and preflight validation before opening storage (`src/cli-control.ts`, shared argument/import helpers; CLI tests).
8. [ ] Strict receipt CLI arguments and schema preflight with predictable exit codes (`src/cli-control.ts`; CLI tests; depends on 7's parser).
9. [ ] Strict takeover CLI arguments before touching the in-memory manager (`src/cli-control.ts`; CLI tests; depends on 7's parser).
10. [ ] Honor cancellation before discovery/read and before committing imported control events (`src/control-plane/ingest.ts`; synthetic-source cancellation tests).

Items 2 and 3 add store read methods without changing existing read APIs. Invalid payloads/arguments become explicit input errors; valid stored wire formats remain compatible. Rollback: revert the squash merge as a unit, or revert individual commits in reverse dependency order. No persisted data is rewritten. Record final CI URL and merge SHA in the PR. Rollback is planned, not exercised.

1: Node 24 storage suite passed, 10 tests; 1,005 surviving events across sequence gaps are returned exactly once in insertion order.

2: Node 24 storage/API suites passed, 12 tests; scoped reads preserve order and ignore unrelated malformed event bodies before decoding. SQL still scans the event table; no indexed-query speedup is claimed.

3: Node 24 storage suite passed, 12 tests; three manifests retain all receipts while global state executes one receipt SELECT instead of one per manifest.

4: Node 24 contracts/storage/reducer suites passed, 30 tests. Payloads are limited to depth 32 and 4,096 visited values; invalid payloads return Zod issues. Shared acyclic arrays and own JSON keys round-trip without prototype changes. This deliberately tightens oversized/non-JSON input acceptance.
