# T10-B 比较与不确定性报告交付卡

本地 Issue 草案：完整快照捕获已有，但没有显式绑定下的比较 API。本包实现只读 verifyWorkspace，输出 matched/drifted/unverifiable；CLI 留给 C。对应 T10 / F06 / AC-F06-1–3 / Q12–Q15 的 SDK 层。

| 工作包 | 提交 | 文件 | 测试 | 回滚 |
| --- | --- | --- | --- | --- |
| T10-B | 基线 070d095c2f2fb616b240b2e765e6a2b6df5c104c；拟定 feat(T10-B): verify captured workspace state；实际 head、CI 与合并 SHA 记录在 PR | 见下方精确清单 | 见验证记录 | 一个 squash 提交；保留 A，先检查消费者 |

文件清单：

- src/workspace/verify.ts：只读捕获与优先级比较。
- src/workspace/contracts.ts、src/workspace/index.ts：公开报告类型与 API。
- tests/workspace/verify.test.ts：真实仓库、绑定、内容/HEAD/索引变化、限制、取消与输入验证。
- tests/workspace/snapshot-races.test.ts：复用 A 的文件读取故障注入，验证失读及两次持续变化优先于 drift。
- scripts/pack-smoke.mjs：隔离安装后调用比较 API。
- docs/v0.2/12-workspace-verification.md：接口和范围限制。
- docs/superpowers/plans/2026-09-14-t10-work-packages.md、2026-09-14-threadport-v0.2.md：工作包与总任务状态。
- docs/verification/t10-b-verify.md：本交付卡。

验证记录：先运行新增测试，6 项因 verifyWorkspace 尚未导出而失败；实现后目标测试 13/13 通过。补充不同 worktree、读取失败及持续并发编辑回归后运行完整 check 与隔离 pack，最终结果见本卡后续记录和 PR。

自审：完整性与身份判断优先；不执行日志命令；未新增数据库迁移/持久化写入；消息不含本地路径或底层异常；相对路径字段在没有逐文件证据时省略。HEAD 变化只报告 HEAD_CHANGED，因为 raw.v1 指纹本身包含 HEAD，无法独立归因文件变化。portable `.` 必须经消费者显式绑定，不按 cwd 推断。本包无真实 Agent 接续认证，无独立外部评审。

回滚触发：假 matched、错误工作区归属或报告泄漏。没有 C/T11/T12/T14 消费者时可单独通过 PR revert 本包的 main squash SHA；已有消费者先按依赖逆序处理。保留 A 捕获/存储 API、schema 4、已有 snapshot 和人工绑定。回滚后运行 A 的 workspace 捕获测试、npm run check、npm run check:pack。回滚方案为设计审查，未实际执行数据库降级或生产回滚。

最终本地验证（macOS arm64，Node 24.18.1）：`npm run check` 通过，37 个测试文件 / 267 项测试；`npm run check:pack` 通过，105 个文件，隔离安装验证旧 CLI 与公开 SDK。文档更新后再次运行 check:docs；远端各平台结果与真实合并 SHA 以 PR 为准。
