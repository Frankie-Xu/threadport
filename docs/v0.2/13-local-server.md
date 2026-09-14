# 本地服务：已实现范围与边界

T11-A 提供 `threadport/server` 的 `startLocalServer({dataDir?})`，返回 `{origin, token, close}`。调用才打开数据库；导入不监听、不扫描。仅监听 `127.0.0.1`，端口固定交由 OS 分配；没有 host/port/token 外部覆盖选项。

```ts
import { startLocalServer } from 'threadport/server';
const server = await startLocalServer({ dataDir: '/private/threadport-data' });
try {
  const response = await fetch(`${server.origin}/api/v1/status`, {
    headers: { Authorization: `Bearer ${server.token}` },
  });
  const status = await response.json();
} finally {
  await server.close();
}
```

token 为每次启动新生成的 32 随机字节（hex 64 位）。调用方只能在当前可信进程内使用；后续 CLI 以 fragment 交接给页面，T11-A 不提供页面或 URL token 传递。禁止把它写入查询串、请求日志、诊断或持久化浏览器存储。Fastify logger 关闭，错误返回固定消息和服务端生成的 requestId，不回显输入。

全部当前 HTTP 路径先校验实际 Host/端口、单一 Authorization bearer；重复 Host/Origin/Authorization 拒绝。只接受相同 origin 或无 Origin 的可信 CLI 请求；恶意及 `null` Origin 拒绝，不开启 CORS。POST/PATCH/PUT/DELETE 必须 application/json；体积上限 1 MiB，JSON schema 不静默剔除未知字段后接受请求。路径遍历拒绝，没有任意文件读取或静态文件路由。

当前唯一业务路由 GET `/api/v1/status` 返回 `{data:{version,index,capacity,counts}}`：实际数据库 events/indexedBytes/sources/sessions/tasks 计数，容量上限 100000 events / 1 GiB indexedBytes。index.running 是本进程扫描中的来源数量；lastRefreshAt 是本进程最近完成或部分完成的扫描时间，无记录为 null，不把历史事件时间冒充刷新时间。不会返回来源目录、工作区根、原始 DB 行或 token。

后台仅每 15 秒刷新已有 enabled 来源，沿用 T07 的有界捕获和取消；不会发现或启用额外目录。关闭停止调度，取消并等待索引任务后关库；重复 close 安全。监听失败也清理索引与数据库。数据库沿用 T05 安全打开/迁移规则，无新 schema。

状态返回 200；认证失败 401；Host/Origin 403；坏输入/未知字段 400；超体积 413；错误内容类型 415；未实现路由 404；内部错误 500。错误形状 `{error:{code,message,retryable,requestId}}`。业务 DomainError 映射、其他 DTO 和写路由留 T11-B，CLI 信号生命周期及 UI 链接留 T11-C；A 不代表 T11 全部完成。

实现采用固定版本 Fastify 5.12.4，参考 [Server options](https://fastify.dev/docs/latest/Reference/Server/) 与 [Hooks](https://fastify.dev/docs/latest/Reference/Hooks/)。测试写路由仅用于验证框架防护，不在生产注册。

## T11-B 业务路由

已接通 projects/workspaces、sources、index-jobs、tasks（列表/详情/修改/会话关联）、sessions 搜索与 events、targets。成功为 `{data}`，列表分页增加 nextCursor；严格 Zod 输入校验，未知写字段为 400，任务修订/项目归属冲突为 409，需要先确认脱敏为 422，忙为 503。错误不回显底层 SQL、路径或请求内容。

来源必须是显式提交的绝对、可访问、非符号链接目录，不能选择文件系统根；该规范化目录成为 adapter 的扫描允许列表，不自动扩大到 HOME。仅支持已实现的 Claude/Codex 来源。工作区必须 confirmBinding=true，根规范化后相同目录复用同一绑定；跨项目重绑定拒绝。路径只在认证 settings 的 sources/workspaces 响应出现。

通用 Task/Session/Event DTO 显式投影，文本二次脱敏、私有绝对路径转 portable opaque locator，不输出 sourcePath 或本地 executable。命令 cwd 可为 null 或 opaque locator，不能由摘要误猜目录。targets 此时仍明确 launch_supported=false，真实能力认证留 T13。

任务列表支持 q/projectId/lifecycle/archived/cursor/limit；q 搜索标题和人工 objective，默认排除归档。分页绑定过滤条件与索引代数，修改后返回 SEARCH_STALE 要求重查。sessions 返回现有 SearchService 的 task/session 混合匹配，消费者按 kind 区分；事件分页绑定 session/limit/generation，不执行日志命令。

index-jobs 为本进程记录，最多保留 1000 组；最多每组 20 个来源，相同正在运行的来源组返回原 jobId，底层同来源扫描由 T07 合并。完成结果固定保存，不把后一次扫描状态覆盖旧 job；重启后旧 jobId 返回 404。取消等待结束，保留已提交批次；DELETE 可用空 JSON body。来源撤销必须 confirmation=true，先取消本进程扫描，再事务清理该来源的索引，保留 session 墓碑、人工任务及修订和关联，不修改源日志；外部索引租约未释放时返回忙。

data 清理/诊断/全删除留 T17；不注册占位成功端点。

由 API 创建的 sourceId 由规范化目录与 agent 的 SHA-256 前缀生成；重复选择不会新增来源，撤销再添加也保留同一来源身份。私有路径本身不编码进 ID。手动 SDK 配置的自定义 sourceId 不会被重写。

## T11-C CLI 与页面入口

运行 `threadport ui [--data-dir <path>] [--no-open] [--demo]`。默认尝试系统浏览器，失败仍保留可用服务并提示使用已打印链接；--no-open 只打印链接。CLI 仅打印一行 `http://127.0.0.1:<port>/#token=<token>` 到 stdout，随后等待终端关闭信号。SIGINT=130，Unix SIGTERM=143；启动/清理失败=5，参数错误=2。监听失败和退出均释放服务资源。

--demo 与 --data-dir 互斥，创建独立临时库，包含明确标记的合成任务、零来源，正常退出删除临时目录。不会读取真实默认数据；异常 OS 强杀可能留下临时目录。Windows 的强制进程终止不能模拟优雅终端 Ctrl-C，本地终端行为仍须实机认证。

GET / 是无需 bearer 的静态 bootstrap，但仍校验 Host/Origin；所有 API 仍需要 bearer。响应以仅允许同源脚本/样式的 CSP、no-store、no-referrer 约束，不加载外部字体/脚本。前端读取 fragment 到闭包内存后立即用 history.replaceState 清除；不写 localStorage/sessionStorage，刷新保留 query 并显示从当前终端链接重新打开的恢复提示。T15-A 提供英文 onboarding、收件箱、历史与设置；T15-B 提供修订检查编辑、来源证据和完整接续预览。GET /assets/<固定构建文件名>.js|css 可公开读取，但仍校验 Host/Origin，仅从启动时的内存白名单提供，不将请求路径拼接到文件系统。刷新后可粘贴当前终端链接恢复，查询参数保留。


## T12-B 准备、确认与导出

`POST /api/v1/handoffs` 接受 taskId/sourceSessionId/target/mode/workspaceId；只允许已关联且同项目的 Claude/Codex 来源。当前目录必须具有完整、可读取的 SHA-1 Git 快照，否则拒绝准备，不伪造 Capsule 必填值。原生模式还要求同 Agent 和来源保存的 vendor session ID；真实目标支持由 T13 决定。

包固定任务 revision，15 分钟有效，promptDigest 为完整实际 prompt 的 SHA-256。prompt 最多 32 KiB UTF-8，先省略旧来源摘录并列出数量/源省略提示，目标、约束和下一步不截断，仍超限则拒绝。人工文本的路径/秘密投影在完整预览中可见；导出重新检查脱敏和摘要，不在导出时静默改写。JSON 包含完整 prompt；Markdown 下载字节就是 prompt。包仅含 metadata，不同步代码或原始日志。

工作区 verification 优先比较来源命令明确引用的历史快照；没有引用时只核验当前准备快照，历史命令当前有效性仍为 unknown，不生成测试通过记录。私有审批记录还绑定实际准备时的工作区路径、物理身份/摘要和来源身份。历史 drifted/unverifiable、来源 partial、未知人工字段需要 acknowledgeUncertainty=true；新工作区变化（包括分支变化）、任务修订、来源绑定或包内容变化，确认返回冲突，必须重新准备。

`GET /api/v1/handoffs/:id` 返回 handoff/state/expired。`POST .../confirm` 接受 promptDigest/acknowledgeUncertainty，只返回 `threadport continue --handoff <uuid>`。该 API 不启动进程；T14-A 的 continue CLI 在终端重新验证和确认。`POST .../export` 接受 format=json/markdown，返回下载字节，不接受服务端输出路径。过期包仍可作为只读 metadata 导出，不能确认执行。

CLI：`threadport prepare --task <id> --source-session <id> --to claude|codex --workspace <id> [--mode native-resume|new-session] [--data-dir <path>]` 输出完整 JSON，默认 new-session。参数/不可准备输入=2，修订冲突=4，I/O=5。自定义数据目录后续使用 continue 时仍须由用户显式提供 --data-dir，不把路径拼入 UI 固定命令。

## T13 目标端能力

GET /api/v1/targets 现返回 Claude/Codex 的 TargetCapability，显式区分 installed、version、auth=unknown、nativeResume、newSessionWithContext 和 reason；不返回 executable。命中明确版本与帮助参数才启用该接口能力，未知版本 export-only。该请求会用固定帮助参数探测本机 CLI，单次子进程 5 秒/256 KiB 上限，不创建 Agent 会话。旧 `threadport targets` 保持纯发现输出；新增 --capabilities 读取新能力。参数证据和实机认证缺口见[兼容性矩阵](../compatibility.md)。


## T14-A 终端接续执行器

`threadport continue --handoff <uuid> [--data-dir <path>]` 必须有 TTY stdin/stdout；解析严格拒绝 --yes 和额外参数。CLI prepare 的 prepared 包可在终端完成审批，已经由 UI 确认的包仍须在终端再次确认。打印完整实际 prompt、目标/版本、JSON 转义工作目录、验证状态和期限后，只有明确键入 CONTINUE 才接受上下文及列出的不确定性，其余输入/预览阶段取消均记 cancelled 并返回 130。

构造 LaunchSpec 后再检查完整记录、任务修订、来源身份、当前工作区/分支和期限。即时事务把 confirmed 变为 launching 并写 launch_attempt；多进程竞争只有一个能取得占用。只支持当前已验证的 argv 传输，prompt 必须恰好作为一个参数，cwd 必须等于审核目录。使用 shell:false 和 inherited stdio，不解析/执行 next_action，没有后台自动重试。

GET handoff 增加 attempts，包含安全状态/时间/errorCode/targetExitCode，无 PID 或可执行文件路径。Agent 正常退出只记 exited，不改任务生命周期；Agent 非零记 TARGET_EXITED 与真实 targetExitCode，CLI 返回 5。未安装/不支持=3；冲突/过期=4；I/O/中断=5；SIGINT 用户取消=130。Agent 运行期间转发 SIGINT/SIGTERM，并清理当前监听器。Windows 自动化中的 child.kill 只证明进程终止路径，不代替真实终端 Ctrl-C 认证。

私有 approval 的运行元数据记录当前 ThreadPort owner PID/attempt ID（不进入导出，也不改变包摘要）。读取 launching 包时，若 owner PID 已不存在，标记 interrupted/OWNER_LOST；这表示观察中断，不证明 Agent 子进程已经停止。PID 存在或无法判断时保守保留占用；不杀其他进程、不自动重试。任何消费终态都要求重新 prepare 一个新 UUID。

T14-A 只通过合成子进程与实际终端取消验证。Claude 当前未登录，至少一条真实跨 Agent 接续 gate 尚未完成；不能据此标记整个 T14 或版本发布完成。

## T15-A 未归类列表

GET /api/v1/sessions/unassigned 支持 projectId、limit（默认 50，最大 100）、cursor。仅返回启用来源中未关联任务的会话；选定项目时仍包含 projectId=null 的会话，创建时由用户确认项目。返回 id/agent/projectId/workspaceId/title/lastEventAt/status，不含日志路径或 vendor ID。独立分页不受已关联搜索结果占位；generation 变化返回 SEARCH_STALE，客户端显式重置分页。

## T15-B 详情与交接工作台

任务列表额外返回 attention 与 lastActivityAt（来源缺时间时为 null）。详情增加 sessions 安全投影、nativeSessionAvailable 布尔值和 files（最多 200 项与 hasMore 标记），不返回 vendor session ID 或源日志路径。GET sessions/:id/events 增加 eventId，用于从特定证据开始分页；不能与 cursor 同传，缺失证据返回 404。

编辑只发送相对打开时的草稿发生变化的字段，防止 DTO 路径投影覆盖未编辑的本地人工字段。保存冲突保留草稿，用户可明确丢弃并读取最新版；脱敏修改显示后必须再次保存。归档/移除关联保留人工字段，来源建议与人工字段分开显示。

接续按同 Agent 且能力已确认时默认 native，其他使用 new-session。目标、来源、目录或模式变化清除旧预览与命令；完整实际 prompt 不折叠/截断，列出未知和省略。用户勾选审核后才可确认，不支持能力只能导出。过期禁用确认和复制；工作目录/任务修订变化由服务再次拒绝。浏览器确认只生成固定 UUID 命令，未启动进程；下载取服务器的完整 JSON/Markdown 字节，由浏览器选择目标文件。操作系统原子文件导出仍由 T17 负责。
