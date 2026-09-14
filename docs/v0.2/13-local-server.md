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

data 清理/诊断/全删除留 T17，handoff 留 T12；不注册占位成功端点。

由 API 创建的 sourceId 由规范化目录与 agent 的 SHA-256 前缀生成；重复选择不会新增来源，撤销再添加也保留同一来源身份。私有路径本身不编码进 ID。手动 SDK 配置的自定义 sourceId 不会被重写。

## T11-C CLI 与页面入口

运行 `threadport ui [--data-dir <path>] [--no-open] [--demo]`。默认尝试系统浏览器，失败仍保留可用服务并提示使用已打印链接；--no-open 只打印链接。CLI 仅打印一行 `http://127.0.0.1:<port>/#token=<token>` 到 stdout，随后等待终端关闭信号。SIGINT=130，Unix SIGTERM=143；启动/清理失败=5，参数错误=2。监听失败和退出均释放服务资源。

--demo 与 --data-dir 互斥，创建独立临时库，包含明确标记的合成任务、零来源，正常退出删除临时目录。不会读取真实默认数据；异常 OS 强杀可能留下临时目录。Windows 的强制进程终止不能模拟优雅终端 Ctrl-C，本地终端行为仍须实机认证。

GET / 是无需 bearer 的静态 bootstrap，但仍校验 Host/Origin；所有 API 仍需要 bearer。响应以 nonce CSP、no-store、no-referrer 约束，不加载外部字体/脚本。前端读取 fragment 到闭包内存后立即用 history.replaceState 清除；不写 localStorage/sessionStorage，刷新保留 query 并显示从当前终端链接重新打开的恢复提示。页面仅显示任务摘要，T15 再接通 onboarding/编辑/预览完整流程。
