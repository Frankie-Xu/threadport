# Main and Refactor Integration Implementation Plan

**Goal:** Integrate remote main d3fe770 and local refactor f5dca12 without losing either feature set or existing databases.
**Architecture:** Merge in an isolated worktree; preserve both control-plane and assertion/observation APIs. Detect legacy database lineage before applying a canonical migration sequence. Keep literal history search and dirty-projection fallback semantics.
**Tech Stack:** TypeScript, SQLite, Fastify, React, Vitest, Playwright.

## Constraints
- Preserve the original checkout and its untracked planning file.
- Never equate equal user_version values with equal schemas across the two historical branches.
- Retain backups and transactional failure behavior; test both historical upgrade paths.
- Do not claim capacity acceptance from a focused benchmark or old SHA results.

## Tasks
- [x] Resolve package/API/error-handler/store conflicts, preserving both feature sets and quality scripts.
- [x] Resolve migration lineage in src/storage/migrations.ts and migration SQL; test fresh, main v6, local v9, and failed upgrade data preservation.
- [x] Resolve src/storage/search-store.ts and tests/search/service.test.ts with main session_search invalidation and existing literal-search contracts.
- [x] Run npm run check, npm run test:coverage, npm run test:e2e, npm run test:package and npm audit; record actual exit results.
- [ ] Commit unified branch, push a reviewable integration PR against main with migration notes, and inspect CI.
