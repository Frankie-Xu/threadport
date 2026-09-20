# 整改实施状态与证据

本页对应 [整改报告](remediation-report-2026-09-16.md)，记录实施结果；原报告保留为问题基线。整体 stable 继续 HOLD，不以阶段代码完成代替全部整改完成。

## R01：固化证据增量

提交 `31cf29a` 固化上一轮证据适用性改动及报告，未包含已有 `.gitignore`、diagram、research、pelican 和 output 内容。用户随后授权推送；R01–R05 已推送至开发分支，未创建 PR。

在该提交的干净独立检出中，Node **24.18.1** / macOS arm64：锁定依赖安装、`npm run check` **57 文件 / 395 测试通过**；`THREADPORT_TEST_CHROME=1 npm run test:package` 通过，包含安装后浏览器任务编辑、刷新后持久化以及只访问 loopback 的断言。不是在旧 HEAD 上测试未提交改动。

安装包 **192 文件**，SHA-256 `9754e017fe6658ad656ff3b042443e56b194c097d1f8981d84e9accedc85a411`。原始 manifest 见 [Node24 安装验证](packages/r01-node24.json)。这是合成安装验证；真实 Agent 和外部用户验收仍独立。

## 阶段一：R02–R04

实施计划见 [运行时整改计划](../superpowers/plans/2026-09-16-remediation-runtime.md)。该阶段交付报告优先的阶段 0/1；后续工作记录在下方各节。

| 工作包 | 本地提交 | 实现与验证边界 |
| --- | --- | --- |
| R02 启动授权 | `a632011` | 先冻结完整计划再审阅，复核规范可执行文件/摘要/版本/argv/cwd/传输与有效期；终端授权摘要精确消费。58 文件 / 401 测试通过；参数、目录、传输、版本、程序替换及授权覆盖均有拒绝测试。见 [ADR 0010](../adr/0010-reviewed-launch-plan.md)。 |
| R03 工作区协调 | `307f55f`、`69755e9` | 跨进程/交接包占用规范工作树；进程身份丢失保留 unknown；终端恢复有证据和确认记录。首包 59 文件 / 407 测试通过；自审另补 spawn 后 error 保留占用的回归。见 [ADR 0011](../adr/0011-workspace-run-coordination.md)。 |
| R04 读取边界 | `64f4930` | raw.v2/scope.v1、敏感文件读前拦截、ignored 计数、链接文本、跨策略 unverifiable；9 项针对性测试通过。见 [ADR 0012](../adr/0012-workspace-reading-policy.md)。 |

R03 的协调范围是**同一应用数据目录**，多个独立数据目录并发操作同一工作树不受支持。观察者或目标身份不明不自动释放；只约束 ThreadPort 运行，不锁外部编辑器。该阶段数据库为 **schema 5**（后续 R05 为 schema 6）；旧 schema-4 程序拒绝打开，优先前向修复，备份恢复须另行核对，不能靠改版本号降级。

R04 的文件名策略不识别任意源码中的秘密。Git-ignored 内容不在比较范围；submodule、无 HEAD、非 UTF-8 路径、外部或链式链接仍为受限支持，不生成可启动的完整快照。旧 raw.v1 保留可读，需重新准备交接。legacy artifact CLI 的独立读取算法不纳入本项承诺。

### 最终阶段验证

精确测试对象：`0e5557dc31da265552fc74971a5cfddefe7560e4`，干净独立检出；macOS **26.6.2 arm64** / Node **24.18.1**。本页及产物清单随后作为纯证据提交追加，不冒称包内已包含这个后续提交。

| 检查 | 结果 |
| --- | --- |
| `npm run check` | 类型检查、构建通过；**61 文件 / 418 测试通过**；270 个本地文档目标通过 |
| `THREADPORT_TEST_CHROME=1 npm run test:e2e` | **6 项浏览器流程通过**，系统 Chrome |
| `THREADPORT_TEST_CHROME=1 npm run test:package` | **201 文件**；隔离安装、公开类型/导出、SQLite、CLI、工作区、Cursor roundtrip、安装后浏览器编辑/持久化/loopback 断言均通过 |
| `git diff --check` | 通过；用户原有无关文件未纳入提交 |

最终阶段安装包 SHA-256：`27992221c297aa01edf69b5dd8be9c9ccb95d452327614d53c8fd144e1f5874c`。原始 [产物清单](packages/r01-r04-node24.json) 记录 sourceCommit、trackedChanges=false、Node/平台、文件列表和 installedBrowser=true；本地归档保存在 `/tmp/threadport-runtime-0e5557d-artifacts/threadport-0.2.0-dev.0.tgz`，临时目录不是长期制品仓库。

这些是本机合成验证，未执行本轮真实 Agent 接续、Ubuntu 实测、外部用户观察或性能重测。自审曾复现 spawn 后 error 被当作启动失败、非 UTF-8 文件 fixture 被本机文件系统拒绝：前者已修复并加入回归，后者改用真实 Git index 字节路径 fixture 后通过；不将环境拒绝视为产品通过。

## R05：决定修订与冲突处理

已实现 [不可覆盖的决定记录](../adr/0013-assertion-ledger.md)：候选/确认/拒绝/替代、显式作用范围、同议题竞争检测与跨议题人工冲突声明。源引用不可用时保留人工确认，重索引不改人工记录。旧任务约束独立保留。

交接编译只采用适用范围内的有效确认；候选另列。未解决冲突或未知适用性阻止生成交接，每次条目修改同步推进任务版本使旧预览失效。工作台可从历史证据起草、明确替代、查看历史；并发保存失败可保留草稿并显式刷新基准。不是自由文本语义矛盾识别器。

数据库为 **schema 6**，迁移 006 增加 assertion revisions，旧 schema-5 程序不能打开。已加入 schema-5 升级失败回滚、不可覆盖历史和来源丢失回归。新浏览器用例曾因预填文本影响隐式表单标签定位失败，已改为显式标签关联并通过替代/并发草稿流程；最终 Node24 与安装验证见下方本轮汇总。

## R06：可观测进程的证据生产

[ADR 0014](../adr/0014-observed-command-production.md) 定义并接入外层目标进程的实际采集：批准计划绑定真实 argv/cwd，保存 spawn/结束时间、前后快照、限定环境摘要，结果与证据完整性分开。`inspect-run` 可查看仍在保留期内的批准计划；正常清理保留观测引用的快照。数据库为 **schema 7**。

真实 Node 子进程合成用例已证明：执行记录 → 保存快照/环境 → 后续修改 → prepare 标记 stale。执行期间改工作区、缺少 spawn 或丢失结果保持 unverified；测试数量 null 不变为 0，未引入 current。当前 `npm run check` 为 **65 文件 / 430 测试通过**。R05 提交 `d1a94a6` 已在独立 Node24 检出通过 427 测试与 7 项浏览器流程并推送。

这条生产链只观察 ThreadPort 启动的目标进程，不观察 Agent 内部命令。原生导入仍缺历史快照绑定；完整环境认证与内部测试生产协议仍是 R06 的剩余边界。

## R07：脱敏操作的防误执行修复

[ADR 0015](../adr/0015-portable-action-review.md) 保留历史 exit 127，给被改写的历史命令/测试添加不可直接执行提示。工作台下一步操作若含被改写路径或脱敏占位符，prepare 返回 `NEXT_ACTION_REVIEW_REQUIRED`；用户保存可移植替代写法后才可继续。没有恢复私有路径或猜测 vendor stdin/file 支持。

本轮源码检查 **67 文件 / 432 测试通过**。真实 CLI 收到完整上下文以及首次命令结果仍需新候选包复测，不能用该回归代替真实认证。

## R08 / R09：搜索改进与原附件查找

[ADR 0016](../adr/0016-literal-search-expression-index.md) 记录表达式索引实验及撤回决定，生产查询和 schema 7 保持原状。精确基线 `9a9e408` 的 API p95 468.30ms、UI p95 492.50ms，API 未达标；数据库筛选占主要耗时。该失败轮次原始数据保留在 [性能记录](performance-beta.md)，不以微基准代替完整复测。

按用户“你找找”的要求查找原始 36 场景，结果见 [本地查找记录](original-acceptance-search-2026-09-16.md)。Downloads、Desktop、当前/旧项目及 Spotlight 相关文件均未找到附件；研究 ZIP 是另一份评估资料。原规格继续未评估，不能以现有测试数量补造映射。

## 本轮最终候选验证与推送

精确测试对象 **`44a23b5b4e5f4b6b876223d42ef202d3fd13c222`**，干净独立检出，macOS arm64 / Node **24.18.1**；源码、浏览器、安装测试顺序完成，未与性能测试并行。以下清单作为后续纯证据提交保存，不冒称已包含在被测包内。

| 检查 | 结果 |
| --- | --- |
| `npm run check` | 类型、构建、**67 文件 / 432 测试通过**；289 个本地文档目标通过 |
| `THREADPORT_TEST_CHROME=1 npm run test:e2e` | **7 项通过**，含决定冲突、明确替代、并发草稿恢复 |
| `THREADPORT_TEST_CHROME=1 npm run test:package` | **217 文件**；隔离安装、公开导出、SQLite、CLI、工作区、Cursor roundtrip、安装后浏览器编辑/持久化/loopback 通过 |
| 安装包 SHA-256 | `6be949ba572a450151db04c3a688ae1a36ffbe520ce26ad6a29b82ece85410a6` |

[原始产物清单](packages/r05-r08-node24.json) 记录精确提交、trackedChanges=false、Node/平台、文件列表和 installedBrowser=true。本地产物为 `/tmp/threadport-r05-r08-node24-artifacts/threadport-0.2.0-dev.0.tgz`；临时目录不是长期制品仓库。该候选为 schema 7，包含 R05/R06/R07 修复；schema-8 搜索实验已删除。

本轮提交推送至用户已授权的 `codex/r04-evidence-applicability` 分支。没有合并或发布，也没有将用户原有无关工作纳入提交。当前候选未执行 Ubuntu 源码/安装认证或真实 Agent 重测；历史 Ubuntu 性能证据只认证其记录的旧提交。

## 尚未关闭的整改项

- R05：实现已接入，当前真实 Agent/外部用户认证仍依赖 R09；原始 36 场景规格未取得，不能宣布全场景认证。
- R06：外层进程生产链已实现；Agent 内部检查、完整环境及历史原生绑定仍未知，未补造历史证据。
- R07：脱敏不可执行提示与下一步阻断已实现；当前 argv 传输和首次命令仍需真实 CLI 复测，未假设 stdin 或文件注入支持。
- R08：既有三个独立性能轮次均未证明达标；最新本地基线 468.30/492.50ms，表达式索引 2387.61/928.80ms 已撤回；另补回 Ubuntu 旧提交 394.68/427.70ms 的失败证据。两平台性能门槛仍未关闭。
- R09：原始 36 场景附件、21 个未运行矩阵格和至少 5 名外部用户观察仍缺；不能生成虚构参与者或把合成测试写成真实认证。
- R10：本阶段同步入口、脚本与已有证据，保留发布 HOLD。

所有评审为开发代理自审；没有外部独立审查或发布授权。
