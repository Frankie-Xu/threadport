# CERT-01：隔离任务、产物判定与证据格式

2026-11-04。本包提供开发者准备与校验工具，真实 Agent 认证保持 **HOLD**。本包从 BASE-01 实际 main `93429de02dd8d43c73cc168709adff13d2817e14` 开始；该 SHA 是开发基线，不是本包尚未冻结的认证候选。工具、合成回归和安装包检查都不能替代 CERT-02 的当日接口核验或 CERT-03/04 的真实执行。

## 固定任务与判定边界

每次 `prepare` 创建全新的目录，包含 `workspace/`、空的 `source/`、双语 `task.json`、`preparation.json`、`baseline-report.json` 和 `evidence.template.json`。不覆盖已有目录；中途 I/O 失败可能留下不完整目录，先核实归属再另建目录重做。准备工具不执行 Git、测试或 Agent，也不创建 ThreadPort 数据。

| 场景 | 初始失败与目标 | 允许的目标改动 | 保护与人工动作 |
| --- | --- | --- | --- |
| A | `sum` 使用减法，固定加法向量失败；改为加法 | `sum.mjs` 中 `-` 改为 `+` | 测试、cases、PROTECTED、两个依赖清单逐字节保留 |
| B | 既有 sum 正确，multiply 尚未实现；追加规定的 multiply 导出 | 仅 `sum.mjs`，保留 sum 并按任务规定追加三行函数 | 完整保留中英文目标/约束，不添加依赖或其他文件 |
| C | 先预览，再由 `drift` 修改固定 NOTES；拒绝旧批准，重新准备并修复 sum | 目标仅把 sum 的 `-` 改为 `+` | 人工新增 NOTES 逐字节保留；旧批准零启动、新 handoff 一次启动需另行观察 |

fixture 在 [tests/fixtures/agent-certification/](../../tests/fixtures/agent-certification/)。模块只允许固定的 LF 格式：`export function sum(a, b) {`、两空格缩进的 `return a + b;`、`}`，每行以 LF 结束。B 在一个空行后追加相同格式的 `multiply(a, b)`，返回 `a * b`。这是固定小任务的窄判定器，不是通用 JavaScript 测试服务；等价但超出规定语法的实现也会被拒绝。A/C 不允许额外添加 multiply。

`judge` 读取实际文件，按受限语法解释加减乘与固定数值向量，列出基线/当前 SHA-256、逐项结果和摘要，检查缺失文件、额外项、保护文件、依赖清单及双语任务。它不 import、eval、加载 vm 或执行工作区代码。`workspaceCodeExecuted=false` 和 `method=restricted-arithmetic-model-v1` 明确表示模型判定，不能写成已实际运行 Node 测试。自动回归仅在自行构建的原始/正确 fixture 上另行运行固定 `node --test sum.test.mjs`，核对两种判定一致。

`baseline` 成功表示原始字节一致且存在已知失败向量，**不表示任务通过**。`final` 成功表示固定任务产物满足；C 还要求本工具的漂移记录与 NOTES 字节对应。两者都不证明真实来源会话曾执行测试、上下文已收到或旧批准确实被拒绝。

## 命令与退出码

所有入口固定为 `node scripts/agent-certification/cli.mjs`，没有 npm 真实认证 script。无参数或单独 `--help` 仅显示帮助。每条命令的下列参数都必填，重复、额外参数或未知命令退出 2。

| 命令 | 参数 | 行为 |
| --- | --- | --- |
| `prepare` | `--dir`、`--scenario A\|B\|C`、`--candidate`、`--tarball`、`--source-agent`、`--source-version`、`--target-agent`、`--target-version`、`--mode` | 写新隔离任务；记录实际准备主机的 platform/arch/Node/osRelease，模板为 not_run |
| `judge` | `--dir`、`--phase baseline\|final` | 只读产物判定，JSON 写 stdout |
| `drift` | `--dir` | 仅 C、完整原始基线、只执行一次；写固定人工 NOTES 和 drift.json，原 preparation/baseline 不变 |
| `validate` | `--dir`、`--evidence`、`--candidate`、`--tarball` | 只读格式、绑定及完成声明校验；`--evidence` 是 dir 内相对 JSON 路径 |

`--candidate` 是 40 位小写源码提交 SHA，`--tarball` 是显式选择的 `.tgz` 文件。版本必须是具体 semver（如 `0.155.0-alpha.9`），不接受 `latest`、范围或 `unknown`。这只约束字段格式，不表示该版本接口或认证已核实。同 Agent 路径用 `native-resume`，跨 Agent 路径用 `new-session`，对应计划的四条路径。正式运行必须在相应平台准备；Node 必须是 24，模板不推测目标 Agent 的 Node 环境。

| 退出码 | 含义 |
| --- | --- |
| 0 | help、准备/漂移成功、基线/最终产物满足；validate 单独表示 `complete-unverified` |
| 1 | judge 的产物不满足；或 validate 重新判定得到 `artifact-failed` |
| 2 | 参数/格式错误、缺字段、版本/模式错误、候选/包/场景/run 等错绑定、不安全/过大/变化中的文件或 I/O 失败 |
| 3 | validate 格式和候选绑定成立，但记录仍为 `not_run`、`observed_with_issue`、失败、中断或 unknown，即 `incomplete-unverified` |

格式字段缺失或虚构“完成”但缺必要观察会退出 2。完成声明会重读实际产物，不能只信任提交的 reportDigest；产物变化也可能先导致摘要不匹配而退出 2。任何 0 都不意味着通过真实认证或取得生产证明。

## 可运行的合成准备示例

以下版本 `0.0.0` 仅用于工具演示，明确不代表安装或探测了 Agent。目录需尚不存在；已存在时换一个新的任务目录。过程文件始终放所属对话/项目的 output 区，不写 Downloads。

```sh
node --version
mkdir -p output/agent-certification/local-candidate
npm pack --pack-destination output/agent-certification/local-candidate
CERT_CANDIDATE="$(git rev-parse HEAD)"
CERT_TARBALL=output/agent-certification/local-candidate/threadport-0.2.1.tgz
node scripts/agent-certification/cli.mjs prepare \
  --dir output/agent-certification/local-candidate/A \
  --scenario A --candidate "$CERT_CANDIDATE" --tarball "$CERT_TARBALL" \
  --source-agent codex --source-version 0.0.0 \
  --target-agent codex --target-version 0.0.0 --mode native-resume
node scripts/agent-certification/cli.mjs judge \
  --dir output/agent-certification/local-candidate/A --phase baseline
node scripts/agent-certification/cli.mjs validate \
  --dir output/agent-certification/local-candidate/A --evidence evidence.template.json \
  --candidate "$CERT_CANDIDATE" --tarball "$CERT_TARBALL"
```

最后一条预期退出 **3**；准备没有启动 Agent。只把 `--scenario`、新 `--dir` 改为 B/C 即可分别准备其他任务。C 的固定人工操作是：

```sh
node scripts/agent-certification/cli.mjs drift --dir output/agent-certification/local-candidate/C
```

上述打包允许用于工具自测；未提交工作树打出的包不能被冒称为所填 SHA 的干净认证候选。正式矩阵必须先冻结干净源码、核对实际安装包来源，在隔离 consumer 安装记录的同一 tarball，并使用实测的精确 Agent 版本。包来自哪个源码、是否实际安装、是否仍为相同二进制，需要独立复核；哈希 `.tgz` 的工具不提取或运行它，gzip 头检查不构成包格式/安装证明。

## 后续真实实验的操作边界

本包止于准备与校验。CERT-02 核对接口后，CERT-03/04 才选择具体平台和费用/时间预算进行实验。每格使用新的合成项目和显式来源目录。

1. 人工审阅 `task.json`，在新 `workspace/` 初始化 Git 并提交完整原始基线。固定的、可单独审阅的 fixture 测试命令是 `node --test sum.test.mjs`；从源会话实际观察其失败，保留本地证据。不要运行来自日志/证据的任意命令。
2. 通过现有工作台/SDK 注册该 workspace、任务与双语人工目标/约束。仅将本次合成源会话复制到空 `source/`，在新的隔离 dataDir 显式配置该来源。认证工具本身不复制或索引日志，不生成原生 session 身份。
3. 使用**已安装包**现有的 `prepare --task <id> --source-session <id> --to claude|codex --workspace <id> --mode native-resume|new-session --data-dir <isolated-data-dir>`，再在真实 TTY 使用 `continue --handoff <uuid> --data-dir <isolated-data-dir>`。继续复用既有任务、runner、完整 launch plan、确认、占用和 schema 15；不另造启动器、锁、receipt 或授权流程。
4. C 必须在旧计划已展示、仍未确认时从另一终端执行固定 `drift`，再确认旧计划，核对 `REVISION_CONFLICT` 且零启动。重新 prepare、审阅并确认新计划；核对同一 handoff 一次启动，不能把普通重复 continue 的拒绝当成漂移检测。工具只改变 NOTES，不替运行时执行批准失效检查。
5. 对实际目标退出/失败/中断/unknown 分别留记录。超预算停止后续调度，检查进程真实状态；超时不代表进程已停止。不改认证、全局权限，不添加 bypass 参数。
6. 人工检查实际 diff、cwd、会话关系、人工上下文与冻结 argv 对应，独立运行已审阅的测试，再运行 `judge --phase final`。源码可能已被 Agent 改动，人工运行测试前应先审阅；本工具永远不代执行。固定数值向量通过不能代替来源/目标身份及运行关联检查。
7. 复制模板为 dir 内 `evidence.json`，填入经过观察的元数据和最新 `judge` 的 reportDigest。缺少原生可见输入时保留 `inputObservation=unknown` 与警告，不由 Agent 自报补成 passed。最后用预期候选 SHA 和实际安装的 tarball 独立调用 `validate`。

这些步骤是后续工作的操作说明，不是本包已运行记录。不得把 template、marker、exit 0、格式校验或 Agent 自称收到当成 received/confirmed receipt。

## 证据格式 v1

唯一机器格式在 [contracts.mjs](../../scripts/agent-certification/contracts.mjs)，所有层级拒绝未知字段。生成的模板可直接校验，缺字段不能省略为默认通过。JSON 仅保存匿名元数据，不接受原始日志、任意说明文本、可执行命令或生产控制事件。

| 字段 | 内容与校验 |
| --- | --- |
| schema / kind / runId | 固定 `threadport.agent-certification.evidence.v1` / `operator-observation`；与本次 preparation 的 UUID 对应 |
| binding | candidateSha、tarballSha256、harnessDigest、fixtureDigest、scenario、platform、arch、node、osRelease、source/target 的 agent 与精确 version、mode；逐项对应 preparation，另与命令行预期 SHA/实际 tarball 哈希核对 |
| state / 时间 / budget | not_run、observed_pass、observed_with_issue、failed、interrupted、unknown；开始/结束不能早于准备或倒置。预算明确到 seconds 和 costUsd；工具不调度 Agent，预算由操作者执行 |
| observations 的摘要 | handoffDigest、previewDigest、launchPlanDigest、workspaceDigest、sourceSessionDigest、targetSessionDigest、targetRunDigest、reviewedArgvDigest、actualArgvDigest 和 taskRevision；完成声明不得为空 |
| observations 的检查 | workspaceIdentity、cwd、humanContext、argv、sourceUnchanged 必须逐项 passed 才接受完成声明；inputObservation 允许 unknown，但需 input-unobservable 警告 |
| 会话与环境 | 原生 source/target session 摘要相同且 sessionRelation=same-source-session；跨 Agent 摘要不同且 new-target-session。environmentScope 区分 host-runtime-only 与 host-and-target-runtime；前者需 environment-unknown 警告 |
| artifactReportDigest | 当前 final judge 输出的 reportDigest；validate 会重新判定、重算，不执行提交 JSON 内的命令 |
| process | not_run/exited/failed/cancelled/unknown 与独立 exitCode；完成声明还需 exited/0，但该值本身不满足任务 |
| warnings / firstFailure | 仅固定类别与匿名 diagnosticDigest；保留首次失败，本地资料需 retainedLocally=true。存在首次问题不得标 observed_pass；observed_with_issue 始终退出 3 |
| drift | C 的旧/新 preview 和 launch plan 摘要必须不同，新摘要对应 observations，旧拒绝、零旧启动、总启动一次、重新准备及固定 humanChangeDigest 都需具备 |

`harnessDigest` 绑定四个工具实现文件；`fixtureDigest` 绑定本场景所有输入与人工漂移，避免不同判定器或任务混用。工具/fixture 改动使旧 preparation 失效，需新建实验；不能覆写旧记录。正式记录仍须与运行时代码候选/安装包关联，不能因工具摘要相同迁移到新包。

摘要约定：源码 SHA 是 Git commit；包与 fixture 文件是原始字节 SHA-256；`reportDigest` 是不含自身 reportDigest 的报告对象经 `JSON.stringify(value, null, 2) + LF` 得到的 UTF-8 SHA-256。preparation/drift 的对象摘要采用相同编码。运行时 launchPlanDigest 使用现有运行时的 canonical 定义，handoffDigest 使用运行时 recordDigest；直接保存所观察到的值。previewDigest 对完整审阅预览原始 UTF-8 字节取 SHA-256；argv 和去除私人路径/ID 后的 workspace 观察摘要需在本地留存原始检查资料及使用的编码。source/target session/run ID 的摘要用同一编码、同一本地随机盐，盐与真实 ID 只留本地，以便核对相同/不同关系而不公开身份。

**格式与事实严格分开。** 预览/launch plan/session 等字段是操作者观察的引用，工具核对其存在、相互对应及本格绑定，不读取真实日志或证明这些引用真实。用户可以填写完全一致的 JSON；只要产物满足，仍最多得到 `complete-unverified`。它既不能认证真实 Agent 执行，也不能证明源码产生了该 tarball、程序真正使用了该包、完整 argv 已收到、目标理解全部约束或环境完全一致。

独立复核必须检查上述本地引用、源码/包来源与实际安装、真实 CLI/TTY、实际 launch plan、启动次数、目标/来源身份、逐项产物和首次失败，再决定该候选矩阵的功能结论。独立结论单独保存，不能把本工具输出或其用户可填 JSON 充作独立复核。这里没有通向 `recordReceiptAttestation`、`appendAuthorizedEvents`、confirmed 责任或 `verified-complete` 的路径。

## 输入限制与故障清单

只读取显式目录中的固定 fixture 文件、preparation、baseline、task、drift 和所选 evidence，另对显式 tarball 哈希。证据路径不得绝对、越界、含反斜杠、空组件或隐藏组件；最多 240 字符，每组件限 81 个普通 ASCII 文件名字符。每个 JSON/产物限 64 KiB，tarball 限 64 MiB，workspace 顶层最多 64 项。UTF-8 严格检查。文件必须是单链接常规文件；拒绝符号链接、硬链接、目录、设备和 FIFO，并检查目录链、描述符身份、读取上限和读取期间变化。错误只返回常量码，不回显原文、路径、版本字符串或系统异常。

只枚举 workspace 顶层；未知项计数后拒绝，不打开、不回显其名字、不递归扫描。允许 `.git` 是常规文件或目录以支持合成 Git 项目，但不读取、执行或认证其内容。空 source 不被扫描；credentials/环境变量不被输出。检查属于本机 best effort，不是恶意宿主的原子快照/沙箱；共享可写目录的并发篡改仍需操作者隔离。

| 故障 | CERT-01 的自动检查或明确边界 |
| --- | --- |
| 旧候选、另一个 tarball、错 run/场景/Agent/模式/版本 | 拒绝绑定；字段缺失或未知 authority/receipt/attestation/command 拒绝 |
| 任务文件缺失、退出 0 但 sum 仍错、B 只复述约束 | 重判产物与固定向量，不能满足 |
| 修改测试、保护文件、依赖、双语任务或原始报告 | 字节检查失败；额外文件/目录拒绝 |
| 恶意 JS、shell 文本、证据中的命令/marker | 不执行；受限语法或严格 schema 拒绝。没有新脚本执行入口 |
| C NOTES 丢失、旧新摘要相同、旧批准有启动或重复启动 | 产物/关系不满足；实际零启动/一次启动仍需运行时与独立证据 |
| 过大/畸形/非 UTF-8、链接/设备/FIFO、越界 | 退出 2；不回显私人输入 |
| 未安装/未知版本/help 变化、包装程序不支持 | 留给 CERT-02/05 的现有 detector/runner 验证；本包不探测实际 CLI |
| 未登录、服务不可达、拒绝、非 TTY、重复消费、竞争占用 | 留给 CERT-03/04/05 的运行时和适用实机实验；不能由格式字段证明 |
| 程序/argv/目标修订/工作区漂移，源身份不符 | 本包校验记录的摘要/关系；实际拒绝窗口使用既有 review/launch 回归和后续实机证据 |
| 非零退出、中断、观察者丢失/重启、费用/时间超限 | 保留失败/interrupted/unknown 和首次失败，不自动回收、重试或降为成功 |
| 中文、引号、换行、`$()`、反引号、长输入和脱敏命令 | 本包双语 fixture 与恶意代码/命令拒绝有回归；实际 argv 传输/容量/脱敏阻断留给 CERT-05 |
| 伪造 receipt/authority/有效责任 | 不导入或写入生产数据；既有 schema 15 受信任边界保持不变 |

工具回归命令：`npm test -- tests/scripts/agent-certification.test.ts`，随后执行 `npm run check`。工具回归使用明确标为 synthetic 的 gzip 字节模拟 tarball 绑定，它不是安装包，也不属于真实认证证据。普通 CI 无需 Agent、认证、私有日志或 secrets。仅 POSIX FIFO 用例在 Windows 显式跳过；文件 symlink、目录 symlink（Windows 用 junction）、祖先目录、常规文件/大小/路径/硬链接及功能判定在 Windows 也执行，创建链接失败会显式失败；Windows 真实认证保持待办。

## 迁移与回退

无生产代码、数据库或 schema 迁移；schema 15、任务/runner/receipt 的权限边界不变。本包经审阅合入后可作为独立提交回退，但先检查 CERT-02 及后续包是否引用工具或格式；本地实验记录保留，旧 harness/fixture 摘要不能在新工具下冒充相同记录。不得清理其他工作或为了重跑覆写旧实验。后续 runtime 变化仍按计划重冻候选并重新运行适用矩阵。
