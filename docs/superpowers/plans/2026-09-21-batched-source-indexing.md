# Batched source indexing implementation plan

**Goal:** Bring the unchanged 200 MiB / 500-session / 50,000-event initial index under 60 seconds without weakening source safety or cursor semantics.

**Architecture:** Keep a source file open for a bounded read page. A synchronous line consumer normalizes records as they are read and stops on the normalized-event budget. The reader computes its checkpoint at the actual consumed boundary, including a partially consumed multi-block record. No file handles survive a read call; persistent cursor format and schema 11 remain unchanged.

**Tech stack:** TypeScript, Node 24, Vitest, existing SQLite storage and benchmark.

## Constraints

- Preserve allowed-root and symlink checks, file identity, head/tail checks, cancellation, partial-line handling, event limits and redaction.
- Bound pages to 100 records in the source adapter and the existing 4 MiB reader budget; keep normalized-event limits.
- Keep benchmark dataset, latency/CPU/memory limits, and release gates unchanged.
- Preserve the user's untracked planning document; use only synthetic test data.

## Steps

- [ ] Add source tests comparing batched and one-event reads, partial-block restart with a fresh adapter, same-page metadata/tool state and source rewrites.
- [ ] Add reader tests for consumer stop/revisit boundaries, reset notification and cancellation/exception cleanup.
- [ ] Add an optional synchronous line consumer to src/sources/jsonl-reader.ts. Compute the final checkpoint after stop/revisit decisions.
- [ ] Move single-record normalization in src/sources/jsonl-source.ts into that consumer. Stop at the event budget and preserve state across records within the page.
- [ ] Run source, indexing, capacity and recovery tests, then full check, three-platform CI, browser and isolated-install checks.
- [ ] Run clean-commit fixed-capacity browser benchmarks locally and on Ubuntu; retain failures and exact source SHA.
- [ ] Update release evidence and merge only after required checks pass. Do not equate synthetic acceptance with real-agent or external-user certification.
