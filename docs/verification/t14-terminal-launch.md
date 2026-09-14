# T14-A · 终端执行器证据与真实 gate

依据[工作包计划](../superpowers/plans/2026-09-15-t14-terminal-launch.md)。本记录是代码/合成进程证据，不等同真实 Agent 接续认证。

| 工作包 | 提交 | 文件 | 测试 | 回滚 |
| --- | --- | --- | --- | --- |
| T14-A | PR 记录最终 head、CI 和 squash | 工作包计划中的 storage/process/targets/CLI、对应回归以及 README/契约/API/兼容/进度/验证文档 | 合成双进程与真实 Node 子进程；macOS 真实 TTY 取消；完整检查和安装包结果见 PR | revert 本包 squash；先撤回 T15 消费方；保留 schema 4 和人工数据/attempt metadata |

本地 macOS arm64 / Node 24.18.1：先验证缺少 launch 模块导致失败，再实现并通过。双独立 Node 进程同时占用同一包，退出集合为 0/4，执行标记只有一行；被 SIGKILL 的 owner 在后续读取变为 interrupted/OWNER_LOST，不能自动重试；存活 owner 保留 launching。真实 Node 子进程 exit 7 保存为 failed/TARGET_EXITED/targetExitCode=7，任务 lifecycle 仍 active。不存在的 executable、取消信号、非 TTY、--yes、终端确认时的人工编辑、构造参数时的目录变化、丢弃 prompt 的 runner 均有拒绝/状态断言。

2026-09-15 macOS 实际 PTY：生成独立合成数据目录和含空格的 Git 项目，运行实际 continue CLI，看到完整 prompt、目的端 Codex 版本和工作目录；输入 CANCEL 后退出 130，包为 cancelled，唯一 attempt 为 USER_CANCELLED，未启动 Agent。没有复制真实日志或凭据，项目文件未被目标端操作。

自审发现并对齐了既有退出码契约：Agent 非零不直接成为 CLI 自身退出码，记录独立 targetExitCode，并通过 CLI 5/TARGET_EXITED 报告。unsupported 返回 3。进程退出 0 从不写 resume_success 或自动完成任务。

真实门槛：Codex 登录检查为已登录；临时官方 Claude CLI 为未登录。未执行登录、复制认证资料或创建真实跨 Agent 会话，因此 T14-B / T18 的实机 gate 明确未完成。Windows/Linux CI 是合成进程，不是 vendor CLI/TTY 认证。观察到 owner 消失不证明残留 Agent 子进程已停止；需要用户检查原终端，应用不会猜 PID 并杀进程。

回滚仅计划，未在生产演练。没有独立人工评审。本包可合并代码后继续其他独立开发，T14 整体保持 in_progress。

最终本地检查：356 项测试 / 50 文件、typecheck/build/docs 全通过；隔离安装包 165 文件，包含安装后的 continue 非 TTY 拒绝且不创建数据目录，以及 UI/server/verify/Cursor 回归。远程 CI 与实际 squash 见 PR。
