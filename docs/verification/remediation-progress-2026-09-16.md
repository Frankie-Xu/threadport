# 整改实施状态与证据

本页对应 [整改报告](remediation-report-2026-09-16.md)，记录实施结果；原报告保留为问题基线。整体 stable 继续 HOLD，不以阶段代码完成代替全部整改完成。

## R01：固化证据增量

本地提交 `31cf29a` 固化上一轮证据适用性改动及报告，未包含已有 `.gitignore`、diagram、research、pelican 和 output 内容，未推送或创建 PR。

在该提交的干净独立检出中，Node **24.18.1** / macOS arm64：锁定依赖安装、`npm run check` **57 文件 / 395 测试通过**；`THREADPORT_TEST_CHROME=1 npm run test:package` 通过，包含安装后浏览器任务编辑、刷新后持久化以及只访问 loopback 的断言。不是在旧 HEAD 上测试未提交改动。

安装包 **192 文件**，SHA-256 `9754e017fe6658ad656ff3b042443e56b194c097d1f8981d84e9accedc85a411`。原始 manifest 见 [Node24 安装验证](packages/r01-node24.json)。这是合成安装验证；真实 Agent 和外部用户验收仍独立。

## 阶段一：R02–R04

实施计划见 [运行时整改计划](../superpowers/plans/2026-09-16-remediation-runtime.md)。本轮只交付报告优先的阶段 0/1；后续领域工作与真实认证仍未完成。

| 工作包 | 本地提交 | 实现与验证边界 |
| --- | --- | --- |
| R02 启动授权 | `a632011` | 先冻结完整计划再审阅，复核规范可执行文件/摘要/版本/argv/cwd/传输与有效期；终端授权摘要精确消费。58 文件 / 401 测试通过；参数、目录、传输、版本、程序替换及授权覆盖均有拒绝测试。见 [ADR 0010](../adr/0010-reviewed-launch-plan.md)。 |
| R03 工作区协调 | `307f55f`、`69755e9` | 跨进程/交接包占用规范工作树；进程身份丢失保留 unknown；终端恢复有证据和确认记录。首包 59 文件 / 407 测试通过；自审另补 spawn 后 error 保留占用的回归。见 [ADR 0011](../adr/0011-workspace-run-coordination.md)。 |
| R04 读取边界 | `64f4930` | raw.v2/scope.v1、敏感文件读前拦截、ignored 计数、链接文本、跨策略 unverifiable；9 项针对性测试通过。见 [ADR 0012](../adr/0012-workspace-reading-policy.md)。 |

R03 的协调范围是**同一应用数据目录**，多个独立数据目录并发操作同一工作树不受支持。观察者或目标身份不明不自动释放；只约束 ThreadPort 运行，不锁外部编辑器。当前数据库 **schema 5**；旧 schema-4 程序拒绝打开，优先前向修复，备份恢复须另行核对，不能靠改版本号降级。

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

## 尚未关闭的整改项

- R05：assertion 修订、显式替代、冲突解决、编译器及界面，需要独立领域工作包。
- R06：真实执行的 argv/cwd/前后快照/环境生产协议，未用旧日志补造历史证据。
- R07：旧 Codex 首次命令失败仍保留；当前 argv 传输需真实 CLI 复测，不能假设 stdin 或文件注入受支持。
- R08：既有三个独立性能轮次均未证明达标；macOS/Ubuntu 固定容量 API/UI 验证仍需完成。
- R09：原始 36 场景附件、21 个未运行矩阵格和至少 5 名外部用户观察仍缺；不能生成虚构参与者或把合成测试写成真实认证。
- R10：本阶段同步入口、脚本与已有证据，保留发布 HOLD。

所有评审为开发代理自审；没有外部独立审查或发布授权。
