# Review remediation — 2026-09-14

Baseline: `31ae677` on `Frankie-Xu/threadport`. This record addresses F01–F15 from the September 14 review; it does not replace that review with an unconditional safety guarantee.

## Acceptance follow-up after PR #25

The initial repairs were merged as `455a153`, but a follow-up check found that F01 and parts of the acceptance criteria were not fully closed. The earlier all-complete wording was too broad. This follow-up makes these corrections:

- Path privacy now maps complete absolute path tokens through repository containment checks instead of replacing root substrings. Regressions cover POSIX/Windows/UNC siblings, traversal, quoted spaces, longer filenames, truncated quotes and a real project directory named `external`. All four adapter fixtures now test two different nested files sharing the same basename.
- Markdown is checked with the marked parser: exactly three three-column tables, one row per input record, unchanged product headings and no active source HTML or links in the adversarial sample. This exposed a bare-CR line ending defect, now fixed alongside LF/CRLF handling.
- Filesystem fault injection covers Markdown `link` and force-mode `rename` failures after JSON publication, preservation of old cache bytes, truthful stdout/stderr, temporary-file cleanup and regeneration through `render`. A JSON publication failure must not publish Markdown or report success paths.
- The real symlink test is no longer skipped on Windows. It asserts that real file symlinks were created, that external target content does not affect the fingerprint, that changing the link does, and that broken links are accepted. [PR #26](https://github.com/Frankie-Xu/threadport/pull/26), [run 34777383751](https://github.com/Frankie-Xu/threadport/actions/runs/34777383751) at `0d55562`: all six OS/Node jobs passed 95 tests with no skipped tests, including the two Windows jobs. The aggregate `check` gate and all six package-install smoke checks also passed.

Local follow-up gate: 95 tests across 19 files pass; isolated installation passes with 43 package files; `npm audit` reports zero vulnerabilities. Live agent-version certification is still input-blocked; see [compatibility evidence](compatibility-evidence.md). Do not treat these code/test fixes as live transcript certification. The verification section below records the historical PR #25 gate and its then-skipped Windows case. Later documentation-only commits and merge status can be checked on PR #26.

## Changes and regression evidence

| Finding | Implemented change | Regression coverage |
| --- | --- | --- |
| F01 | Shared portable path boundary preserves nested file identity, maps external paths to opaque locators, and processes display metadata. | `privacy.test.ts`: four adapters, same-basename paths, Windows/UNC, full serialized output. |
| F02 | Redact complete record strings before summarization; sanitize exported identifiers and metadata. Handle unterminated private keys and quoted assignments. | `privacy.test.ts`, `redact.test.ts`: synthetic keys crossing summary limits, token session IDs, idempotence. |
| F03 | Default output namespaces use canonical local project identity plus source agent before portable display conversion. | `cli-regressions.test.ts`: same session ID in two projects yields separate destinations. |
| F04 | Only recognized successful tool results enter completed work; missing results remain attempts and failures stay visible. | `trace-regressions.test.ts`: rejected and missing edit results. |
| F05 | One shared reducer reopens a failure after a successful retry. Tool outcomes are reduced in observed result order, not invocation order. | `trace-regressions.test.ts`: fail/pass/fail and reversed concurrent results across all four adapters. |
| F06 | Hash staged and unstaged diffs independently; normalize diff presentation, algorithms and context. Domain-separated hash migration documented. | `git-regressions.test.ts`: same worktree/different index and changed user diff configuration. |
| F07 | Atomic no-clobber publication of completed files; explicit force required to replace a regular file. Preflight both destinations; JSON is authoritative and Markdown cache failure is reported separately. | `storage.test.ts`: concurrent writers, force, non-files; `cli-regressions.test.ts`: invalid Markdown destination does not publish JSON. |
| F08 | Parse rename XY correctly; fingerprint symlinks as links, including broken links; bound regular-file reads and Git subprocess output. | `git-regressions.test.ts`: modified rename, external target content independence, broken link, untracked contents. |
| F09 | Portable root no longer defeats work-state comparison; export defaults outside the project and leaves its status clean. | `git-regressions.test.ts`, `cli-regressions.test.ts`. |
| F10 | Strict order-independent options reject unknown, repeated, missing or surplus arguments before writes; expose privacy mode and use `.md`. | `cli-regressions.test.ts`: malformed-input table, input-first, explicit local privacy. |
| F11 | Reject empty/unsupported input, preserve source timestamps, parse explicit exits, pair Gemini by ID and leave ambiguous ID-less results unknown. | `trace-regressions.test.ts`, existing adapter fixtures. |
| F12 | Public strict handoff envelope type, Zod validator and JSON Schema; explicit CLI validation route; lowercase SHA contract aligned. | `handoff.test.ts`, `schema-contract.test.ts`, CLI envelope round-trip. |
| F13 | Filesystem-only PATH/PATHEXT discovery, separate existence from launch support; deprecated launch suggestions now reject unsupported execution. | `targets.test.ts`: native lookup, simulated Windows extensions, directory rejection. |
| F14 | Correct GFM column delimiters; escape source-controlled text, table cells and unsafe inline-code boundaries. | `handoff.test.ts`, `markdown.test.ts`: hostile markup and expected output structure. |
| F15 | Source-only build, prepack hook and isolated tarball install smoke; CI matrix covers three OSes and two Node versions. | `check:pack`: CLI help and public package exports; no compiled tests distributed. |

## Verification

Local environment: macOS, Node v26.5.0. A fresh `npm ci` succeeded. Final local gates:

- `npm run check`: typecheck, build and 81 tests across 18 files.
- `npm run check:pack`: 43 package files; installed CLI help and public library import succeeded in an isolated temporary directory.
- `npm audit`: zero reported vulnerabilities after pinning Vitest 4.1.11 and Vite 6.4.3; Node 20 support retained.
- `git diff --check`: clean.

PR [#25](https://github.com/Frankie-Xu/threadport/pull/25) is published. The [first matrix run](https://github.com/Frankie-Xu/threadport/actions/runs/34775131022) passed all four Ubuntu/macOS jobs; Windows exposed a checked-in Markdown fixture converted to CRLF during checkout. `.gitattributes` now fixes text checkouts to LF without weakening the exact-output assertion. The [updated matrix run](https://github.com/Frankie-Xu/threadport/actions/runs/34775228369) for repair commit `bb2054b` passed all six OS/Node jobs, including package-install smoke checks, plus the required aggregate `check` job. Windows symlink tests are deliberately skipped because they require host privileges; a passing Windows job must not be presented as symlink verification.

## Compatibility and remaining boundaries

1. Re-extract old capsules before Git-state comparisons: the old hash omitted the index and is intentionally incompatible. Capsule v1 fields are unchanged.
2. Default artifacts moved to a user-specific OS temporary directory outside the source project. These are not durable storage; use explicit `--out` for retained handoffs. Local project hashes are not cross-device repository identity. Consumers must independently bind the intended repository before using `gitStateMatches`.
3. No launch, resume, apply, MCP server or agent execution was added. Handoff flags declare intent, not a sandbox. PATH existence does not establish vendor identity or CLI flag compatibility.
4. Formats remain fixture-backed experimental adapters. Tests use synthetic sessions only; this work did not read private live sessions or certify all current vendor transcript versions.
5. Redaction is heuristic; opaque path hashes are not encryption. Review artifacts before sharing. Markdown escaping does not certify the security behavior of third-party renderers.
6. JSON and Markdown are not a two-file transaction. Atomic publication requires filesystem hard-link/rename support; unsupported filesystems fail rather than silently overwriting. Snapshot checks are bounded and best-effort, not an atomic repository lock.
7. Tests do not cover every Git configuration, filesystem race, special file or resource-exhaustion scenario. The six CI environments verify the implemented regression suite, not universal compatibility.

## Delivery

Repair batches are tracked in `docs/superpowers/plans/2026-09-14-review-remediation.md`. Changes are developed on `fix/Frankie-Xu/review-remediation` and published in PR #25, never pushed directly to main. This evidence update changes documentation only; consult PR #25 for its latest commit checks and merge status.
