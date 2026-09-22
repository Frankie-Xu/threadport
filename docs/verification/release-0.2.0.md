# v0.2 发布决策：HOLD

当前没有 0.2.0 stable 发布。未创建 stable tag，未执行 npm publish，未对外发送邀请或推广消息。公开的开发 prerelease 与尚未合并的 PR candidate 分别记录如下，均不构成 stable 认证。

| 门禁 | 状态 | 证据与解锁条件 |
| --- | --- | --- |
| T15 本地工作台 | L2 集成 | PR #49/#50 三平台自动 CI；不等于真实 Agent 认证 |
| T16 性能预算 | 合成验收通过 | [批量索引验收](batched-indexing-2026-09-21.md)：macOS/Ubuntu 首次索引 19.00/19.11s，全部固定容量预算通过；不替代真实环境认证 |
| T17 数据生命周期 | L2 集成，#52/#53/#54 已合并 | [分包记录](t17-data-lifecycle.md)；删除失败、并发与关闭已通过本地回归 |
| T18 真实平台/Agent | HOLD | [24 格矩阵](agent-matrix-beta.md)：旧包 3/24 格已运行（2 pass、1 with issue），21 格未运行 |
| T19 安装包 | 集成验证 | [产物流程](package-rc.md)；开发包已验证；最终 RC 仍依赖真实认证 |
| T20 外部用户 | HOLD | [用户表](user-study-v0.2.md)：0 名已观察参与者 |
| T21 stable 决策 | HOLD | 必交功能至少 L3、核心流程 L4 尚未满足 |

不以补齐文档代替通过门槛。下一步为在安静参考机复测性能、取得两个平台的真实 Agent 条件与用户许可；任何真实失败回到所属模块的小 PR 修复。最终候选必须重新执行 check、test:e2e、test:package，保存产物 SHA-256，再逐条完成 Q01–Q24 审查和明确的发布授权。

Release Notes 草稿：实验性本地任务收件箱、历史搜索、人工修订、完整接续预览、终端确认及本地数据管理；Node 24。支持范围按实际认证矩阵列出，当前不宣称稳定版支持。没有测量依据的效率提升、用户数量或增长百分比不进入发布说明。

[Q01–Q24 审查索引](rc-checklist-v0.2.md) 列出自动证据与不能替代的真实门槛。当前快照版本为 0.2.0-dev.0，不冒充 alpha/RC/stable。

当前 R01–R08 分阶段开发修复及 Node24 合成验证见 [整改状态](remediation-progress-2026-09-16.md)。R06 内部 Agent 证据、R07 真实 CLI 复测及 R08/R09 的剩余认证仍未关闭；本页历史成绩不自动延伸到新提交。

## 2026-09-22 开发预发布记录修正与 control-plane 候选

已复核公开 GitHub prerelease `v0.2.0-dev.0`：tag 指向 `967ceee`，CI aggregate run 为 `35719556446`，资产 `threadport-0.2.0-dev.0.tgz` 的真实 SHA-256 为 `b3cb66cb671930d021bda9e710d96a617068b1700d2e1f1c4bb576b91dee3a6c`。发布说明中的 hash 占位文本已替换为该值；这只修正已发布开发快照的交付记录。

新的 control-plane 候选为 workspace-only 实现提交 `f0a1ef93064b78e07a0dd4a020104586e998d41f`，其后仅追加验证文档，尚未进入上述发布包。隔离 Node 24.19.0 / Windows x64 验证通过 83 个测试文件、526 个测试、11 个浏览器测试和 264 文件安装包；候选 tarball SHA-256 为 `9ea561a2a3a990b1c9fc048fdeb04413f7c69344a63da2314c8bf15fb86389ce`，证据 manifest 记录的 `sourceCommit` 为 `cb651aa7927af38f7d935f0ff5749384bb6180e5`。PR #70 的最新三平台 Node 24 CI 已全绿，但 PR 仍为 Draft，尚未合并。完整门禁和首次失败记录见 [control-plane review](control-plane-review-2026-09-22.md)。

stable 仍为 HOLD：真实 Agent、外部用户、Q01–Q24 和原始 S01–S36 证据没有因本次候选验证而关闭。本次未创建 stable tag/Release，未执行 npm publish、真实 Agent 登录或用户招募。维护者审阅、合并及 reviewed candidate 重建的责任、前置条件和执行单见 [开发交接记录](control-plane-handoff-2026-09-22.md)。

## 2026-09-18 候选复核

候选工作树最新提交为 `e608372`；代码修复提交为 `6db8c71`，其后仅追加候选绑定性能原始证据与文档。`npm run check` 已通过（440 个测试），浏览器流程 7/7 通过，隔离安装包检查 217 个文件通过。固定容量性能证据绑定 `6db8c71`，Node 26/macOS API p95 为 324.85ms，R08 仍为 HOLD；这不是 Node 24/Ubuntu 的发布认证。Windows Node 24、真实 Claude/Codex 接续、原始 36 项规格和外部用户观察仍保持未验证或 unavailable，不能解除发布 HOLD。

## 2026-09-19 本地环境模拟补充

最新证据候选为 `8378962`，本机 Node 24 源码、浏览器和隔离安装包检查均已完成；Docker `node:24-bookworm` 用户态检查报告 437 项通过、3 项既有跳过。Node 24 固定容量 API p95 为 322.78ms，仍超过 300ms 门槛，性能继续 HOLD。该记录不扩大为 Ubuntu CI、Windows 实机、真实 Agent 接续或外部用户认证；完整边界见 [本地环境证据](local-environment-2026-09-19.json)。

随后提交 `382b3dc` 将 Codex 0.155.0-alpha.9 的已核对 help/resume 参数加入显式版本白名单，并保留未知版本的 `unverified` 结果。该变更通过 442 个测试和 217 文件隔离安装包检查；它只更新接口探测兼容性，未改变真实 Agent、认证或发布 HOLD 状态。

## 2026-09-21 性能预算闭环

运行时代码 `829a862` 的两平台合成性能预算已全部通过，Node 24 本地完整检查为 520 项测试通过。T16 不再以既有索引/搜索预算超标阻断当前候选；真实 Agent/目标环境、原始范围验收及外部用户观察仍未完成，stable 决定继续 HOLD，不创建稳定版 tag 或 Release。详见 [批量索引验收](batched-indexing-2026-09-21.md)。
