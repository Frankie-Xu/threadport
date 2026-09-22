# Control-plane receipt review — 2026-09-22

This review records the isolated candidate for the control-plane integrity and task-detail projection work. The code candidate is **`f0a1ef93064b78e07a0dd4a020104586e998d41f`** on branch `codex/control-plane-integrity`, based on `origin/main@967ceee`. The candidate is workspace-only until an independent PR is reviewed and merged.

## Delivered scope

- Receipt input and advancement reject `verified-complete` without trusted evidence. Agent reports remain `unknown` and an agent-reported verified stage is projected as `reported-complete` with an open attention item.
- Prepared manifests are schema- and digest-checked. A receipt requires a prepared manifest with both target session and target run; digest, target, expiry and nonce checks remain explicit and idempotent.
- The reducer validates manifest and receipt projections before confirming them. Invalid, forged, missing-evidence and coverage-gap inputs remain `unknown` and produce an explainable attention item.
- `GET /api/v1/tasks/:id/control` and `ControlPlaneService.state()` merge persisted manifests and receipts into the task projection rather than relying only on the event stream.
- Public web types and the task detail page show receipt stage, status, target and evidence IDs with fact labels `verified`, `observed`, `coverage-gap` or `unknown`. Pending receipts never render as complete.

## First failure and retest

The first focused command was:

```text
npx vitest run tests/control-plane tests/server/control-plane.test.ts
```

It initially failed because the server test starts before `dist/web/index.html` exists (`ENOENT` in `registerBootstrap`). This was an environment/build prerequisite, not a product assertion. After `npm run build`, the focused baseline passed 26/26. The new integrity tests were then written first, observed failing on the missing protections, and passed after the minimal implementation.

## Candidate verification

Runtime: Node `v24.19.0`, npm from the repository toolchain, Windows `win32/x64`. The full source gate was run at the candidate SHA:

| Command | Result |
| --- | --- |
| `npm ci` | passed; 128 packages audited, 0 vulnerabilities |
| `npm run check` | passed; format, typecheck, build, **83 files / 526 tests**, docs and redaction |
| `npm run test:e2e` | passed; **11/11** browser tests |
| `npm run check:pack` | passed; 264-file isolated package smoke |
| `THREADPORT_PACKAGE_OUTPUT=output/package-review-candidate npm run test:package` | passed; installed browser smoke plus 264-file package smoke |

The retained candidate package is `threadport-0.2.0-dev.0.tgz`, with **264 files** and SHA-256 **`9ea561a2a3a990b1c9fc048fdeb04413f7c69344a63da2314c8bf15fb86389ce`**. Its machine-readable [package evidence JSON](packages/control-plane-candidate-2026-09-22.json) is committed with the review; the local retained tarball is under `output/package-review-final/`. The package manifest recorded `sourceCommit=cb651aa7927af38f7d935f0ff5749384bb6180e5`, `trackedChanges=false`, Node `v24.19.0`, platform `win32`, and architecture `x64`.

## Public prerelease record

The published GitHub prerelease remains **`v0.2.0-dev.0` → `967ceee`**. Its uploaded asset is `threadport-0.2.0-dev.0.tgz` with SHA-256 **`b3cb66cb671930d021bda9e710d96a617068b1700d2e1f1c4bb576b91dee3a6c`**; the release notes placeholder was corrected to that value. GitHub Actions aggregate run `35719556446` remains the evidence attached to that already-published snapshot. The workspace candidate above is not part of that release.

## Gates that remain open

Stable remains **HOLD**. No stable tag, stable GitHub Release, npm publish, real Agent login, or external-user recruitment was performed. T14-B/T18 real Agent coverage, T20 external-user evidence, Q01–Q24 review, and original S01–S36 evidence remain incomplete or unavailable. The first failed focused run is retained above; rollback for the code change is the independent PR commit `f0a1ef9` (revert that PR while preserving this verification record).

The first remote PR CI run `35735908166` also failed on Ubuntu and macOS after all 83 test files / 526 tests passed: `check:docs` referenced the local-only package evidence path. That failure is a documentation artifact availability issue; the manifest is now committed under `docs/verification/packages/` and the PR is being re-run. Windows was still pending when the first failure was recorded.

## Next step

Review the small control-plane PR on `codex/control-plane-integrity`, then rerun the candidate matrix on the reviewed merge SHA. Keep all unsupported Agent/platform paths as `unknown`, `coverage-gap`, `not_run` or `HOLD` until their evidence is available.
