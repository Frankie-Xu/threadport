# Unified main/refactor candidate

This candidate integrates main `d3fe770` (control-plane evidence and session search) and local `f5dca12` (assertions, execution observations, launch coordination, recovery and quality gates). It does not declare a stable release or reuse earlier branch test counts as unified evidence.

## Compatibility

- Preserve Capsule v1 and existing public exports; retain the main control-plane export, CLI, API and UI alongside the local assertion/observation workflow.
- Canonical database schema is version 10. Main versions 1–6 keep their original meanings. Canonical versions 7–9 add launch coordination, assertions and execution observations; version 10 retires the obsolete local search projections.
- Local versions 5–9 reused main's version numbers. A schema-object comparison identifies these historical databases, creates a pre-upgrade backup, then installs missing features atomically. Unknown or altered known schemas fail closed. Equal version numbers alone never authorize an upgrade.
- Canonical `session_search` is derived data. It is rebuilt from preserved events during upgrade; dirty or absent rows use literal event search. Events, manual task history and control evidence are not discarded.
- Opening an upgraded database with older code is unsupported. To roll back, stop the service and restore the matching pre-upgrade backup with the corresponding old application; do not decrement `user_version` manually.

## Validation policy

Run checks against the unified commit: format, typecheck, build, unit/integration, documentation, redaction, coverage, browser workflows and isolated package smoke. CI must cover Node 24 on Ubuntu/macOS/Windows. Full capacity performance, real-agent certification and external-user evidence remain distinct release gates.

The earlier 128ms focused benchmark and 2,022ms full benchmark describe different branches/workloads. Neither is accepted as unified-commit performance evidence. `noUncheckedIndexedAccess` remains deferred; this merge does not claim it was enabled.

## Local integration verification

Environment: macOS arm64, Node 24.18.1, 2026-09-20. Checks below apply to the integrated tree, not either pre-merge branch.

- `npm run check`: exit 0, 82 files / 508 tests; 308 documentation targets; redaction gate passed. A subsequent CRLF compatibility regression brings the total to 509.
- `npm run test:coverage`: exit 0, 82 files / 509 tests; statements 84.15%, branches 78.47%, functions 84.90%, lines 92.90%.
- `npm run test:e2e`: exit 0, 10/10, including both assertion editing and control-plane visibility.
- `npm run test:package`: exit 0, 263-file isolated package including canonical/legacy SQL, control-plane public export, manifest persistence, browser persistence and Cursor roundtrips.
- `npm audit --json`: exit 0, zero vulnerabilities including development dependencies.
- `git diff --cached --check`: exit 0.

The first Node 26 integration run used stale compiled migration filenames while source integration was still in progress; after rebuilding, all 12 affected subprocess tests passed. The complete Node 24 check and coverage run above supersede that incomplete intermediate run.

## Remote review and capacity evidence

Integration PR: [#64](https://github.com/Frankie-Xu/threadport/pull/64).
The first CI run passed macOS and Ubuntu. Windows passed 508/509 tests, with the format-check fixture incorrectly expecting POSIX separators. The test now constructs paths with `path.join`; no format-validation requirement was weakened.

Full capacity benchmark on clean `7e5aff529274d90febff1546679773deb1249d27` (Node 24.18.1, M1/macOS arm64) completed with 100/100 validated timing samples and exit 1: index 27,608ms, search p95 475.54ms, status p95 13.80ms, cold start p95 376.57ms, increment 208.44ms, RSS 334.53MiB, cancellation 7.05ms, idle CPU median 62.77%. Decision remains **HOLD** for search latency and idle CPU. Development integration does not waive these release gates.
