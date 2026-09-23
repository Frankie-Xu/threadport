# Control-plane 开发交接记录 — 2026-09-22

## 已完成

- 基线为 `origin/main@967ceee`；运行时代码提交为 `f0a1ef93064b78e07a0dd4a020104586e998d41f`（短 SHA `f0a1ef9`）。
- P0-A：`verified-complete` 必须来自 trusted source 并携带 evidence；manifest digest、target session/run、expiry、nonce 和 receipt integrity 均受到校验。无法验证的输入保持 `unknown` 或 `reported-complete`。
- P0-B：持久化 manifest/receipt 已进入 `ControlPlaneService.state()` 和 `GET /api/v1/tasks/:id/control` 的投影；任务详情显示 stage、status、target、evidence 及 `verified`、`observed`、`coverage-gap`、`unknown` 事实标签；pending 不会渲染为 complete。
- P0-C：公开 `v0.2.0-dev.0` 的发布说明已使用真实资产 hash；该 prerelease 仍绑定 `967ceee`，候选代码没有写入已发布包。
- PR：[Frankie-Xu/threadport#70](https://github.com/Frankie-Xu/threadport/pull/70) 已 squash merge，实际 merge SHA 为 `80f6220bd3f4ef8ee23c88b38d75aee5a589b824`。
- 版本 PR：[Frankie-Xu/threadport#72](https://github.com/Frankie-Xu/threadport/pull/72) 已合并，发布提交为 `4854c4079985c5fe03e6bcf2720ca73f5e35229d`；`v0.2.1` tag 和 GitHub Stable Release 已存在。
- 合并后的 GitHub CI run [`35756796936`](https://github.com/Frankie-Xu/threadport/actions/runs/35756796936) 的 aggregate check、Ubuntu Node 24、macOS Node 24、Windows Node 24 全部通过。
- 候选包为 workspace-only artifact：264 个文件，SHA-256 `9ea561a2a3a990b1c9fc048fdeb04413f7c69344a63da2314c8bf15fb86389ce`，manifest `sourceCommit=cb651aa7927af38f7d935f0ff5749384bb6180e5`，`trackedChanges=false`，Node `v24.19.0`、`win32/x64`。证据见 [control-plane-candidate-2026-09-22.json](packages/control-plane-candidate-2026-09-22.json)。
- 合并 SHA 上重新构建的 reviewed package 仍为 workspace-only artifact：264 个文件，SHA-256 `9ea561a2a3a990b1c9fc048fdeb04413f7c69344a63da2314c8bf15fb86389ce`，manifest `sourceCommit=80f6220bd3f4ef8ee23c88b38d75aee5a589b824`，`trackedChanges=false`，Node `v24.19.0`、`win32/x64`。证据见 [control-plane-reviewed-80f6220.json](packages/control-plane-reviewed-80f6220.json)。
- stable package asset 已绑定发布提交：264 个文件，SHA-256 `8659e7d286d8cf29d6ab7aac7c92fe57b3dd0359e9719ce0bf01a25c4ecd7d08`，manifest `sourceCommit=4854c4079985c5fe03e6bcf2720ca73f5e35229d`，`trackedChanges=false`，Node `v24.20.0`、`linux/x64`。证据见 [control-plane-stable-0.2.1.json](packages/control-plane-stable-0.2.1.json)。
- 已核对候选 tarball 的 SHA-256、SHA-512、264 个归档文件、提交 manifest 与本地 `.tgz.json`，全部一致；该包仍保留为历史 candidate 证据，没有伪装成 merge SHA 或 stable 产物。
- 交付报告：[development-completion-report.html](../../outputs/development-completion-report.html)。

## 未完成

- PR #70 和版本 PR #72 已合并；GitHub stable `v0.2.1` 已发布。
- npm stable publish 尚未执行；当前 `npm whoami` 为 `ENEEDAUTH`，不能把 GitHub asset 或本地 tarball 写成 npm 已发布证据。
- T14-B/T18 的真实 Claude/Codex Agent、Ubuntu/macOS/Windows、native-resume/new-session 矩阵仍为 `unknown`、`coverage-gap`、`not_run` 或 `HOLD`。
- T20 外部用户观察仍为 0 名；T21、Q01–Q24 以及原始 S01–S36 仍有 unavailable/unknown 项。
- `docs/compatibility.md` 继续把 help/参数探测和真实接续认证分开；`docs/verification/user-study-v0.2.md` 继续保留 0 名观察参与者。旧包的 macOS Codex 三格观察不迁移为本候选的真实 Agent 认证。
- candidate、公开 prerelease、GitHub stable、npm 分发四者边界保持分开：公开 prerelease 是 `v0.2.0-dev.0` → `967ceee`；GitHub stable 是 `v0.2.1` → `4854c40`；npm `0.2.1` 尚未发布。

## 执行步骤

1. 获得可用 npm 身份验证后，在发布提交 `4854c4079985c5fe03e6bcf2720ca73f5e35229d` 的干净 checkout 中重新运行 npm publish 前检查；在此之前保持 npm 状态为未发布。
2. 已读取实际 merge SHA，并在独立、干净 checkout 中检出该 SHA；stable 输出目录使用发布提交命名且未覆盖既有 evidence。
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
- `v0.2.1` tag、GitHub Stable Release 和 stable asset 的 `sourceCommit` 等于发布提交。
- 候选 tarball SHA-256、SHA-512、文件清单与 manifest 一致，且不覆盖历史 evidence。
- `npm run check`、`npm run test:e2e`、`npm run check:pack`、`npm run test:package`、`npm run check:docs`、`git diff --check` 均通过。
- 合并 SHA 的 Ubuntu、macOS、Windows Node 24 CI 均通过。
- T14-B/T18、T20、T21、Q01–Q24 和 S01–S36 的状态仍按实际证据记录，没有把合成测试、旧包观察或 prerelease 事实写成 stable 认证。

## 禁止动作

- 未获得 npm 身份验证前，不执行 `npm publish`。
- 不把 GitHub stable asset 写成 npm registry 已发布版本。
- 不覆盖或复用其他仓库已经发布的 `threadport@0.2.0`。
- 不声称真实 Agent 登录、真实 Agent 接续或外部用户招募已经完成。
- 不把当前 candidate 或公开 prerelease 的证据写成 stable 证据。
