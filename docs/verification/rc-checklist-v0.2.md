# v0.2 开发快照审查索引

本表是已运行自动回归的证据索引，不是 stable 认证通过表。整合开发快照在 Node 24.18.1 / macOS arm64 上 `npm run check` 为 377 tests / 56 files，浏览器 6 个合成流程；最终提交、三平台 CI 和安装产物以 PR/包证据 JSON 为准。审查者为当前开发代理自审，尚无独立外部人工评审。

| 场景 | 自动证据 | 仍有的边界 |
| --- | --- | --- |
| Q01 不同目录同名文件 | [路径](../../tests/workspace/paths.test.ts)、[隐私](../../tests/privacy.test.ts) | 合成路径 |
| Q02 Windows/UNC/Unicode/外部路径 | [路径](../../tests/workspace/paths.test.ts)、[隐私](../../tests/privacy.test.ts) | 不等于 Windows 工作台实机认证 |
| Q03 命令 1→0→1 | [状态](../../tests/domain/command-state.test.ts)、[结果](../../tests/command-outcomes.test.ts) | 历史证据，不推断当前成功 |
| Q04 cwd/会话隔离 | [命令上下文](../../tests/adapters/command-context.test.ts) | cwd 缺失保持 unknown |
| Q05 用户更正与 assistant 建议 | [任务派生](../../tests/domain/derive-task.test.ts)、[证据](../../tests/adapters/task-evidence.test.ts) | 不自动采纳建议 |
| Q06 中文人工约束与重扫 | [任务服务](../../tests/tasks/service.test.ts)、[清理重建](../../tests/integration/index-retention.test.ts) | 实际 Agent 保留约束见 Q23 |
| Q07 增量/半行/截断/换文件 | [读取](../../tests/sources/jsonl-reader.test.ts)、[索引](../../tests/indexing/service.test.ts) | 原日志格式版本受兼容矩阵约束 |
| Q08 显式读取范围 | [Claude](../../tests/sources/claude-source.test.ts)、[Codex](../../tests/sources/codex-source.test.ts) | 未自动扫描用户 HOME |
| Q09 坏记录/超大行/未知事件 | [读取](../../tests/sources/jsonl-reader.test.ts)、[索引](../../tests/indexing/service.test.ts) | 部分读取不冒充完整 |
| Q10 revision 冲突 | [任务服务](../../tests/tasks/service.test.ts)、[双标签页](../../tests/e2e/task-handoff.spec.ts) | 409 保留草稿 |
| Q11 中文检索/组合筛选/分页 | [搜索](../../tests/search/service.test.ts)、[浏览器](../../tests/e2e/workspace.spec.ts) | 搜索 p95 性能仍 HOLD |
| Q12 绑定根目录后匹配 | [工作区验证](../../tests/workspace/verify.test.ts)、[CLI](../../tests/cli-verify.test.ts) | SHA-1 Git 范围 |
| Q13 tracked/untracked/HEAD 变化 | [快照](../../tests/workspace/snapshot.test.ts)、[验证](../../tests/workspace/verify.test.ts) | 范围外不可推断 |
| Q14 并发读取/无提交/不可读文件 | [竞态](../../tests/workspace/snapshot-races.test.ts) | 不完整即 unverifiable |
| Q15 旧测试结果时效性 | [任务派生](../../tests/domain/derive-task.test.ts)、[验证](../../tests/workspace/verify.test.ts) | 不证明现在仍通过 |
| Q16 预览变动与过期 | [确认](../../tests/handoff/confirm.test.ts)、[浏览器](../../tests/e2e/task-handoff.spec.ts) | 实际终端复核仍必需 |
| Q17 参数原样传递 | [runner](../../tests/targets/runners.test.ts)、[接续](../../tests/integration/continue.test.ts) | fake Agent，不是真实认证 |
| Q18 缺失/非TTY/取消/崩溃 | [执行](../../tests/targets/launch.test.ts)、[接续](../../tests/integration/continue.test.ts) | OWNER_LOST 不表示子 Agent 已停止 |
| Q19 Host/Origin/token/穿越 | [服务器](../../tests/server/app.test.ts)、[路由](../../tests/server/routes.test.ts) | loopback 服务边界 |
| Q20 日志注入 | [浏览器历史](../../tests/e2e/workspace.spec.ts)、[任务预览](../../tests/e2e/task-handoff.spec.ts) | 文本展示；真实日志未上传 |
| Q21 迁移/导出/磁盘失败 | [迁移](../../tests/storage/migrations.test.ts)、[导出](../../tests/handoff/export.test.ts)、[删除失败](../../tests/integration/delete-failure.test.ts) | 全部删除不是跨文件原子事务 |
| Q22 清理/撤来源/重建/删除 | [路由](../../tests/server/routes.test.ts)、[保留期](../../tests/integration/index-retention.test.ts)、[删除](../../tests/integration/delete-data.test.ts)、[UI](../../tests/e2e/data.spec.ts) | 代码回滚不恢复已删用户数据 |
| Q23 两平台四路径三个任务 | [未完成矩阵](agent-matrix-beta.md) | **HOLD：真实测试未运行** |
| Q24 安装产物 | [包脚本](../../scripts/pack-smoke.mjs)、[产物记录](package-rc.md) | dev 快照；最终 RC 尚未认证 |

发布阻断：性能预算、真实 Agent/平台认证、外部用户许可与结果、最终 RC 清单及具体发布授权。许可证为仓库现有 Apache-2.0，Capsule v1 冻结，主 SQLite schema 4；新增进程协调库不存任务正文。没有以“接受 P2”为由豁免这些门槛。未确认的外部实机情况记 unknown；后续失败按所属模块建立小工作包。
