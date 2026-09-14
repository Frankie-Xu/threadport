# 目标端兼容性与认证边界

T13 核对 CLI 版本和参数接口，不把命令存在、help 匹配或进程退出 0 当作真实任务接续成功。所有探测返回 `auth: unknown`；登录由用户已有 Agent 安装处理，不修改认证或权限。

| Agent / 版本 | 参数证据平台 | new-session | native-resume + 当前上下文 | 实际接续认证 |
| --- | --- | --- | --- | --- |
| Claude Code 2.1.270 | macOS arm64；官方 npm @anthropic-ai/claude-code，临时隔离安装 | `["--", prompt]` | `["--resume", vendorUuid, "--", prompt]` | 尚未完成；T14/T18 |
| Codex 0.154.0-alpha.6.2 | macOS arm64；当前 Codex CLI | `["--cd", root, "--", prompt]` | `["resume", "--cd", root, "--", vendorUuid, prompt]` | 尚未完成；T14/T18 |
| 其他版本或帮助不匹配 | 不推断兼容 | export-only | export-only | 不宣称通过 |

两种模式 input 均为 argv，完整 prompt 只放一个参数，stdin 留给交互终端；原生 session UUID 来自选定来源，由 T14 从已确认的私有记录读取。没有 prompt-file 假设、shell 拼接、--print、权限绕过、自动认证或原生恢复丢弃人工目标的降级。

2026-09-15 实际只运行 --version/--help（Codex 加 resume --help），未启动真实会话。Claude 帮助的 Usage 包含 `[options] [command] [prompt]` 和 `--resume [value]`。Codex 包含 `[OPTIONS] [PROMPT]`、resume 的 `[SESSION_ID] [PROMPT]` 及 `--cd <DIR>`。实际 detector 对两端返回 installed=true、nativeResume=true、newSessionWithContext=true、auth=unknown；这些布尔值表示匹配了已核对的接口，不表示登录或接续实验成功。Claude 临时安装不会加入用户系统 PATH。

原始帮助输出 SHA-256（用于审计本次参数证据，不要求未来版本文本逐字一致）：

- Claude help：`ae85d661e9c086f05637ebcd868f5702b477ff6e55e2e65b8ada7807cd51a4b6`
- Codex help：`4abfbbaee583f6d8c3fa45fd751a138b2b8fdac68f651ac444aa36599629acb7`
- Codex resume help：`47edbbf1ed9891ba489fc0dbf3b9811b8f90fc1f6852484e7c065398f9bc0797`

探测仅搜索绝对 PATH 目录并以 shell:false 执行固定参数；每次子进程上限 5 秒/256 KiB，失败只返回常量原因。Windows .cmd/.bat 不启动，.exe/.com 才可探测。Windows 启动规格使用保守 30,000 UTF-16 字符（含参数转义）上限，超限要求缩短/导出，不能转成 shell 绕过。跨平台 CI 是合成 argv 验证，Windows/Linux 实机 CLI 认证仍属 T18。

`threadport targets` 保持旧的纯 PATH 发现输出；`threadport targets --capabilities` 和认证 API `GET /api/v1/targets` 返回 Claude/Codex 新能力 DTO，不含 executable 路径。T14-A 已接入 continue 执行器，仍必须完整预览、有效审批、终端再次确认和工作区复验；真实跨 Agent 认证仍待 T14-B/T18。

T18 的 [24 格真实验证矩阵](verification/agent-matrix-beta.md) 单独记录未完成项；参数核对与 CI 合成流程不计入该矩阵。
