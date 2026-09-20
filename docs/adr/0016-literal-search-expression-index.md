# ADR 0016: materialize literal search folding

Status: rejected after the fixed-capacity experiment; the index and schema-8 migration were removed before distribution; fixed-capacity evidence is recorded separately in [performance results](../verification/performance-beta.md).

## Problem and decision

The clean Node24 baseline `9a9e408` measured API p95 468.30ms. Database candidate query p95 was 458.73ms; JS assembly p95 was 1.23ms. No-match and selective queries scan many event projections. The existing query repeatedly computes SQLite `lower(search_text)` before literal `instr` matching.

The experimental migration 008 added `events_search_folded(session_id,lower(search_text))`. SQLite maintained the same expression during insert/update/delete; the production query and result contract are unchanged. A bounded diagnostic favored this index over a raw-text covering index. The migration regression verifies the query plan uses the expression index and matching agrees before/after upgrade, including text after NUL. Existing search tests cover Chinese, literal wildcard characters, ASCII folding, filters, snippets, keyset pagination and cursor invalidation.

## Costs, compatibility and recovery

The index stores another folded search-text copy plus B-tree overhead. Index writes and migration can consume additional time and disk; no reduction in projection scope or dataset size offsets this cost. Full benchmark results include indexing, increment, RSS, start, status, idle and cancellation budgets. Do not infer overall performance from the small diagnostic or merge samples across runs.

The experiment used schema 8 as an additive migration over schema 7; user task bodies and source event bodies are unchanged. The existing migration runner takes a consistent backup and applies the index and user_version transactionally. Failure rolls back; insufficient backup space prevents migration. Older binaries refuse the new schema. Prefer forward repair; restoring an older backup to a fresh data directory discards later work unless separately preserved and is not an automatic downgrade.

## Evidence boundary

Local machine and shared-runner measurements are versioned observations, not fixed-reference hardware certification or real Agent acceptance. The first profiling baseline accidentally collected each storage timing twice through two IPC listeners; raw API/UI latency samples are unaffected. The duplicate listener is removed in `09b51fc` and later runs.

## Rejection

Clean commit `09b51fc` regressed API p95 to 2387.61ms and UI p95 to 928.80ms; indexing rose to 50.90s. Keep the raw failed round. The small in-memory diagnostic did not predict full on-disk behavior; load samples are preserved and no causal claim beyond the observed regression is made. The index, migration and experiment-only regression were removed; the shipping schema remains **7**. Only measurement improvements are retained. This experimental commit was not distributed as an installation candidate.
