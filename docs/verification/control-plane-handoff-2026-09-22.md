# Control-plane 开发交接记录 — 2026-09-22

这份记录用于把 control-plane receipt 完整性候选从开发代理交接给维护者。当前交付仍是 PR candidate，不是 stable 发布。

## 当前代码与 PR 状态

- 基线：`origin/main@967ceee`。
- 实现提交：`f0a1ef93064b78e07a0dd4a020104586e998d41f`（短 SHA：`f0a1ef9`）。
- 当前分支：`codex/control-plane-integrity`。
- 交接前 HEAD：`8997b0e65b0d1080de3f4898b5c3ab7c3cd042bc`；本交接提交是当前分支的新 tip，交接提交及其前一提交只追加验证记录和交付报告，没有改变运行时代码。推送后以 `git rev-parse HEAD` 记录最终交接提交 SHA。
- PR：[Frankie-Xu/threadport#70](https://github.com/Frankie-Xu/threadport/pull/70)，标题为 `fix: enforce control-plane receipt verification`，状态为 **OPEN / Draft**，`mergeStateStatus=CLEAN`。
- 当前 PR 没有 review 或 comment；维护者审阅与是否合并是当前阻塞责任。
- PR 当前 diff 相对 `origin/main` 为 19 个文件；工作树干净，分支将在本交接提交推送后与 `origin/codex/control-plane-integrity` 同步。

## 已完成

### P0-A：receipt / manifest 完整性

- `verified-complete` 必须来自 trusted source，并携带非空 evidence。
- `agent-report`、无 evidence、manifest digest 错误、target 不匹配、缺少 target、过期 receipt、nonce 冲突和 forged receipt 都不会形成可信完成事实。
- manifest schema、digest、target session/run 与 receipt target 之间的关系受到持久化层和 reducer 双重校验。
- 无法验证的输入保持 `unknown` 或 `reported-complete`，并记录可解释的 attention item。

### P0-B：持久化投影与任务详情

- `ControlPlaneService.state()` 与 `GET /api/v1/tasks/:id/control` 合并持久化 manifest/receipt。
- Web API 类型包含 manifest 和完整 receipt 字段。
- 任务详情显示 receipt 阶段、状态、target 和 evidence，并明确标记 `verified`、`observed`、`coverage-gap`、`unknown`。
- pending receipt 不会被 UI 当作 complete。

### P0-C：公开 prerelease 记录

- 已发布的 `v0.2.0-dev.0` 仍绑定 tag `967ceee`，公开资产 SHA-256 为 `b3cb66cb671930d021bda9e710d96a617068b1700d2e1f1c4bb576b91dee3a6c`。
- 发布说明中的 hash 占位文本已经改为真实值。
- 当前 control-plane candidate 没有写入该已发布 prerelease，也没有创建 stable tag/Release。

## 验证与候选包证据

本地运行时为 Node `v24.19.0`、Windows `win32/x64`：

| 检查 | 结果 |
| --- | --- |
| `npm ci` | 通过；128 packages audited，0 vulnerabilities |
| `npm run check` | 通过；format、typecheck、build、83 个测试文件 / 526 个测试、docs、redaction |
| `npm run test:e2e` | 通过；11/11 browser tests |
| `npm run check:pack` | 通过；264-file isolated package smoke |
| `THREADPORT_PACKAGE_OUTPUT=output/package-review-final npm run test:package` | 通过；installed browser smoke + 264-file package smoke |
| `npm run check:docs` | 通过；327 个本地 destination、109 个 Markdown 文件 |
| `git diff --check` | 通过 |

候选包为 workspace-only review artifact：

- 文件数：264。
- SHA-256：`9ea561a2a3a990b1c9fc048fdeb04413f7c69344a63da2314c8bf15fb86389ce`。
- manifest `sourceCommit`：`cb651aa7927af38f7d935f0ff5749384bb6180e5`。
- `trackedChanges=false`，Node `v24.19.0`，平台 `win32/x64`。
- 机器可读证据：[control-plane-candidate-2026-09-22.json](packages/control-plane-candidate-2026-09-22.json)。

最新 PR CI run `35737956731` 已通过 aggregate `check` 以及 Ubuntu、macOS、Windows 的 Node 24 jobs。此前第一轮远程 run 因 `check:docs` 引用本地 ignored evidence 路径失败；manifest 改为提交在 `docs/verification/packages/` 后，后续 run 全部通过。

交付报告：[development-completion-report.html](../../outputs/development-completion-report.html)。完整候选审查：[control-plane-review-2026-09-22.md](control-plane-review-2026-09-22.md)。

## 明确未完成且必须保持事实状态

- T14-B/T18 的真实 Claude/Codex Agent、Ubuntu/macOS/Windows、native-resume/new-session 矩阵仍为 `unknown`、`not_run` 或 `HOLD`；合成浏览器测试不能替代真实 Agent 证据。
- T20 外部用户观察仍为 0 名，不得写成完成。
- T21、Q01–Q24 以及原始 S01–S36 证据仍有 unavailable/unknown 项。
- `rc-checklist-v0.2.md` 和 `agent-matrix-beta.md` 中的历史/未完成状态保持原样；不存在的 `compatibility.md` 未新增伪造的兼容性证据。
- stable 继续 `HOLD`。当前 candidate、公开 prerelease、stable 三者边界不得混写。
- 本交接阶段没有执行 stable tag/Release、npm publish、真实 Agent 登录、外部用户招募或对外通知。

## 维护者下一步

1. 审阅 PR #70 的代码和测试，决定是否合并；在此之前不把 candidate 称为 stable。
2. PR 合并后，以实际 merge SHA 重新构建 candidate package，重新生成并提交 manifest，绑定新的 `sourceCommit` 和 SHA-256。
3. 在合并后的 SHA 上重新运行 `npm run check`、`npm run test:e2e`、`npm run check:pack`、`npm run test:package`、`npm run check:docs`，并保留三平台 CI 结果。
4. 继续补齐 T14-B/T18、T20、T21 及原 S01–S36 的真实证据；只有这些门槛与明确发布授权全部具备后，才重新评估 stable HOLD。

实现回滚点为独立运行时代码提交 `f0a1ef9`；回滚时保留本交接记录、首次失败记录和候选包证据。

## 责任、前置条件、命令与验收

- **责任人**：当前阻塞项由仓库维护者负责 PR #70 的人工审阅、合并决定和合并后的 reviewed candidate 重建；开发代理已完成候选实现、自动验证和证据归档。
- **前置条件**：PR 必须先完成审阅并合并；合并后的 SHA、干净工作树、可复现依赖安装和可保存的 package artifact 必须可取得；真实 Agent/用户测试必须在获授权的目标环境执行。
- **合并后命令**：`npm ci`；`npm run check`；`npm run test:e2e`；`npm run check:pack`；`THREADPORT_PACKAGE_OUTPUT=output/package-reviewed npm run test:package`；`npm run check:docs`；`git diff --check`。
- **验收条件**：合并 SHA 与 package manifest 的 `sourceCommit` 一致；候选 tarball SHA-256 与 manifest 一致；源测试、浏览器测试、隔离安装包 smoke、文档链接和三平台 CI 均通过；T14-B/T18/T20/T21 与原 S01–S36 的状态仍按真实证据逐项记录。
- **禁止动作**：在上述条件满足前不得创建 stable tag/Release、不得执行 `npm publish`、不得声称真实 Agent 登录或外部用户招募完成、不得把 candidate 或 prerelease 证据写成 stable 证据。
