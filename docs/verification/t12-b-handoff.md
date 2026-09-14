# T12-B · 不可变接续包验证记录

工作包基于 T12-A，提交边界见[工作包计划](../superpowers/plans/2026-09-15-t12-work-packages.md)。准备/确认/导出及 API/CLI 接入为一个可独立回滚的交付单元。这里不声明 T14 实际启动或真实 Agent 认证。

| 工作包 | 提交 | 文件 | 测试 | 回滚 |
| --- | --- | --- | --- | --- |
| T12-B | PR 记录实际 head 与合并 squash | src/handoff/contracts.ts、prepare.ts、confirm.ts、export.ts；src/storage/handoff-store.ts、sqlite-store.ts；src/server/handoff-routes.ts、app.ts；src/cli.ts；tests/handoff/helpers.ts、prepare.test.ts、confirm.test.ts、api-cli.test.ts；本记录、API 文档和两份计划 | 下述局部/全量和三平台 CI | 通过 PR revert 本包 squash；先撤回 T13/T14 调用方，不删除人工数据 |

本地环境：macOS arm64，Node 24.18.1。新增准备测试最初因缺少接口失败，随后实现并通过。局部 `npm test -- tests/handoff` 首轮 14 项（包含旧格式兼容）；完整检查 339 项 / 47 文件通过，随后新增来源 partial/撤销和绑定变化两个回归用例，confirm 7 项及 typecheck 通过。隔离安装包 145 文件，现有 CLI/server/verify/Cursor smoke 通过。

证据覆盖：32 KiB UTF-8 上限；过长人工目标/约束明确拒绝；旧摘录省略清单；来源 partial/unknown；同项目与原生模式约束；完整 prompt 导出字节相同；密钥/路径和摘要再检查；任务编辑、准备中并发修订、来源/目录绑定检查；包篡改/过期；已知历史 drift 与不完整历史快照均须明确确认；确认后新增漂移、分支变化拒绝；真实临时 SQLite/Git/HTTP/CLI 联动。生成 Capsule 已被旧 verify CLI 正确读取显式 raw.v1 快照。测试数据均为合成内容。

当前 Git 快照只证明准备时的工作状态，历史 exit 0 不转换成当前测试通过。完整当前捕获失败或 SHA-256 Git 仓库无法满足冻结 Capsule 的 SHA-1 HEAD 时拒绝准备。历史不确定性允许确认，但新工作区变化没有豁免。没有 schema 迁移，没有服务端任意路径导出，没有进程启动。

自审；没有独立人工评审。回滚方案未在生产演练。完整检查与远程 CI 的最终结果记录于 PR，合并前不标记全部 T12 完成。
