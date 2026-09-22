# Control Plane 开发收口与发布推进计划

> **Purpose:** 这份计划交给新的 Workshop 开发任务执行。它描述当前主线、未上线工作区改动、开发边界、可复现步骤、验收证据和回滚方式。

## 基线与目标（编写时历史基线）

- 编写本计划时的主线基线：`origin/main@967ceee`，来自 PR #67；这不是本轮收口后的 HEAD。
- 编写本计划时的公开版本：GitHub prerelease `v0.2.0-dev.0`，tag 指向 `967ceee`；当前开发版本以收口报告为准。
- 编写本计划时的 stable：`v0.1.0`；本轮没有提升 stable。
- 编写本计划时的工作区：存在未提交的 control-plane receipt、manifest、reducer、storage、route、UI 和测试改动；这些改动不属于 `967ceee`，也不属于 `v0.2.0-dev.0`。
- 编写本计划时未上线改动只通过定向 typecheck 和 20 个 control-plane 测试；后续收口证据见 docs/verification/control-plane-review-2026-09-22.md。
- 编写本计划时发布说明中的 prerelease 包 SHA 仍有 `$hash` 占位符；本轮收口已记录实际 archive SHA。

**目标：** 将当前 control-plane 改动收口为一个可审计的小 PR，在不扩大支持声明和隐私边界的前提下完成完整验证；随后再决定是否发布新的开发预发布。真实 Agent、外部用户和 stable 发布仍然是独立门禁。

## 全局约束

- 运行时最低版本保持 Node 24；不修改既有 Capsule v1、handoff v1、CLI stdout 或默认自动刷新语义。
- 不采集 hidden reasoning、system prompt、认证 token、完整原始日志、私有路径或完整工作区快照。
- `agent-report` 不能单独把 receipt 推进为 `verified-complete`。
- receipt 必须绑定 prepared manifest、manifest digest、target session 和 target run；未知、缺证据、未运行状态保持 `unknown` 或 `coverage-gap`。
- 不在当前含有其它未提交改动的工作区执行 reset、clean、覆盖式复制或自动提交；开发验证应使用隔离 worktree。
- 没有明确授权，不创建 stable tag、不发布 GitHub stable Release、不执行 npm publish。
- 任何一次失败都必须保留首次失败摘要，修复后结果不能覆盖失败证据。

## 工作包与顺序

### P0-A：完成 receipt / manifest 完整性修复

**功能目标：** 阻止伪造或无证据的完成状态进入存储、reducer 和 API 投影。

**范围：**

- `src/control-plane/receipts.ts`
- `src/control-plane/reducer.ts`
- `src/domain/errors.ts`
- `src/storage/control-plane-store.ts`
- `src/server/app.ts`
- `src/server/control-plane-routes.ts`
- `tests/control-plane/receipts.test.ts`
- `tests/control-plane/reducer.test.ts`
- `tests/control-plane/storage.test.ts`
- `tests/server/control-plane.test.ts`

**边界：**

- 只处理证据完整性、目标绑定和错误状态，不添加自动接管。
- 不把 `status: unknown` 与 `stage: verified-complete` 的矛盾状态留给消费者解释；Agent 自报的 verified completion 应直接拒绝。
- prepared manifest 缺少 target 时不得接受任意 target receipt。
- reducer 只有在 manifest digest、target 和 evidence 条件满足时才允许确认；否则写入 `unknown` 并生成 attention。

**步骤：**

1. 先固定当前工作区清单，确认 control-plane 改动与其它未提交文件的关系；不执行清理。
2. 为 `agent-report -> verified-complete`、直接写入 `verified-complete`、缺失 target、伪造 digest、错误 target 和重复 nonce 增加最小 fixture。
3. 保持稳定错误码：`RECEIPT_VERIFICATION_REQUIRED`、`RECEIPT_TARGET_MISMATCH`、`RECEIPT_DIGEST_MISMATCH`、`RECEIPT_NONCE_CONFLICT`。
4. 验证 `GET /api/v1/tasks/:id/control` 能从持久化 manifest/receipt 重建状态，而不是只读取事件流。
5. 运行 focused tests，保留首次失败和修复后结果。

**验收：** 伪造完成不能变成 confirmed；合法 receipt 可幂等重放；错误 target/digest/nonce 有稳定错误；投影中的未知状态和 attention 可解释。

**回滚：** 回滚该小 PR，保留首次失败和验证文档；不得回退到允许无证据 verified completion 的行为。

### P0-B：完成 control-plane UI 和公开类型契约

**功能目标：** 让操作者能在任务详情中看到 receipt 阶段、状态、目标和 evidence 来源。

**范围：**

- `web/src/api.ts`
- `web/src/features/task/detail.tsx`
- 对应 UI 测试或 browser fixture

**边界：**

- UI 只能展示事实标签：`verified`、`observed`、`coverage-gap`、`unknown`。
- 不把 `pending` 渲染成完成，不把自然语言提示渲染成验证事实。
- 不展示 token、完整日志或绝对私有路径。
- 不在 UI 中新增停止、接管或云同步控制。

**步骤：**

1. 固定 receipt 类型字段和空值处理。
2. 为无 receipt、有 receipt、过期 receipt、unknown receipt 和 open attention 准备 fixture。
3. 验证任务详情同时展示 stage、status、target 和 evidence 摘要。
4. 运行 typecheck、browser test 和 redaction 检查。

**验收：** 操作者能在 30 秒内区分已验证、仅观察到、证据缺失和未知状态；浏览器页面不泄漏敏感字段。

### P0-C：更新 prerelease 交付记录

**功能目标：** 让当前公开开发预发布的提交、资产 hash 和限制说明准确可复查。

**范围：**

- GitHub Release `v0.2.0-dev.0` 文案中的 `$hash` 占位符修正。
- `outputs/development-completion-report.html`
- `docs/verification/control-plane-review-2026-09-22.md`
- `docs/verification/release-0.2.0.md`

**边界：**

- 只修正已发布开发快照的事实和限制，不把当前未提交改动写成已上线。
- 不把 npm 上另一个仓库的 `threadport@0.4.0` 当作本项目版本。
- 不把 GitHub prerelease 写成 stable。

**步骤：**

1. 将发布说明中的 `$hash` 替换为 GitHub asset 的真实 SHA-256。
2. 记录 tag `v0.2.0-dev.0 -> 967ceee`、CI run 和 tarball 资产。
3. 在报告中明确当前工作区 control-plane 改动仍未提交、未进入发布包。
4. 更新 stable HOLD 原因：真实 Agent、外部用户、Q01–Q24 和原始 S01–S36 证据仍未完成。

**验收：** 发布文案、报告、tag、CI 和资产 hash 一致；任何未上线改动都明确标为 workspace-only。

### P1：隔离 worktree 执行完整候选验证

**功能目标：** 证明 control-plane PR 能在干净环境中通过完整检查并生成可复查包。

**步骤：**

1. 从包含 control-plane PR 的候选 SHA 创建隔离 worktree。
2. 执行 `npm ci`、`npm run check`、`npm run check:pack`、`npm run check:redaction`、`npm run check:docs`。
3. 执行 `npm run test:e2e` 和 `THREADPORT_PACKAGE_OUTPUT=output/package-review npm run test:package`。
4. 保存 Node/npm、Git SHA、测试数量、浏览器数量、包文件清单和 tarball SHA-256。
5. 检查包内不得出现测试、研究资料、临时 output、token 或原始日志。
6. 推送独立 PR，等待 Ubuntu、macOS、Windows Node 24 和汇总 check 全绿。

**验收：** PR diff 只包含 control-plane 目标文件、测试和验证文档；完整矩阵通过；包和 CI artifact 指向同一 SHA。

### P1：完成 T14-B/T18 真实 Agent 矩阵

**功能目标：** 在最终候选包上完成真实 CLI 接续和 24 格 Agent/平台矩阵。

**边界：**

- 不自动登录，不复制认证资料，不读取 hidden reasoning。
- 不把维护者代理、合成 fixture、命令存在性或 exit 0 当作成功。
- 未实测版本、平台和模式保持 `not_run`、`unknown` 或 `HOLD`。

**步骤：**

1. 固定 Claude/Codex 版本、Node 24、OS、候选 SHA 和包 hash。
2. 重跑已有 macOS Codex→Codex 场景。
3. 补齐 Claude、Ubuntu、跨 Agent、new-session 和 native-resume 场景。
4. 记录 cwd、人工约束、预期下一步、实际产物、用户确认、失败和重测关系。
5. 保留首次失败，不用重试覆盖失败证据。

**验收：** 24 格均有明确状态；支持声明只覆盖证据完整的版本和路径。

### P1：完成 T19/T20/T21 发布门禁

**T19 安装包：** 独立安装、public exports、SQLite native binding、CLI/UI、doctor JSON、Cursor 输入、持久化和包白名单全部通过。

**T20 用户验证：** 5 名明确同意的真实用户；至少 4/5 在 5 分钟内独立准备接续，至少 3/5 实际完成接续；不采集 token、原始日志或私有路径。

**T21 发布审查：** 绑定最终 SHA、包 hash、CI、T18/T20 证据；逐项审 Q01–Q24 和原始 S01–S36，缺证据保持 `unknown`/`unavailable`；未授权不创建 stable tag、Release 或 npm publish。

### P2：独立规划 v0.3/v0.4/v0.5

- **v0.3 Observe：** 只读来源、运行状态、谱系候选、attention 和脱敏导出；不停止、不接管、不云同步。
- **v0.4 Receipt：** manifest digest、target/expiry/nonce、分阶段 receipt、重启/重复/过期处理；receipt 不代表业务完成。
- **v0.5 Takeover：** 条件停止、固定快照、继任确认和继续执行；无控制接口时只显示 `stop-unavailable`。

## 推荐执行顺序

1. P0-A：先锁定 receipt/manifest 完整性和稳定错误语义。
2. P0-B：补齐任务投影和 UI 事实展示。
3. P0-C：修正开发预发布文案和资产 hash。
4. P1：从干净 worktree 跑完整验证、打包和三平台 CI。
5. P1：执行 T14-B/T18 真实 Agent 验证。
6. P1：执行 T19、T20、T21，决定继续 HOLD 或准备 stable。
7. P2：T21 完成后分别建立 Observe、Receipt、Takeover 计划。

## 完成定义

- 代码、测试、文档和验证记录在独立 PR 内可解释。
- 所有成功结论绑定候选 SHA、版本、平台、包 hash 和实际产物。
- 首次失败、重测结果和回滚路径均保留。
- 没有扩大支持声明、权限或隐私采集范围。
- 主线、tag、GitHub Release、包资产和报告的事实一致。

本计划只负责组织下一阶段开发，不自动执行真实 Agent 登录、用户招募、stable 发布或 npm publish。


## 2026-09-22 review closeout

This plan is a planning artifact and is not itself user authorization. The latest user request authorized continued review of the existing temporary-session implementation while explicitly skipping real Agent and real-user tests. The implementation remains a development prerelease at 0.3.0-dev.0.

The review closed the receipt/manifest integrity, reducer false-confirmation, persisted projection, expiry, and installed-browser smoke selector gaps. Fresh non-real evidence is recorded in docs/verification/control-plane-review-2026-09-22.md and docs/verification/local-validation-final-2026-09-22.json. Windows Node 24 checks, coverage, fixture-only Playwright E2E, package smoke, and a Node 24 Linux container check completed; no external Agent or user was contacted. Real Agent/user gates remain skipped-by-request and stable release remains HOLD.
