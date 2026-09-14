# Contributing

Start with the [v0.2 development documentation](docs/v0.2/README.md), select the next dependency-ready task in the [implementation plan](docs/superpowers/plans/2026-09-14-threadport-v0.2.md), then read its contracts and tests. The [collaboration workflow](docs/v0.2/05-contributing-workflow.md) and [quality gates](docs/v0.2/04-quality-gates.md) define acceptance and review requirements. The [v0.1 playbook](docs/DEV-PLAYBOOK.md) is historical.

## Tasks and branches

Work on one verifiable work package at a time. A task may contain several dependency-ordered packages; follow the [work-package delivery rules](docs/v0.2/11-work-package-delivery.md). Record its problem, T/F/AC/Q IDs, dependencies, affected contracts, exclusions, and acceptance checklist in an Issue. Prepare a local Issue draft when remote creation is unavailable or not authorized; local progress must not depend on publishing it.

Use `codex/<task-id>-<short-description>`, for example `codex/t02-portable-paths`. Start from current `main` for a clean checkout. When continuing an existing workspace, record HEAD and preserve all pre-existing uncommitted work; do not reset or stage unrelated files.

## Quality gate

```bash
npm ci
npm run check
```

The current gate runs TypeScript typechecking and compilation, Vitest, and local Markdown link checks. Run the link check separately with `npm run check:docs`. It checks file destinations in repository-root Markdown files, `docs/`, and `.github/`; it does not validate remote URLs or heading anchors. Follow existing formatting and review the diff with `git diff --check`; automated format/lint gates are not yet installed. Web, E2E, and benchmark checks are introduced by their implementation tasks and must not be reported as passed before they exist.

CI runs the same gate on Ubuntu, macOS and Windows with Node 24 (the `engines` floor), plus `npm run check:pack` to verify an isolated package installation. Vitest is configured in `vitest.config.ts` to run `tests/**/*.test.ts` only. `tsconfig.build.json` excludes tests from the runtime build. Keep Vitest and Vite pins compatible with the declared Node floor.

Tests use synthetic fixtures and temporary directories only. Never commit real agent sessions, API keys, or `.env` files. Vitest collects only `tests/**/*.test.ts`, so building `dist/` does not duplicate tests.

Use Node 24 for v0.2 development (`.nvmrc`, `engines >=24.0.0`). T05 adds pinned better-sqlite3 and changes CI to Node 24 on Ubuntu, macOS and Windows. Each job performs a clean locked install plus isolated tarball SQLite creation. Windows checks data-directory ownership and broad write ACLs; it is not yet a certified Agent continuation platform. See [storage migration](docs/v0.2/07-storage-migration.md).

Dependabot may propose patch/minor updates. Major updates to Vitest, Zod, TypeScript, and `@types/node` require deliberate compatibility review. Explain new dependency purpose, license, and installation impact.

## Commits, review, and handoff

- Use your own contributor identity and an English imperative commit subject.
- Use one PR per independently reviewable work package: work package → commit → files → tests → rollback. List upstream/downstream dependencies and exact files before implementation; include necessary tests in the same package.
- Record the base/head SHA, actual test results, PR and eventual squash SHA. One PR becomes one main commit; multiple branch commits do not become separate rollback units under squash merge.
- Fill in the PR work-package table and rollback section. Identify whether the package can be reverted alone, which consumers must be reverted first, and whether database compatibility prevents a code downgrade.
- Review scope, correctness, data boundaries, design, maintainability, and evidence in that order. Mark self-review explicitly; unresolved P0/P1 issues block completion.
- Record changed files, checks, limitations, task-owned uncommitted changes, and the next smallest action in a local handoff. Update the plan with evidence rather than estimated completion percentages.
- The maintainer reviews and commits local changes, then uses a PR and squash merge into `main`. Do not push directly to `main` or publish comments, packages, or releases without authorization. Repository settings must be verified independently of these instructions.

## Product boundary

v0.2 delivers a local task inbox, history search, and explicitly confirmed Claude Code/Codex CLI continuation. Existing manual Cursor/Gemini extraction does not imply native continuation support.

Capsule v1 fields and existing CLI output formats stay compatible. Internal task and handoff models use separately versioned contracts. Source logs, source code, and Git history remain read-only to the ThreadPort core. Never execute commands or `next_action` taken from a log. A destination Agent may start only after explicit terminal confirmation; its subsequent permissions and model-service data handling belong to that Agent and must be explained in the preview.

No raw-session upload, telemetry, accounts, LLM summarization, embedded terminal, or multi-Agent orchestration is in scope. Changes to public formats, runtime/platform support, storage, execution permissions, or data leaving the machine require an ADR under `docs/adr/` and corresponding acceptance updates.
