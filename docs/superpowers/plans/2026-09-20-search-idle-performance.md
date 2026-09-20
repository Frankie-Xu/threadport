# Search and idle CPU Implementation Plan

**Goal:** Reduce search latency and unchanged refresh CPU without weakening search semantics or acceptance budgets.

**Architecture:** Preserve the invalidatable session projection, upgrading to schema 11 to cache ASCII case folding and maintain an external-content FTS5 trigram candidate index. Avoid unused large query result columns and skip projection reconstruction when no events changed and the existing projection is clean. Continue reading source checkpoints to detect replacement and truncation.

**Tech Stack:** TypeScript, better-sqlite3, Vitest, Node 24.

## Constraints

- Fixed dataset remains 200 MiB / 500 sessions / 50,000 events.
- API p95 <= 300 ms; browser p95 <= 500 ms; idle CPU median <= 2%.
- Preserve literal, Chinese, NUL, dirty/missing projection fallback, cursor and privacy behavior.
- Do not modify the user's untracked planning document or real source databases.

## Task 1: Remove unused search result payload

- [ ] In src/storage/search-store.ts replace SELECT * with the explicit Row metadata fields used by result assembly; sessionSearch and searchDirty remain SQL predicate inputs only.
- [ ] Add a regression in tests/search/service.test.ts that captures the statement result and proves projection text is not returned.
- [ ] Fold session_search.search_text with SQLite lower() when rebuilding and during migration 011; remove lower() from clean-cache query predicates. Original event text remains unchanged. Test schema 10 upgrade with NUL/Unicode and preserve dirty fallback.
- [ ] Maintain FTS rows through session_search insert/update/delete triggers in migration 011. For terms of at least three code points without NUL, intersect quoted trigram candidates and retain instr() verification. Load full cache text only after candidate selection. Test quote/emoji/NUL/dirty/missing and non-contiguous trigram false positives.
- [ ] Run search tests and fixed-capacity benchmark.

## Task 2: Eliminate unchanged projection reconstruction

- [ ] In src/storage/index-store.ts reconstruct only after reset, nonempty event writes, or missing/dirty projection. Keep cursor and metadata validation and updates.
- [ ] Test unchanged refresh leaves session_search untouched; dirty and missing projection are repaired even without new events.
- [ ] Run search/indexing/migration tests, then the full check and browser/package checks.

## Task 3: Measure and record

- [ ] Run Node 24 benchmark with browser timing without concurrent builds/tests; retain all results and failed budgets.
- [ ] Record exact environment, candidate SHA and limitations. Commit changes and open a PR with measured evidence.
