# T18 真实 Agent 矩阵：HOLD

**证据时效：** 下方 CLI 接口与真实接续记录属于各自记录的旧安装包/版本，不认证后续运行时修复。当前提交、自动回归和待验收边界见 [整改状态](remediation-progress-2026-09-16.md)。

这不是全矩阵认证通过报告。2026-09-15 已通过实际安装包运行 macOS Codex→Codex 的三个隔离任务；第一次绝对命令路径脱敏导致 exit127，Agent回退后完成，后续用例使用可移植命令。其余21格未运行。当前 Codex 0.154.0-alpha.6.2 已登录；本机 Claude 不在 PATH，先前临时安装已不存在；Docker 服务未运行，尚无 Ubuntu 真实 Agent 条件。

每格需记录最终候选 SHA、安装包 SHA-256、OS/Node/Agent 版本、native-resume 或 new-session 模式、正确工作目录、完整人工约束、预设下一步的实际产物和用户确认。一次 exit 0 不能视作任务成功。首次失败保留，再按所属模块修复并记录重测。只保存匿名元数据，不提交原始私人日志。

| 平台 | 路径 | 隔离任务 | 状态 | 证据 |
| --- | --- | --- | --- | --- |
| macOS arm64 / Node 24 | Claude → Claude | 失败测试修复 | not_run | 版本/模式/目录/下一步证据待实测 |
| macOS arm64 / Node 24 | Claude → Claude | 保留人工约束的小改动 | not_run | 版本/模式/目录/下一步证据待实测 |
| macOS arm64 / Node 24 | Claude → Claude | 工作区变动后的重新预览 | not_run | 版本/模式/目录/下一步证据待实测 |
| macOS arm64 / Node 24 | Codex → Codex | 失败测试修复 | observed_with_issue | 仅 macOS：安装包实际接续与最终测试通过；首次命令失败保留，见下方记录 |
| macOS arm64 / Node 24 | Codex → Codex | 保留人工约束的小改动 | observed_pass | 仅修改 sum.mjs，multiply 检查及原测试通过 |
| macOS arm64 / Node 24 | Codex → Codex | 工作区变动后的重新预览 | observed_pass | 旧确认 REVISION_CONFLICT，新预览接续通过，NOTES 原样保留 |
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

## macOS 真实安装包证据

[匿名机器可读记录](real-codex-macos.json) 绑定 aa76591990b0dc6f424510cb3a937443c740bfe8 与已验证 tarball SHA-256。真实 Codex 源会话先复现失败，复制且仅索引本次源日志到隔离目录；三个独立 Git 工作区分别测试失败修复、增加 multiply 且保留 sum、工作区变动后重新准备。各包实际经安装目录的 CLI 在 PTY 展示全文，由开发代理代表已授权测试输入 CONTINUE，再由原生 resume 执行；检查目标产物、Git diff、受保护文件字节与 exit0，最后正常 /quit 并核对 ThreadPort attempt=exited/0。未以 exit0 单独判断成功。

第一场景的绝对 Node 命令被预览脱敏为 external 引用，首次运行 exit127；Agent用 node 回退成功，独立 Node24 重跑成功。这项准备问题明确保留，不能写为首次零失败；后两场景在确认前改为可移植命令。Agent登录shell可使用其配置的Node，ThreadPort运行时与最终独立复核均为Node24。

没有新增 bypass 参数或修改全局权限；继承当前账号配置，仅对本次自行创建、已核验的三个 fixture 目录接受信任提示。真实源索引仍报告 partial/unknown 事件，未宣称完整解析该版本所有事件。没有提交原始日志、会话UUID、临时私人路径或认证材料。此为开发代理观察，外部用户验证排除；Claude/cross-Agent/Ubuntu仍需真实环境，矩阵总门槛 HOLD。

## 2026-09-19 当前 Codex 接口探测

在候选工作树上对本机 `codex-cli 0.155.0-alpha.9` 仅执行 `--version`、`--help` 和 `resume --help`。帮助文本匹配 `--cd <DIR>`、`resume [SESSION_ID] [PROMPT]`，因此运行时能力探测返回 `installed=true`、`newSessionWithContext=true`、`nativeResume=true`、`auth=unknown`。这更新了可探测的接口版本白名单，但没有运行真实会话，也没有把任意 exit 0 或帮助匹配写成接续通过；24 格矩阵和真实 Codex 证据状态保持 HOLD。
