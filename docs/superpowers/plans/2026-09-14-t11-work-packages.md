# T11 本地 API 工作包计划

目标：按 T11/API v1 契约接通本地工作流，三个独立 PR / main squash 提交，支持局部回滚。基线 6512975f7ee4fc4fdd1e936ab1eddcca211e3207（T10-C，PR #39）。Node 24，Fastify 5，SQLite schema 4；不扩大 T11 的 10–16 小时总体估算。

| 包 | 交付 | 文件与提交 | 测试 | 回滚 |
| --- | --- | --- | --- | --- |
| T11-A | 固定 loopback/随机端口、每次启动随机 token、认证防护、真实状态 DTO、停止索引后关 DB | src/server/app.ts、auth.ts、routes.ts、schemas.ts、index.ts；storage/sqlite-store.ts 状态统计；package.json/lock；tests/server/app.test.ts；pack-smoke 与文档。feat(T11-A): protect local server lifecycle | 真实 HTTP 认证/Origin/Host/体积/错误/关闭；check、pack | 无消费者时单独 revert A，保留 DB；有 B/C 先处理消费者 |
| T11-B | tasks/sessions/search/index/sources/workspaces 等已实现用例的 API v1 路由及允许字段 DTO | server/routes.ts、schemas.ts，按缺口补 storage 查询；server 路由集成测试 | 权限、严格输入、游标/冲突/取消、DTO 隐私与真实用例 | 保留 A 的服务与状态能力，处理 C/UI 消费者后 revert B |
| T11-C | ui CLI 基础、一次性 fragment 链接、信号/启动失败清理、整体 T11 收口 | cli.ts、server 入口、pack-smoke、CLI 测试和使用文档 | 安装后启动/请求/停止、错误码、无 token 日志/持久化、旧 CLI 回归 | 撤销 ui 命令，保留 A/B SDK 和数据 |

A 已合并 PR #40（2f46ea5）；B 已实现，见 [交付卡](../../verification/t11-b-routes.md)；C 待实施。handoff 留 T12，完整 UI 留对应后续 UI 任务。一个包一个 PR，实际 SHA/CI/回滚单元记录在交付卡和 PR。现有无关工作区文件不纳入。

A 执行顺序：

1. 添加真实 HTTP 测试：缺 token、错误 Host、恶意/null Origin 拒绝；认证 GET status 成功且不含路径；关闭不能留下索引/DB。
2. startLocalServer({dataDir?}) 仅监听 127.0.0.1:0，返回 origin/token/close。token 32 随机字节，只在启动返回值中提供；不从请求读日志或回显错误输入。
3. onRequest 校验实际 Host/端口、Origin 与 bearer；所有请求防护，后续静态页路由另行设计。写操作要求 application/json；bodyLimit=1MiB。配置严格 JSON schema，不移除未知字段后悄悄接受。
4. status 返回显式构造的版本、计数/容量、最近已索引活动与索引进度，不返回 source/workspace 原始行。不能把事件时间误说成最近成功扫描时间。
5. close 停止调度、取消并等待索引，再关 DB；启动失败也释放所有已获得资源。关闭重复调用安全。
6. npm test -- tests/server/app.test.ts；npm run check；npm run check:pack；自审；提交/推送/PR/CI/合并。生产写路由的未知字段与真实 UI 生命周期测试分别在 B/C 完成。
