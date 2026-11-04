# 目标端兼容性与认证边界

**当前状态（2026-11-04，CERT-02）：** 从 CERT-01 实际 main `69bb7f8e37743b146dfe953a36805ba019ad0e5d` 核对 Claude Code **2.1.312** 与 Codex **0.166.0-alpha.5.1** 的官方来源和只读接口，见 [版本化接口证据](verification/target-interfaces-2026-11-04.md)。只加入这两个经过核验的精确版本，不自动接受后续版本。当前候选的 24 格仍全部 `not_run`，认证保持 HOLD；[隔离认证工具](verification/agent-certification-harness.md) 及接口匹配不替代真实功能认证。

**历史证据时效：** 旧版本保留原参数证据与兼容回归，不用今日文档反推旧包行为，也不把旧真实接续记录迁移给当前候选。历史整改边界见 [整改状态](verification/remediation-progress-2026-09-16.md)。本包只做接口匹配，没有运行真实 Agent 接续。

T13 核对 CLI 版本和参数接口，不把命令存在、help 匹配或进程退出 0 当作真实任务接续成功。所有探测返回 `auth: unknown`；登录由用户已有 Agent 安装处理，不修改认证或权限。

| Agent / 版本 | 参数证据平台 | new-session | native-resume + 当前上下文 | 实际接续认证 |
| --- | --- | --- | --- | --- |
| Claude Code 2.1.312（2026-11-04） | macOS arm64；现有官方 npm 安装，厂商签名及签名 manifest 校验 | `["--", prompt]` | `["--resume", vendorUuid, "--", prompt]` | not_run；auth=unknown；CERT-03/04 待验收 |
| Codex 0.166.0-alpha.5.1（2026-11-04） | macOS arm64；厂商签名的 App 内置二进制及完整性校验的官方 npm 平台包，帮助输出相同 | `["--cd", root, "--", prompt]` | `["resume", "--cd", root, "--", vendorUuid, prompt]` | not_run；auth=unknown；CERT-03/04 待验收 |
| Claude Code 2.1.270 | macOS arm64；官方 npm @anthropic-ai/claude-code，临时隔离安装 | `["--", prompt]` | `["--resume", vendorUuid, "--", prompt]` | 尚未完成；T14/T18 |
| Codex 0.154.0-alpha.6.2 / 0.155.0-alpha.9 | macOS arm64；当前 Codex CLI | `["--cd", root, "--", prompt]` | `["resume", "--cd", root, "--", vendorUuid, prompt]` | 尚未完成；T14/T18 |
| 其他版本或帮助不匹配 | 不推断兼容 | export-only | export-only | 不宣称通过 |

两种模式 input 均为 argv，完整 prompt 只放一个参数，stdin 留给交互终端；原生 session UUID 来自选定来源，由 T14 从已确认的私有记录读取。没有 prompt-file 假设、shell 拼接、--print、权限绕过、自动认证或原生恢复丢弃人工目标的降级。

2026-09-15 实际只运行 --version/--help（Codex 加 resume --help），未启动真实会话。Claude 帮助的 Usage 包含 `[options] [command] [prompt]` 和 `--resume [value]`。Codex 0.154.0-alpha.6.2 与 0.155.0-alpha.9 均核对了 `[OPTIONS] [PROMPT]`、resume 的 `[SESSION_ID] [PROMPT]` 及 `--cd <DIR>`。实际 detector 对已匹配版本返回 installed=true、nativeResume=true、newSessionWithContext=true、auth=unknown；这些布尔值表示匹配了已核对的接口，不表示登录或接续实验成功。Claude 临时安装不会加入用户系统 PATH。

原始帮助输出 SHA-256（用于审计本次参数证据，不要求未来版本文本逐字一致）：

- Claude help：`ae85d661e9c086f05637ebcd868f5702b477ff6e55e2e65b8ada7807cd51a4b6`
- Codex help：`4abfbbaee583f6d8c3fa45fd751a138b2b8fdac68f651ac444aa36599629acb7`
- Codex resume help：`47edbbf1ed9891ba489fc0dbf3b9811b8f90fc1f6852484e7c065398f9bc0797`

探测仅搜索绝对 PATH 目录并以 shell:false 执行固定参数；每次子进程上限 5 秒/256 KiB，失败只返回常量原因。Windows .cmd/.bat 不启动，.exe/.com 才可探测。Windows 启动规格使用保守 30,000 UTF-16 字符（含参数转义）上限，超限要求缩短/导出，不能转成 shell 绕过。跨平台 CI 是合成 argv 验证，Windows/Linux 实机 CLI 认证仍属 T18。

CERT-02 对 Usage、唯一 Options 声明段、精确 flag/参数名及声明歧义作保守检查；说明文字、引用示例、相似 flag 或大小写变化不能补齐缺失接口。Codex 的 interactive `resume` 与 `exec resume` 分开，原生恢复仍同时传入明确 session 和完整当前上下文。`--cd` 的覆盖语义来自当前官方文档；实际目标运行后的 cwd 留待真实实验核对。

当前 Claude 二进制为 275,988,512 bytes（263.20 MiB），已超过原冻结计划的 256 MiB 身份读取上限。该上限调整为 **320 MiB**，仍用 1 MiB 流式 buffer、常规文件验证、NOFOLLOW、文件/路径身份和哈希复验，并以非阻塞打开拒绝无写端 FIFO；大于 320 MiB 仍失败关闭。这不是权限放宽或认证通过。探测的 5 秒/256 KiB、完整 prompt 与 Windows argv 预算均不变。

`threadport targets` 保持旧的纯 PATH 发现输出；`threadport targets --capabilities` 和认证 API `GET /api/v1/targets` 返回 Claude/Codex 新能力 DTO，不含 executable 路径。T14-A 已接入 continue 执行器，仍必须完整预览、有效审批、终端再次确认和工作区复验；真实跨 Agent 认证仍待 T14-B/T18。

T18 的 [24 格真实验证矩阵](verification/agent-matrix-beta.md) 单独记录未完成项；参数核对与 CI 合成流程不计入该矩阵。

CERT-01 的 A/B/C 固定任务分别覆盖失败修复、双语人工约束和漂移后重新准备。证据绑定源码 SHA、tarball SHA-256、平台/架构/Node、Agent 精确版本、模式、场景及预览/launch plan 摘要；校验器拒绝旧候选、缺字段、错绑定和不满足的产物。`complete-unverified` 仅表示格式/关联及固定任务产物满足，用户可填 JSON 不提供真实性证明，也不能创建 receipt attestation、authority、有效责任或 `verified-complete`。独立复核与真实矩阵结论另行保存。

## 控制平面覆盖度

| 能力 | Claude/Codex 本地日志 | ThreadPort 事件 | 运行控制 |
| --- | --- | --- | --- |
| Observe | 版本化读取；缺少 parent/run 字段时 `coverage-gap` | `prepare/confirm/launch/interrupt` 可登记 | 只读 |
| Receipt | manifest digest、target、expiry、nonce 校验 | 分阶段 receipt 可重放 | 不表示目标理解或完成 |
| Takeover | 无通用停止承诺 | 无控制接口显示 `stop-unavailable` | 只有显式 runner 验证后才允许 active |

协议存在、标题相似、时间接近、共享 cwd 或 Agent 自报均不能单独确认 parent/child、停止成功或 verified-complete。具体 parser/runtime 版本和 fixture 证据必须随验证记录保存。
