# Ten maintenance fixes

Base: `249363b` (v0.2.1 release record), with the previously developed search highlight fix retained. Branch: `codex/maintenance-ten-fixes`. Each numbered item is a separate commit and push. No schema migration or release is planned.

Acceptance: each fix has a regression covering the observable failure, affected tests pass, and the final combined code passes `npm run check` on Node 24. Public entry points and cursor wire formats stay compatible with valid existing callers. Revert individual commits to roll back; no persisted data is rewritten.

1. [x] Reject invalid timezone offsets in search filters and stored activity (`src/search/contracts.ts`; search tests).
2. [x] Require canonical search cursor encoding, rejecting ignored bytes and altered padding bits (`src/search/contracts.ts`; search tests).
3. [x] Validate task/session/event pagination cursor shapes before freshness checks (`src/storage/api-store.ts`, `src/server/business-routes.ts`; route tests).
4. [x] Return actionable, private-path-safe errors for unavailable source/workspace directories (`src/server/business-routes.ts`; route tests).
5. [x] Prevent scheduled refresh overlap and recover after failures (`src/indexing/scheduler.ts`; fake timer tests).
6. [x] Retain explicit unverifiable command evidence if historical snapshot reads fail (`src/handoff/evidence.ts`; handoff tests).
7. [x] Preserve literal Markdown source text containing tildes (`src/markdown.ts`; parsed Markdown tests).
8. [x] Avoid argument-count overflow when exporting text with many backtick runs (`src/tasks/export.ts`; export regression).
9. [ ] Share API error recovery classification between browser and server (`src/contracts/api-errors.ts`, server compatibility facade, `web/src/api.ts`; classification tests).
10. [ ] Make repeated version probes independent of RegExp state (`src/targets/detect.ts`; synthetic read-only probe tests).

Constraints: original untracked planning document is excluded; CLI probes in tests are synthetic, not real Agent certification. No stable-release claims are extended. Validation results and commit links are recorded after execution.

Item 1: Node 24 search suite passed (15 tests). Invalid offsets produce INVALID_INPUT; invalid stored activity remains unknown.

Item 2: Node 24 search suite passed (16 tests); canonical cursor resumes, altered unused padding bits are rejected.

Item 3: Node 24 routes suite passed (8 tests), including malformed task/session/event cursors and existing continuation/staleness cases.

Item 4: Node 24 routes suite passed (9 tests); missing paths, non-directory ancestors, files and NUL input return private-path-safe 400 errors without creating bindings.

Item 5: Node 24 scheduler/indexing suites passed (11 tests); slow refreshes skip overlapping ticks and recover after asynchronous rejection or synchronous failure.

Item 6: Node 24 evidence/handoff suites passed (24 tests); unreadable historical snapshots retain unknown applicability, and repeated failed lookups are cached per preparation.

Item 7: Node 24 Markdown suite passed (8 tests), including parsed strikethrough/fence regressions and the existing checked-in example.

Item 8: Node 24 export/task suites passed (8 tests). Export preserves a 450 KB synthetic command with 150,000 backtick runs without argument overflow. Parsed-Markdown validation also exposed and fixed inline evidence-ID fences swallowing later headings; sections and command blocks now parse correctly.
