# CERT-02：精确版本的目标接口

2026-11-04，macOS arm64 / Node 24。开发基线是 CERT-01 实际 main `69bb7f8e37743b146dfe953a36805ba019ad0e5d`。本包核对 Claude Code **2.1.312**、Codex **0.166.0-alpha.5.1** 的分发与只读接口，并保留先前精确版本的历史白名单。`newSessionWithContext`、`nativeResume` 仍只表示接口匹配，`auth` 始终 `unknown`；[24 格矩阵](agent-matrix-beta.md)全部 `not_run` / HOLD。

## 官方文档与来源

以下官方页面均于 2026-11-04 获取。OpenAI 文档先使用官方检索，再 fetch 匹配原页；Claude 先检索官方站点，再打开原页。动态 ConfigTable 未展开的字段不据此推断，由本机精确版本的实际 help 交叉核对。

| 官方来源 | 本包采用的事实与限制 |
| --- | --- |
| [Codex developer commands：codex resume](https://learn.chatgpt.com/docs/developer-commands#codex-resume) | interactive resume 可选择 session；明确 `--cd` 覆盖保存/当前目录选择。与 `exec resume` 分开；未运行任何真实恢复 |
| [OpenAI 官方 CLI 安装说明](https://developers.openai.com/cookbook/examples/codex/using_goals_in_codex) | 确认 `@openai/codex` 是官方 npm 渠道；本包按实际精确版本查询 registry，不把浮动 latest 当成证据，也没有执行 Goals |
| [Claude CLI reference](https://code.claude.com/docs/en/cli-reference) | 交互启动接受位置 prompt，显式 resume 可同时携带后续 query；不用 `-p` 或 print 模式替代交互接续 |
| [Claude advanced setup](https://code.claude.com/docs/en/setup) | 官方 npm 渠道、发布 manifest/checksum、公钥指纹和平台签名；未执行登录、更新、全局安装或权限调整 |

原始帮助、registry 元数据、签名验证及文件身份留在所属本地任务过程区。可提交的 [最小版本化 fixture 和证据清单](../../tests/fixtures/targets/interfaces/manifest.json)只保留去私人路径后的日期、平台、精确版本、固定参数、摘要、分发来源及必要声明，不含账户、session、环境变量、原始日志或本机路径。它是接口观察记录，不是 receipt attestation 或作者真实性证明。

## 实际探测与完整性

只运行以下参数；没有无参数 Agent、真实 prompt、实际 resume/exec、认证检查或登录。每条仍限 5 秒、stdout/stderr 各 256 KiB，`shell:false`。

| 二进制/版本 | 固定探测 | 分发核对 |
| --- | --- | --- |
| Claude Code 2.1.312 | `--version`、`--help`，均退出 0 | 现有 npm 包版本相符；275,988,512-byte 二进制 SHA-256 与官方签名 manifest 的 darwin-arm64 checksum 一致；GPG 签名及官方指纹验证，Apple 厂商签名验证成功 |
| Codex 0.166.0-alpha.5.1，App 内置 | `--version`、`--help`、`resume --help`，均退出 0 | 267,754,128-byte 二进制，OpenAI 厂商签名验证成功 |
| Codex 同版本，官方 npm 平台包 | 同上三个固定参数，均退出 0 | 精确平台 tarball SHA-512 与 registry integrity 一致，原生文件厂商签名有效；三份 stdout 与内置版本逐字节相同 |

Claude 官方 [2.1.312 manifest](https://downloads.claude.ai/claude-code-releases/2.1.312/manifest.json) 对应 SHA-256 `6b5ec691195e551b02c41df9f7d723f4ea61eaa03c2df90acefe3736f1aeb620`。其公开签名指纹为 `31DDDE24DDFAB679F42D7BD2BAA929FF1A7ECACE`，本包在隔离 keyring 验证；厂商 Team 为 `Q6L2SF6YDW`。

Codex 官方 npm 平台包是 `@openai/codex@0.166.0-alpha.5.1-darwin-arm64`，来自 [精确 metadata](https://registry.npmjs.org/@openai%2Fcodex/0.166.0-alpha.5.1-darwin-arm64)，archive SHA-256 `00e5180f324cf8be4ecdcd5f140e97b704f736e2c3053b9201bd04827790c1c2`。只在任务过程区下载和读取已核对的常规成员，没有运行安装 hooks 或修改项目依赖。平台包的原生文件为 267,753,104 bytes，与 App 内置文件的原始哈希不同；两者不被宣称为相同二进制。实际 version/help 相同，两个签名均验证，OpenAI Team 为 `2DC432GLL2`。完整原始字节身份与 stdout 摘要在本地及最小清单中分别记录。

## 参数、cwd 与上下文

| 目标 | 新会话 argv | 原生恢复 argv | cwd/传输 |
| --- | --- | --- | --- |
| Claude 2.1.312 | `["--", prompt]` | `["--resume", vendorUuid, "--", prompt]` | OS 子进程 cwd 固定为已确认 canonical workspace；完整当前人工上下文为一个 argv 参数 |
| Codex 0.166.0-alpha.5.1 | `["--cd", root, "--", prompt]` | `["resume", "--cd", root, "--", vendorUuid, prompt]` | OS cwd 和显式 `--cd` 都为该 workspace；完整 prompt 为一个 argv 参数 |

`vendorUuid` 仍必须来自原有已确认来源身份，原生恢复校验 source Agent 与目标相同；没有按标题、最近会话、marker 或 Agent 自报猜测身份。人工目标/约束随当前 handoff 同时传入，不因 resume 被丢弃。

合成回归用四条路径构造真实 handoff，核对中英文、引号、换行、长文本、`$()`、反引号及看似 flag 的内容在冻结后的完整 prompt 中，并用普通 Node 子进程逐字节回显 argv/cwd、确认无 shell marker。该 Node 子进程不是 Agent。保留已有 Windows 30,000 UTF-16 argv 上限与 handoff prompt 上限，不改 shell 或 stdin 通道。实际 Agent 是否接收完整输入、使用预期 session/cwd 并完成任务，仍须 CERT-03/04 的实机证明；Claude 没有新增猜测的 cwd flag。

## 保守匹配与降级

必须同时满足精确版本与实际帮助结构。Usage 按大小写和参数名匹配；Options 必须是唯一的顶层声明段，引用示例、代码围栏、重复或冲突声明不能补齐接口。只认精确 `--cd <DIR>` / `--resume [value]` 的声明，说明文字、相似 flag、不同大小写或缺失参数均不能视为支持。未知 help 结构保守降级，不由最新文档强行放行。

| 情形 | 结果 |
| --- | --- |
| 未安装/不可访问 | installed=false；保留原常量原因，支持导出 |
| 未核验版本、修改版版本后缀 | `unverified_version`；不探测其帮助，不自动接受版本范围 |
| 新会话 Usage/必须 flag 缺失或歧义 | `unverified_help`；new-session/native-resume 均不支持 |
| 新会话匹配，恢复 Usage/必须 flag 不符或出现 exec resume | `native_resume_unverified`；新会话接口可用，原生恢复不支持 |
| 超时、超字节、子进程错误 | `probe_failed`；不泄露原异常/路径，无 shell 兜底 |
| Windows `.cmd`/`.bat` 等不支持包装 | `unsupported_executable`；不调用探测，也不转 shell 执行 |

旧白名单 Claude 2.1.270、Codex 0.154.0-alpha.6.2 / 0.155.0-alpha.9 保留原 [历史参数证据](../compatibility.md)与兼容测试。它们的声明格式满足新匹配规则；本包没有重新下载/运行旧版本，也不把当前文档、签名或新版本 help 冒称旧版本的当日证明。未来任何新版本仍需单独核验。

## 真实文件大小与身份读取

当前 Claude 文件是 **263.20 MiB**，实际超过旧 `freezeLaunchPlan` 的 256 MiB 文件上限；只加版本白名单会造成“接口匹配、计划始终失败”。本包将身份读取的上限调整到下一档 **320 MiB**，满足实测文件并保留明确上界；大于该值仍返回 `REVISION_CONFLICT`。读取仍复用 1 MiB buffer、流式 SHA-256、NOFOLLOW、完整 stat 身份及最终路径复验，没有一次性加载整个文件。

身份读取还使用非阻塞描述符打开，再核对常规文件，避免先 blocking open、后 fstat 的顺序在无写端 FIFO 上停住。该缺口由本地合成计划/可执行路径替换触发，涉及本机读取可用性，不是已证明的远程执行或权限绕过。POSIX FIFO 回归有定时解阻保护，确认快速拒绝；Windows 仅排除 FIFO 适用性。

对应回归覆盖当前文件大小以上旧界限的冻结/复验、后段字节变化拒绝、320 MiB 超限拒绝以及特殊文件拒绝。它们只检查计划和字节，没有执行模拟大文件或真实目标。计划批准、TTY 再确认、单次消费、占用、恢复和 receipt/authority 边界沿用已有实现与回归。

## 验证与回退边界

本包改运行时，因此交付卡记录 Node 24 下定向回归、完整 check、coverage、浏览器 E2E 和隔离安装包的实际结果；命令未完成前不在此预填通过。UI、数据库/schema 15、依赖和既有能力布尔值语义不变，没有 CERT-03/04/05 真实实验、登录、外部用户实验或认证通过声明。

普通回退以本包实际 squash 为单位，检查后续精确版本/格式消费者后整体 revert；没有 DB 降级。回退后本次新精确版本降为 unknown/export-only，原版本与历史证据仍在；263.20 MiB 文件会恢复旧身份预算限制。原始过程记录与首次失败保留，不覆盖历史或靠降低校验强度恢复“支持”。
