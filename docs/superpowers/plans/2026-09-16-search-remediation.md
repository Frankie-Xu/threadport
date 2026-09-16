# Search latency remediation Implementation Plan

**Goal:** Re-measure R08 at the fixed capacity and improve the measured bottleneck while preserving literal matching.

**Architecture:** Instrument only the isolated benchmark worker to separate SQLite candidate query, snippet projection, JS assembly, response and UI timing. First retain a clean-commit baseline. Test a covering index for the existing literal scan only if IO/query time dominates; use an additive migration and the same queries, budgets and output contract.

**Tech Stack:** Existing SQLite and Node24. No additional services or search language.

- [ ] Commit benchmark-only measurement support and record exact commit, load and raw stage samples.
- [ ] Run the unchanged 200MiB / 500 sessions / 50,000 events / 100 mixed API+UI queries. Keep failures.
- [ ] If justified, add `events(session_id,ordinal DESC,id,search_text)` covering index; verify actual query plans and compare with the same dataset. Remove the change if it does not improve measured performance or violates resource budgets.
- [ ] Preserve Chinese substrings, literal %, _, backslash, NUL suffixes, ASCII folding, filtering and stable paging through existing and added tests.
- [ ] Record all metrics independently, including Ubuntu absence. A local pass cannot close the two-platform gate.
