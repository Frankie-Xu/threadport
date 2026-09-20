# Search latency remediation Implementation Plan

**Goal:** Re-measure R08 at the fixed capacity and improve the measured bottleneck while preserving literal matching.

**Architecture:** Instrument only the isolated benchmark worker to separate SQLite candidate query, snippet projection, JS assembly, response and UI timing. First retain a clean-commit baseline. Test a covering index for the existing literal scan only if IO/query time dominates; use an additive migration and the same queries, budgets and output contract.

**Tech Stack:** Existing SQLite and Node24. No additional services or search language.

- [x] Commit benchmark-only measurement support and record exact commit, load and raw stage samples.
- [x] Run the unchanged 200MiB / 500 sessions / 50,000 events / 100 mixed API+UI queries. Keep failures.
- [x] If justified, add `events(session_id,ordinal DESC,id,search_text)` covering index; verify actual query plans and compare with the same dataset. Remove the change if it does not improve measured performance or violates resource budgets.
- [x] Preserve Chinese substrings, literal %, _, backslash, NUL suffixes, ASCII folding, filtering and stable paging through existing and added tests.
- [x] Record all metrics independently, including historical Ubuntu evidence. A local pass cannot close the two-platform gate.

## Measured adjustment

Clean baseline `9a9e408`: API p95 468.30ms, UI p95 492.50ms; query execution dominates. Its raw profiling rows were accidentally collected twice by two IPC listeners (latency samples themselves are not duplicated); fix the second listener before comparison.

A bounded 10,000-event in-memory diagnostic compared the existing scan (~61–73ms in four ordinary rounds, one 305ms outlier), raw-text covering index (~50–72ms) and an index on `(session_id,lower(search_text))` (~34–35ms). Therefore test the expression index in migration 008 instead of the original covering-index candidate. The production query remains unchanged. This adds one folded text copy on disk and index maintenance on writes; the full fixed-capacity benchmark must validate resource costs. Diagnostic timing is not release evidence.

## Outcome

The full on-disk expression-index experiment `09b51fc` regressed API/UI p95 to 2387.61/928.80ms and index time to 50.90s. The index and migration were removed as required. Original literal search and schema 7 remain. Instrumentation/clean-commit attribution and raw failed rounds are retained; R08 performance is still HOLD. The earlier Ubuntu run was retrieved: `7f57a79`, API/UI p95 394.68/427.70ms, API failed. No current fixed-reference Ubuntu pass exists.
