# Ten projection and receipt integrity fixes

Base: `6ed3455`. Branch: `codex/projection-receipt-integrity`. Each numbered change gets a regression, separate commit and push. Then create one PR, require all three platform jobs and aggregate check on the final head, squash-merge and synchronize local main.

1. [x] Prototype-safe session/manifest/receipt projection dictionaries (`src/control-plane/reducer.ts`; reducer regressions).
2. [x] Preserve unknown/incomplete coverage in merges and observation health (`coverage.ts`, reducer; coverage/reducer tests).
3. [x] Reject duplicate manifest item/constraint keys (`contracts.ts`; contract tests).
4. [x] Require both target session/run IDs or neither; reject empty supplied IDs (`contracts.ts`, `manifest.ts`; contract tests).
5. [x] Bind receipt validation and projected manifests to the actual handoff/target identity (`receipts.ts`, reducer; receipt/reducer tests).
6. [x] Share strict ISO timestamp validation between search/control plane and validate injected receipt clocks (`src/contracts/timestamp.ts`, search/control contracts, receipts; timestamp regressions).
7. [x] Prevent advancement after receipt expiry and expose pending stored receipt expiry without rewriting history (`receipts.ts`, control-plane store; deterministic clock tests).
8. [x] Validate runtime receipt transition stage/source values before terminal shortcuts (`receipts.ts`; receipt tests).
9. [x] Preserve the first valid immutable manifest during event replay (`reducer.ts`; conflicting replay tests).
10. [x] Retain event-conflict attention through subsequent incremental updates (`reducer.ts`; batch/incremental parity tests).

Acceptance: targeted regressions, final Node 24 `npm run check`, 11 browser flows and isolated `npm run test:package`; final-head Ubuntu/macOS/Windows CI plus required `check`. No dependency, schema, version or release change. Ambiguous manifests (duplicate keys or half-bound targets), invalid dates and unrecognized transition sources become explicit validation failures; valid unambiguous persisted formats keep their digest algorithm. Pending expiry is a read-time projection only. Item 7 uses item 6's validated clock; other items can be assessed independently. Rollback the squash commit as a unit or revert in reverse dependency order; no stored data is rewritten. Rollback is planned, not exercised. Preserve the original untracked planning file.

1: Node 24 reducer/API suites passed (12 tests). Prototype-named IDs remain own JSON-visible entries, with no inherited phantom state.

2: Node 24 coverage/reducer suites passed (20 tests). Unknown coverage is retained when mixed with partial coverage; partial/none/unknown runtime observations remain coverage-gap, not current.

3: Node 24 contracts/storage suites passed (21 tests). Duplicate keys within either section are rejected; item and constraint namespaces remain separate.

4: Node 24 contracts/storage/API suites passed (23 tests). Targets must have both valid IDs or neither; empty supplied IDs are no longer silently omitted.

5: Node 24 receipt/reducer suites passed (18 tests). Receipt context cannot substitute a different manifest handoff/target, and replay cannot register a manifest under an alias handoff.

6: Node 24 contracts/receipt/search suites passed (31 tests). Impossible control-event/receipt offsets and injected invalid clocks are rejected; existing search timestamp behavior uses the same shared schema.

7: Node 24 receipt/storage/API suites passed (19 tests). Advancement stops at the exact deadline using an optional deterministic clock. Pending reads and retries show expiry without updating SQLite; stored confirmed milestones remain confirmed on read.

8: Node 24 receipt suite passed (6 tests). Invalid runtime transition stages/sources raise schema errors before terminal shortcuts; valid Agent reports remain unknown.

9: Node 24 reducer/storage suites passed (29 tests). Different valid content cannot replace the first manifest; identical manifest replay stays idempotent and conflicts remain visible.

10: Node 24 reducer/API suites passed (18 tests). Event-conflict warnings survive subsequent events and exact duplicates, including updates from a rebuilt state; batch and incremental projections agree.

## Combined local acceptance

Runtime `5b9996957c0b54c109048a214f0ece74ba9e6f22`, Node 24.18.1 / macOS: `npm run check` passed (87 files / 578 tests), including types/build/format/docs/redaction. `npm run test:e2e` passed all 11 browser flows. `npm run test:package` passed (274 files), isolated exports/CLI/server/workspace checks, three Cursor roundtrips and installed-browser smoke. Archive SHA-256: `5322c814188ff83f5441efd59ba2b3ec4b8206dcd1c1f426f9ba7f8d5a55515d`. The following evidence commit changes documentation only. Hosted CI and merge SHA will be recorded in the PR after passing.

| Item | Separately pushed implementation |
| --- | --- |
| 1. Prototype-safe projections | [117ec82](https://github.com/Frankie-Xu/threadport/commit/117ec82) |
| 2. Coverage uncertainty | [69b620a](https://github.com/Frankie-Xu/threadport/commit/69b620a) |
| 3. Unique manifest keys | [d83b4d7](https://github.com/Frankie-Xu/threadport/commit/d83b4d7) |
| 4. Complete target binding | [e695df3](https://github.com/Frankie-Xu/threadport/commit/e695df3) |
| 5. Receipt/manifest identity | [80b6f53](https://github.com/Frankie-Xu/threadport/commit/80b6f53) |
| 6. Valid timestamp clocks | [d7b32be](https://github.com/Frankie-Xu/threadport/commit/d7b32be) |
| 7. Receipt expiry lifecycle | [69b81c3](https://github.com/Frankie-Xu/threadport/commit/69b81c3) |
| 8. Transition input validation | [33c9fb7](https://github.com/Frankie-Xu/threadport/commit/33c9fb7) |
| 9. Immutable manifest replay | [611efba](https://github.com/Frankie-Xu/threadport/commit/611efba) |
| 10. Persistent conflict attention | [5b99969](https://github.com/Frankie-Xu/threadport/commit/5b99969) |
