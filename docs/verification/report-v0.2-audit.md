# 开发报告 v0.2：仓库对照与首个实现增量

日期：2026-09-16。输入：用户提供的 `ThreadPort_Development_Report_v0.2.md`，并要求以此指导开发。报告中的建议按现有代码核实；引用的 Schema、DDL、36 场景附件未随本次请求提供，不能声称已读取或执行这些附件。

基线：`7f57a7917130014870a478951e4b650f97f3dd41`，原分支 main。本地工作分支 `codex/r04-evidence-applicability`。初始 `.gitignore` 修改、`docs/diagrams/`、两个 pelican HTML 和 `research/` 均为已有工作，未纳入本包。

## 1. 原有模块的实际位置

| 报告模块 | 当前代码 | 已核实与差距 |
| --- | --- | --- |
| 本地日志与 Source adapters | `src/sources/claude-source.ts`、`codex-source.ts`、`jsonl-reader.ts`、`claude-events.ts` | 显式来源根、只读分页、文件身份和首尾检查点已有；没有完整的父子事件/会话分支图，也没有原生历史运行快照生产链路 |
| 增量索引 | `src/indexing/service.ts`、`src/storage/index-store.ts` | 事件/游标同事务、取消、来源重置、租约已有；细粒度 gap 范围与可引用的跨代际证据仍需设计 |
| SQLite Store | `src/storage/sqlite-store.ts`、`database.ts`、`migrations.ts`、`migrations/001–004` | 当前 schema v4，任务修订与来源索引分离；不需要用报告新库 DDL 覆盖它 |
| 应用用例与任务状态 | `src/tasks/service.ts`、`src/domain/derive-task.ts` | 乐观修订、人工字段保留、候选信息已有；缺独立 assertion 类型、明确替代、冲突及作用域模型 |
| 工作区验证 | `src/workspace/reader.ts`、`snapshot.ts`、`verify.ts` | 工作树身份、HEAD、index、tracked/untracked 内容、预算和竞争检查已有；symlink、submodule、unborn HEAD、非 UTF-8 路径保守拒绝，尚未达到报告的覆盖要求；尚无独立的敏感文件排除策略，未被 Git 忽略的 `.env` 也可能被读取计算指纹 |
| Evidence Validator | 新增 `src/evidence/command.ts` | 本包补上逐命令适用性；历史 argv、环境、外部依赖、测试数量仍缺，不能输出 current |
| Handoff Compiler | `src/handoff/prepare.ts`、`evidence.ts`、`export.ts` | 32 KiB 冻结文本、脱敏、约束保留、精确字节导出已有；本包补上逐条证据及不可被篇幅截断隐藏的汇总警告 |
| 本地 HTTP API | `src/server/app.ts`、`auth.ts`、`handoff-routes.ts` | loopback、Host/Origin 校验、令牌、严格输入已有；confirm 路由只返回终端命令，启动仍需终端确认；CLI/浏览器能力令牌的进一步分离另立工作包 |
| 浏览器工作台 | `web/src/features/task/`、`history/`、`handoff/`、`settings/` | 任务编辑、历史、完整文本审阅、设置已有；缺 assertion 冲突处理与逐修订差异审阅 |
| 终端 CLI | `src/cli.ts`、`cli-continue.ts` | prepare/export/verify/continue、TTY 与明确输入确认已有；本包完善超限错误，未改目标启动能力 |
| Target runner / 目标工具 | `src/targets/`、`src/platform/process.ts`、`src/storage/launch-store.ts` | shell:false、同交接包单次消费、运行回执已有；完整上下文仍通过 argv，LaunchSpec 未作为最终审阅授权的完整绑定对象；不同包的工作区级互斥、进程身份/unknown 恢复尚未实现 |

这里的盘点是源码与本地测试自审，不是外部安全认证。旧架构已有可用基础，报告的 PR00–PR11 不能机械地从空仓重做。

## 2. 本包修复的可复现问题

旧流程只读取最后一个带快照的命令：先前命令对应的工作区已变化，而最后一个命令对应新现场时，摘要仍可能显示 matched。缺失或其他工作区的历史快照也会回退到当前快照，掩盖历史不可验证这一事实。

现在每个命令使用自己的快照引用；历史退出 0 始终保留，同时可标记 stale。空结果/不完整执行证据是 unverified；缺少历史快照、身份不符或环境未观测是 unknown。匹配的代码指纹只支持工作区比较，不足以认证测试。较早记录即使不在最后 20 个片段中，过期计数和汇总状态仍保留。

超出容量且已无法再删证据片段时，返回 `CONTEXT_BUDGET_EXCEEDED`，HTTP 422 / CLI exit 2；目标、约束及风险汇总不会静默截断，也不保存半份交接包。

实现决策见 [ADR 0009](../adr/0009-command-evidence-applicability.md)，文件、接口及回滚见 [实施计划](../superpowers/plans/2026-09-16-evidence-applicability.md)。

## 3. 后续按依赖交付

| 顺序 | 独立工作包 | 最低验收 |
| --- | --- | --- |
| A，本包 | PR00 对照盘点 + PR04/05 的逐命令适用性增量 | 较晚匹配不掩盖较早过期；未知不升格；警告不随截断丢失；预算错误可操作 |
| B | assertion 契约、修订 ledger 与显式替代 | 不覆盖原 task_revisions；同任务无环替代；冲突显式解决；保留人工确认和来源 |
| C | assertion 接入无模型编译器与审阅页 | 生效决定/约束进入交接；争议阻断与候选状态可见；预算和净化回归 |
| D | 可观测的命令-快照-环境证据生产协议 | 不倒推历史现场；null 不作 0；无环境证据不输出 current；单独界定用户主动执行检查的授权 |
| E | 工作区覆盖补齐 | 敏感文件默认不读且标明遗漏；symlink 不越界、submodule/忽略文件遗漏明确、unborn/non-UTF-8 场景可解释；快照算法升级有兼容规则 |
| F | runner 授权与并发加固 | 冻结可执行路径/版本/argv/权限/传输计划；确认期间变更失效；不同交接包不能并发占用同一工作区；崩溃歧义保持 unknown |
| G | 已验证的目标传输、安装、固定任务评测与实机认证 | 按具体 CLI/平台实测；不再以 help 探测等同能力认证；独立用户试用和真实失败记录 |

优先在发布前完成 F；这里按依赖描述工作包，不把既有实验性启动能力当成满足报告的新发布门槛。B/C 与 E/F 可分别规划，但每个增量应独立验证。可选模型抽取仍排在无模型路径和固定评测之后。

## 4. 验证记录

- 环境：macOS 26.6.2 arm64、本地 Node v26.5.0、Chrome 153.0.8010.36；这不替代声明的 Node 24 或 Linux/Windows 认证。
- 修改前：`npm run check` 通过，56 文件 / 377 测试；类型检查、构建、文档链接检查通过。
- 先失败证据：新增领域模块测试因未实现失败；集成测试复现较晚匹配掩盖旧过期/缺失快照，以及预算错误仍为 INVALID_INPUT 的问题。
- 定向回归初次通过：5 文件 / 37 测试；之后增加真实 Git worktree 身份隔离与无部分保存的断言。跨工作区测试初稿违反了现有路径唯一约束，改为真正的独立 worktree 后通过。
- 最终 `npm run check`：57 文件 / 395 测试全部通过，较基线增加 18 项；类型检查、构建、229 个本地文档目标链接检查通过。
- `npm run check:pack`：192 个文件的包完成隔离安装，公开入口、SQLite、CLI、工作区核对、本地服务及 3 种 Cursor roundtrip 检查通过。产物 SHA-256：`9754e017fe6658ad656ff3b042443e56b194c097d1f8981d84e9accedc85a411`。
- 默认 `npm run test:e2e` 因缺少 Playwright Chromium 二进制在浏览器启动阶段失败，未执行页面断言；使用仓库已有的 Chrome 选项 `THREADPORT_TEST_CHROME=1 npm run test:e2e` 后，6 项浏览器流程全部通过，包括完整文本与导出字节一致、冲突草稿保留、脱敏、数据管理和历史查找。
- `git diff --check` 通过；最终文档补记后再次运行本地链接检查。没有安装浏览器、改依赖锁文件或改变测试配置来绕过失败。

已实现并经上述回归验证：逐命令判断、汇总警告、冻结文本、预算错误链路。浏览器验收为现有合成场景的回归，新过期判断另由真实临时 Git/SQLite 集成测试验证。仅设计：上表 B–G 的新增要求。真实 Agent 接续、外部用户试用、报告 36 场景全量验收未执行。原 [发布 HOLD](release-0.2.0.md) 保持有效。

自审重点：没有新增执行入口或源日志写入；证据没有自动升级成当前测试通过；缺失引用不借用别人的匹配；所有历史问题先归集再裁剪片段；旧冻结包不改写。提交、推送、PR、发布均未进行，变更留在本地供维护者审阅。
