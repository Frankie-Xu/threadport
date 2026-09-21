# Bounded source batching: fixed-capacity acceptance

Runtime commit: `829a862430de06a507eb922b122e5b184fbfb532`. Both raw reports bind this clean commit (`trackedChanges=false`). Subsequent documentation commits do not change the measured runtime. This closes the previously recorded initial-index budget failure in the synthetic benchmark; stable release still requires separate real-agent, scope and external-user acceptance.

## Implementation and invariants

The JSONL adapter previously reopened and validated a source for each record. It now normalizes records during one bounded file read, stopping at the requested event budget or the adapter's 100-record / reader's existing byte budget. The reader computes the checkpoint at the consumed boundary, including the start of a partly consumed multi-block record. File handles close within each call; there is no persistent handle cache.

Allowed-root and symlink checks, file identity and head/tail validation, half-line handling, cancellation, redaction, event IDs, command pairing and persisted cursor format remain intact. A failed page returns the prior cursor and metadata. Database schema remains 11.

Tests cover multi-record pages, partial-block resumption through a fresh adapter, exact stop/revisit boundaries, reset/cancellation/consumer failures, metadata rollback, and Codex state at both one-event and ten-event budgets. The cancellation test still requires response under 2 seconds, no reads after cancellation, and complete duplicate-free resume; it now counts persisted events independently from adapter calls.

## Same workload and budgets

200 MiB, 500 sessions, 50,000 events, 100 API and 100 browser queries, 100 status requests, five cold starts. No workload or threshold was relaxed. Both reports validate 200 unique search timing samples.

| Metric | macOS arm64 / Node 24.18.1 | Ubuntu x64 / Node 24.20.0 | Budget |
| --- | ---: | ---: | ---: |
| Initial index | 19.00 s | 19.11 s | <=60 s |
| Search API p95 | 75.86 ms | 57.78 ms | <=300 ms |
| Browser search p95 | 95.70 ms | 93.90 ms | <=500 ms |
| Indexing status p95 | 39.93 ms | 35.07 ms | <=200 ms |
| Cold start p95 | 491.57 ms | 380.28 ms | <=3000 ms |
| Incremental visibility | 13.49 s | 0.21 s | <=20 s |
| Peak RSS | 298.92 MiB | 323.55 MiB | <=400 MiB |
| Idle CPU median | 0.076% | 0.071% | <=2% |
| Cancellation | 4.83 ms | 3.98 ms | <=2000 ms |
| Decision | PASS | PASS | All budgets |

Raw evidence: [macOS](performance/batched-indexing-2026-09-21/macos-829a862.json), [Ubuntu](performance/batched-indexing-2026-09-21/ubuntu-829a862.json). [Successful Ubuntu workflow](https://github.com/Frankie-Xu/threadport/actions/runs/35604690787).

The previous Ubuntu candidate recorded 78.22 seconds for initial indexing; its raw failure remains in [the prior optimization record](search-idle-performance-2026-09-20.md). Runs use independent machines/load conditions, so these figures are observations, not a controlled causal speedup estimate. Three-second idle medians are not long-term CPU guarantees. Shared-runner/synthetic results do not certify real-agent continuation or real-user usability.

## Regression verification

Frozen-code local Node 24 `npm run check` passed: 82 test files / 520 tests, types, build, format, documentation links and redaction. Final three-platform CI, browser workflows, Linux coverage and isolated package installation are attached to [PR #66](https://github.com/Frankie-Xu/threadport/pull/66).

An earlier local full test overlapped the addition of the failed-page rollback case and loaded an older source module: 519 passed / 1 failed. The focused rollback test and the subsequent frozen-code full run both passed. This intermediate result is not used as acceptance evidence.
