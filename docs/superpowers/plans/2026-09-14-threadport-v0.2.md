# ThreadPort v0.2 Implementation Plan

**Goal:** 交付本地任务收件箱、Claude/Codex 历史发现与可审查的实际接续闭环。

**Architecture:** 单 npm 包的模块化单体，CLI 与 Web API 共用用例。Source/Target 分离，SQLite 持久化人工状态和可重建索引，Capsule v1 作为兼容投影。

**Tech Stack:** Node 24、TypeScript strict/ESM、npm、Zod 3、Vitest；SQLite/better-sqlite3、React/Vite、Fastify、Playwright 按对应任务引入。

## Global Constraints

- 产品范围与验收以 [v0.2 入口](../../v0.2/README.md) 及其链接文档为准；基线 SHA 为 `31ae6771bbb135bcf690e713c02869136db4b3ca`。
- 一个全职维护者，每次实施一个可验证任务；本计划不要求或依赖外部 Agent 技能。
- 旧 Capsule v1 字段及旧 CLI 格式兼容；Node 门槛在 v0.2 提升到 `>=24.0.0` 并明确发布说明。
- 源日志/源代码/Git 历史只读；只有用户终端确认后才启动目的端，不执行日志里的 next_action。
- 默认无账户、无上传、无遥测、无 LLM 总结、无内嵌终端、无多 Agent 编排。
- 所有 tests 使用合成数据与临时目录；真实认证使用经许可的隔离任务，不能提交私人日志。
- 未实现命令和测试脚本是所属任务产物，不能在进度表里声称已通过。
- 代码步骤是实现规格，接口和示例测试见 [契约](../../v0.2/03-contracts.md)、[质量门](../../v0.2/04-quality-gates.md)；不把此文当未经验证的整套代码补丁。

---

## 1. 阶段门和预估

工时为规划区间，不是交付承诺。全计划约 187–289 个有效工时，按每周25–30小时约7–12周；可优先以第5–8周可演示alpha为检查点，实际取决于真实CLI接入。招募、等待反馈和跨平台设备准备可与开发穿插，日历时间另留1–2周缓冲。每周用已完成任务实耗重估。

| 阶段 | 任务 | 可交付物 | 进入下一阶段的门槛 |
| --- | --- | --- | --- |
| P0 可信基础 | T01–T04 | 路径正确、命令状态正确、事实模型 | 原38项回归+Q01–Q06/Q15相关用例通过 |
| P1 发现与存储 | T05–T07 | 两种来源、可恢复DB、增量索引 | 幂等/截断/取消/来源隔离，目标平台依赖可安装 |
| P2 日常任务 | T08–T10 | 人工任务、搜索、工作区verify | 人工数据不丢，搜索可用，真假匹配分清 |
| P3 接续闭环 | T11–T14 | 本地API、完整预览、终端启动 | fake全闭环+至少一条真实跨Agent路径，可alpha |
| P4 完整体验 | T15–T18 | UI、容量、恢复、四条路径 | 所有必交功能集成，支持矩阵实测，可beta |
| P5 发布与使用 | T19–T21 | 可安装包、用户证据、发布决策 | RC全门槛，L3/L4要求满足，才stable |

T15 是完整UI；P3 alpha可先使用CLI+最小API调试入口，不宣称完整工作台已完成。若alpha必须向无CLI经验者开放，则等T15后再邀请。

## 2. 每项任务的执行步骤

每个任务先按 [工作包交付规则](../../v0.2/11-work-package-delivery.md) 在 Issue 或本地文档展开：工作包 → 提交 → 文件 → 测试 → 回滚。每包一个 PR/main squash 提交，列出上下游依赖和数据兼容；任务内全部包通过后才标 done。复杂实现通常需要数小时，不伪装成一个5分钟动作；先选一个边界案例，用下面的失败→实现→通过循环逐条推进。文档/配置等低影响变更做对应检查，不为了形式编写无意义测试。

每个任务末尾给建议 commit subject；维护者在本地 review 后自行提交，不能让完成标准依赖已经推远端。分支统一 `codex/<task-id>-<slug>`，例如 `codex/t02-portable-paths`。

### T01 · 锁定基线与统一协作入口

**阶段 / 工时 / 依赖：** P0 / 3–5 小时 / 无\
**覆盖：** 全局 / Q24

**文件：** 修改 CONTRIBUTING.md、.github/pull_request_template.md、.github/ISSUE_TEMPLATE/feature_request.yml、docs/DEV-PLAYBOOK.md；必要时修改 package.json / .github/workflows/ci.yml 以建立格式与 lint gate。

**接口：**
- Consumes：当前 HEAD、现有 npm check 与本套文档。
- Produces：可复核的基线记录、旧手册历史标记、符合 v0.2 范围的贡献入口。

**边界：** 仅修文档和开发门槛；不更改 Capsule 和产品行为，不覆盖工作区已有未提交文件。

**必审案例：** 记录 SHA/Node/npm/OS 与 38 项测试基线；模板不再要求所有贡献者冒用同一作者；所有本地文档链接可解析。

- [x] **步骤 1 — 核对输入：** 阅读上述接口、相关源文件和既有测试，在 Issue 写下本任务的 AC 与当前失败行为；记录 HEAD，确认依赖任务已完成。
- [x] **步骤 2 — 建立可失败证据：** 将上述必审案例逐个放入指定测试文件，先运行目标测试，确认失败是待实现行为导致；纯文档任务用链接/模板/基线检查替代新增测试。
- [x] **步骤 3 — 实现一个可观测增量：** 在指定生产模块实现一个案例所需逻辑；遵循输入/输出和错误契约，接好调用方。重复步骤 2/3 直到该任务全部案例覆盖，不增加边界外功能。
- [x] **步骤 4 — 验证交付：** 运行下方命令并保存结果；涉及实机/人工门槛时同时补齐证据，不以自动测试代替。

```bash
npm run check
```

**预期结果：** 构建和当前全部测试通过；如当前 HEAD 已增加测试，以实际数量为准。

- [x] **步骤 5 — 审查与收口：** 执行质量文档 review 顺序，检查 diff、数据去向、兼容与失败恢复；补用户文档。修复 P0/P1，再运行受影响检查，最后运行 `npm run check`。
- [x] **步骤 6 — 提交与交接：** 按本任务边界提交，PR关联 Issue/AC/证据；更新进度表的真实等级、commit与下一步。建议标题：`chore: align contributor guidance with the workspace release`。

**完成门：** 产出接口与调用方实际接通、必审案例通过、没有未解决 P0/P1、文档对应实际行为。阶段涉及发布/实机时，还必须通过该阶段人工 gate，才可标 L3。

### T02 · 修复 portable 路径与证据身份

**阶段 / 工时 / 依赖：** P0 / 5–8 小时 / T01\
**覆盖：** F05 / Q01,Q02

**文件：** 修改 src/adapters/common.ts；新增 src/workspace/paths.ts、tests/workspace/paths.test.ts；扩展 tests/adapters/claude.test.ts 与 codex.test.ts。

**接口：**
- Consumes：path、sourceRoot、sourcePlatform。
- Produces：portablePath(value, sourceRoot, sourcePlatform) 的内部实现；旧 adapter API 不变，外部路径使用 opaque locator。

**边界：** 只修路径语义，不重排 Capsule schema，不把宿主平台当作源平台。

**必审案例：** Q01/Q02：同名文件保留 src/a 与 src/b；POSIX/Windows/UNC/中文/空格/跨盘/仓库外路径；输出中不存在用户家目录。

- [x] **步骤 1 — 核对输入：** 阅读上述接口、相关源文件和既有测试，在 Issue 写下本任务的 AC 与当前失败行为；记录 HEAD，确认依赖任务已完成。
- [x] **步骤 2 — 建立可失败证据：** 将上述必审案例逐个放入指定测试文件，先运行目标测试，确认失败是待实现行为导致；纯文档任务用链接/模板/基线检查替代新增测试。
- [x] **步骤 3 — 实现一个可观测增量：** 在指定生产模块实现一个案例所需逻辑；遵循输入/输出和错误契约，接好调用方。重复步骤 2/3 直到该任务全部案例覆盖，不增加边界外功能。
- [x] **步骤 4 — 验证交付：** 运行下方命令并保存结果；涉及实机/人工门槛时同时补齐证据，不以自动测试代替。

```bash
npm test -- tests/workspace/paths.test.ts tests/adapters/claude.test.ts tests/adapters/codex.test.ts
```

**预期结果：** 全部通过，既有合法 Capsule fixture 继续可解析。

- [x] **步骤 5 — 审查与收口：** 执行质量文档 review 顺序，检查 diff、数据去向、兼容与失败恢复；补用户文档。修复 P0/P1，再运行受影响检查，最后运行 `npm run check`。
- [x] **步骤 6 — 提交与交接：** 按本任务边界提交，PR关联 Issue/AC/证据；更新进度表的真实等级、commit与下一步。建议标题：`fix: preserve portable file identity across source platforms`。

**完成门：** 产出接口与调用方实际接通、必审案例通过、没有未解决 P0/P1、文档对应实际行为。阶段涉及发布/实机时，还必须通过该阶段人工 gate，才可标 L3。

### T03 · 修复逐次命令结果

**阶段 / 工时 / 依赖：** P0 / 5–8 小时 / T01\
**覆盖：** F05 / Q03,Q04

**文件：** 修改 src/adapters/common.ts；新增 src/domain/models.ts、src/domain/command-state.ts、tests/domain/command-state.test.ts。

**接口：**
- Consumes：contracts 定义的 CommandRun[]；旧 CapsuleCommand[] 在兼容层映射，不伪造缺失 cwd。
- Produces：latestCommandRuns(runs: readonly CommandRun[]): CommandRun[]，及正确的 Capsule failures 投影。

**边界：** 保留每次执行，按 session/cwd/command 关联；未识别的测试命令作为一般命令，不假报 passed。

**必审案例：** Q03/Q04；exit 1→0→1 最后失败；1→0 可显示该组最后通过；不同 cwd 不互相解决；null 退出码仍 unknown；npm/pnpm/yarn 常见 test 识别有样例。

- [x] **步骤 1 — 核对输入：** 阅读上述接口、相关源文件和既有测试，在 Issue 写下本任务的 AC 与当前失败行为；记录 HEAD，确认依赖任务已完成。
- [x] **步骤 2 — 建立可失败证据：** 将上述必审案例逐个放入指定测试文件，先运行目标测试，确认失败是待实现行为导致；纯文档任务用链接/模板/基线检查替代新增测试。
- [x] **步骤 3 — 实现一个可观测增量：** 在指定生产模块实现一个案例所需逻辑；遵循输入/输出和错误契约，接好调用方。重复步骤 2/3 直到该任务全部案例覆盖，不增加边界外功能。
- [x] **步骤 4 — 验证交付：** 运行下方命令并保存结果；涉及实机/人工门槛时同时补齐证据，不以自动测试代替。

```bash
npm test -- tests/domain/command-state.test.ts tests/adapters
```

**预期结果：** 最终状态正确，输入数组无修改，全部旧 adapter 回归通过。

- [x] **步骤 5 — 审查与收口：** 执行质量文档 review 顺序，检查 diff、数据去向、兼容与失败恢复；补用户文档。修复 P0/P1，再运行受影响检查，最后运行 `npm run check`。
- [x] **步骤 6 — 提交与交接：** 按本任务边界提交，PR关联 Issue/AC/证据；更新进度表的真实等级、commit与下一步。建议标题：`fix: retain the latest command outcome without losing history`。

**完成门：** 产出接口与调用方实际接通、必审案例通过、没有未解决 P0/P1、文档对应实际行为。阶段涉及发布/实机时，还必须通过该阶段人工 gate，才可标 L3。

### T04 · 建立事实与人工状态模型

**阶段 / 工时 / 依赖：** P0 / 8–12 小时 / T02,T03\
**覆盖：** F04,F05 / Q05,Q06,Q15

**文件：** 新增 src/domain/derive-task.ts、src/domain/errors.ts、tests/domain/derive-task.test.ts；扩展 src/domain/models.ts；调整必要的 common.ts 投影。

**接口：**
- Consumes：NormalizedEvent[]；Claim/Task/DerivedTaskState 定义。
- Produces：deriveTask(events) 纯函数，origin 标签、候选目标、最后命令及 attention。

**边界：** 不引入 LLM；不从 assistant 计划推断用户采纳；不声称旧测试对当前 Git 生效。

**必审案例：** Q05/Q06/Q15；用户修正保留历史引用；中文约束可编辑；没有事实给 unknown；固定输入和时钟重复得到同一结果。

- [x] **步骤 1 — 核对输入：** 阅读上述接口、相关源文件和既有测试，在 Issue 写下本任务的 AC 与当前失败行为；记录 HEAD，确认依赖任务已完成。
- [x] **步骤 2 — 建立可失败证据：** 将上述必审案例逐个放入指定测试文件，先运行目标测试，确认失败是待实现行为导致；纯文档任务用链接/模板/基线检查替代新增测试。
- [x] **步骤 3 — 实现一个可观测增量：** 在指定生产模块实现一个案例所需逻辑；遵循输入/输出和错误契约，接好调用方。重复步骤 2/3 直到该任务全部案例覆盖，不增加边界外功能。
- [x] **步骤 4 — 验证交付：** 运行下方命令并保存结果；涉及实机/人工门槛时同时补齐证据，不以自动测试代替。

```bash
npm test -- tests/domain tests/adapters
```

**预期结果：** 所有状态区分有断言，旧 Capsule 输出继续合法。

- [x] **步骤 5 — 审查与收口：** 执行质量文档 review 顺序，检查 diff、数据去向、兼容与失败恢复；补用户文档。修复 P0/P1，再运行受影响检查，最后运行 `npm run check`。
- [x] **步骤 6 — 提交与交接：** 按本任务边界提交，PR关联 Issue/AC/证据；更新进度表的真实等级、commit与下一步。建议标题：`feat: separate observed evidence from task decisions`。

**完成门：** 产出接口与调用方实际接通、必审案例通过、没有未解决 P0/P1、文档对应实际行为。阶段涉及发布/实机时，还必须通过该阶段人工 gate，才可标 L3。

### T05 · 本地存储与安全迁移

**阶段 / 工时 / 依赖：** P1 / 12–18 小时 / T04\
**覆盖：** F10 / Q21

**文件：** 新增 src/storage/database.ts、migrations.ts、sqlite-store.ts、migrations/001-initial.sql、src/platform/paths.ts；新增 tests/storage/database.test.ts、migrations.test.ts；修改 package.json/package-lock.json/.nvmrc/CI。

**接口：**
- Consumes：contracts 表结构及 domain 模型。
- Produces：事务 Store、user_version=1、迁移备份恢复、Node24 + better-sqlite3 可安装基线。

**边界：** 一个本地 DB，无 ORM/云存储；只在应用数据目录写入。Node 门槛变化须同步文档。

**必审案例：** 临时 DB CRUD/外键/revision；迁移故障注入保留人工数据；旧程序拒绝更高版本；目标平台干净安装原生依赖；锁争用 5 秒上限返回 STORAGE_BUSY。

- [x] **步骤 1 — 核对输入：** 阅读上述接口、相关源文件和既有测试，在 Issue 写下本任务的 AC 与当前失败行为；记录 HEAD，确认依赖任务已完成。
- [x] **步骤 2 — 建立可失败证据：** 将上述必审案例逐个放入指定测试文件，先运行目标测试，确认失败是待实现行为导致；纯文档任务用链接/模板/基线检查替代新增测试。
- [x] **步骤 3 — 实现一个可观测增量：** 在指定生产模块实现一个案例所需逻辑；遵循输入/输出和错误契约，接好调用方。重复步骤 2/3 直到该任务全部案例覆盖，不增加边界外功能。
- [x] **步骤 4 — 验证交付：** 运行下方命令并保存结果；涉及实机/人工门槛时同时补齐证据，不以自动测试代替。

```bash
npm test -- tests/storage
```

**预期结果：** 事务、恢复和约束全部通过；macOS arm64/Ubuntu x64 安装证据附 PR。

- [x] **步骤 5 — 审查与收口：** 执行质量文档 review 顺序，检查 diff、数据去向、兼容与失败恢复；补用户文档。修复 P0/P1，再运行受影响检查，最后运行 `npm run check`。
- [x] **步骤 6 — 提交与交接：** 按本任务边界提交，PR关联 Issue/AC/证据；更新进度表的真实等级、commit与下一步。建议标题：`feat: persist task state with recoverable SQLite migrations`。

**完成门：** 产出接口与调用方实际接通、必审案例通过、没有未解决 P0/P1、文档对应实际行为。阶段涉及发布/实机时，还必须通过该阶段人工 gate，才可标 L3。

### T06 · Claude 来源发现与有界读取

**阶段 / 工时 / 依赖：** P1 / 10–16 小时 / T05\
**覆盖：** F01,F02 / Q07,Q08,Q09

**文件：** 新增 src/sources/contracts.ts、registry.ts、claude-source.ts、jsonl-reader.ts、tests/sources/claude-source.test.ts、jsonl-reader.test.ts；扩展 tests/fixtures/claude/ 和 compatibility/。

**接口：**
- Consumes：SourceAdapter/ReadCursor 接口、用户允许目录、AbortSignal。
- Produces：Claude SourceAdapter；仅可见字段的规范化事件与稳定游标。

**边界：** 扫描允许根目录，无全盘查找；不改旧 extract API；unsupported 格式显式隔离。

**必审案例：** Q07–Q09；半行补全、坏 JSON、超大单行、取消、路径 symlink 越界、无权限、缺 ID、未知字段；fake HOME 诱饵绝不读取。

- [x] **步骤 1 — 核对输入：** 阅读上述接口、相关源文件和既有测试，在 Issue 写下本任务的 AC 与当前失败行为；记录 HEAD，确认依赖任务已完成。
- [x] **步骤 2 — 建立可失败证据：** 将上述必审案例逐个放入指定测试文件，先运行目标测试，确认失败是待实现行为导致；纯文档任务用链接/模板/基线检查替代新增测试。
- [x] **步骤 3 — 实现一个可观测增量：** 在指定生产模块实现一个案例所需逻辑；遵循输入/输出和错误契约，接好调用方。重复步骤 2/3 直到该任务全部案例覆盖，不增加边界外功能。
- [x] **步骤 4 — 验证交付：** 运行下方命令并保存结果；涉及实机/人工门槛时同时补齐证据，不以自动测试代替。

```bash
npm test -- tests/sources/claude-source.test.ts tests/sources/jsonl-reader.test.ts
```

**预期结果：** 扫描范围、长度预算、稳定 ID 和增量边界通过。

- [x] **步骤 5 — 审查与收口：** 执行质量文档 review 顺序，检查 diff、数据去向、兼容与失败恢复；补用户文档。修复 P0/P1，再运行受影响检查，最后运行 `npm run check`。
- [x] **步骤 6 — 提交与交接：** 按本任务边界提交，PR关联 Issue/AC/证据；更新进度表的真实等级、commit与下一步。建议标题：`feat: discover and normalize allowed Claude sessions`。

**完成门：** 产出接口与调用方实际接通、必审案例通过、没有未解决 P0/P1、文档对应实际行为。阶段涉及发布/实机时，还必须通过该阶段人工 gate，才可标 L3。

### T07 · Codex 来源与幂等增量索引

**阶段 / 工时 / 依赖：** P1 / 12–18 小时 / T06\
**覆盖：** F01,F02 / Q07,Q08,Q09

**文件：** 新增 src/sources/codex-source.ts、src/indexing/service.ts、scheduler.ts、tests/sources/codex-source.test.ts、tests/indexing/service.test.ts；扩展 tests/fixtures/codex/ 和 compatibility/。

**接口：**
- Consumes：SourceAdapter、Store、允许来源列表；15 秒调度与手动刷新。
- Produces：两种 source 注册、index job 进度/取消、幂等短事务、来源变化恢复。

**边界：** 并发读最多 2；不覆盖人工字段；同一来源只运行一份 job。

**必审案例：** Q07–Q09；同源双扫描不重复、追加两事件只新增两条、替换截断可重建、源删除留墓碑、部分错误不阻塞另一源、退出重启恢复；批次失败不提交半个游标。

- [x] **步骤 1 — 核对输入：** 阅读上述接口、相关源文件和既有测试，在 Issue 写下本任务的 AC 与当前失败行为；记录 HEAD，确认依赖任务已完成。
- [x] **步骤 2 — 建立可失败证据：** 将上述必审案例逐个放入指定测试文件，先运行目标测试，确认失败是待实现行为导致；纯文档任务用链接/模板/基线检查替代新增测试。
- [x] **步骤 3 — 实现一个可观测增量：** 在指定生产模块实现一个案例所需逻辑；遵循输入/输出和错误契约，接好调用方。重复步骤 2/3 直到该任务全部案例覆盖，不增加边界外功能。
- [x] **步骤 4 — 验证交付：** 运行下方命令并保存结果；涉及实机/人工门槛时同时补齐证据，不以自动测试代替。

```bash
npm test -- tests/sources tests/indexing
```

**预期结果：** 两类来源相同契约通过，源文件摘要保持不变。

- [x] **步骤 5 — 审查与收口：** 执行质量文档 review 顺序，检查 diff、数据去向、兼容与失败恢复；补用户文档。修复 P0/P1，再运行受影响检查，最后运行 `npm run check`。
- [x] **步骤 6 — 提交与交接：** 按本任务边界提交，PR关联 Issue/AC/证据；更新进度表的真实等级、commit与下一步。建议标题：`feat: index Claude and Codex sessions incrementally`。

**完成门：** 产出接口与调用方实际接通、必审案例通过、没有未解决 P0/P1、文档对应实际行为。阶段涉及发布/实机时，还必须通过该阶段人工 gate，才可标 L3。

### T08 · 可编辑任务与会话关联

**阶段 / 工时 / 依赖：** P2 / 10–14 小时 / T07\
**覆盖：** F04 / Q06,Q10,Q22

**文件：** 新增 src/tasks/contracts.ts、service.ts、tests/tasks/service.test.ts；扩展 src/storage/sqlite-store.ts 和模型。

**接口：**
- Consumes：TaskService、TaskPatch、SessionRecord、Project/Workspace 绑定。
- Produces：创建/编辑/生命周期/归档、attach/detach、revision 冲突和人工修订历史。

**边界：** 默认未归类，不自动语义合并；一个 session 最多一个 task，跨 project 拒绝。

**必审案例：** Q06/Q10/Q22；重扫保留人工目标；两个标签模拟并发更新第二个 409；关联/移除原子性；已完成新活动只加提醒；归档可撤回。

- [x] **步骤 1 — 核对输入：** 阅读上述接口、相关源文件和既有测试，在 Issue 写下本任务的 AC 与当前失败行为；记录 HEAD，确认依赖任务已完成。
- [x] **步骤 2 — 建立可失败证据：** 将上述必审案例逐个放入指定测试文件，先运行目标测试，确认失败是待实现行为导致；纯文档任务用链接/模板/基线检查替代新增测试。
- [x] **步骤 3 — 实现一个可观测增量：** 在指定生产模块实现一个案例所需逻辑；遵循输入/输出和错误契约，接好调用方。重复步骤 2/3 直到该任务全部案例覆盖，不增加边界外功能。
- [x] **步骤 4 — 验证交付：** 运行下方命令并保存结果；涉及实机/人工门槛时同时补齐证据，不以自动测试代替。

```bash
npm test -- tests/tasks/service.test.ts tests/storage
```

**预期结果：** 事务和人工状态保护通过，所有写入进行输入长度校验。

- [x] **步骤 5 — 审查与收口：** 执行质量文档 review 顺序，检查 diff、数据去向、兼容与失败恢复；补用户文档。修复 P0/P1，再运行受影响检查，最后运行 `npm run check`。
- [x] **步骤 6 — 提交与交接：** 按本任务边界提交，PR关联 Issue/AC/证据；更新进度表的真实等级、commit与下一步。建议标题：`feat: manage tasks without overwriting user decisions`。

**完成门：** 产出接口与调用方实际接通、必审案例通过、没有未解决 P0/P1、文档对应实际行为。阶段涉及发布/实机时，还必须通过该阶段人工 gate，才可标 L3。

### T09 · 中英文历史检索与分页

**阶段 / 工时 / 依赖：** P2 / 6–10 小时 / T08\
**覆盖：** F03 / Q11

**文件：** 新增 src/search/service.ts、tests/search/service.test.ts；扩展 sqlite-store 查询；新增搜索容量合成数据。

**接口：**
- Consumes：q/projectId/agent/from/to/cursor/limit；仅脱敏 event search_text。
- Produces：稳定分页、组合过滤、匹配片段和任务关联结果。

**边界：** 确定性文字检索；无语义搜索、无 SQL 语法透传；最多每页 100。

**必审案例：** Q11；中文子串、英文大小写、同名目录、路径、空结果、无效日期、SQL wildcard 字面量、重复分页；密钥/hidden 内容无命中。

- [x] **步骤 1 — 核对输入：** 阅读上述接口、相关源文件和既有测试，在 Issue 写下本任务的 AC 与当前失败行为；记录 HEAD，确认依赖任务已完成。
- [x] **步骤 2 — 建立可失败证据：** 将上述必审案例逐个放入指定测试文件，先运行目标测试，确认失败是待实现行为导致；纯文档任务用链接/模板/基线检查替代新增测试。
- [x] **步骤 3 — 实现一个可观测增量：** 在指定生产模块实现一个案例所需逻辑；遵循输入/输出和错误契约，接好调用方。重复步骤 2/3 直到该任务全部案例覆盖，不增加边界外功能。
- [x] **步骤 4 — 验证交付：** 运行下方命令并保存结果；涉及实机/人工门槛时同时补齐证据，不以自动测试代替。

```bash
npm test -- tests/search/service.test.ts
```

**预期结果：** 固定数据能定位正确会话，分页无重复遗漏，过滤结果可解释。

- [x] **步骤 5 — 审查与收口：** 执行质量文档 review 顺序，检查 diff、数据去向、兼容与失败恢复；补用户文档。修复 P0/P1，再运行受影响检查，最后运行 `npm run check`。
- [x] **步骤 6 — 提交与交接：** 按本任务边界提交，PR关联 Issue/AC/证据；更新进度表的真实等级、commit与下一步。建议标题：`feat: search task history with stable multilingual filters`。

**完成门：** 产出接口与调用方实际接通、必审案例通过、没有未解决 P0/P1、文档对应实际行为。阶段涉及发布/实机时，还必须通过该阶段人工 gate，才可标 L3。

### T10 · 工作区快照与显式验证

**执行拆分：** 按 [T10-A 捕获 / T10-B 比较 / T10-C CLI 工作包计划](2026-09-14-t10-work-packages.md) 逐包提交、推送、PR、CI 与合并；以下仍是总任务验收；A/B 已合并，C 已实现并完成本地验证；实际交付与合并证据见包计划及 PR。

**阶段 / 工时 / 依赖：** P2 / 12–18 小时 / T02,T05,T08\
**覆盖：** F06 / Q12,Q13,Q14,Q15

**文件：** 新增 src/workspace/snapshot.ts、verify.ts、tests/workspace/verify.test.ts；修改 src/git.ts、src/cli.ts；扩展 tests/cli.test.ts。

**接口：**
- Consumes：WorkspaceSnapshot、VerificationReport、已绑定 Workspace；现有 Capsule 输入。
- Produces：verifyWorkspace(snapshot, workspace) 报告；新增 verify CLI，旧 validate 保持 schema-only。

**边界：** 只读 Git/文件；不创建历史测试快照；捕获超限不可读返回 unverifiable。

**必审案例：** Q12–Q15；portable .、不同 root 绑定、wrong repo、无 commit、detached HEAD、untracked、改 HEAD、符号链接、并发读写、超限；源目录不变。

- [x] **步骤 1 — 核对输入：** 阅读上述接口、相关源文件和既有测试，在 Issue 写下本任务的 AC 与当前失败行为；记录 HEAD，确认依赖任务已完成。
- [x] **步骤 2 — 建立可失败证据：** 将上述必审案例逐个放入指定测试文件，先运行目标测试，确认失败是待实现行为导致；纯文档任务用链接/模板/基线检查替代新增测试。
- [x] **步骤 3 — 实现一个可观测增量：** 在指定生产模块实现一个案例所需逻辑；遵循输入/输出和错误契约，接好调用方。重复步骤 2/3 直到该任务全部案例覆盖，不增加边界外功能。
- [x] **步骤 4 — 验证交付：** 运行下方命令并保存结果；涉及实机/人工门槛时同时补齐证据，不以自动测试代替。

```bash
npm test -- tests/workspace tests/git.test.ts tests/cli.test.ts
```

**预期结果：** matched/drifted/unverifiable 与 CLI 退出码一致，没有假 matched。

- [x] **步骤 5 — 审查与收口：** 执行质量文档 review 顺序，检查 diff、数据去向、兼容与失败恢复；补用户文档。修复 P0/P1，再运行受影响检查，最后运行 `npm run check`。
- [x] **步骤 6 — 提交与交接：** 按本任务边界提交，PR关联 Issue/AC/证据；更新进度表的真实等级、commit与下一步。建议标题：`feat: verify captured workspaces with explicit uncertainty`。

**完成门：** 产出接口与调用方实际接通、必审案例通过、没有未解决 P0/P1、文档对应实际行为。阶段涉及发布/实机时，还必须通过该阶段人工 gate，才可标 L3。

### T11 · 本地认证 API 与服务生命周期

**执行拆分：** 按 [A 服务基础 / B 业务路由 / C CLI 工作包计划](2026-09-14-t11-work-packages.md) 独立交付；A 已合并，B 已实现；不代表全部 T11 完成。

**阶段 / 工时 / 依赖：** P3 / 10–16 小时 / T07,T08,T09,T10\
**覆盖：** F01,F03,F04 / Q19

**文件：** 新增 src/server/app.ts、auth.ts、routes.ts、schemas.ts、tests/server/app.test.ts；修改 src/cli.ts 与 package manifest 添加 Fastify。

**接口：**
- Consumes：现有应用用例、API v1 契约、私有 source/workspace DTO 规则。
- Produces：loopback 服务、token/Host/Origin 防护、ui 命令基础、index/tasks/search/status 路由。

**边界：** 服务端不直接启动 Agent，不提供任意文件读取端点；请求体≤1MiB。后续 handoff 路由随 T12 接入。

**必审案例：** Q19；无/错 token、恶意 origin、null origin、错误 Host、遍历路径、超限 body、未知字段；shutdown 取消索引关 DB；敏感字段不进入 DTO。

- [ ] **步骤 1 — 核对输入：** 阅读上述接口、相关源文件和既有测试，在 Issue 写下本任务的 AC 与当前失败行为；记录 HEAD，确认依赖任务已完成。
- [ ] **步骤 2 — 建立可失败证据：** 将上述必审案例逐个放入指定测试文件，先运行目标测试，确认失败是待实现行为导致；纯文档任务用链接/模板/基线检查替代新增测试。
- [ ] **步骤 3 — 实现一个可观测增量：** 在指定生产模块实现一个案例所需逻辑；遵循输入/输出和错误契约，接好调用方。重复步骤 2/3 直到该任务全部案例覆盖，不增加边界外功能。
- [ ] **步骤 4 — 验证交付：** 运行下方命令并保存结果；涉及实机/人工门槛时同时补齐证据，不以自动测试代替。

```bash
npm test -- tests/server/app.test.ts
```

**预期结果：** 正向 API 与所有边界拒绝场景通过；生产不使用宽松 CORS。

- [ ] **步骤 5 — 审查与收口：** 执行质量文档 review 顺序，检查 diff、数据去向、兼容与失败恢复；补用户文档。修复 P0/P1，再运行受影响检查，最后运行 `npm run check`。
- [ ] **步骤 6 — 提交与交接：** 按本任务边界提交，PR关联 Issue/AC/证据；更新进度表的真实等级、commit与下一步。建议标题：`feat: expose task workflows through a protected local API`。

**完成门：** 产出接口与调用方实际接通、必审案例通过、没有未解决 P0/P1、文档对应实际行为。阶段涉及发布/实机时，还必须通过该阶段人工 gate，才可标 L3。

### T12 · 不可变交接包和完整预览

**阶段 / 工时 / 依赖：** P3 / 10–16 小时 / T10,T11\
**覆盖：** F07,F09 / Q16

**文件：** 新增 src/handoff/contracts.ts、prepare.ts、confirm.ts、export.ts、tests/handoff/prepare.test.ts、confirm.test.ts；扩展 server/routes.ts 和 CLI prepare。

**接口：**
- Consumes：Task revision、来源 session、WorkspaceSnapshot、Target、Capsule v1 投影。
- Produces：TaskHandoff 新协议、32KiB 文本预算、摘要绑定、15 分钟期限、API confirm。

**边界：** 不修改旧 handoff 格式；目标和人工约束不得静默截断；确认仅准备启动命令。

**必审案例：** Q16；目标/包/工作区修改、过期；drift/unknown 明确确认；unicode 字节预算；省略证据清单；完整 prompt 与实际输出一致。

- [ ] **步骤 1 — 核对输入：** 阅读上述接口、相关源文件和既有测试，在 Issue 写下本任务的 AC 与当前失败行为；记录 HEAD，确认依赖任务已完成。
- [ ] **步骤 2 — 建立可失败证据：** 将上述必审案例逐个放入指定测试文件，先运行目标测试，确认失败是待实现行为导致；纯文档任务用链接/模板/基线检查替代新增测试。
- [ ] **步骤 3 — 实现一个可观测增量：** 在指定生产模块实现一个案例所需逻辑；遵循输入/输出和错误契约，接好调用方。重复步骤 2/3 直到该任务全部案例覆盖，不增加边界外功能。
- [ ] **步骤 4 — 验证交付：** 运行下方命令并保存结果；涉及实机/人工门槛时同时补齐证据，不以自动测试代替。

```bash
npm test -- tests/handoff tests/server/app.test.ts tests/cli.test.ts
```

**预期结果：** 不可变包、确认失效及旧 CLI 兼容通过。

- [ ] **步骤 5 — 审查与收口：** 执行质量文档 review 顺序，检查 diff、数据去向、兼容与失败恢复；补用户文档。修复 P0/P1，再运行受影响检查，最后运行 `npm run check`。
- [ ] **步骤 6 — 提交与交接：** 按本任务边界提交，PR关联 Issue/AC/证据；更新进度表的真实等级、commit与下一步。建议标题：`feat: prepare reviewable task handoffs with expiry and digests`。

**完成门：** 产出接口与调用方实际接通、必审案例通过、没有未解决 P0/P1、文档对应实际行为。阶段涉及发布/实机时，还必须通过该阶段人工 gate，才可标 L3。

### T13 · 独立目的端能力与启动规格

**阶段 / 工时 / 依赖：** P3 / 10–16 小时 / T12\
**覆盖：** F08 / Q17,Q18

**文件：** 新增 src/targets/contracts.ts、registry.ts、detect.ts、claude.ts、codex.ts、tests/targets/runners.test.ts；更新 src/targets.ts facade；新增 docs/compatibility.md。

**接口：**
- Consumes：TargetRunner/Capability、指定版本 CLI help/version、TaskHandoff。
- Produces：两个独立 runner 的 LaunchSpec；未知/不支持版本明确降级。

**边界：** 本任务构造并验证 LaunchSpec，不默认假设 prompt-file；不修改认证或 Agent 权限设置。

**必审案例：** Q17/Q18；fake executable 检查探测与 argv；合法/未知版本、缺失、空格路径、恶意 payload；实测 CLI 参数证据；native resume 与新上下文可共存或明确降级。

- [ ] **步骤 1 — 核对输入：** 阅读上述接口、相关源文件和既有测试，在 Issue 写下本任务的 AC 与当前失败行为；记录 HEAD，确认依赖任务已完成。
- [ ] **步骤 2 — 建立可失败证据：** 将上述必审案例逐个放入指定测试文件，先运行目标测试，确认失败是待实现行为导致；纯文档任务用链接/模板/基线检查替代新增测试。
- [ ] **步骤 3 — 实现一个可观测增量：** 在指定生产模块实现一个案例所需逻辑；遵循输入/输出和错误契约，接好调用方。重复步骤 2/3 直到该任务全部案例覆盖，不增加边界外功能。
- [ ] **步骤 4 — 验证交付：** 运行下方命令并保存结果；涉及实机/人工门槛时同时补齐证据，不以自动测试代替。

```bash
npm test -- tests/targets/runners.test.ts
```

**预期结果：** 矩阵能力与实际参数一致；没有把 which 成功当认证成功。

- [ ] **步骤 5 — 审查与收口：** 执行质量文档 review 顺序，检查 diff、数据去向、兼容与失败恢复；补用户文档。修复 P0/P1，再运行受影响检查，最后运行 `npm run check`。
- [ ] **步骤 6 — 提交与交接：** 按本任务边界提交，PR关联 Issue/AC/证据；更新进度表的真实等级、commit与下一步。建议标题：`feat: model verified Claude and Codex launch capabilities`。

**完成门：** 产出接口与调用方实际接通、必审案例通过、没有未解决 P0/P1、文档对应实际行为。阶段涉及发布/实机时，还必须通过该阶段人工 gate，才可标 L3。

### T14 · 终端确认与实际启动闭环

**阶段 / 工时 / 依赖：** P3 / 10–16 小时 / T13\
**覆盖：** F08 / Q16,Q17,Q18

**文件：** 新增 src/targets/launch.ts、src/platform/process.ts、tests/targets/launch.test.ts、tests/integration/continue.test.ts；扩展 src/cli.ts 和 launch_attempt 存储。

**接口：**
- Consumes：已确认 TaskHandoff、完整包摘要、TTY、TargetRunner。
- Produces：continue CLI：复验→终端确认→spawn(shell:false)→记录退出/取消/中断。

**边界：** 只消费应用 ID，不执行 next_action；不内嵌 PTY，无 --yes；同包禁止重复自动启动。

**必审案例：** Q16–Q18；变更拒绝、过期拒绝、stdin/argv/file 模式准确、非 TTY、Ctrl-C、目标非零退出、进程中断、两个进程同时抢启动，只有一个执行；隔离项目至少一条真实跨 Agent 路径。

- [ ] **步骤 1 — 核对输入：** 阅读上述接口、相关源文件和既有测试，在 Issue 写下本任务的 AC 与当前失败行为；记录 HEAD，确认依赖任务已完成。
- [ ] **步骤 2 — 建立可失败证据：** 将上述必审案例逐个放入指定测试文件，先运行目标测试，确认失败是待实现行为导致；纯文档任务用链接/模板/基线检查替代新增测试。
- [ ] **步骤 3 — 实现一个可观测增量：** 在指定生产模块实现一个案例所需逻辑；遵循输入/输出和错误契约，接好调用方。重复步骤 2/3 直到该任务全部案例覆盖，不增加边界外功能。
- [ ] **步骤 4 — 验证交付：** 运行下方命令并保存结果；涉及实机/人工门槛时同时补齐证据，不以自动测试代替。

```bash
npm test -- tests/targets tests/integration/continue.test.ts tests/cli.test.ts
```

**预期结果：** fake 进程闭环通过，附至少一条真实接续证据，可发布受限 alpha。

- [ ] **步骤 5 — 审查与收口：** 执行质量文档 review 顺序，检查 diff、数据去向、兼容与失败恢复；补用户文档。修复 P0/P1，再运行受影响检查，最后运行 `npm run check`。
- [ ] **步骤 6 — 提交与交接：** 按本任务边界提交，PR关联 Issue/AC/证据；更新进度表的真实等级、commit与下一步。建议标题：`feat: continue reviewed tasks in the users terminal`。

**完成门：** 产出接口与调用方实际接通、必审案例通过、没有未解决 P0/P1、文档对应实际行为。阶段涉及发布/实机时，还必须通过该阶段人工 gate，才可标 L3。

### T15 · 三屏工作台和首次使用流程

**阶段 / 工时 / 依赖：** P4 / 16–24 小时 / T11,T12,T14\
**覆盖：** F01,F03,F04,F05,F07 / Q19,Q20

**文件：** 新增 web/index.html、vite.config.ts、src/app.tsx、api.ts、styles.css、features/{onboarding,inbox,task,handoff,settings}/；新增 tests/e2e/workspace.spec.ts、playwright.config.ts；调整 tsconfig 和构建脚本。

**接口：**
- Consumes：API v1、产品页面表、空/错误/漂移/unknown 状态。
- Produces：可操作 onboarding、任务首页、详情编辑、接续预览与复制命令；离线 production assets。

**边界：** 不内嵌终端、不引入账户和新设计系统依赖；显示 derived 与人工字段来源。

**必审案例：** Q19/Q20；键盘完整流程，1280×800/1440×900/768px；加载/空/失败/冲突；恶意 HTML 不执行；双击不重复提交；刷新保留查询；实际预览全文可读。

- [ ] **步骤 1 — 核对输入：** 阅读上述接口、相关源文件和既有测试，在 Issue 写下本任务的 AC 与当前失败行为；记录 HEAD，确认依赖任务已完成。
- [ ] **步骤 2 — 建立可失败证据：** 将上述必审案例逐个放入指定测试文件，先运行目标测试，确认失败是待实现行为导致；纯文档任务用链接/模板/基线检查替代新增测试。
- [ ] **步骤 3 — 实现一个可观测增量：** 在指定生产模块实现一个案例所需逻辑；遵循输入/输出和错误契约，接好调用方。重复步骤 2/3 直到该任务全部案例覆盖，不增加边界外功能。
- [ ] **步骤 4 — 验证交付：** 运行下方命令并保存结果；涉及实机/人工门槛时同时补齐证据，不以自动测试代替。

```bash
npm run check
npm run test:e2e
```

**预期结果：** 核心合成数据用户流程通过；UI 手动查看无内容裁切/不可达操作。

- [ ] **步骤 5 — 审查与收口：** 执行质量文档 review 顺序，检查 diff、数据去向、兼容与失败恢复；补用户文档。修复 P0/P1，再运行受影响检查，最后运行 `npm run check`。
- [ ] **步骤 6 — 提交与交接：** 按本任务边界提交，PR关联 Issue/AC/证据；更新进度表的真实等级、commit与下一步。建议标题：`feat: deliver the local task workspace user flow`。

**完成门：** 产出接口与调用方实际接通、必审案例通过、没有未解决 P0/P1、文档对应实际行为。阶段涉及发布/实机时，还必须通过该阶段人工 gate，才可标 L3。

### T16 · 容量、响应和取消优化

**阶段 / 工时 / 依赖：** P4 / 8–12 小时 / T15\
**覆盖：** F02,F03 / 性能门

**文件：** 新增 scripts/benchmark.mjs、tests/indexing/capacity.test.ts；按性能证据调整 indexing/search/server；保存 docs/verification/performance-beta.md。

**接口：**
- Consumes：质量文档的固定容量、参考机器和响应预算。
- Produces：可复现生成器、benchmark JSON、资源上限与取消证据。

**边界：** 不以优化名义改行为/削弱中文搜索；达不到预算先定位慢查询/阻塞，再决定是否需要 worker 或新索引。

**必审案例：** 200MiB/500sessions/50k events 索引、100次混合查询、索引时 status 延迟、内存峰值、取消≤2秒；超1GiB/100k events 时明确限额。

- [ ] **步骤 1 — 核对输入：** 阅读上述接口、相关源文件和既有测试，在 Issue 写下本任务的 AC 与当前失败行为；记录 HEAD，确认依赖任务已完成。
- [ ] **步骤 2 — 建立可失败证据：** 将上述必审案例逐个放入指定测试文件，先运行目标测试，确认失败是待实现行为导致；纯文档任务用链接/模板/基线检查替代新增测试。
- [ ] **步骤 3 — 实现一个可观测增量：** 在指定生产模块实现一个案例所需逻辑；遵循输入/输出和错误契约，接好调用方。重复步骤 2/3 直到该任务全部案例覆盖，不增加边界外功能。
- [ ] **步骤 4 — 验证交付：** 运行下方命令并保存结果；涉及实机/人工门槛时同时补齐证据，不以自动测试代替。

```bash
npm test -- tests/indexing/capacity.test.ts
npm run bench
```

**预期结果：** 固定平台满足预算或明确 hold；不能用小样本掩盖大输入无界读取。

- [ ] **步骤 5 — 审查与收口：** 执行质量文档 review 顺序，检查 diff、数据去向、兼容与失败恢复；补用户文档。修复 P0/P1，再运行受影响检查，最后运行 `npm run check`。
- [ ] **步骤 6 — 提交与交接：** 按本任务边界提交，PR关联 Issue/AC/证据；更新进度表的真实等级、commit与下一步。建议标题：`perf: bound indexing work and verify interactive response times`。

**完成门：** 产出接口与调用方实际接通、必审案例通过、没有未解决 P0/P1、文档对应实际行为。阶段涉及发布/实机时，还必须通过该阶段人工 gate，才可标 L3。

### T17 · 清理、导出与失败恢复

**阶段 / 工时 / 依赖：** P4 / 8–12 小时 / T12,T15\
**覆盖：** F09,F10 / Q21,Q22

**文件：** 新增 src/diagnostics/service.ts、src/platform/atomic-write.ts、tests/integration/data-lifecycle.test.ts、tests/handoff/export.test.ts；接入 settings/doctor/export API。

**接口：**
- Consumes：数据寿命、诊断字段白名单、Task/Session 墓碑规则。
- Produces：清索引/撤来源/重建/删全部数据、诊断预览、原子导出与保留期清理。

**边界：** 源文件零修改；默认不覆盖输出；取消清理无副作用。

**必审案例：** Q21/Q22；磁盘失败、已有文件、并发写、迁移恢复；人工修订保留；重建关联恢复；删除前后源目录摘要相同；token 和私密路径不出现在诊断。

- [ ] **步骤 1 — 核对输入：** 阅读上述接口、相关源文件和既有测试，在 Issue 写下本任务的 AC 与当前失败行为；记录 HEAD，确认依赖任务已完成。
- [ ] **步骤 2 — 建立可失败证据：** 将上述必审案例逐个放入指定测试文件，先运行目标测试，确认失败是待实现行为导致；纯文档任务用链接/模板/基线检查替代新增测试。
- [ ] **步骤 3 — 实现一个可观测增量：** 在指定生产模块实现一个案例所需逻辑；遵循输入/输出和错误契约，接好调用方。重复步骤 2/3 直到该任务全部案例覆盖，不增加边界外功能。
- [ ] **步骤 4 — 验证交付：** 运行下方命令并保存结果；涉及实机/人工门槛时同时补齐证据，不以自动测试代替。

```bash
npm test -- tests/integration/data-lifecycle.test.ts tests/handoff/export.test.ts
```

**预期结果：** 清理影响和 UI 说明一致，无丢失人工数据或源文件修改。

- [ ] **步骤 5 — 审查与收口：** 执行质量文档 review 顺序，检查 diff、数据去向、兼容与失败恢复；补用户文档。修复 P0/P1，再运行受影响检查，最后运行 `npm run check`。
- [ ] **步骤 6 — 提交与交接：** 按本任务边界提交，PR关联 Issue/AC/证据；更新进度表的真实等级、commit与下一步。建议标题：`feat: manage local data and exports with explicit recovery`。

**完成门：** 产出接口与调用方实际接通、必审案例通过、没有未解决 P0/P1、文档对应实际行为。阶段涉及发布/实机时，还必须通过该阶段人工 gate，才可标 L3。

### T18 · 真实 Agent 与平台兼容认证

**阶段 / 工时 / 依赖：** P4 / 12–20 小时 / T14,T15,T16,T17\
**覆盖：** F08 / Q23

**文件：** 更新 docs/compatibility.md；新增 docs/verification/agent-matrix-beta.md；根据失败补 source/runner fixture 和测试。

**接口：**
- Consumes：待发布 SHA、两个目标平台、四条接续路径、三个隔离任务。
- Produces：逐版本认证矩阵、成功与失败证据、明确支持/降级声明。

**边界：** 不能只用 synthetic E2E 代替；不把私人日志提交仓库；不为了通过设 bypass 权限。

**必审案例：** Q23：两个平台×四条路径×三个任务；目录正确、人工约束保留、下一步实际完成；同 Agent 恢复/新会话模式分别记录。

- [ ] **步骤 1 — 核对输入：** 阅读上述接口、相关源文件和既有测试，在 Issue 写下本任务的 AC 与当前失败行为；记录 HEAD，确认依赖任务已完成。
- [ ] **步骤 2 — 建立可失败证据：** 将上述必审案例逐个放入指定测试文件，先运行目标测试，确认失败是待实现行为导致；纯文档任务用链接/模板/基线检查替代新增测试。
- [ ] **步骤 3 — 实现一个可观测增量：** 在指定生产模块实现一个案例所需逻辑；遵循输入/输出和错误契约，接好调用方。重复步骤 2/3 直到该任务全部案例覆盖，不增加边界外功能。
- [ ] **步骤 4 — 验证交付：** 运行下方命令并保存结果；涉及实机/人工门槛时同时补齐证据，不以自动测试代替。

```bash
npm run check
npm run test:e2e
```

**预期结果：** 自动化通过且人工矩阵有版本/结果；核心失败阻断 beta 完成。

- [ ] **步骤 5 — 审查与收口：** 执行质量文档 review 顺序，检查 diff、数据去向、兼容与失败恢复；补用户文档。修复 P0/P1，再运行受影响检查，最后运行 `npm run check`。
- [ ] **步骤 6 — 提交与交接：** 按本任务边界提交，PR关联 Issue/AC/证据；更新进度表的真实等级、commit与下一步。建议标题：`test: certify task continuation across supported agents`。

**完成门：** 产出接口与调用方实际接通、必审案例通过、没有未解决 P0/P1、文档对应实际行为。阶段涉及发布/实机时，还必须通过该阶段人工 gate，才可标 L3。

### T19 · 发布包装与迁移说明

**阶段 / 工时 / 依赖：** P5 / 8–12 小时 / T18\
**覆盖：** 全部 / Q24

**文件：** 新增 scripts/package-smoke.mjs、发布检查配置；修改 package.json files/exports/bin、README.md、CONTRIBUTING.md、.github/workflows/ci.yml；新增 docs/verification/package-rc.md。

**接口：**
- Consumes：已验证 SHA、版本矩阵、npm 包名所有权和干净机器。
- Produces：可安装 tarball、完整静态资源、Node24迁移说明、用户 quickstart 和 RC 记录。

**边界：** 先本地产物与验证，不因为写了发布计划就自动 npm publish/push tag；不打包 research 或真实日志。

**必审案例：** Q24：临时目录安装产物、native dependency、CLI帮助/旧命令/UI/库types/import无副作用；包清单与sha；断网打开已有任务。

- [ ] **步骤 1 — 核对输入：** 阅读上述接口、相关源文件和既有测试，在 Issue 写下本任务的 AC 与当前失败行为；记录 HEAD，确认依赖任务已完成。
- [ ] **步骤 2 — 建立可失败证据：** 将上述必审案例逐个放入指定测试文件，先运行目标测试，确认失败是待实现行为导致；纯文档任务用链接/模板/基线检查替代新增测试。
- [ ] **步骤 3 — 实现一个可观测增量：** 在指定生产模块实现一个案例所需逻辑；遵循输入/输出和错误契约，接好调用方。重复步骤 2/3 直到该任务全部案例覆盖，不增加边界外功能。
- [ ] **步骤 4 — 验证交付：** 运行下方命令并保存结果；涉及实机/人工门槛时同时补齐证据，不以自动测试代替。

```bash
npm run test:package
npm run check
```

**预期结果：** 声明平台安装成功；README 命令与实际包名/产物相符。

- [ ] **步骤 5 — 审查与收口：** 执行质量文档 review 顺序，检查 diff、数据去向、兼容与失败恢复；补用户文档。修复 P0/P1，再运行受影响检查，最后运行 `npm run check`。
- [ ] **步骤 6 — 提交与交接：** 按本任务边界提交，PR关联 Issue/AC/证据；更新进度表的真实等级、commit与下一步。建议标题：`build: package a verifiable workspace release`。

**完成门：** 产出接口与调用方实际接通、必审案例通过、没有未解决 P0/P1、文档对应实际行为。阶段涉及发布/实机时，还必须通过该阶段人工 gate，才可标 L3。

### T20 · 外部用户可用性与首发素材

**阶段 / 工时 / 依赖：** P5 / 8–12 小时 / T19\
**覆盖：** L4 / 用户门

**文件：** 新增 docs/verification/user-study-v0.2.md、docs/demo/README.md；更新 README 英文首屏/已知限制；必要修复回到所属模块小 PR。

**接口：**
- Consumes：RC安装包、5名独立目标用户、匿名观察表、明确许可。
- Produces：首次体验结果、卡点与修复证据、30–45秒真实demo、3–5个可贡献Issue草稿。

**边界：** 观察真实使用，不代替用户操作、不把demo当激活、不发布未经测量提升百分比。

**必审案例：** 至少4/5在5分钟内找到真实会话并准备接续、至少3/5实际继续；未达先修最大阻碍再重试，保留失败记录。

- [ ] **步骤 1 — 核对输入：** 阅读上述接口、相关源文件和既有测试，在 Issue 写下本任务的 AC 与当前失败行为；记录 HEAD，确认依赖任务已完成。
- [ ] **步骤 2 — 建立可失败证据：** 将上述必审案例逐个放入指定测试文件，先运行目标测试，确认失败是待实现行为导致；纯文档任务用链接/模板/基线检查替代新增测试。
- [ ] **步骤 3 — 实现一个可观测增量：** 在指定生产模块实现一个案例所需逻辑；遵循输入/输出和错误契约，接好调用方。重复步骤 2/3 直到该任务全部案例覆盖，不增加边界外功能。
- [ ] **步骤 4 — 验证交付：** 运行下方命令并保存结果；涉及实机/人工门槛时同时补齐证据，不以自动测试代替。

```bash
npm run test:package
```

**预期结果：** 包入口可用；人工用户门槛单独记录，不能用自动测试覆盖。

- [ ] **步骤 5 — 审查与收口：** 执行质量文档 review 顺序，检查 diff、数据去向、兼容与失败恢复；补用户文档。修复 P0/P1，再运行受影响检查，最后运行 `npm run check`。
- [ ] **步骤 6 — 提交与交接：** 按本任务边界提交，PR关联 Issue/AC/证据；更新进度表的真实等级、commit与下一步。建议标题：`docs: validate onboarding and prepare honest launch materials`。

**完成门：** 产出接口与调用方实际接通、必审案例通过、没有未解决 P0/P1、文档对应实际行为。阶段涉及发布/实机时，还必须通过该阶段人工 gate，才可标 L3。

### T21 · RC 审查与 stable 交付

**阶段 / 工时 / 依赖：** P5 / 4–6 小时 / T20\
**覆盖：** 全部 / release gate

**文件：** 新增 docs/verification/release-0.2.0.md 和 Release Notes 草稿；更新兼容矩阵/已知问题/完成度表。

**接口：**
- Consumes：全部 AC、Q01–Q24、RC tarball/sha、用户证据和未关闭问题。
- Produces：release/hold 决策、可追溯版本；获得具体发布授权后才执行外部发布。

**边界：** 无P0/P1豁免；不重打已发布tag掩盖错误；预发布版本号不冒充稳定版本。

**必审案例：** 发布质量清单、升级备份恢复、所有支持声明、许可证、包内容、打开的P2有负责人与理由；范围审查完成。

- [ ] **步骤 1 — 核对输入：** 阅读上述接口、相关源文件和既有测试，在 Issue 写下本任务的 AC 与当前失败行为；记录 HEAD，确认依赖任务已完成。
- [ ] **步骤 2 — 建立可失败证据：** 将上述必审案例逐个放入指定测试文件，先运行目标测试，确认失败是待实现行为导致；纯文档任务用链接/模板/基线检查替代新增测试。
- [ ] **步骤 3 — 实现一个可观测增量：** 在指定生产模块实现一个案例所需逻辑；遵循输入/输出和错误契约，接好调用方。重复步骤 2/3 直到该任务全部案例覆盖，不增加边界外功能。
- [ ] **步骤 4 — 验证交付：** 运行下方命令并保存结果；涉及实机/人工门槛时同时补齐证据，不以自动测试代替。

```bash
npm run check
npm run test:e2e
npm run test:package
```

**预期结果：** 全部通过并完成书面RC决策，功能至少L3、核心流程L4。

- [ ] **步骤 5 — 审查与收口：** 执行质量文档 review 顺序，检查 diff、数据去向、兼容与失败恢复；补用户文档。修复 P0/P1，再运行受影响检查，最后运行 `npm run check`。
- [ ] **步骤 6 — 提交与交接：** 按本任务边界提交，PR关联 Issue/AC/证据；更新进度表的真实等级、commit与下一步。建议标题：`docs: record the v0.2 release decision and evidence`。

**完成门：** 产出接口与调用方实际接通、必审案例通过、没有未解决 P0/P1、文档对应实际行为。阶段涉及发布/实机时，还必须通过该阶段人工 gate，才可标 L3。

## 3. 需求到任务的覆盖矩阵

| 功能 | 实现任务 | 核心审查证据 |
| --- | --- | --- |
| F01 首次启动/来源 | T06,T07,T11,T15,T17 | Q08/Q19/Q22 + onboarding E2E |
| F02 发现/索引 | T05,T06,T07,T16 | Q07–Q09 + 容量/取消 |
| F03 搜索 | T09,T11,T15,T16 | Q11 + 真实历史查找 |
| F04 收件箱 | T04,T08,T15 | Q06/Q10 + 所有人工操作 |
| F05 详情/证据 | T02,T03,T04,T15 | Q01–Q06/Q15 |
| F06 工作区verify | T10 | Q12–Q15 |
| F07 预览/包 | T12,T15 | Q16 + 文本预算/完整预览 |
| F08 实际接续 | T13,T14,T18 | Q17/Q18/Q23 |
| F09 导出/诊断 | T12,T17 | Q21 + 脱敏检查 |
| F10 本地数据 | T05,T17 | Q21/Q22 |
| 安装/协作/增长 | T01,T19,T20,T21 | Q24 + RC/用户门 |

## 4. 进度表

以下按实际证据更新；未实施任务仍保持 L0。T01/T02/T03/T04/T05/T06/T07/T08/T09 已合并；T10-A/B 已合并，T10-C 已实现并完成本地验证，按其验证记录与 PR 跟进，不代表整体产品或真实接续认证完成。

| 任务 | 状态 | 完成等级 | 实际工时 | PR / SHA / 证据 |
| --- | --- | --- | --- | --- |
| T01 | done | L1（开发门槛） | 本次约 0.3h（含阅读/验证） | PR #27 / `02c20e7`；[基线与验收](../../verification/t01-baseline.md)；六组 CI 全通过 |
| T02 | done | L2（合成集成） | 本次约 0.2h，至本地验证 | PR #28 / `6a28a41`；[验收与回归](../../verification/t02-portable-paths.md)；129 测试，六组 CI 通过 |
| T03 | done | L2（合成集成） | 本次约 0.2h，至本地验证 | PR #29 / `d184e1a`；[验收与回归](../../verification/t03-command-outcomes.md)；180 测试，六组 CI 通过 |
| T04 | done | L2（合成集成） | 本次约 0.3h，至本地验证 | PR #30 / `8a1a225`；[验收与回归](../../verification/t04-evidence-model.md)；194 测试，六组 CI 通过 |
| T05 | done | L2（存储集成） | 本次约 0.2h，至本地验证 | PR #31 / `6393bcf`；[验收与回归](../../verification/t05-sqlite-storage.md)；202 测试，三平台 CI 通过 |
| T06 | done | L2（来源集成） | 本次约 0.3h，至本地验证 | [验收与回归](../../verification/t06-claude-source.md)；220 测试，PR #32 / edb05dd，三平台 CI 通过 |
| T07 | done | L2（索引集成） | 未单独计时 | [验收与回归](../../verification/t07-incremental-index.md)；233 测试，PR #33 / 0d00f6d，三平台 CI 通过 |
| T08 | done | L2（任务集成） | 未单独计时 | [验收与回归](../../verification/t08-task-management.md)；241 测试，PR #34 / 7c13034，三平台 CI 通过 |
| T09 | done | L2（搜索集成） | 未单独计时 | [验收与回归](../../verification/t09-history-search.md)；249 测试，PR #35 / ff32547，三平台 CI 通过 |
| T10 | done | L1（A/B/C SDK 与 CLI） | 未单独计时 | [T10-A 证据](../../verification/t10-a-snapshot.md)、[T10-B 证据](../../verification/t10-b-verify.md)、[T10-C 证据](../../verification/t10-c-cli.md)；C 已合并 PR #39（6512975）；UI/真实接续后续验收 |
| T11 | done | L1（A/B/C 已合并，#40/#42/#43） | 未单独计时 | [T11 包计划](2026-09-14-t11-work-packages.md)、[A 证据](../../verification/t11-a-server.md) |
| T12 | done | L1（A/B 已合并，#44/#45） | 未单独计时 | [T12 工作包](2026-09-15-t12-work-packages.md)、[B 证据](../../verification/t12-b-handoff.md) |
| T13 | review | L1（参数实测、局部验证，待 CI/合并） | 未单独计时 | [T13 计划](2026-09-15-t13-target-runners.md)、[版本矩阵](../../compatibility.md) |
| T14 | pending | L0 | 尚未实施 | 尚未实施 |
| T15 | pending | L0 | 尚未实施 | 尚未实施 |
| T16 | pending | L0 | 尚未实施 | 尚未实施 |
| T17 | pending | L0 | 尚未实施 | 尚未实施 |
| T18 | pending | L0 | 尚未实施 | 尚未实施 |
| T19 | pending | L0 | 尚未实施 | 尚未实施 |
| T20 | pending | L0 | 尚未实施 | 尚未实施 |
| T21 | pending | L0 | 尚未实施 | 尚未实施 |

状态只用 pending / in_progress / review / done / blocked；blocked 必须有具体缺失条件和可继续的独立任务。不要因等待真实认证就把整个项目所有工作都暂停。

## 5. 重新规划触发点

- P1 原生依赖无法可靠安装：先修打包或用ADR重新选存储，不能把安装问题留到P5。
- P3 目的端输入方式不可靠：缩小支持版本并实测；若核心跨Agent流程不能成立，暂停新UI装饰，修闭环。
- P4 性能未达标：按benchmark定位，允许减少默认来源数量并公开上限，不能隐瞒遗漏数据。
- P5 用户找不到自己的任务：优先修来源识别/搜索/首屏；只有使用者反复遇到新需求才扩范围。
- 出现严重源数据修改/泄漏：立即停止发布，先修原语和回归，重新审查所有依赖该原语的模块。

执行到一个阶段门时，提交“已满足哪些AC、缺什么证据、哪些功能仍实验性”的短报告。下一阶段继续沿同一份计划，避免每次重新设计全产品。
