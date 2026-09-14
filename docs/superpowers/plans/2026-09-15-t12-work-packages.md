# T12 · 不可变交接包实施计划

沿用总计划 T12，在当前任务内执行；每个工作包独立提交、测试、PR 与回滚，不调整 Capsule v1 格式。

**目标：** 固定任务修订、来源、工作区和完整实际 prompt，确认失效可被验证。

**架构：** 准备时从只读原始文件快照生成当前 Git 投影，历史命令有效性保持 unknown。私有存储保存审批绑定；导出只输出脱敏 metadata。确认只返回固定 UUID 命令，实际执行属于 T14。

| 工作包 | 提交 | 文件 | 测试 | 回滚 |
| --- | --- | --- | --- | --- |
| T12-A 安全的当前 Git 投影 | feat(T12-A): project raw workspace state for handoffs | src/workspace/reader.ts、snapshot.ts、tests/workspace/projection.test.ts、本计划 | 原始文件、staged/unstaged、外部 filter/fsmonitor 不执行、无提交拒绝 | 单 PR squash；先撤回依赖该接口的 T12-B，保留既有快照 |
| T12-B 不可变准备/确认与导出 | feat(T12-B): prepare immutable reviewed handoffs | src/handoff/contracts.ts、prepare.ts、confirm.ts、export.ts、src/storage/handoff-store.ts、sqlite-store.ts、src/server/handoff-routes.ts、app.ts、src/cli.ts、tests/handoff/prepare.test.ts、confirm.test.ts、API/CLI 用例 | 32 KiB UTF-8、过期、摘要篡改、任务/目录变更、uncertainty 确认、脱敏导出、旧 CLI | 独立 squash，先撤回 T13/T14 消费方；不删除人工任务和原始日志 |

T12-A 不运行 git diff/status，不执行 clean/process/textconv/fsmonitor。GitState 的 dirty_diff_hash 使用明确的 threadport.workspace.raw.v1 当前状态摘要；Capsule 引用原始快照，核验走已存在的显式快照路径，不与旧 diff 算法混用。changed_files 是原始 blob/index/HEAD 差异；属性过滤造成的差异保守视为 dirty。无有效 SHA-1 HEAD 或完整快照时，不伪造 Capsule 必填字段。

- [ ] T12-A：建立上述失败测试，增加只读投影接口，运行局部及完整检查，提交/推送/PR/CI/合并。
- [ ] T12-B：逐项实现总计划 AC-F07-1..4/Q16，运行局部及完整检查，提交/推送/PR/CI/合并。

T12-A 本地证据：Node 24.18.1/macOS arm64；328 测试 / 44 文件、typecheck/build/docs 通过；隔离安装包 133 文件通过。四项新增投影测试先失败于缺少接口，再通过。T12-A 当前为本地验证，远程 CI/合并尚待完成。
