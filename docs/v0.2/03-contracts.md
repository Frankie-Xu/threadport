# 数据与接口契约

本文是实现阶段的契约基线。TypeScript 片段用于确定名称与语义，不代表仓库已有实现。公开 JSON、文件和 CLI 需要运行时校验；不能只用 `as Type` 信任外部数据。

## 1. 实体模型

```ts
type Agent = "claude" | "codex";
type Lifecycle = "active" | "paused" | "completed";
type ClaimOrigin = "observed" | "user-confirmed" | "derived" | "unknown";
type ISODate = string; // validated ISO-8601 UTC
type Id = string; // app UUID; vendor IDs are separate strings

interface EvidenceRef {
  sessionId: Id;
  eventId: Id;
}
interface Claim {
  text: string;
  origin: ClaimOrigin;
  evidence: EvidenceRef[];
  updatedAt: ISODate | null; // unknown source time stays null
}
interface Task {
  id: Id;
  projectId: Id;
  revision: number; // starts at 1; each user mutation +1
  title: string;
  objective: Claim;
  constraints: Claim[];
  nextAction: Claim;
  lifecycle: Lifecycle;
  archived: boolean;
  createdAt: ISODate;
  updatedAt: ISODate;
}
interface SessionRecord {
  id: Id;
  sourceId: Id;
  agent: Agent;
  vendorSessionId: string | null;
  projectId: Id | null;
  workspaceId: Id | null;
  sourcePath: string; // private, never exported
  parserVersion: string;
  formatVersion: string | null;
  lastEventAt: ISODate | null;
  status: "ready" | "partial" | "unsupported" | "missing" | "error";
}
interface CommandRun {
  id: Id;
  sessionId: Id;
  ordinal: number;
  command: string;
  cwd: string | null; // local internal locator
  exitCode: number | null;
  startedAt: ISODate | null;
  completedAt: ISODate | null;
  eventId: Id;
  snapshotId: Id | null; // null for unbound historical logs
}
interface NormalizedEvent {
  id: Id;
  sessionId: Id;
  ordinal: number;
  occurredAt: ISODate | null;
  kind: "user-message" | "assistant-message" | "file-change" | "command";
  text: string; // visible content only, redacted and length bounded
  commandRun: CommandRun | null;
  relativePaths: string[];
  omitted: boolean;
}
```

Task.projectId 指向本地用户绑定的项目身份。Project 有 id/name 与一组 Workspace；Workspace 有 id/projectId/canonicalRoot/gitCommonDir/head，均为本地元数据，不以 remote URL 唯一化。无 Git 的来源可显示历史，但不获得 workspace matched。发现的项目绑定是候选，用户明确选择后才能启动目的端。

状态轴分开：`lifecycle` 仅人工改变；`attention` 由最近未解决失败/失效证据派生；`freshness` 属于 VerificationReport。三者禁止合成一个含糊的 `status: success`。

`deriveTask(events: readonly NormalizedEvent[]): DerivedTaskState` 返回目标候选、来源引用、按会话/cwd/完整命令分组的最后命令结果及 attention；不修改 Task。DerivedTaskState 的字段为 `objective: Claim | null`、`constraints: Claim[]`、`latestRuns: CommandRun[]`、`attention: string[]`。聚合顺序先 session，后 ordinal；跨会话没有证据关联时不抵消失败。

T04 按最后一条非空用户消息的首个非空行生成 derived 目标候选；这可能只是补充要求，必须由用户确认。assistant 计划仅是消息证据，不自动成为已采纳决策。历史消息保留引用。中文/英文禁止句逐行保留原文，识别是保守规则，不声称完整语义理解。

Claim.updatedAt 缺失时保留 null，见 [ADR 0007](../adr/0007-unknown-claim-time.md)。Task 的修改时间仍必填。`resolveTaskState(task, derived)` 是不写入的呈现合成：已有 Task 的目标、约束（含空数组）、下一步、生命周期和归档优先；无 Task 时生命周期未知。T08 负责持久化与编辑界面。旧 Capsule.status 是兼容投影，不代表新 Task.lifecycle。

attention 使用稳定代码：OBJECTIVE_UNKNOWN、MULTIPLE_SESSION_OBJECTIVES、INCOMPLETE_EVIDENCE、EVIDENCE_TIME_UNKNOWN、COMMAND_RESULT_UNKNOWN、COMMAND_FAILED、COMMAND_IDENTITY_INCOMPLETE、COMMAND_CONTEXT_UNKNOWN、HISTORICAL_VALIDITY_UNKNOWN。任何历史运行均不证明当前工作区有效性。跨会话按 sessionId 字典序聚合并提示竞争候选，不声称全局时间顺序。

旧适配器 bridge 的事件 ID 仅在一次提取内稳定，relativePaths 留空；文件证据仍走原路径隐私投影。消息时间只取明确有效字段，命令时间保持 null。持久索引与原生 SourceAdapter 属于 T06；不可把临时引用当作数据库事件身份。

T03 的 `latestCommandRuns(runs: readonly CommandRun[]): CommandRun[]` 按 sessionId/cwd/完整 command 字符串精确分组，选最大 ordinal；输出按 sessionId、ordinal 排序，不修改输入。源契约要求每个 session 的 ordinal 唯一。`null` cwd 只与同一 session 的 `null` cwd 归入同组，不填入本地项目 root，也不证明两次未知目录实际相同。

旧适配器的 `SessionTraces.commandRuns` 保留每次运行，内部序号采用现有结果观察顺序；缺失的 startedAt/completedAt/snapshotId 均为 null，不投影到 Capsule v1。Claude/Cursor 从调用参数或记录 cwd 取值；Codex 从 workdir/cwd 参数或 session_meta/turn_context 取值；Gemini 从调用/记录 cwd 取值。没有任何字段时保留 null；不执行或解释 shell 的 cd 来猜 cwd。旧 Capsule 每次提取只容纳一个明确 session ID，拼接多个 ID 的输入报错，要求分别提取。

失败投影逐次保留失败输出；只有同组后续 exit 0 可添加 resolution。命令或 cwd 含脱敏标记时无法确认完整身份，旧失败投影保守地不添加 resolution；不因替换后文本相同而推断原命令相同。新一次未知结果不抹掉此前的未解决失败。测试识别仅覆盖已列出的直接调用形式，复合 shell 命令和未知 runner 保留为一般命令，不以输出文本中的 test 单词推断测试通过。


## 2. SQLite 约束

| 表 | 核心列/约束 | 删除策略 |
| --- | --- | --- |
| sources | id PK, agent, root, enabled, parser_version | 删除来源索引；保留人工任务 |
| projects | id PK, name | 有 task 时拒绝删除 |
| workspaces | id PK, project_id FK, canonical_root UNIQUE | 缺失只标记，不假改路径 |
| sessions | id PK, source_id FK, vendor_id, source_path, metadata_json | 清除索引时留身份墓碑以便重关联 |
| events | id PK, session_id FK, ordinal, body_json, search_text；UNIQUE(session_id, ordinal) | 随来源索引清除 |
| source_cursors | session_id PK, file_identity, byte_offset, parser_version | 重建重置 |
| tasks | id PK, project_id FK, revision, body_json, updated_at | 用户明确删除全部数据才清除 |
| task_sessions | session_id UNIQUE, task_id FK | 与人工任务一起保留，允许 source missing |
| task_revisions | task_id FK, revision, changed_at, body_json；复合 PK | 人工历史不随重扫删除 |
| snapshots | id PK, workspace_id FK, captured_at, body_json | 保留当前包依赖；过期无引用可清理 |
| handoffs | id PK, task_id, task_revision, digest, expires_at, body_json, state | 7 天清理包文本 |
| launch_attempts | id PK, handoff_id, status, started_at, ended_at, error_code | 摘要 30 天 |

Task JSON 用 Zod 验证，修改时 `UPDATE ... WHERE id=? AND revision=?`；更新行数为 0 则返回 conflict。任务修改、revision 插入、会话关联修改在同一事务内。Session 墓碑仍占同一 ID，重建 upsert 恢复；不能使用会触发删除的 REPLACE 破坏关联。

查询索引至少包括 tasks(updated_at,id)、sessions(project_id,last_event_at,id)、events(session_id,ordinal)、task_sessions(task_id)。搜索文本不包含 raw hidden fields，SQL 值全部参数化；排序列只允许代码白名单。

## 3. 应用端口

```ts
interface SourceCandidate {
  sourceId: Id;
  path: string;
  agent: Agent;
}
interface ReadCursor {
  fileIdentity: string;
  byteOffset: number;
  nextOrdinal: number;
  parserVersion: string;
}
interface SourceReadResult {
  session: SessionRecord;
  events: NormalizedEvent[];
  cursor: ReadCursor;
  warnings: string[];
  hasMore: boolean;
}
interface SourceAdapter {
  readonly agent: Agent;
  readonly parserVersion: string;
  discover(roots: readonly string[], signal: AbortSignal): AsyncIterable<SourceCandidate>;
  read(input: {
    candidate: SourceCandidate;
    cursor: ReadCursor | null;
    maxEvents: number;
    signal: AbortSignal;
  }): Promise<SourceReadResult>;
}

interface TaskPatch {
  title?: string;
  objective?: string;
  constraints?: string[];
  nextAction?: string;
  lifecycle?: Lifecycle;
  archived?: boolean;
}
interface TaskService {
  create(input: { projectId: Id; title: string; sessionId?: Id }): Promise<Task>;
  update(id: Id, expectedRevision: number, patch: TaskPatch): Promise<Task>;
  attachSession(taskId: Id, sessionId: Id, expectedRevision: number): Promise<Task>;
  detachSession(taskId: Id, sessionId: Id, expectedRevision: number): Promise<Task>;
}
```

SourceAdapter 接受只读根目录，不能内部访问 process.env.HOME 扩大范围。项目绑定与任务关联在应用层完成。Store 是上述用例依赖的事务端口，其方法与具体用例对齐；不要发布泛型任意 SQL 或全局数据库句柄。

## 4. 验证契约

```ts
interface WorkspaceSnapshot {
  id: Id;
  workspaceId: Id;
  capturedAt: ISODate;
  head: string | null;
  digest: string | null;
  scope: "head-tracked-diff-untracked";
  incompleteReasons: string[];
}
interface VerificationReport {
  status: "matched" | "drifted" | "unverifiable";
  snapshotId: Id;
  workspaceId: Id;
  verifiedAt: ISODate;
  scope: WorkspaceSnapshot["scope"];
  reasons: Array<{
    code: "HEAD_CHANGED" | "CONTENT_CHANGED" | "WORKSPACE_UNBOUND" |
      "SOURCE_MISSING" | "READ_FAILED" | "LIMIT_EXCEEDED" | "RACED" |
      "NO_GIT" | "NO_COMMIT";
    message: string;
    path?: string; // project-relative only in public output
  }>;
}
```

优先级：身份未绑定/读取不完整 → unverifiable；完整可比且存在差异 → drifted；所有范围完整且相等 → matched。用户可看到已观测差异，但不得因发现一个差异就忽略其他缺失范围。捕获前后复查 HEAD/status 与文件元数据；变化重试最多一次，仍变化则 RACED。它是尽力的一致性检查，不能声称操作系统级原子快照。

portable path 使用声明的 source root 与 source platform 规范化，POSIX 用 path.posix，Windows 用 path.win32；不能在 macOS 上用宿主 resolve 去解释 Windows 盘符。仓库外路径使用 opaque ID，只在私有映射保存原位置；拒绝 `..` 越界和不同 drive 混算。

T02 内部接口为 `portablePath(value: string, sourceRoot: string, sourcePlatform: 'posix' | 'win32'): string`，位于 `src/workspace/paths.ts`。调用方提供绝对 sourceRoot；普通相对路径按该 root 解释，未知/相对 root 不读取宿主 cwd 来补全。Windows `C:foo`、无盘符的根相对路径及设备命名空间均输出 opaque locator。外部相对路径的标识加入源平台与 root 上下文，避免不同来源的 `../private.ts` 共用同一身份；已有绝对外部路径保持原 hash 算法。

旧 adapter API 保持不变：本地 Git 读取边界将调用方项目 root 解析为绝对位置，然后显式传入从本地 Git root 确定的平台。此行为不提供导入日志到异机仓库的自动重绑定。路径函数只判定词法包含关系，不证明 symlink 指向、文件存在或 workspace 匹配。


## 5. 接续包与执行契约

新格式与旧 `threadport.handoff.v1` 分开：

```ts
import type { Capsule } from "../../src/types.js";

interface TaskHandoff {
  protocol: "threadport.task-handoff.v1";
  id: Id;
  taskId: Id;
  taskRevision: number;
  createdAt: ISODate;
  expiresAt: ISODate;
  sourceSessionId: Id;
  target: Agent;
  mode: "native-resume" | "new-session";
  workspaceId: Id;
  capsule: Capsule;
  claims: Claim[];
  verification: VerificationReport;
  prompt: string;
  promptDigest: string;
  omissions: string[];
}
interface TargetCapability {
  agent: Agent;
  installed: boolean;
  version: string | null;
  auth: "unknown"; // detecting a binary never proves login
  nativeResume: boolean;
  newSessionWithContext: boolean;
  reason: string | null;
}
interface LaunchSpec {
  executable: string;
  args: string[];
  cwd: string;
  input: { kind: "argv"; value: string } |
    { kind: "stdin"; value: string } |
    { kind: "file"; path: string; digest: string } |
    { kind: "native-session"; vendorSessionId: string };
}
interface TargetRunner {
  readonly agent: Agent;
  detect(): Promise<TargetCapability>;
  prepare(input: { handoff: TaskHandoff; workspaceRoot: string;
    vendorSessionId: string | null }): Promise<LaunchSpec>;
}
```

类型片段中的 Capsule 路径说明类型来源；实际 `src/handoff/contracts.ts` 应使用 `../types.js`。input 的实际传递由 runner 测试约束，不能同时把 payload 放 argv 又错误喂给交互终端。原生 resume 模式还须传递/提示当前人工目标和约束；若 CLI 无法让上下文与原生恢复共存，降级为 new-session 并在预览中明确，不假装原生恢复成功。

`prepareHandoff({taskId, sourceSessionId, target, mode, workspaceId}): Promise<TaskHandoff>` 固定任务 revision 并读快照。`confirmHandoff({id, promptDigest, acknowledgeUncertainty}): Promise<{command:string}>` 重新检查并记录确认，不启动进程。新 UI 的 command 只允许 UUID 形式。

批准记录绑定包的完整规范化摘要（移除批准记录自身）、目标/模式/目录、promptDigest 和 taskRevision。UI 确认与终端启动都检查；确认后内容变化不得沿用旧批准。终端重新 verify，发生新漂移则要求重新 prepare，而不是仅凭旧 acknowledge 放行。

handoff 状态：prepared → confirmed → launching → exited / failed / cancelled / interrupted。expired 是按时间派生的不可执行条件，不覆盖诊断结果。退出码 0 只记进程正常结束；用户确认任务接续有效才记用户实验中的 resume_success。原生 session ID 只从选定来源读取，不从自由文本猜。

## 6. HTTP API v1

响应成功形状 `{data: T}`；分页 `{data: T[], nextCursor: string | null}`；错误 `{error:{code,message,retryable,requestId}}`。Schema 拒绝未知写字段，timestamp 与 ID 运行时校验。全部 API 认证规则见架构文档。

| Method / path | 请求 | 响应/语义 |
| --- | --- | --- |
| GET /api/v1/status | 无 | 版本、索引状态、容量、最近刷新；无绝对路径 |
| GET /api/v1/sources | 无 | 已选来源和状态，路径仅当前认证本地 UI 可见 |
| GET /api/v1/projects | 无 | 本地项目 id/name，供任务过滤与绑定选择 |
| GET /api/v1/workspaces | projectId? | 工作目录与绑定状态，仅认证本地 UI 可见 |
| POST /api/v1/sources | agent, root | 201 Source；验证目录允许列表 |
| DELETE /api/v1/sources/:id | confirmation: true | 撤销扫描、清理来源索引，保留人工任务 |
| POST /api/v1/index-jobs | sourceIds | 202 jobId；同来源正在扫描返回已有 job |
| GET /api/v1/index-jobs/:id | 无 | 进度、partial、错误数量 |
| DELETE /api/v1/index-jobs/:id | 无 | 取消；已提交批次保留 |
| GET /api/v1/sessions | q, projectId, agent, from, to, cursor, limit | 分页结果和匹配片段 |
| GET /api/v1/tasks | q, lifecycle, archived, projectId, cursor, limit | 分页任务 |
| POST /api/v1/tasks | projectId, title, sessionId? | 201 Task |
| GET /api/v1/tasks/:id | 无 | Task、derived、session 摘要 |
| PATCH /api/v1/tasks/:id | expectedRevision, patch | 新 Task 或 409 |
| POST /api/v1/tasks/:id/sessions | sessionId, expectedRevision | 关联；跨项目拒绝 |
| DELETE /api/v1/tasks/:id/sessions/:sessionId | expectedRevision | 移除关联；不删日志 |
| GET /api/v1/sessions/:id/events | cursor, limit | 只返回脱敏允许字段 |
| GET /api/v1/targets | 无 | TargetCapability[] |
| POST /api/v1/workspaces | projectId?, root, confirmBinding | 201 项目/工作区绑定；不修改仓库 |
| POST /api/v1/handoffs | taskId, sourceSessionId, target, mode, workspaceId | 201 TaskHandoff |
| GET /api/v1/handoffs/:id | 无 | 当前包与过期/消费状态；不包含 bearer token |
| POST /api/v1/handoffs/:id/confirm | promptDigest, acknowledgeUncertainty | 固定格式终端命令 |
| POST /api/v1/handoffs/:id/export | format: markdown/json | 下载 bytes；不由浏览器指定任意服务端写路径 |
| GET /api/v1/diagnostics | 无 | 可预览的脱敏诊断 |
| POST /api/v1/data/clear-index | confirmation: true | 清索引保留人工数据 |
| POST /api/v1/data/delete-all | confirmation: "DELETE LOCAL DATA" | 停扫描、清应用数据，终止服务 |

Source/Workspace 的本地路径在认证本地设置 UI 中可展示；不得混入可导出的通用 Task/Session DTO 或诊断。API 层显式构造 DTO，不把整个 DB 行序列化。

关联已有任务时，如果 session 已属于另一任务，返回 REVISION_CONFLICT 并说明当前归属；不隐式抢占。首版由用户先移出，再加入，未归类中间状态持久化。人工编辑经长度校验、脱敏后存储，UI 在保存前提示脱敏替换，不能静默改变用户输入。

页面刷新会丢失仅内存中的认证 token；此时保留 URL 内的任务/过滤参数，展示从当前 CLI 链接重新打开的恢复入口。首版不把 token 放入 sessionStorage 来隐式解决刷新。如果这个体验成为可用性阻碍，需另作本地会话 cookie 的安全与生命周期设计后修改契约。

## 7. CLI 兼容与新命令

旧命令保留：extract、validate、render、handoff、targets。旧格式和默认输出不变，文档明确 `validate` 是结构校验。

| 新命令 | 输入/输出 | 行为 |
| --- | --- | --- |
| `threadport ui [--data-dir <path>] [--no-open] [--demo]` | 打印本地 URL | 启动工作台；demo 使用独立目录 |
| `threadport index --source <id> [--data-dir <path>]` | 扫描摘要 | 显式扫描已配置来源 |
| `threadport verify <capsule.json> --project <root> [--json]` | 验证报告 | 旧 Capsule 缺少充分绑定/范围信息可返回 unverifiable，不能补造 |
| `threadport prepare --task <id> --source-session <id> --to claude\|codex --workspace <id> [--mode native-resume\|new-session]` | 包 id、预览、状态 | 只生成准备包 |
| `threadport continue --handoff <id> [--data-dir <path>]` | 交互确认，再继承终端 | 非 TTY 拒绝；无 `--yes` 绕过首版确认 |
| `threadport doctor [--json]` | 脱敏诊断 | 不上传 |

新命令都接受可选 `--data-dir`，表内省略的按全局选项实现。stdout 只输出声明的结果，进度写 stderr，`--json` 不夹杂文字。旧命令退出行为仍 0/1；新命令 0 成功、2 输入错误、3 不支持/未安装、4 需重新确认/冲突/过期、5 IO/数据库失败、6 无法验证、130 用户取消。verify drifted 返回 4，unverifiable 返回 6。Agent 的非零退出在结构化诊断保存，不冒充 ThreadPort 自身错误码；CLI continue 返回 5 并给 TARGET_EXITED 错误。

## 8. 统一错误表

| code | HTTP | retryable | 用户修复动作 |
| --- | --- | --- | --- |
| INVALID_INPUT | 400 | false | 修改标出的字段 |
| UNAUTHORIZED / ORIGIN_REJECTED | 401 / 403 | false | 从当前 CLI 输出重新打开页面 |
| NOT_FOUND | 404 | false | 刷新列表/重新关联来源 |
| REVISION_CONFLICT | 409 | true | 比较最新 revision 后重交 |
| WORKSPACE_MISMATCH | 409 | false | 选择正确目录或显式重新绑定 |
| HANDOFF_EXPIRED / HANDOFF_CHANGED | 409 | true | 重新生成与预览 |
| UNSUPPORTED_FORMAT / TARGET_UNSUPPORTED | 422 | false | 使用支持版本或导出 |
| CAPACITY_EXCEEDED | 422 | false | 收窄来源或取消大文件 |
| SOURCE_UNREADABLE | 422 | true | 修正目录权限后重扫 |
| STORAGE_BUSY | 503 | true | 等待当前短事务后重试 |
| MIGRATION_FAILED / IO_FAILED | 500 | false | 保留数据，查看脱敏诊断与恢复说明 |

服务端保留 requestId 和结构化错误；默认不打印 request body、完整 prompt 或绝对 source path。程序员错误不吞掉；转成安全 INTERNAL_ERROR 并记录堆栈时也要脱敏路径。
