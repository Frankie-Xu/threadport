# v0.2 发布收口与后续版本 Implementation Plan

> **For agentic workers:** This plan is for review and staged execution. Use one small PR per task, keep each task independently testable, and preserve the existing evidence boundary.

**Goal:** 把 ThreadPort 从当前 `origin/main@967ceee` 的 `0.2.0-dev.0` 主线推进到可审计的发布候选；关闭真实 Agent、安装包、外部用户和发布审查门禁，记录历史 CI 超时的适用边界，并把后续 v0.3/v0.4/v0.5 能力与 v0.2 发布工作分开。

**Architecture:** 先稳定当前主线和已提交的 benchmark 调度隔离改动，再从干净的最终候选 SHA 生成安装包。真实 Agent 验证只消费已允许的 CLI/日志和匿名元数据，所有成功结论必须绑定版本、平台、候选 SHA、安装包 SHA-256、工作目录、人工约束和实际产物；没有可靠控制接口时保留 `unknown`/`stop-unavailable`，不扩张能力声明。外部用户验证只使用明确同意的匿名观察记录，发布决策只读取新鲜证据，不用旧分支或合成测试替代真实门禁。

**Tech Stack:** Node 24、TypeScript strict、Fastify 5、better-sqlite3、Vitest、Playwright、npm pack、GitHub Actions。

**Spec:** `docs/v0.2/01-product-spec.md`、`docs/v0.2/02-architecture.md`、`docs/v0.2/03-contracts.md`、`docs/verification/release-0.2.0.md`、`docs/verification/rc-checklist-v0.2.md`。

## Global Constraints

- 运行时最低版本保持 Node 24；不因 CI 超时而降低迁移正确性或删除历史数据保护。
- 不采集 hidden reasoning、system prompt、认证 token、完整原始日志、任意绝对路径或完整工作区快照。
- 不把 Agent 自报、自然语言“已交接”、进程 `exit 0` 或命令存在性当作任务完成或接续成功证据。
- 不改变 Capsule v1、handoff v1、既有 CLI stdout、旧 API 语义或默认服务的自动刷新行为，除非专门任务补齐回归测试并记录迁移影响。
- 所有真实验证必须使用最终候选 SHA；历史证据必须标注原始提交、版本和适用边界，不能自动延伸到新提交。
- 不在当前含有未提交改动的工作区执行破坏性清理；候选验证使用从 `origin/main` 创建的隔离 worktree。
- 每项任务都必须有代码/文档边界、可复现命令、通过条件、失败保留方式和回滚路径。

## Review Focus

- **迁移超时：** 5 秒超时究竟是测试预算过小、GitHub runner 负载，还是迁移/备份实现退化；不能只把 timeout 调大就关闭门禁。
- **自动刷新边界：** `autoRefresh: false` 只能用于基准控制；默认 `startLocalServer()` 仍必须启动索引，关闭服务必须停止 indexer 并关闭数据库。
- **真实接续：** 目标版本、native-resume/new-session、cwd、人工约束、下一步产物和用户确认必须逐格记录；一次 exit 0 不足以通过。
- **隐私与证据：** 报告、DOM、API 和导出不能包含 token、hidden reasoning、用户家目录或原始私人日志；覆盖缺口要显式显示。
- **发布一致性：** Git SHA、tarball SHA-256、包内 manifest、doctor 版本、CI artifact 和 Release Notes 必须指向同一候选。

---

## 当前状态与工作分层

### 必须先完成才能继续发布（P0）

1. 以 `origin/main@967ceee` 为基线，从隔离 worktree 冻结最终候选并重新生成包证据。
2. 对已合并的 benchmark 调度隔离补一条专门断言 `autoRefresh:false` 的回归测试，并把 benchmark validation 结果绑定到候选 SHA；当前三平台 CI 已通过。
3. 把历史 Ubuntu 迁移超时与候选 run 35718501543 的全绿结果写入验证记录；只有再次重现时才开启实现修复。

### 发布前必须完成（P1）

4. 完成 T14-B/T18 的真实 Claude/Codex/Ubuntu Agent 矩阵，并保留首失败与重测证据。
5. 完成 T19 最终 RC 安装包复核。
6. 完成 T20 五名真实用户的匿名观察与回访计划，或明确记录无法开展的阻塞条件。
7. 完成 T21 Q01–Q24、原始范围附件、支持范围、已知限制和发布授权审查。

### 稳定版之后再做（P2）

8. v0.3 Observe：只读来源、运行状态、谱系候选、attention 和脱敏导出。
9. v0.4 Receipt：manifest、摘要校验、分阶段 receipt 和重启/重复/过期处理。
10. v0.5 Takeover：一个真实验证过的 runner 的条件停止、固定快照、继任确认和继续执行。

P2 不得为了“看起来完整”而提前扩张 v0.2 的发布范围。

---

## Task 1: 记录并监测 Ubuntu 迁移测试超时

**功能目标：** 记录历史 Ubuntu Node 24 迁移超时与当前候选全绿结果的差异；只有重现时才修改实现，同时保留迁移回滚、备份恢复和跨 lineage schema 验证的语义。

**边界：** 只处理迁移测试的耗时/资源问题和已证实的实现回归；不删除历史 schema 测试，不把全局 timeout 无条件放宽，不改变 `SCHEMA_VERSION` 或数据库升级协议。

**文件：**
- Inspect: `tests/storage/migrations.test.ts`
- Inspect/modify only if evidence requires it: `src/storage/migrations.ts`, `src/storage/database.ts`
- Inspect: `.github/workflows/ci.yml`
- Update evidence: `docs/verification/release-0.2.0.md` and a new `docs/verification/ci-migration-timeout-2026-09-22.md`

**接口约束：** `migrate(db, dataDir, migrations?)`、`openDatabase({ dataDir })`、`SCHEMA_VERSION` 和错误码 `MIGRATION_FAILED` 保持不变。

- [ ] **Step 1: 复现并分段计时**

  Run:

  ```text
  npm test -- --run tests/storage/migrations.test.ts
  npx vitest run tests/storage/migrations.test.ts --reporter=verbose
  ```

  记录单个测试耗时，特别是 `upgrades actual canonical v9...` 及其前后的临时目录、SQLite backup 和 schema rebuild 操作。

- [ ] **Step 2: 在不修改代码的情况下确认环境差异**

  在 Ubuntu Node 24 runner 和本地 Node 24 各运行一次同一测试文件，保存 Node、SQLite、CPU、磁盘类型和总耗时；如果只有 runner 超时，先标记为环境/预算问题，不直接修改生产迁移代码。

- [ ] **Step 3: 写出针对根因的回归测试**

  如果发现真实迁移回归，先在 `tests/storage/migrations.test.ts` 增加最小失败用例，断言历史数据、`user_version`、备份数量、`foreign_key_check` 和重复迁移幂等性；不要用更大的 timeout 代替测试。

- [ ] **Step 4: 实施最小修复**

  只修改导致超时的具体路径：例如减少重复 schema 初始化、避免重复读取 SQL、或把非必要的昂贵断言拆成同一文件中的独立测试。每个修改必须保留失败回滚和备份校验。

- [ ] **Step 5: 运行本地验证**

  ```text
  npm test -- --run tests/storage/migrations.test.ts
  npm run typecheck
  npm run build
  npm run check:docs
  npm run check:redaction
  ```

  预期：迁移测试全部通过，类型/构建/文档/脱敏门禁通过，且没有删除任何历史 lineage 覆盖。

- [ ] **Step 6: 运行全平台 CI 并记录结果**

  推送独立小 PR，等待 Ubuntu/macOS/Windows Node 24 和汇总 `check` 全部通过。失败日志、首次耗时和重跑结果全部保留在验证记录中。

- [ ] **Step 7: 提交**

  ```text
  git add tests/storage/migrations.test.ts src/storage/migrations.ts docs/verification/ci-migration-timeout-2026-09-22.md
  git commit -m "test: stabilize migration verification on Ubuntu"
  ```

**验收条件：** 候选 run 35718501543 的三平台和汇总 check 全绿；验证文档说明历史超时是瞬态、环境差异或已修复回归；迁移失败仍恢复 `user_version`、人工数据和可恢复备份。

**回滚：** 回滚该 PR 的 squash commit；保留原始失败日志和验证文档，不手工降低 schema 版本。

---

## Task 2: 收口 benchmark 调度隔离改动

**功能目标：** 为容量基准提供“服务启动但不自动刷新”的可控模式，同时保证产品默认行为不变。

**边界：** 该选项只服务于基准/诊断；不暴露给用户 CLI，不改变默认 `startLocalServer()` 行为，不绕过索引生命周期或关闭逻辑。基准中的“手动触发增量 index job”必须与产品默认的 15 秒自动刷新可见性分开计量，不能把前者写成自动刷新延迟。

**文件：**
- Modify: `src/server/app.ts`
- Modify: `scripts/benchmark.mjs`
- Test: `tests/server/app.test.ts` or a focused `tests/benchmark/server-start.test.ts`
- Update: `docs/verification/batched-indexing-2026-09-21.md` only if the benchmark protocol changes

**接口：**

```ts
startLocalServer(options?: { dataDir?: string; demo?: boolean; autoRefresh?: boolean }): Promise<LocalServer>
```

`autoRefresh` 缺省或为 `true` 时调用 `indexer.start()`；只有明确为 `false` 时不启动自动刷新。`close()` 仍必须停止 indexer、清理 timer 并关闭 store。

- [ ] **Step 1: 复核当前候选提交和工作树状态**

  运行 `git status --short`、`git diff --name-status`、`git diff --check`、`git show --stat 55e1828` 和 `git show --stat 967ceee`；确认代码改动已合并到 `origin/main@967ceee`，未提交内容只能属于报告、计划或验证记录。不要 reset、clean 或覆盖其它开发者改动；确认 benchmark diff 之外没有其它文件依赖 `autoRefresh`。

- [ ] **Step 2: 写默认行为和测量边界回归测试**

  用可观察的 `IndexService.start/stop` 依赖或现有 server fixture 断言：默认启动会开始刷新，`autoRefresh:false` 不开始刷新，两个模式都能正常 `close()`。基准脚本另断言手动 `POST /index-jobs` 的完成时间单独命名为 `incrementalJobMs`，不复用 `incrementMs` 代表默认 15 秒刷新。

- [ ] **Step 3: 运行 focused tests 和基准协议检查**

  ```text
  npm test -- --run tests/server/app.test.ts
  npm run typecheck
  node scripts/benchmark-validation.mjs output/performance/benchmark.json
  ```

- [ ] **Step 4: 决策并保留或撤回候选提交**

  如果该模式只用于 benchmark 且测试证明默认行为未变，保留 `55e1828`，并在候选证据中绑定 focused test、benchmark 结果和 CI run；如果新增 focused test 或协议文档，再单独提交补充 commit：

  ```text
  git add tests/server/app.test.ts docs/verification/batched-indexing-2026-09-21.md
  git commit -m "test: verify benchmark refresh isolation"
  ```

  如果没有稳定的产品/基准需求，完整撤回 `55e1828` 的两个代码文件改动，不留下半成品接口。

**验收条件：** 默认服务行为有回归证据；benchmark 使用 `autoRefresh:false` 时数据准备与索引测量边界清晰；没有额外用户可见参数。

**回滚：** 撤回该 commit；benchmark 恢复使用默认自动刷新前先更新性能证据说明。

---

## Task 3: 冻结最终候选并重跑本地发布检查

**功能目标：** 生成一个没有工作区漂移、可复查、可安装的候选 SHA。

**边界：** 不在当前工作区执行 `git clean -xfd`；不发布 npm、不创建 stable tag、不发送外部邀请。

**文件/产物：**
- Inspect: `package.json`, `package-lock.json`, `scripts/pack-smoke.mjs`, `playwright.config.ts`
- Generate in isolated worktree: `output/package-review/`, `output/performance/`
- Update: `docs/verification/package-rc.md`, `docs/verification/rc-checklist-v0.2.md`

- [ ] **Step 1: 创建隔离候选 worktree**

  从已通过 CI 的 `origin/main@967ceee` 创建 worktree，确认 `git status --short` 为空；当前含未提交改动的工作区只用于开发，不作为候选。

- [ ] **Step 2: 安装锁定依赖**

  ```text
  npm ci
  node --version
  npm --version
  ```

  记录 Node 24.x、npm 版本和候选 SHA。

- [ ] **Step 3: 执行源码检查**

  ```text
  npm run check
  npm run check:pack
  npm run check:redaction
  npm run check:docs
  ```

- [ ] **Step 4: 执行浏览器和安装包检查**

  ```text
  npx playwright install chromium
  npm run test:e2e
  THREADPORT_PACKAGE_OUTPUT=output/package-review npm run test:package
  ```

  保存 tarball、文件清单、SHA-256、浏览器结果和版本信息。

- [ ] **Step 5: 检查包边界**

  确认包内只有 `dist/src`、`dist/web`、`schema`、`examples`、`migrations` 和 `THIRD_PARTY_NOTICES.md` 等白名单内容；拒绝测试、研究资料、临时 output、环境文件、token 和原始会话日志。

- [ ] **Step 6: 更新候选证据**

  把候选 SHA、tarball SHA-256、测试数量、浏览器数量、包文件数和已知限制写入 `package-rc.md`，所有旧候选标记为 historical。

**验收条件：** 候选 worktree 干净；源码、浏览器、安装包、文档和脱敏检查全部通过；所有产物都绑定同一 SHA。

**回滚：** 删除候选 worktree 和临时产物，不影响当前开发工作区。

---

## Task 4: 完成 T14-B 真实终端接续证据

**功能目标：** 在已完成的 T14-A 执行器和预览边界上，验证受支持的真实 CLI 版本能完成一次人工确认的接续闭环。

**边界：** 不自动登录、不复制认证资料、不添加 `--yes` 或 bypass、不把 exit 0 当作完成、不承诺未经验证的 Agent/版本、不读取 hidden reasoning。

**文件：**
- Inspect/modify only when a real failure is reproduced: `src/targets/`, `src/integration/continue.ts`, `src/targets/runners.ts`
- Update evidence: `docs/verification/t14-terminal-launch.md`, `docs/compatibility.md`, `docs/verification/agent-matrix-beta.md`
- Store only anonymous metadata: `docs/verification/real-*-*.json`

- [ ] **Step 1: 固定目标版本和参数证据**

  保存 Claude/Codex 的 `--version`、`--help`、resume help 摘要、候选 SHA、包 SHA-256 和认证状态；认证状态缺失时写 `unknown`。

- [ ] **Step 2: 准备三个隔离任务**

  分别覆盖失败测试修复、保留人工约束的小改动、工作区变动后的重新预览；每个任务使用独立 Git 根目录和非敏感 fixture。

- [ ] **Step 3: 运行 new-session 与 native-resume**

  在终端人工确认完整预览、目录、约束、下一步和工作区状态；记录目标 Agent 的实际输出与产物，不记录原始私人日志。

- [ ] **Step 4: 保留失败和取消证据**

  对非零退出、用户取消、非 TTY、cwd 变化、OWNER_LOST 和 revision conflict 分别记录状态；确认目标退出码与 ThreadPort CLI 退出码分开。

- [ ] **Step 5: 对真实失败建立小修复 PR**

  每个失败只修所属模块；先增加可重复 fixture，再修改代码；重跑同一场景并保留首次失败。

**验收条件：** 至少一个受支持目标完成从预览、用户确认、启动、实际产物到工作区复验的闭环；失败/取消/不可控停止仍显示为明确状态；兼容矩阵不扩大到未实测版本。

**回滚：** 回滚对应 runner/target 小 PR；保留失败证据和 `unknown`/`stop-unavailable` 状态。

---

## Task 5: 完成 T18 真实 Agent 矩阵

**功能目标：** 用最终候选包补齐 24 格矩阵，形成真实 Claude/Codex、macOS/Ubuntu、同 Agent/跨 Agent 的证据边界。

**边界：** 不把维护者代理、合成 fixture、CI fake runner 或旧候选包结果写成真实支持；不提交原始日志、session UUID、token、私有路径或认证材料。

**文件/产物：**
- Update: `docs/verification/agent-matrix-beta.md`
- Update: `docs/compatibility.md`
- Add anonymous records under `docs/verification/`
- Update: `docs/verification/rc-checklist-v0.2.md`

- [ ] **Step 1: 先重跑已有 3 格**

  用 Task 3 的最终候选包重跑旧的 macOS Codex→Codex 三场景，确保旧证据不被错误复用，并保留首次命令失败及修复后的结果。

- [ ] **Step 2: 获取明确的 Claude 和 Ubuntu 条件**

  先确认账号登录、Agent 版本、Node 24、Ubuntu x64 环境和工作目录；缺任何条件就标记 `not_run`，不以模拟替代。

- [ ] **Step 3: 按固定矩阵运行**

  每格记录：候选 SHA、tarball SHA-256、OS/Node/Agent 版本、new-session/native-resume、cwd、人工约束、预期下一步、实际产物、用户确认、失败与重测关系。

- [ ] **Step 4: 重复失败场景**

  首次失败不得覆盖；修复后用同一 fixture 重跑，确认失败原因消失且没有引入额外重试或权限绕过。

- [ ] **Step 5: 更新支持声明**

  只有完成且证据完整的格子才能进入“observed pass”；未运行、部分证据和 source coverage gap 保持 `not_run`、`unknown` 或 `HOLD`。

**验收条件：** 24 格都有明确状态；真实支持声明只覆盖已验证的版本和路径；没有把“命令可启动”写成“接续成功”。

**回滚：** 删除匿名临时产物并保留审计摘要；任何真实失败回到目标 runner 或 adapter 的独立小 PR。

---

## Task 6: 完成 T19 最终 RC 安装包复核

**功能目标：** 证明最终候选 tarball 可在独立目录安装、运行、持久化并通过包边界检查。

**边界：** 这是安装/分发验证，不替代 T18 真实 Agent 或 T20 用户验证；不执行发布。

**文件：** `scripts/pack-smoke.mjs`、`package.json`、`docs/verification/package-rc.md`、`docs/verification/rc-checklist-v0.2.md`。

- [ ] **Step 1:** 从 Task 3 候选 SHA 运行 `THREADPORT_PACKAGE_OUTPUT=output/package-review npm run test:package`。
- [ ] **Step 2:** 在干净临时目录编译严格消费者，验证 public exports、SQLite native binding、CLI/UI、doctor JSON、Cursor 输入和数据持久化。
- [ ] **Step 3:** 逐项核对包文件白名单、`THIRD_PARTY_NOTICES.md`、repository/homepage/bugs 元数据和 Node 24 engine。
- [ ] **Step 4:** 将 tarball SHA-256 与候选 SHA 写入包证据；如果重新打包，旧 hash 标记失效并重新验收。

**验收条件：** 安装目录验证通过，包内没有测试/日志/token/临时文件，tarball hash 与候选证据一致。

---

## Task 7: 完成 T20 外部用户验证

**功能目标：** 取得真实目标用户在候选包上的首次使用、接续准备、实际接续和回访证据。

**边界：** 用户自行操作，观察者不代做；必须取得明确同意；不收集源日志、token、私有路径或完整屏幕内容；分母为 0 时不计算通过率。

**文件/产物：**
- Update: `docs/verification/user-study-v0.2.md`
- Update: `docs/demo/README.md`
- Add anonymized consent/observation records outside the repository or in the approved redacted format

- [ ] **Step 1:** 在 T18 通过且包 hash 固定后，招募 5 名目标用户并取得记录许可。
- [ ] **Step 2:** 给每人同一安装包和同一任务说明；记录找到真实会话、准备接续、完成接续所需时间和阻碍。
- [ ] **Step 3:** 让用户确认目录、人工约束和预设下一步实际产物；观察者只记录匿名字段。
- [ ] **Step 4:** 统计门槛：至少 4/5 在 5 分钟内独立准备接续，至少 3/5 实际完成接续；不足则建立最大阻碍的小 PR。
- [ ] **Step 5:** 记录第 7–13 天回访；未到期必须写 `not_due`，不能填充结果。

**验收条件：** 5 名参与者都有同意状态、包 hash、平台、匿名结果和阻碍；通过率只在分母完整时计算；用户数据不进入源码或原始日志。

---

## Task 8: 完成 T21 发布审查与决策

**功能目标：** 把代码、CI、包、真实平台、用户和原始范围证据汇总为可审计的 release/hold 决策。

**边界：** 只有用户明确授权后才执行 tag、Release 或 npm publish；本任务本身只准备可审查材料，不发布外部内容。

**文件：**
- Update: `docs/verification/release-0.2.0.md`
- Update: `docs/verification/rc-checklist-v0.2.md`
- Update: `README.md`, `docs/compatibility.md`, release notes draft
- Inspect: GitHub Actions artifacts and package SHA-256

- [ ] **Step 1:** 绑定最终候选 SHA、tarball SHA-256、CI run、浏览器结果和 T18/T20 证据。
- [ ] **Step 2:** 逐项审查 Q01–Q24，并逐项处理原始 W5 `S01`–`S36` 附件；缺证据写 `unknown`/`unavailable`，不从相邻测试推断通过。原始附件缺失时保持整组 `unavailable`，不能用 Q01–Q24 自动测试替代。
- [ ] **Step 3:** 更新支持矩阵、已知限制、升级/回退步骤、数据生命周期和隐私边界。
- [ ] **Step 4:** 由维护者审阅 release/hold 文案；任何 T18/T20/原始范围缺口都保持 HOLD。
- [ ] **Step 5:** 只有收到明确发布授权后，按固定 SHA 创建 tag/Release，并在发布后重新核对安装包 hash。

**验收条件：** release 文档能回答“支持什么、证据是什么、哪些未验证、如何回滚”；未授权时没有外部发布副作用。

**回滚：** 保持 dev 快照，不创建 stable tag；若发布后 hash/证据不一致，立即停止推广并按回滚说明恢复匹配包。

---

## Task 9: v0.2 之后的分阶段能力

这些任务不进入当前 stable 发布门禁，必须在 T21 明确决策后另立小计划。

### v0.3 Observe

- **功能：** 只读来源、运行状态、谱系候选、attention、脱敏导出。
- **边界：** 没有 parent/run 证据时只能显示 `coverage-gap`；不停止进程、不自动接管、不做云同步。
- **验收：** 新用户可在 30 秒内找到当前责任方、最后证据和下一步；所有未知状态可解释。

### v0.4 Receipt

- **功能：** manifest digest、target/expiry/nonce 绑定、prepared→accepted→observed-start 的阶段 receipt。
- **边界：** receipt 表示传输/接受事实，不表示理解、遵守或业务完成。
- **验收：** 错 target、旧 revision、错误 digest、重复/冲突 nonce、重启和迟到事件在 fixture 中零误接受。

### v0.5 Takeover

- **功能：** 一个经过版本验证的 runner 支持条件停止、固定快照、继任确认和继续执行。
- **边界：** 没有控制接口时只显示 `stop-unavailable`；不自动 checkout/stash/reset，不猜测残留 PID 已停止。
- **验收：** 并发接管最多一个 active successor；停止不可用和 successor 失败都有可恢复状态和人工路径。

---

## 执行顺序与完成定义

建议按以下顺序推进：

1. Task 1：记录历史迁移超时与当前全绿 CI 的适用边界；重现时才开修复 PR。
2. Task 2：补齐 `autoRefresh:false` 专门回归测试和 benchmark validation 证据。
3. Task 3：从 `origin/main@967ceee` 冻结最终候选并重跑完整检查。
4. Task 4：T14-B 真实终端接续。
5. Task 5：T18 Agent 矩阵。
6. Task 6：T19 最终 RC 包。
7. Task 7：T20 外部用户验证。
8. Task 8：T21 release/hold 决策。
9. Task 9：另立 v0.3/v0.4/v0.5 计划。

每个任务完成前必须同时满足：

- 代码、文档和测试变更在同一个小 PR 内可解释。
- 有明确的自动或真实证据，包含命令、候选 SHA、版本和产物摘要。
- 有失败/回滚路径，且首次失败没有被覆盖。
- 没有扩大支持声明、隐私采集范围或用户权限。
- 工作区干净，或未提交内容已明确归属下一个任务。

本计划只整理后续工作，不自动执行代码修改、真实 Agent 登录、用户招募、tag、Release 或 npm publish。
