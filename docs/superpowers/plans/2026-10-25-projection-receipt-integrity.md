# Ten projection and receipt integrity fixes

Base: `6ed3455`. Branch: `codex/projection-receipt-integrity`. Each numbered change gets a regression, separate commit and push. Then create one PR, require all three platform jobs and aggregate check on the final head, squash-merge and synchronize local main.

1. [x] Prototype-safe session/manifest/receipt projection dictionaries (`src/control-plane/reducer.ts`; reducer regressions).
2. [x] Preserve unknown/incomplete coverage in merges and observation health (`coverage.ts`, reducer; coverage/reducer tests).
3. [x] Reject duplicate manifest item/constraint keys (`contracts.ts`; contract tests).
4. [x] Require both target session/run IDs or neither; reject empty supplied IDs (`contracts.ts`, `manifest.ts`; contract tests).
5. [ ] Bind receipt validation and projected manifests to the actual handoff/target identity (`receipts.ts`, reducer; receipt/reducer tests).
6. [ ] Share strict ISO timestamp validation between search/control plane and validate injected receipt clocks (`src/contracts/timestamp.ts`, search/control contracts, receipts; timestamp regressions).
7. [ ] Prevent advancement after receipt expiry and expose pending stored receipt expiry without rewriting history (`receipts.ts`, control-plane store; deterministic clock tests).
8. [ ] Validate runtime receipt transition stage/source values before terminal shortcuts (`receipts.ts`; receipt tests).
9. [ ] Preserve the first valid immutable manifest during event replay (`reducer.ts`; conflicting replay tests).
10. [ ] Retain event-conflict attention through subsequent incremental updates (`reducer.ts`; batch/incremental parity tests).

Acceptance: targeted regressions, final Node 24 `npm run check`, 11 browser flows and isolated `npm run test:package`; final-head Ubuntu/macOS/Windows CI plus required `check`. No dependency, schema, version or release change. Ambiguous manifests (duplicate keys or half-bound targets), invalid dates and unrecognized transition sources become explicit validation failures; valid unambiguous persisted formats keep their digest algorithm. Pending expiry is a read-time projection only. Item 7 uses item 6's validated clock; other items can be assessed independently. Rollback the squash commit as a unit or revert in reverse dependency order; no stored data is rewritten. Rollback is planned, not exercised. Preserve the original untracked planning file.

1: Node 24 reducer/API suites passed (12 tests). Prototype-named IDs remain own JSON-visible entries, with no inherited phantom state.

2: Node 24 coverage/reducer suites passed (20 tests). Unknown coverage is retained when mixed with partial coverage; partial/none/unknown runtime observations remain coverage-gap, not current.

3: Node 24 contracts/storage suites passed (21 tests). Duplicate keys within either section are rejected; item and constraint namespaces remain separate.

4: Node 24 contracts/storage/API suites passed (23 tests). Targets must have both valid IDs or neither; empty supplied IDs are no longer silently omitted.
