# Control-plane 开发交接记录 — 2026-09-22

## 已完成

- 基线为 `origin/main@967ceee`；运行时代码提交为 `f0a1ef93064b78e07a0dd4a020104586e998d41f`（短 SHA `f0a1ef9`）。
- P0-A：`verified-complete` 必须来自 trusted source 并携带 evidence；manifest digest、target session/run、expiry、nonce 和 receipt integrity 均受到校验。无法验证的输入保持 `unknown` 或 `reported-complete`。
- P0-B：持久化 manifest/receipt 已进入 `ControlPlaneService.state()` 和 `GET /api/v1/tasks/:id/control` 的投影；任务详情显示 stage、status、target、evidence 及 `verified`、`observed`、`coverage-gap`、`unknown` 事实标签；pending 不会渲染为 complete。
- P0-C：公开 `v0.2.0-dev.0` 的发布说明已使用真实资产 hash；该 prerelease 仍绑定 `967ceee`，候选代码没有写入已发布包。
- PR：[Frankie-Xu/threadport#70](https://github.com/Frankie-Xu/threadport/pull/70) 已 squash merge，实际 merge SHA 为 `80f6220bd3f4ef8ee23c88b38d75aee5a589b824`。
- 合并后的 GitHub CI run [`35756796936`](https://github.com/Frankie-Xu/threadport/actions/runs/35756796936) 的 aggregate check、Ubuntu Node 24、macOS Node 24、Windows Node 24 全部通过。
- 候选包为 workspace-only artifact：264 个文件，SHA-256 `9ea561a2a3a990b1c9fc048fdeb04413f7c69344a63da2314c8bf15fb86389ce`，manifest `sourceCommit=cb651aa7927af38f7d935f0ff5749384bb6180e5`，`trackedChanges=false`，Node `v24.19.0`、`win32/x64`。证据见 [control-plane-candidate-2026-09-22.json](packages/control-plane-candidate-2026-09-22.json)。
- 合并 SHA 上重新构建的 reviewed package 仍为 workspace-only artifact：264 个文件，SHA-256 `9ea561a2a3a990b1c9fc048fdeb04413f7c69344a63da2314c8bf15fb86389ce`，manifest `sourceCommit=80f6220bd3f4ef8ee23c88b38d75aee5a589b824`，`trackedChanges=false`，Node `v24.19.0`、`win32/x64`。证据见 [control-plane-reviewed-80f6220.json](packages/control-plane-reviewed-80f6220.json)。
- 已核对候选 tarball 的 SHA-256、SHA-512、264 个归档文件、提交 manifest 与本地 `.tgz.json`，全部一致；该包仍保留为历史 candidate 证据，没有伪装成 merge SHA 或 stable 产物。
- 交付报告：[development-completion-report.html](../../outputs/development-completion-report.html)。

## 未完成

- PR #70 已合并；当前 reviewed candidate 仍不能称为 stable。
- stable 发布被 npm registry 的同名版本占用和当前 `npm whoami` 的 `ENEEDAUTH` 阻断；在解决包身份/版本边界并获得可用凭据前，不创建 stable tag/Release 或执行 npm publish。
- T14-B/T18 的真实 Claude/Codex Agent、Ubuntu/macOS/Windows、native-resume/new-session 矩阵仍为 `unknown`、`coverage-gap`、`not_run` 或 `HOLD`。
- T20 外部用户观察仍为 0 名；T21、Q01–Q24 以及原始 S01–S36 仍有 unavailable/unknown 项。
- `docs/compatibility.md` 继续把 help/参数探测和真实接续认证分开；`docs/verification/user-study-v0.2.md` 继续保留 0 名观察参与者。旧包的 macOS Codex 三格观察不迁移为本候选的真实 Agent 认证。
- candidate、公开 prerelease、stable 三者边界保持分开：公开 prerelease 是 `v0.2.0-dev.0` → `967ceee`；当前 candidate 属于 PR #70；stable 仍为 `HOLD`。

## 执行步骤

1. 解决 `threadport@0.2.0` 的 registry 冲突并获得可用 npm 身份验证；在此之前不要把 candidate 写成 stable。
2. 已读取实际 merge SHA，并在独立、干净 checkout 中检出该 SHA；输出目录使用 merge SHA 命名且未覆盖既有 evidence。
3. 使用 Node 24 执行：

   ```powershell
   gh pr view 70 --repo Frankie-Xu/threadport --json state,mergeCommit,headRefOid
   git status --porcelain
   $reviewedCommit = git rev-parse HEAD
   node --version
   npm ci
   npm run check
   npm run test:e2e
   npm run check:pack
   $reviewedOutput = "output/package-reviewed-$reviewedCommit"
   if (Test-Path -LiteralPath $reviewedOutput) { throw "Evidence directory already exists; preserve it." }
   $env:THREADPORT_PACKAGE_OUTPUT = $reviewedOutput
   try { npm run test:package } finally { Remove-Item Env:THREADPORT_PACKAGE_OUTPUT }
   npm run check:docs
   git diff --check
   ```

4. 从新输出目录读取伴随 JSON，核对 `sourceCommit` 等于 merge SHA、`sha256` 等于实际 tarball SHA-256、`trackedChanges=false`，并保存同一 merge SHA 的三平台 CI 链接。
5. 继续按真实证据更新 T14-B/T18、T20、T21 和 S01–S36；测试失败时保留首次失败、修复与重测记录。

## 验收条件

- PR 已合并，reviewed candidate manifest 的 `sourceCommit` 等于实际 merge SHA。
- 候选 tarball SHA-256、SHA-512、文件清单与 manifest 一致，且不覆盖历史 evidence。
- `npm run check`、`npm run test:e2e`、`npm run check:pack`、`npm run test:package`、`npm run check:docs`、`git diff --check` 均通过。
- 合并 SHA 的 Ubuntu、macOS、Windows Node 24 CI 均通过。
- T14-B/T18、T20、T21、Q01–Q24 和 S01–S36 的状态仍按实际证据记录，没有把合成测试、旧包观察或 prerelease 事实写成 stable 认证。

## 禁止动作

- 未满足以上条件前，不创建 stable tag 或 stable Release。
- 未满足以上条件前，不执行 `npm publish`。
- 不覆盖或复用其他仓库已经发布的 `threadport@0.2.0`。
- 不声称真实 Agent 登录、真实 Agent 接续或外部用户招募已经完成。
- 不把当前 candidate 或公开 prerelease 的证据写成 stable 证据。
