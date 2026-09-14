# T10 工作包交付计划

**目标：** 以三个独立 PR 完成工作区捕获、显式比较和 verify CLI。范围仍以 [T10 总计划](2026-09-14-threadport-v0.2.md)、[F06](../../v0.2/01-product-spec.md) 与 [验证契约](../../v0.2/03-contracts.md) 为准；不扩大 12–18 小时任务估算。

**基线：** 制定时 main 为 ff32547496cd8811ed2d637ac8988611ddfaad8e。每包开工重新记录实际 main SHA。以下均为计划，T10 尚未实现；拟定文件、入口和测试不能报告为已经存在或通过。

**架构：** 本地只读捕获 → 持久化已知范围的 snapshot → verifyWorkspace 比较 → 薄 CLI。沿用现有 SQLite snapshots 表与用户显式绑定；不伪造历史测试快照，不执行日志命令。

**技术：** Node 24、TypeScript、现有 Git/SQLite 用例、Vitest 临时 Git 仓库。遵循 [工作包交付规则](../../v0.2/11-work-package-delivery.md)。

## 包顺序与提交

| 工作包 | 可独立评审的交付物 | 前置 / 消费者 | 拟定提交及分支 | 当前状态 |
| --- | --- | --- | --- | --- |
| T10-A | 有界、只读的当前工作区捕获与保存；无法完整捕获时记录原因 | T02/T05/T08；B 消费 | `feat(T10-A): capture bounded workspace snapshots`；codex/t10-a-snapshot | 未开始；无提交/PR |
| T10-B | 明确绑定下的 matched/drifted/unverifiable 比较报告 | A 已合并；C/T11/T12/T14 消费 | `feat(T10-B): verify captured workspace state`；codex/t10-b-verify | 未开始；无提交/PR |
| T10-C | verify CLI 输出与退出码，保留旧 validate 行为 | B 已合并；CLI 用户及后续集成消费 | `feat(T10-C): expose explicit workspace verification`；codex/t10-c-cli | 未开始；无提交/PR |

每包包含自己的测试与文档，一个 PR squash 成 main 上一个可定位的提交。A/B 是可直接调用和测试的 SDK 增量，不能只提交无法运行的空接口。C 合并且 T10 全部验收通过后才将总任务标 done；UI 语义一致性留给后续 UI 集成验证。

## T10-A：捕获与持久化

**文件与职责：**

- 新增 src/workspace/contracts.ts、snapshot.ts、index.ts：验证契约、捕获实现、SDK 入口。
- 修改 src/git.ts、src/storage/sqlite-store.ts：复用安全的 Git 读取，提供受校验的 snapshot 保存/读取；沿用 snapshots 表，预计不新增迁移。
- 修改 package.json、scripts/pack-smoke.mjs：导出 threadport/workspace 并在隔离安装中验证入口。
- 新增 tests/workspace/snapshot.test.ts；按实际修改扩展 tests/git.test.ts、tests/git-regressions.test.ts、tests/storage/database.test.ts。
- 新增 docs/v0.2/12-workspace-verification.md、docs/verification/t10-a-snapshot.md：只记录本包已实现的捕获行为与预算。

**测试与完成门：**

`npm test -- tests/workspace/snapshot.test.ts tests/git.test.ts tests/git-regressions.test.ts tests/storage`，再运行 `npm run check` 与 `npm run check:pack`。

覆盖 HEAD/tracked diff/untracked 内容与路径；无 Git/无 commit/detached HEAD；安全读取、符号链接、文件删除或读失败；捕获前后复查，最多重试一次，仍变化为 RACED；超限明确不完整。保存后可重读同一 snapshot，目标目录内容/Git 状态不被捕获修改。不得自动给历史 CommandRun 补 snapshotId。

**回滚：** 触发条件为捕获越界、错误完整性声明或旧 Git 行为回归。B 及其他消费者未合并时可整体 revert A；已有消费者须先处理它们。现有 snapshots 数据保留，旧代码可忽略新增记录；若实施时确需 schema 变化，先改交付卡，重新说明旧代码兼容性。回滚后运行原 Git/存储/CLI 回归、完整 check 和 pack。

## T10-B：比较与不确定性

**文件与职责：**

- 新增 src/workspace/verify.ts、tests/workspace/verify.test.ts：verifyWorkspace(snapshot, workspace) 与真实临时仓库的比较案例。
- 修改 src/workspace/contracts.ts、index.ts：导出 VerificationReport 和完整比较接口；同时接入 A 的实际捕获实现。
- 修改 scripts/pack-smoke.mjs、docs/v0.2/12-workspace-verification.md；新增 docs/verification/t10-b-verify.md。

**测试与完成门：**

`npm test -- tests/workspace/verify.test.ts tests/workspace/snapshot.test.ts`，再运行 `npm run check` 与 `npm run check:pack`。

AC-F06-1–3 / Q12–Q15：立即比较 matched；改 HEAD/tracked/untracked/删除或重命名为 drifted；portable `.` 通过显式绑定解析；wrong repo、未绑定、移动/失读/超限/并发变化为 unverifiable。未完整读取的优先级高于已观察到的差异，不能返回假 matched。报告标明范围与相对路径，不声称业务正确或历史测试仍有效。

**回滚：** 触发条件为假 matched、项目身份误判或报告泄漏。若仅 B 有问题且没有消费者，可 revert B，保留 A 的捕获/存储功能。C 或 T11/T12/T14 已引用时先处理这些消费者；不得留下未满足的导入/API。snapshot 数据与人工绑定保留；回滚后 A 的目标测试、完整 check 和 pack 必须通过。

## T10-C：CLI 与任务收口

**文件与职责：**

- 修改 src/cli.ts、tests/cli.test.ts、tests/cli-regressions.test.ts：接通 `threadport verify <capsule.json> --project <root> [--json]` 及 data-dir 处理。
- 修改 scripts/pack-smoke.mjs、README.md、docs/v0.2/12-workspace-verification.md：实际安装后的命令与示例。
- 新增 docs/verification/t10-c-cli.md；更新本计划及 T10 总计划进度与真实 PR/SHA。

**测试与完成门：**

`npm test -- tests/workspace tests/git.test.ts tests/cli.test.ts tests/cli-regressions.test.ts`，再运行 `npm run check` 与 `npm run check:pack`。

AC-F06-4：JSON/文本均投影 B 的报告；matched=0、drifted=4、unverifiable=6，输入错误=2、IO=5。旧 validate 仍只做 schema 检查；旧 Capsule 缺少足够绑定/范围信息时返回 unverifiable，不能用当前状态冒充历史快照。隔离安装验证实际命令、stdout 纯 JSON、错误处理、旧 CLI 兼容，以及不执行日志命令。

**回滚：** CLI 输出/退出码或兼容回归可整体 revert C，保留 A/B 的 SDK 能力。后续 CLI 消费者存在时先核对其依赖；撤销公开 verify 命令需在回滚 PR 明示。无数据库降级；完整 check 和 pack 验证旧 CLI 与保留的 workspace SDK。

## 执行与交接

每包依次记录：失败证据（适用）→实现及必要测试→目标检查→完整检查→提交/推送→PR/CI→自审或实际外部评审→合并 SHA。实际文件偏离清单时在该包 PR 解释职责变化，不顺手吸收其他包。

合并后的真实 SHA、测试环境和回滚依赖写入对应 PR 和验收文档后续记录。局部回滚状态应写“C 已撤销、A/B 保留”等明确结果，不笼统写“回滚 T10”。全部撤销通常为 C → B → A；执行前仍检查新出现的跨任务消费者与数据库兼容性。
