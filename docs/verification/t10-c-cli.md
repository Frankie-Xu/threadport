# T10-C verify CLI 交付卡

本地 Issue 草案：A/B 已合并，但 CLI 无法调用比较接口。T10 / F06 / AC-F06-4 / Q12–Q15；用现有 Capsule evidence 显式引用保存的快照，不改冻结 schema，不补历史快照。

| 工作包 | 提交 | 文件 | 测试 | 回滚 |
| --- | --- | --- | --- | --- |
| T10-C CLI | 基线 d3c439d948475d5ad4953345bb9945b369990e86；拟定 feat(T10-C): expose explicit workspace verification；head/CI/实际合并 SHA 记录在 PR | 见下方 | 首轮 3 项 CLI 集成通过；最终结果见后续记录 | 独立 main squash，保留 A/B 及全部数据 |

精确文件与职责：

- src/cli.ts：命令分派、严格选项、文本/JSON 与退出码。
- src/workspace/verify-capsule.ts：Capsule 解析、本地证据引用、只读数据库、显式根绑定与调用 B；独立文件避免把存储逻辑塞入 CLI。
- tests/cli-verify.test.ts：真实仓库与数据库，0/4/6/2/5、旧 validate、缺失/错误引用、错误根、损坏库、无命令执行；单独测试文件避免膨胀旧 CLI 测试。
- scripts/pack-smoke.mjs：隔离安装后运行实际 verify 进程，核对所有上述退出码和纯 JSON。
- README.md、docs/v0.2/12-workspace-verification.md、docs/v0.2/03-contracts.md：命令、本地引用协议、未知范围 null 投影及边界。
- docs/superpowers/plans/2026-09-14-t10-work-packages.md、2026-09-14-threadport-v0.2.md：包/任务状态。
- docs/verification/t10-c-cli.md：本交付卡。

自审：不改变 Capsule schema、旧 validate 或默认导出；不以旧 dirty_diff_hash 冒充 A 的 raw.v1。只有明确 evidence 才查库，缺失引用/库/快照不会创建数据。打开库只读、不迁移，未知 schema 或损坏报 IO。引用认证的是工作区快照比较范围，不认证 Capsule 内容或历史测试。错误消息不输出输入内容或本地路径。UI 尚未实现，后续 UI 必须消费同一报告语义；本包不声称 UI E2E 或真实 Agent 接续认证。无独立外部评审。

回滚：假匹配、退出码或旧 CLI 兼容回归时，检查后续 CLI 消费者后通过 PR revert C 的实际 squash SHA；保留 A/B 捕获/比较 SDK、schema 4、快照及人工绑定。不降级/清库。已有引用仍是合法 Capsule evidence。回滚后运行 workspace、git、全部 CLI 测试、check 与 pack；verify 命令撤销，旧命令与 A/B 仍工作。回滚仅方案审查，未进行生产回滚。

最终本地验证（macOS arm64 / Node 24.18.1）：npm run check 通过，38 文件 / 271 项测试；npm run check:pack 通过，107 个包文件，安装后的 CLI 真进程覆盖 0/4/6/2/5；最终文档检查 92 个目的地 / 40 个 Markdown 文件。未先执行红灯测试，不把首轮通过描述成失败复现；A/B 的先前证据保留。CI 与 merge SHA 记录在 PR；C 合并后 T10 的 SDK/CLI 开发收口，UI/真实接续认证仍在后续任务。
