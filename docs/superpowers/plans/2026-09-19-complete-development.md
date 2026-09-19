# ThreadPort 完整本地流程与工程质量 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]).

**Goal:** 将结构化内部证据接入接续预览与导出，强化关联校验和错误恢复，并把本地验证、维护规范、公开契约与故障回归做成可重复交付。

**Architecture:** 先完成四个互不争用的 P1 工作包：事件级内部证据接入、证据关联安全校验、统一 API/导出错误恢复、本地验证执行器。随后补充格式门禁、公开接口兼容性、故障恢复测试、浏览器操作体验和文档状态索引。数据库 schema 保持 7；内部证据通过结构化事件和 handoff 投影传递，不解析 assistant prose 或自由文本。

**Tech Stack:** Node 24、TypeScript、Fastify、Zod、SQLite/better-sqlite3、React、Vitest、Playwright、Docker Node 24。

## Global Constraints

- 保持数据库 schema 7，不新增迁移。
- assistant prose、turn ended、exit 文本不能推断内部 Agent 命令或测试成功。
- 错配、重复、缺历史快照或未知环境必须降为 unknown/unverified。
- 不提交真实会话原文、token、私人日志、本机绝对路径。
- Windows、Ubuntu CI、真实 Agent、36 项原始附件和外部用户证据继续独立记录。
- 保持现有 API 错误码兼容；新增字段通过可选 DTO 或明确版本化暴露。
- 每个任务独立测试、独立提交；不修改用户已有 .gitignore、output、research、pelican 文件和 docs/diagrams。

---

### Task 1: 将内部 Agent 证据接入接续预览、API、导出和界面

Files:
- Modify: src/domain/models.ts, src/server/dto.ts, src/handoff/contracts.ts, src/handoff/prepare.ts, src/server/handoff-routes.ts
- Modify: web/src/api.ts, web/src/features/handoff/preview.tsx, web/src/features/task/evidence.tsx
- Test: tests/evidence/observations.test.ts, tests/handoff/prepare.test.ts, tests/handoff/api-cli.test.ts, tests/e2e/task-handoff.spec.ts

Interfaces:
- NormalizedEvent.innerObservation is optional and only accepts structured payload.
- TaskHandoff.innerEvidence is an array; old records default to [].
- GET /api/v1/tasks/:id/events/:eventId/inner-evidence returns one InnerAgentEvidence.
- JSON export includes evidence summaries; Markdown includes only status and recovery guidance.

- [x] Write failing tests for a structured command/test event, no-result event, and current/stale/unverified/unknown outcomes.
- [x] Add the event field and handoff DTO/schema.
- [x] In HandoffService.prepareHandoff call prepareInnerEvidence for selected events with historical snapshot lookup.
- [x] Add read-only API and render status, reason, source protocol, and recovery guidance in preview/evidence UI.
- [x] Run focused Vitest and task-handoff Playwright tests.
- [x] Commit feat(evidence): connect structured inner results to handoff previews.

### Task 2: 强化证据关联、重复和工作区校验

Files:
- Modify: src/evidence/observations.ts, src/handoff/evidence.ts, src/handoff/prepare.ts
- Test: tests/evidence/observations.test.ts, tests/handoff/prepare.test.ts, tests/server/routes.test.ts
- Docs: docs/adr/0014-observed-command-production.md

Interfaces:
- prepareInnerEvidence accepts one result per eventId; duplicates become unknown with DUPLICATE_EVENT.
- evaluator validates eventId, kind, snapshot workspace binding, and current workspace identity.
- EVENT_MISMATCH, KIND_MISMATCH, SNAPSHOT_WORKSPACE_MISMATCH, DUPLICATE_EVENT are stable reasons.

- [x] Add failing tests for event/kind mismatch, duplicate IDs, foreign workspace snapshots, and duplicate sources.
- [x] Add input-level identity validation before evaluator execution.
- [x] Add workspace binding validation; never substitute current snapshot for missing history.
- [x] Update warning, DTO, UI, and ADR text.
- [x] Run focused tests and typecheck.
- [x] Commit fix(evidence): reject mismatched and duplicate inner observations.

### Task 3: 统一 API、导出和界面的错误恢复

Files:
- Modify: src/server/routes.ts, src/server/handoff-routes.ts, src/server/business-routes.ts, src/handoff/export.ts
- Modify: web/src/api.ts, web/src/components.tsx, web/src/features/handoff/preview.tsx, web/src/features/settings/export.tsx
- Test: tests/server/routes.test.ts, tests/handoff/export.test.ts, tests/e2e/task-handoff.spec.ts, tests/e2e/data.spec.ts

Interfaces:
- API errors use error:{code,message,retryable,recovery}; existing code remains stable.
- retryable is true for NETWORK_ERROR, STORAGE_BUSY, SEARCH_STALE.
- recovery is one of reconnect, retry, refresh, edit-and-save, review-path, export-only, none.

- [x] Add Fastify contract tests for network/401/storage busy/revision conflict/export validation.
- [x] Implement one pure errorResponse classifier and use it for all routes.
- [x] Make export failures use the same envelope while successful downloads keep attachment headers.
- [x] Extend ApiError and ErrorNotice with recovery action buttons.
- [x] Run focused tests and browser recovery tests.
- [x] Commit feat(errors): unify recovery guidance across API and exports.

### Task 4: 本地一键验证执行器

Files:
- Create: scripts/local-validation-runner.mjs, tests/scripts/local-validation-runner.test.ts
- Modify: package.json, docs/superpowers/plans/2026-09-19-local-environment-simulation.md
- Create: docs/verification/local-validation-YYYY-MM-DD.json

Interfaces:
- local-validation-runner.mjs --json --output path runs environment probe, npm run check, browser E2E when Chrome exists, package smoke, and Linux container only when Docker exists.
- Report schema threadport.local-validation.v1 has candidateSha, workingTree, runtime, and steps; every step has name, command, status, exitCode, timestamps, stdoutDigest, stderrDigest, skipReason.
- Secrets and absolute paths are redacted; failed steps remain and process exits non-zero.
- npm run validate:local is the entry point.

- [x] Add mocked pass/fail/skip tests.
- [x] Implement argv-based child execution, fixed order, timeout, and digest-only output.
- [x] Bind git SHA/status and runtime versions; write atomically.
- [x] Add package script and documentation.
- [x] Run mocked and real validation; retain the report.
- [x] Commit feat(validation): add reproducible local validation runner.

### Task 5: P2 格式与维护门禁

- [x] Add deterministic format check for src, web, tests, and scripts without reformatting historical docs.
- [x] Add check:format to npm check and document the command.
- [x] Format only changed/new modules first and commit separately.

### Task 6: P2 公开边界与故障恢复

- [x] Add compatibility fixtures for public exports, CLI JSON, and API DTOs.
- [x] Add migration interruption, disk write failure, half-line/duplicate import, restart, and manual-field retention regressions.
- [x] Preserve schema 7 and existing error codes.

### Task 7: P2 浏览器体验与状态索引

- [x] Add keyboard focus, long text, empty list, load failure, unsaved draft, and retry browser regressions.
- [x] Establish a single current-status entry with links to historical evidence.
- [x] Run all seven browser flows and documentation link checks.

## Integration order

1. Run Tasks 1–4 in parallel with focused tests and independent commits.
2. Integrate Tasks 1 and 2 before Task 3; Task 4 is independent.
3. Run npm run check, browser E2E, package smoke, and npm run check:docs after Tasks 5–7.
4. Keep performance, Windows, real Agent, original 36 scenarios, and user observation independently HOLD.

## Release gates

- Structured internal evidence is visible in handoff/API/UI/export.
- Event, kind, and workspace mismatches only yield unknown/unverified.
- API and export errors share an envelope and recovery action.
- One-command validation binds candidate SHA, runtime, working-tree state, and every step.
- P2 work must not rewrite performance, Windows, real Agent, original 36-scenario, or user evidence as pass.
