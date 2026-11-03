# 真实 Agent 当前候选矩阵：HOLD

**当前状态（2026-11-04，CERT-01）：** 本包从 BASE-01 实际 main `93429de02dd8d43c73cc168709adff13d2817e14` 开发，尚未冻结真实认证候选或安装该候选进行 Agent 实验。下面 24 格全部 `not_run`；macOS/Ubuntu 功能认证、适用异常矩阵及独立抽验均待后续 CERT 包。Windows 真实认证单列待办。准备工具和校验格式见 [CERT-01 使用说明](agent-certification-harness.md)。

**历史证据时效：** 后面的旧 CLI 接口与真实接续记录仅适用于各自源码/安装包/版本，不认证当前运行时。历史整改边界见 [整改状态](remediation-progress-2026-09-16.md)。

这不是全矩阵认证通过报告。2026-09-15 在旧安装包实际运行 macOS Codex→Codex 的三个隔离任务；第一次绝对命令路径脱敏导致 exit127，Agent回退后完成，后续用例使用可移植命令。该旧候选其余21格未运行。该次环境为 Codex 0.154.0-alpha.6.2 已登录、Claude 不在 PATH、先前临时安装已不存在、Docker 服务未运行；这些历史事实不代表当前环境或候选已经完成认证。旧三格观测在下方历史表单列，不放入当前矩阵。

2026-09-22 当时的 control-plane 候选只增加自动验证与交接记录，那一轮未进行真实 Agent 登录或接续实验。旧包三个观察结果不迁移为该候选的通过记录，Ubuntu/macOS/Windows 的真实 Agent 路径继续按缺口保留 `unknown`、`coverage-gap`、`not_run` 或 `HOLD`，参见 [开发交接记录](control-plane-handoff-2026-09-22.md)。

每格需记录最终候选 SHA、安装包 SHA-256、OS/Node/Agent 版本、native-resume 或 new-session 模式、正确工作目录、完整人工约束、预设下一步的实际产物和用户确认。一次 exit 0 不能视作任务成功。首次失败保留，再按所属模块修复并记录重测。只保存匿名元数据，不提交原始私人日志。

| 平台 | 路径 | 隔离任务 | 状态 | 证据 |
| --- | --- | --- | --- | --- |
| macOS arm64 / Node 24 | Claude → Claude | 失败测试修复 | not_run | 版本/模式/目录/下一步证据待实测 |
| macOS arm64 / Node 24 | Claude → Claude | 保留人工约束的小改动 | not_run | 版本/模式/目录/下一步证据待实测 |
| macOS arm64 / Node 24 | Claude → Claude | 工作区变动后的重新预览 | not_run | 版本/模式/目录/下一步证据待实测 |
| macOS arm64 / Node 24 | Codex → Codex | 失败测试修复 | not_run | 当前候选待运行；旧观测见历史表 |
| macOS arm64 / Node 24 | Codex → Codex | 保留人工约束的小改动 | not_run | 当前候选待运行；旧观测见历史表 |
| macOS arm64 / Node 24 | Codex → Codex | 工作区变动后的重新预览 | not_run | 当前候选待运行；旧观测见历史表 |
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

当前任务固定为 A（失败修复）、B（中英文人工约束）、C（人工漂移后重新准备）。单格必须绑定同一冻结运行时候选与安装包，保存逐项产物、保护文件、身份/cwd/argv、首次失败和适用异常证据。`not_run`、环境受阻、`observed_with_issue` 均不能计入 G1。用户填写的证据通过格式校验也只得到 `complete-unverified`，还需独立审查；不创建生产 receipt attestation、authority、有效责任或 verified-complete。

## 历史：2026-09-15 macOS 旧安装包观测

| 旧候选路径 | 隔离任务 | 历史状态 | 观测 |
| --- | --- | --- | --- |
| macOS Codex → Codex | 失败测试修复 | observed_with_issue | 最终测试通过；首次 exit127 保留 |
| macOS Codex → Codex | 保留人工约束 | observed_pass | 仅修改 sum.mjs，multiply 及原测试通过 |
| macOS Codex → Codex | 漂移后重新准备 | observed_pass | 旧确认 REVISION_CONFLICT，新预览接续，NOTES 保留 |

[匿名机器可读记录](real-codex-macos.json) 绑定 aa76591990b0dc6f424510cb3a937443c740bfe8 与已验证 tarball SHA-256。真实 Codex 源会话先复现失败，复制且仅索引本次源日志到隔离目录；三个独立 Git 工作区分别测试失败修复、增加 multiply 且保留 sum、工作区变动后重新准备。各包实际经安装目录的 CLI 在 PTY 展示全文，由开发代理代表已授权测试输入 CONTINUE，再由原生 resume 执行；检查目标产物、Git diff、受保护文件字节与 exit0，最后正常 /quit 并核对 ThreadPort attempt=exited/0。未以 exit0 单独判断成功。

第一场景的绝对 Node 命令被预览脱敏为 external 引用，首次运行 exit127；Agent用 node 回退成功，独立 Node24 重跑成功。这项准备问题明确保留，不能写为首次零失败；后两场景在确认前改为可移植命令。Agent登录shell可使用其配置的Node，ThreadPort运行时与最终独立复核均为Node24。

没有新增 bypass 参数或修改全局权限；继承当前账号配置，仅对本次自行创建、已核验的三个 fixture 目录接受信任提示。真实源索引仍报告 partial/unknown 事件，未宣称完整解析该版本所有事件。没有提交原始日志、会话UUID、临时私人路径或认证材料。此为开发代理观察，外部用户验证排除；Claude/cross-Agent/Ubuntu仍需真实环境，矩阵总门槛 HOLD。

## 历史：2026-09-19 Codex 接口探测

在候选工作树上对本机 `codex-cli 0.155.0-alpha.9` 仅执行 `--version`、`--help` 和 `resume --help`。帮助文本匹配 `--cd <DIR>`、`resume [SESSION_ID] [PROMPT]`，因此运行时能力探测返回 `installed=true`、`newSessionWithContext=true`、`nativeResume=true`、`auth=unknown`。这更新了可探测的接口版本白名单，但没有运行真实会话，也没有把任意 exit 0 或帮助匹配写成接续通过；24 格矩阵和真实 Codex 证据状态保持 HOLD。
