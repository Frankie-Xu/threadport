# T10-A 捕获与持久化

工作包：T10-A / F06 / Q12–Q15；基线 799acd7867db3419851689636297885afa4be173。前置 T02/T05/T08 已合并；T10-B 是直接消费者，尚未实施。

提交计划：feat(T10-A): capture bounded workspace snapshots；分支 codex/t10-a-snapshot。

文件计划：新增 workspace/contracts.ts、snapshot.ts、index.ts 与内部 reader.ts；SqliteStore 增加 workspace 查询和不可变 snapshot 保存/读取；package.json、pack smoke；snapshot 行为测试及文档。旧 src/git.ts 保持兼容，新 reader 用 Git 原生清单和文件摘要覆盖 HEAD/index/worktree，不调用可能执行外部过滤器的 diff/status。相对原包清单增加 reader.ts，避免混合进程/文件系统边界与用例。

测试计划：临时仓库上的稳定摘要、内容/暂存区/HEAD 变化、删除/重命名、detached、无 Git/无 commit、symlink/大文件/取消/并发变化；保存后重读、拒绝覆盖既有 snapshot；全量 check 与隔离安装。

回滚计划：本包一个 PR / main squash 单元。消费者尚未合并时可整体 revert；若 B 或其他消费者已合并先处理下游。沿用 snapshots 表、schema 4，无数据库降级或人工数据删除；新增记录保留，旧代码可忽略。回滚后运行原 Git/存储/CLI、完整 check 和 pack。尚未执行回滚。


## 实际交付和检查

文件：新增 src/workspace/contracts.ts、reader.ts、snapshot.ts、index.ts；修改 src/storage/sqlite-store.ts、package.json、scripts/pack-smoke.mjs；新增 tests/workspace/snapshot.test.ts、snapshot-races.test.ts；更新 README、验证契约、包计划/总计划并新增快照用法文档。本包不修改 src/git.ts、旧 CLI 或迁移文件。

- [x] 稳定完整范围摘要、独立暂存区与工作树变化、untracked、删除/重命名、HEAD、detached 与 linked worktree。
- [x] 无 Git、无 commit、缺失根、非 worktree 根、符号链接及 tracked 祖先 symlink、文件数/字节上限。
- [x] 实际文件元数据故障注入：一次变化重试成功，持续变化恰好两次读取后 RACED；EACCES 和读取中取消。
- [x] 外部 filter/process/textconv/diff/fsmonitor marker 未被执行，继承的 GIT_DIR/GIT_WORK_TREE 不能重定向捕获。
- [x] snapshot 持久化与重开后读取、同 ID 不可变、stale workspace binding 拒绝且无记录、非法完整性组合拒绝。

首次目标测试因 workspace/index 缺失失败。后续一次完整回归发现多次捕获的集成案例超过默认 5 秒测试期限；真实 Git/SQLite 场景明确设置 30 秒、故障注入案例 15 秒测试期限，不修改产品 30 秒捕获/5 秒 Git 命令预算或重试断言。

环境：2026-09-14，macOS arm64，Node 24.18.1 / npm 11.16.0。最终 npm run check：36 文件 / 259 测试通过，typecheck/build/文档检查通过；npm run check:pack：103 包文件、所有 SDK 与新 workspace 捕获/持久化入口通过。最终文档独立检查为 89 个本地目标。远端 CI 与实际提交/合并 SHA 在本任务 PR 更新。

## 自审与限制

AI self-review，无外部审计声明。只捕获当前工作区，不生成 matched/drifted 报告，不给历史 CommandRun 补 snapshotId。完整摘要需要所有声明范围可读；不完整一律 digest=null。原始 tracked 内容也计入 64 MiB，未忽略 untracked 同样计入；不支持 submodule 内容和 symlink，返回不完整。并发复核为尽力一致性，不是操作系统原子快照或任意恶意路径竞态隔离。

新增 bindingDigest/algorithm 在内部契约明确记录；当前 snapshot JSON 不含源码、原始路径或命令内容。沿用 schema 4，回滚保留已有快照与人工数据。只有 A 完成，T10 总任务仍在进行；下一包 T10-B「比较与不确定性」。实际 head/merge SHA 及可回滚单元写入 PR 和交接。
