# Search and idle CPU optimization

Candidate validation is in progress; this document does not lift the stable-release HOLD.

The unchanged source scan rebuilt every session's complete search projection. It now rebuilds only after event writes/reset or when the projection is missing/dirty. Source checkpoints, metadata, leases and cursor checks remain active.

Search previously selected the full session text into result rows and repeatedly folded it. Schema 11 folds the derived cache once, maintains an external-content FTS5 trigram candidate index, and preserves original event text for snippets. Quoted trigram intersections narrow candidates; literal instr() still decides the match. Short/NUL terms and dirty/missing projections retain direct matching. The metadata CTE does not load full cache text; that read occurs after candidate filtering. No private event body is indexed.

## Local experiments (not final candidate certification)

Node 24.18.1 / Apple M1 / macOS, unchanged 200 MiB, 500 sessions, 50,000 events, 100 API and 100 UI queries. All three reports identify a dirty development tree; they are separate experiments, not interchangeable candidate evidence. No concurrent build/test was run by this task during measurement. Host load varied substantially; raw load samples are retained.

| Experiment | API p95 ms | UI p95 ms | Idle CPU median % | Index ms | Decision |
| --- | ---: | ---: | ---: | ---: | --- |
| [Skip unchanged rebuilds and remove result payload](performance/search-idle-2026-09-20/01-unchanged-scan.json) | 583.20 | 812.70 | 0.122 | 49,241 | HOLD |
| [Add folded cache](performance/search-idle-2026-09-20/02-folded-cache.json) | 1,236.51 | 1,206.80 | 0.085 | 37,640 | HOLD |
| [Trigrams before removing eager CTE text](performance/search-idle-2026-09-20/03-trigram-eager-cache.json) | 1,011.84 | 402.70 | 0.074 | 60,177 | HOLD |

Final code additionally removes eager full-text reads from the metadata CTE. Performance budgets remain API <=300ms, UI <=500ms, idle CPU median <=2%, index <=60s and RSS <=400MiB. The existing 3-second idle observation is not a long-term CPU guarantee. Final commit-bound evidence and cross-platform checks must be recorded before claiming acceptance.

Upgrade to schema 11 creates a pre-migration backup; rollback requires restoring a compatible backup, not editing user_version. Real-agent and external-user acceptance remain separate release gates.
