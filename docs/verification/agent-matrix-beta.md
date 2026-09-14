# T18 真实 Agent 矩阵：HOLD

这不是认证通过报告。24 个必测单元尚未完成。当前仅核对本机版本与登录状态：Codex 0.154.0-alpha.6.2 已登录；Claude Code 2.1.270 未登录。没有启动真实 Agent，没有改变登录、权限或 bypass 配置。GitHub Actions 的 Ubuntu/macOS 合成测试不能替代真实账号与交互任务。

每格需记录最终候选 SHA、安装包 SHA-256、OS/Node/Agent 版本、native-resume 或 new-session 模式、正确工作目录、完整人工约束、预设下一步的实际产物和用户确认。一次 exit 0 不能视作任务成功。首次失败保留，再按所属模块修复并记录重测。只保存匿名元数据，不提交原始私人日志。

| 平台 | 路径 | 隔离任务 | 状态 | 证据 |
| --- | --- | --- | --- | --- |
| macOS arm64 / Node 24 | Claude → Claude | 失败测试修复 | not_run | 版本/模式/目录/下一步证据待实测 |
| macOS arm64 / Node 24 | Claude → Claude | 保留人工约束的小改动 | not_run | 版本/模式/目录/下一步证据待实测 |
| macOS arm64 / Node 24 | Claude → Claude | 工作区变动后的重新预览 | not_run | 版本/模式/目录/下一步证据待实测 |
| macOS arm64 / Node 24 | Codex → Codex | 失败测试修复 | not_run | 版本/模式/目录/下一步证据待实测 |
| macOS arm64 / Node 24 | Codex → Codex | 保留人工约束的小改动 | not_run | 版本/模式/目录/下一步证据待实测 |
| macOS arm64 / Node 24 | Codex → Codex | 工作区变动后的重新预览 | not_run | 版本/模式/目录/下一步证据待实测 |
| macOS arm64 / Node 24 | Claude → Codex | 失败测试修复 | not_run | 版本/模式/目录/下一步证据待实测 |
| macOS arm64 / Node 24 | Claude → Codex | 保留人工约束的小改动 | not_run | 版本/模式/目录/下一步证据待实测 |
| macOS arm64 / Node 24 | Claude → Codex | 工作区变动后的重新预览 | not_run | 版本/模式/目录/下一步证据待实测 |
| macOS arm64 / Node 24 | Codex → Claude | 失败测试修复 | not_run | 版本/模式/目录/下一步证据待实测 |
| macOS arm64 / Node 24 | Codex → Claude | 保留人工约束的小改动 | not_run | 版本/模式/目录/下一步证据待实测 |
| macOS arm64 / Node 24 | Codex → Claude | 工作区变动后的重新预览 | not_run | 版本/模式/目录/下一步证据待实测 |
| Ubuntu x64 / Node 24 | Claude → Claude | 失败测试修复 | not_run | 版本/模式/目录/下一步证据待实测 |
| Ubuntu x64 / Node 24 | Claude → Claude | 保留人工约束的小改动 | not_run | 版本/模式/目录/下一步证据待实测 |
| Ubuntu x64 / Node 24 | Claude → Claude | 工作区变动后的重新预览 | not_run | 版本/模式/目录/下一步证据待实测 |
| Ubuntu x64 / Node 24 | Codex → Codex | 失败测试修复 | not_run | 版本/模式/目录/下一步证据待实测 |
| Ubuntu x64 / Node 24 | Codex → Codex | 保留人工约束的小改动 | not_run | 版本/模式/目录/下一步证据待实测 |
| Ubuntu x64 / Node 24 | Codex → Codex | 工作区变动后的重新预览 | not_run | 版本/模式/目录/下一步证据待实测 |
| Ubuntu x64 / Node 24 | Claude → Codex | 失败测试修复 | not_run | 版本/模式/目录/下一步证据待实测 |
| Ubuntu x64 / Node 24 | Claude → Codex | 保留人工约束的小改动 | not_run | 版本/模式/目录/下一步证据待实测 |
| Ubuntu x64 / Node 24 | Claude → Codex | 工作区变动后的重新预览 | not_run | 版本/模式/目录/下一步证据待实测 |
| Ubuntu x64 / Node 24 | Codex → Claude | 失败测试修复 | not_run | 版本/模式/目录/下一步证据待实测 |
| Ubuntu x64 / Node 24 | Codex → Claude | 保留人工约束的小改动 | not_run | 版本/模式/目录/下一步证据待实测 |
| Ubuntu x64 / Node 24 | Codex → Claude | 工作区变动后的重新预览 | not_run | 版本/模式/目录/下一步证据待实测 |

当前支持声明保持实验性；未通过格不得写成支持指定真实平台/版本。现有 CLI fixture 与版本检测见 [兼容矩阵](../compatibility.md)。
