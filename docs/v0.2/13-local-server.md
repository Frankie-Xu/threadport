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
