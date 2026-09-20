# Search and idle CPU optimization

Candidate validation is in progress; this document does not lift the stable-release HOLD.

The unchanged source scan rebuilt every session's complete search projection. It now rebuilds only after event writes/reset or when the projection is missing/dirty. Source checkpoints, metadata, leases and cursor checks remain active.

Search previously selected the full session text into result rows and repeatedly folded it. Schema 11 folds the derived cache once, maintains an external-content FTS5 trigram candidate index, and preserves original event text for snippets. Quoted trigram intersections narrow candidates; exact literal instr() verification still decides the match. Metadata is streamed in cursor order, and text verification stops after limit + 1 matches rather than scanning text for every later page. Short/NUL terms and dirty/missing projections retain direct matching. The metadata CTE does not load full cache text; that read occurs after candidate filtering. No private event body is indexed.

## Local experiments (not final candidate certification)

Node 24.18.1 / Apple M1 / macOS, unchanged 200 MiB, 500 sessions, 50,000 events, 100 API and 100 UI queries. All three reports identify a dirty development tree; they are separate experiments, not interchangeable candidate evidence. No concurrent build/test was run by this task during measurement. Host load varied substantially; raw load samples are retained.

| Experiment | API p95 ms | UI p95 ms | Idle CPU median % | Index ms | Decision |
| --- | ---: | ---: | ---: | ---: | --- |
| [Skip unchanged rebuilds and remove result payload](performance/search-idle-2026-09-20/01-unchanged-scan.json) | 583.20 | 812.70 | 0.122 | 49,241 | HOLD |
| [Add folded cache](performance/search-idle-2026-09-20/02-folded-cache.json) | 1,236.51 | 1,206.80 | 0.085 | 37,640 | HOLD |
| [Trigrams before removing eager CTE text](performance/search-idle-2026-09-20/03-trigram-eager-cache.json) | 1,011.84 | 402.70 | 0.074 | 60,177 | HOLD |

Final code additionally removes eager full-text reads from the metadata CTE. Performance budgets remain API <=300ms, UI <=500ms, idle CPU median <=2%, index <=60s and RSS <=400MiB. The existing 3-second idle observation is not a long-term CPU guarantee. Final commit-bound evidence and cross-platform checks must be recorded before claiming acceptance.

Upgrade to schema 11 creates a pre-migration backup; rollback requires restoring a compatible backup, not editing user_version. Real-agent and external-user acceptance remain separate release gates.

## Candidate 898303f and diagnostic follow-up

- [macOS candidate](performance/search-idle-2026-09-20/04-macos-898303f.json): API/UI p95 281.32/368.60ms, idle CPU 0.051%, index 78.13s. HOLD for index time.
- [Ubuntu candidate](performance/search-idle-2026-09-20/05-ubuntu-898303f.json): API/UI p95 313.22/344.40ms, idle CPU 0.083%, index 99.74s. HOLD for index and API time. [Workflow](https://github.com/Frankie-Xu/threadport/actions/runs/35529739499).
- [Instrumented local diagnostic](performance/search-idle-2026-09-20/06-diagnostic-898303f.json): uses an extra temporary SQLite statement-timing preload, so it is diagnostic evidence rather than an uninstrumented acceptance run. Index 47.85s, API p95 258.41ms, but idle CPU 24.68% during a scheduled unchanged scan. This exposed remaining no-op metadata/cursor and lease writes; it does not lift HOLD.

The follow-up removes per-record lease renewal (the 10-second heartbeat and transactional write fencing remain), skips all writes for checkpoint-verified unchanged batches, and uses optimized literal substring matching for the folded cache. These changes require new commit-bound measurements.

## Ordered-page implementation

The V8 substring experiment was withdrawn: [macOS 0b9faa0](performance/search-idle-2026-09-20/07-macos-0b9faa0.json) had API/UI p95 656.67/710.80ms, while [Ubuntu 0b9faa0](performance/search-idle-2026-09-20/08-ubuntu-0b9faa0.json) had 870.55/878.40ms and index 104.60s. Idle CPU was below 0.11% in both. No failures are discarded.

The replacement streams ordered metadata, builds trigram candidate sets once per term, verifies exact literals and stops after collecting one page plus its continuation sentinel. This keeps transaction/cursor semantics and bounds text reads for common queries. The benchmark profiler measures iterator steps and candidate/verification statements as query time, preserving one unique sample per request.

[Ordered development run](performance/search-idle-2026-09-20/09-ordered-development.json): macOS Node 24, API/UI p95 43.28/78.50ms, idle CPU 0.128%, index 35.24s, RSS 308.73MiB. All budgets pass. This is a dirty-tree development result; clean candidate and Ubuntu evidence are still required.
