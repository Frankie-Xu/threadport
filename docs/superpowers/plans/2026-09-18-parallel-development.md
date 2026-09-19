# ThreadPort 并行快速高质量开发报告与实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不把未验证结果写成通过的前提下，解除当前 PR 的跨平台阻塞，并并行完成性能、真实接续、验收规格和发布证据缺口。

**Architecture:** 先用一个 P0 兼容性工作包修复 Windows CI 的确定性失败；其余工作按“代码生产链、性能测量、验收证据、文档收口”拆成互不争用文件的独立分支。每个工作包都有自己的回归测试和证据，最终由一个候选分支做全平台集成，不能用合成测试代替真实 Agent 或外部用户验证。

**Tech Stack:** Node 24、TypeScript、Vitest、Playwright、Fastify、SQLite/better-sqlite3、GitHub Actions、系统 Claude/Codex CLI（仅在真实环境可用时）。

## Global Constraints

- 以当前 PR [#58](https://github.com/Frankie-Xu/threadport/pull/58) 为集成基线；当前 head `1317e659`，base `7f57a791`。
- Node 最低版本为 24；所有候选必须执行源码、浏览器、安装包三类检查。
- 当前数据库 schema 为 7；没有经验证的迁移设计前不改变 schema 版本。
- 不触碰用户现有 `.gitignore`、`output/`、`research/`、`pelican-*.html` 和 `docs/diagrams/` 工作。
- 不提交真实会话原文、令牌、私有日志或本机绝对路径；证据使用匿名元数据、摘要和版本绑定。
- “unknown/unverified/HOLD”必须保留原义；不能用自动测试数量替代 36 场景、真实 Agent 或外部用户证据。
- 性能门槛保持 API p95 ≤300ms、UI p95 ≤500ms、索引 ≤60s、RSS ≤400MiB、status p95 ≤200ms、冷启动 ≤3s、增量 ≤20s、取消 ≤2s。
- 每个工作包独立提交；同一文件只由一个并行工作包负责，集成阶段再解决跨包冲突。

## 现状快照（2026-09-18）

| 项目 | 当前状态 | 证据 |
| --- | --- | --- |
| PR | 草稿 PR #58，尚未合并 | [PR #58](https://github.com/Frankie-Xu/threadport/pull/58) |
| Ubuntu CI | 通过 | 远端 CI run `35061856006` |
| macOS CI | 通过 | 远端 CI run `35061856006` |
| Windows CI | 失败 | 430/432 测试通过，2 个失败见下方 P0 |
| 本机 Node24 | 432 测试、7 浏览器流程、217 文件安装包通过 | `docs/verification/packages/r05-r08-node24.json` |
| 搜索性能 | HOLD | macOS API/UI p95 468.30/492.50ms；历史 Ubuntu API/UI 394.68/427.70ms |
| 36 项原始验收附件 | 未找到 | `docs/verification/original-acceptance-search-2026-09-16.md` |
| 真实 Agent 矩阵 | 3/24 旧 macOS Codex 格已运行，21 格未运行 | `docs/verification/agent-matrix-beta.md` |
| 外部用户 | 0 名 | `docs/verification/user-study-v0.2.md` |
| R06 内部 Agent 证据 | 未实现；当前只观察 ThreadPort 外层目标进程 | `docs/adr/0014-observed-command-production.md` |

## 并行工作包总览

| 工作包 | 优先级 | 可立即开始 | 文件边界 | 依赖 | 退出条件 |
| --- | --- | --- | --- | --- | --- |
| W0 Windows 进程身份 | P0 | 是 | `src/platform/process-identity.ts`, `tests/integration/continue.test.ts` | 无 | Windows 丢失观察者测试稳定通过 |
| W1 Windows junction/符号链接 | P0 | 是 | `src/workspace/reader.ts`, `tests/workspace/snapshot.test.ts` | 无 | Windows 得到 `SYMLINK_OUTSIDE`，不读取目标内容 |
| W2 真实目标 CLI 复测 | P1 | 是，需本机 CLI | `docs/verification/agent-matrix-beta.md`, `docs/verification/real-codex-macos.json`, 新匿名 fixture | PR #58 代码稳定 | argv/cwd/首次结果/工作区产物证据完整 |
| W3 搜索性能 | P1 | 是 | `src/search/`, `src/storage/search-store.ts`, `scripts/benchmark*.mjs`, `docs/verification/performance/` | 无，最终需 W0/W1 通过 | macOS/Ubuntu 固定容量 API/UI 达标或形成可审计的下一轮方案 |
| W4 R06 内部证据契约 | P1 | 是，先做协议和 fixture | `src/evidence/`, `src/adapters/`, `tests/evidence/`, ADR | 目标 CLI 适配约束 | 内部命令/测试未观测时明确 unknown；不解析自由文本猜成功 |
| W5 36 场景与验收映射 | P1 | 是，先整理索引 | `docs/verification/`, `docs/acceptance/` | 原附件取得前只能标 unavailable | 原规格摘要、版本、逐项要求→代码→运行证据→缺口表 |
| W6 真实平台矩阵 | P1 | 部分可开始 | `docs/verification/agent-matrix-beta.md`, 匿名结果文件 | W0/W1、实际 Claude/Codex/Ubuntu 条件 | 24 格逐格记录；失败和重测都保留 |
| W7 外部用户观察 | P2 | 需许可和参与者 | `docs/verification/user-study-v0.2.md` | 候选包、许可、脚本 | 至少 5 名；4/5 独立准备，3/5 完成接续 |
| W8 R10 发布收口 | P2 | 是，文档可先做 | README、release、compatibility、check scripts | W0–W7 结果 | 状态、版本、门槛、HOLD/发布决定完全一致 |

## 依赖图与推荐调度

```text
W0 ─┐
    ├─> PR #58 可合并候选 ─┬─> W2 真实 CLI 复测 ─┐
W1 ─┘                      ├─> W6 平台矩阵       ├─> W8 发布收口
                           └─> W7 用户观察       │
W3 ──────────────────────────────────────────────┤
W4 ──────────────────────────────────────────────┤
W5 ──────────────────────────────────────────────┘
```

推荐并行开 5 条开发线：W0、W1、W3、W4、W5。W2/W6 由有实际 CLI 和平台的人在 P0 合并候选上执行；W7 只能在候选包、许可和匿名记录模板准备好后开始。W8 最后收口，但可以先清理文档中的旧状态引用。

---

## Task 1: W0 修复 Windows 进程身份和 lost-launcher 测试

**Files:**
- Modify: `src/platform/process-identity.ts`
- Test: `tests/integration/continue.test.ts`
- Test: `tests/targets/process-observation.test.ts`
- Docs: `docs/adr/0011-workspace-run-coordination.md`

**Confirmed failure:** Windows CI 在 `tests/integration/continue.test.ts:34` 期望 handoff 为 `launching`，实际已变为 `unknown`。当前 `processIdentity()` 仅在 Linux/macOS 填充 `boot/start`；Windows 上跨进程观察返回 `unavailable`，`reconcile()` 因此保守转换状态。保守未知本身不能删除，但新进程启动后不应在正常探测窗口内被误判为 owner lost。

**Implementation boundary:** 为 Windows 增加稳定的进程创建时间探测，至少返回 `platform=win32`、PID 和创建时间 token；探测失败仍返回 `unavailable`。不要自动释放占用、不要改变未知态语义。测试子进程必须先写 ready 标记，再由父进程读取状态，避免把 Windows 调度延迟当作产品状态。

- [ ] 写失败回归：Windows 子进程 claim 后，父进程在收到 `claimed` 前后均观察到 `launching`；杀死 owner 后变为 `unknown`，第二次 claim 仍为 `WORKSPACE_BUSY`。
- [ ] 在 Linux/macOS 跑 `npx vitest run tests/integration/continue.test.ts tests/targets/process-observation.test.ts`，预期全部通过。
- [ ] 在 Windows Node24 跑同一命令，预期 lost-launcher 用例通过且没有自动 retry。
- [ ] 更新 ADR，说明 Windows 创建时间探测来源、失败时的保守 unknown 和权限限制。
- [ ] 提交：`fix(runtime): preserve Windows launch ownership until observer loss`。

## Task 2: W1 修复 Windows junction 的边界分类

**Files:**
- Modify: `src/workspace/reader.ts`
- Test: `tests/workspace/snapshot.test.ts`
- Test: `tests/workspace/scope-policy.test.ts`
- Docs: `docs/v0.2/12-workspace-verification.md`

**Confirmed failure:** Windows CI 在 `tests/workspace/snapshot.test.ts:60` 期望 `SYMLINK_OUTSIDE`，实际得到 `READ_FAILED`。当前 `safePath()` 使用 `stat()`，Windows junction 会先被解析为目录；之后越界目标未经过与 POSIX symlink 相同的分类路径。

**Implementation boundary:** 在存在组件检查中使用 `lstat()` 识别 symlink/junction，再用 `realpath()` 计算目标边界；越界只返回 `SYMLINK_OUTSIDE`，内部链接按既有 `SYMLINK_UNSUPPORTED`/链接摘要策略处理，任何目标内容都不能被读取。保留竞态和权限错误的 `READ_FAILED` 分类。

- [ ] 新增 Windows junction 回归：越界 junction 返回 `SYMLINK_OUTSIDE`，外部文件仍可被独立读取且没有被 ThreadPort 读取。
- [ ] 保留 POSIX 文件 symlink、内部链接和 raced file 回归。
- [ ] 在 Windows Node24 跑 `npx vitest run tests/workspace/snapshot.test.ts tests/workspace/scope-policy.test.ts`。
- [ ] 提交：`fix(workspace): classify Windows junction boundaries before reading`。

## Task 3: W2 真实目标 CLI 复测和 R07 传输闭环

**Files:**
- Modify: `docs/verification/agent-matrix-beta.md`
- Modify: `docs/verification/real-codex-macos.json`
- Create: `docs/verification/real-runs/2026-09-*/` 中的匿名元数据文件
- Test: `tests/targets/claude.test.ts`, `tests/targets/codex.test.ts`

**Implementation boundary:** 先用 `inspect()` 固定实际版本、`--help` 输出摘要和能力，不把 binary installed 当成登录或可接续。每次真实运行必须绑定候选提交、安装包 SHA、OS/Node/CLI 版本、native-resume/new-session 模式、canonical cwd、完整人工约束、首次命令结果和目标产物。

- [ ] 记录第一次失败，不覆盖为后续成功；记录是否因绝对路径脱敏、argv、cwd、context transport 或目标版本失败。
- [ ] 复测 Codex→Codex 的失败修复、人工约束保留、工作区变动后重预览三格。
- [ ] 在有 Claude 环境时执行对应 Claude→Claude 和 cross-agent 格；无环境保持 `not_run`，不能写成通过。
- [ ] 用安装包 CLI 检查 `inspect-run`、`recover-run` 和完整 argv 预览；退出 0 不单独视为成功。
- [ ] 提交：`test(real): record candidate-bound target continuation evidence`。

## Task 4: W3 搜索性能专项

**Files:**
- Modify: `src/storage/search-store.ts` 或 `src/search/`（只保留经完整基准证明有效的方案）
- Modify: `scripts/benchmark.mjs`, `scripts/benchmark-profile.mjs`
- Test: `tests/search/service.test.ts`, `tests/indexing/capacity.test.ts`
- Evidence: `docs/verification/performance/`, `docs/verification/performance-beta.md`

**Current evidence:** 基线 API/UI p95 为 468.30/492.50ms；表达式索引实验退化至 2387.61/928.80ms，已撤回。数据库筛选占主要耗时，不能再用微基准推断容量结果。

- [ ] 先写查询计划和阶段计时回归，确认 100 个混合查询的阶段样本不会重复收集。
- [ ] 分别评估候选：候选集缩小、文档投影缓存、SQLite FTS5 可选实验；每个候选使用同一 200MiB/500 session/50,000 event 数据集。
- [ ] 任何候选都必须保留 literal `%`、`_`、反斜杠、NUL 后文本、中文、ASCII folding、AND 查询、筛选和 keyset cursor 语义。
- [ ] 每个候选完成 API、UI、索引、RSS、status、cold start、increment、cancel 全量测量；失败结果也保存。
- [ ] 只有 macOS 与 Ubuntu 都满足声明门槛，才能把 R08 从 HOLD 改为通过；否则写清下一步瓶颈和撤回理由。
- [ ] 提交：`perf(search): reduce fixed-capacity query latency with measured plan`，若无有效方案则只提交测量改进，不伪造性能通过。

## Task 5: W4 内部 Agent 证据协议

**Files:**
- Modify: `src/evidence/observations.ts`, `src/handoff/evidence.ts`
- Modify: `src/adapters/claude.ts`, `src/adapters/codex.ts`（若供应商结构化接口实际可用）
- Test: `tests/evidence/observations.test.ts`, `tests/adapters/claude-source.test.ts`, `tests/adapters/codex-source.test.ts`
- Docs: `docs/adr/0014-observed-command-production.md`

**Implementation boundary:** 外层 `threadport.execution-observation.v1` 保持不变。新增内部证据必须有来源协议、事件 ID、命令/测试状态、工作区快照绑定和环境范围；拿不到结构化结果就输出 unknown。禁止从 assistant prose、turn ended、exit 文本猜测测试通过。

- [ ] 为“无内部结果、pending tool、被中断、部分日志、完整结构化结果”各写 fixture。
- [ ] 验证 inner command/test 的 current、stale、unverified 分类与外层 observation 不混淆。
- [ ] 对 native import 保留缺少历史快照绑定的 unknown；不回填当前工作区证明历史结果。
- [ ] 提交：`feat(evidence): add explicit inner-agent observation contract`。

## Task 6: W5 取得并映射 36 项原始验收规格

**Files:**
- Create: `docs/acceptance/threadport-v0.2-36-scenarios.json`（取得原件后）
- Create: `docs/acceptance/threadport-v0.2-36-scenarios-map.md`
- Modify: `docs/verification/original-acceptance-search-2026-09-16.md`
- Modify: `docs/verification/rc-checklist-v0.2.md`

**Current block:** 本地 Downloads、Desktop、当前项目、旧项目和研究 ZIP 均未找到原始附件。报告正文只说明附件名称和用途，没有 36 条场景正文。

- [ ] 先保存原始附件 SHA-256、来源路径/取得日期和版本，不把报告正文重建成“原始附件”。
- [ ] 为每个场景建立固定列：`scenario_id`、原始要求、代码位置、自动测试、实机证据、平台/Agent、状态、缺口、审查者。
- [ ] 现阶段所有未取得条目标为 `unavailable`，现有 Q01–Q24 和 432 测试不得自动映射为通过。
- [ ] 取得原包后逐项建立映射，并保留首次失败和重测记录。
- [ ] 提交：`docs(acceptance): map original v0.2 scenarios to evidence`。

## Task 7: W6 真实平台矩阵与 W7 用户观察

**Files:**
- Modify: `docs/verification/agent-matrix-beta.md`
- Modify: `docs/verification/user-study-v0.2.md`
- Create: 匿名运行/观察记录，不提交原始日志

- [ ] 在 P0 修复候选上执行 24 格矩阵：macOS/Ubuntu × Claude/Codex 路径 × 3 任务；每格绑定候选 SHA、安装包 SHA、版本、模式、cwd、产物和完整人工约束。
- [ ] 失败格保留首次错误、修复提交和重测结果；目标不可用时写 `not_run` 并附环境证据。
- [ ] 在取得明确许可后观察至少 5 名外部用户；记录准备时间、是否独立完成、实际接续、卡点和许可状态，不收集私人原文日志。
- [ ] 只有至少 4/5 在 5 分钟内独立准备且至少 3/5 完成实际接续，才满足该用户门槛。
- [ ] 提交：`docs(validation): record candidate-bound platform and user evidence`。

## Task 8: W8 R10 文档与发布收口

**Files:**
- Modify: `README.md`
- Modify: `docs/verification/release-0.2.0.md`
- Modify: `docs/verification/development-handoff-v0.2.md`
- Modify: `docs/compatibility.md`
- Modify: `docs/v0.2/04-quality-gates.md`
- Test: `scripts/check-doc-links.mjs`

- [ ] 统一 schema 7、当前候选 SHA、CI 结果、性能 HOLD、真实矩阵和用户观察状态。
- [ ] 删除“已实现”等会掩盖 unknown/HOLD 的措辞，保留历史提交和旧包适用范围。
- [ ] 运行 `npm run check:docs`，预期所有本地目标通过。
- [ ] 只有 W0–W7 的证据满足发布解除条件后，才允许从 HOLD 改为候选发布；本工作包本身不做 merge/release 决策。
- [ ] 提交：`docs(release): align status with candidate-bound evidence`。

## 集成顺序

1. W0 与 W1 完成后重跑 Windows 全套 `npm run check`、`THREADPORT_TEST_CHROME=1 npm run test:e2e` 和 `THREADPORT_TEST_CHROME=1 npm run test:package`。
2. W0/W1 通过后把 PR #58 从 draft 改为 ready，等待 Ubuntu/macOS/Windows CI 全部通过；Windows 仍失败时不进入真实矩阵。
3. W2、W3、W4、W5 可并行开发；W2/W6 的运行证据必须绑定同一个最终候选 SHA。
4. W6、W7 完成后由 W8 更新发布入口；所有未满足条件仍保持 HOLD。
5. 最终候选必须重新执行：

```bash
npm ci
npm run check
THREADPORT_TEST_CHROME=1 npm run test:e2e
THREADPORT_TEST_CHROME=1 THREADPORT_PACKAGE_OUTPUT=output/package-review npm run test:package
THREADPORT_TEST_CHROME=1 node scripts/benchmark.mjs --browser > output/performance/benchmark.json
```

## 发布解除条件

- [ ] PR #58 及后续变更在 Ubuntu、macOS、Windows Node24 CI 全部通过。
- [ ] W2/W6 的真实平台和目标路径证据绑定最终候选，不再使用旧包认证当前代码。
- [ ] 原始 36 场景文件已取得并完成逐项映射；未取得项保持 unavailable。
- [ ] W3 在声明平台达到性能门槛，或维护者记录明确不发布决定。
- [ ] W4 对内层 Agent 证据保持结构化、可追溯和 unknown 安全语义。
- [ ] W7 满足外部用户观察门槛并保留许可/匿名元数据。
- [ ] W8、安装包摘要、schema 7、迁移恢复说明和兼容矩阵一致。

## 风险排序

1. **P0 Windows CI 阻塞**：当前 PR 不能合并；W0/W1 必须先处理。
2. **P1 真实接续证据缺失**：代码通过不代表 Claude/Codex 真实接续可用；需要实际安装和目标版本。
3. **P1 性能超预算**：不能靠索引猜测，必须以固定容量全量样本决定。
4. **P1 原始规格缺失**：没有 36 项原文就不能做逐项合规声明。
5. **P2 用户和发布证据缺失**：外部用户、Ubuntu/Claude/cross-agent 条件需要外部环境和许可。

## 自检结果

- 规格覆盖：R01–R10 的实现、剩余缺口、CI、性能、真实矩阵、36 场景、用户观察和发布条件均有工作包。
- 文件边界：W0/W1/W3/W4/W5 不共享生产文件；W6/W8 只修改验证和文档，避免并行冲突。
- 证据边界：远端 Windows 失败、性能失败、36 场景缺失和 21 个未运行矩阵格均保持原状态，没有用推断改成通过。
- 回滚边界：每个代码包独立提交；schema 7 保持不变；旧数据库程序兼容限制继续明确。
