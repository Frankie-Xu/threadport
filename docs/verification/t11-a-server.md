# T11-A 服务基础交付卡

本地 Issue 草案：现有索引/任务 SDK 尚无认证服务入口。以独立包提供实际 loopback 服务、状态统计与生命周期，覆盖 T11/F01/Q19 的基础防护；业务路由 B 和 CLI/UI 基础 C 未实现。

| 工作包 | 提交 | 文件 | 测试 | 回滚 |
| --- | --- | --- | --- | --- |
| T11-A | 基线 6512975f7ee4fc4fdd1e936ab1eddcca211e3207；feat(T11-A): protect local server lifecycle；实际 head/merge SHA 见 PR | 下方清单 | HTTP/生命周期目标测试、完整 check、pack，结果见 PR | 一个 main squash；没有 B/C 等消费者时独立 revert |

精确清单：

- src/server/app.ts：启动/关闭、固定 loopback、错误处理及索引生命周期。
- src/server/auth.ts：实际 Host、Origin、bearer、重复头、内容类型与路径边界。
- src/server/routes.ts、schemas.ts：仅状态路由与严格 schema 设置。
- src/server/index.ts：仅导出固定监听入口和 LocalServer 类型，内部 composition 不公开。
- src/storage/sqlite-store.ts：单 SQL 快照统计，无 schema 变更。
- tests/server/app.test.ts：真实 TCP 请求、隔离 SQLite、取消等待、监听失败与 token 轮换。
- package.json、package-lock.json：Fastify 5.12.4 固定版本与 server export；npm install 审计 0 漏洞。
- scripts/pack-smoke.mjs：安装后启动、认证状态与重复关闭。
- README.md、docs/v0.2/13-local-server.md：实际 SDK 用法和边界。
- docs/superpowers/plans/2026-09-14-t11-work-packages.md、2026-09-14-threadport-v0.2.md：工作包拆分与进度，回填 T10-C 已合并。
- docs/verification/t11-a-server.md：本卡。

验证证据：先写测试，因 app 模块缺失失败；实现后暴露测试客户端会规范化 Host/路径的问题，改用 node:http 发原始请求后验证实际拒绝行为。6 项目标用例通过：缺失/错误 token、恶意/null Origin、错 Host/forwarded bypass、重复 Authorization、查询 token、路径遍历、未知查询字段、未实现路由、JSON 类型/体积/严格字段、实际索引取消后关库、重复关闭/token 轮换、监听失败清理。写路由仅在测试注册，不冒充生产业务端点。Fastify logger 关闭、固定错误消息和随机 requestId，状态 DTO 只由允许字段构造。

回滚触发：认证绕过、泄漏、关闭后残留扫描或旧 SDK 回归。检查消费者，无 B/C 等消费者可通过 PR revert 本包 squash；有消费者先按依赖逆序处理。保留 schema 4 与全部人工数据/索引/快照，无数据降级；卸除服务入口及 Fastify 依赖，旧 SDK/CLI 保留。回滚后完整 check 与 pack；回滚仅方案自审，未执行生产回滚。未声称外部独立评审或 UI/真实 Agent 接续验收。

本地验证（2026-09-15，macOS arm64 / Node 24.18.1）：安装包 smoke 通过，117 个文件，实际安装包启动/认证请求/关闭成功。一次全量运行出现 3 个旧 Git 用例的 5 秒超时及新 HTTP 测试 ECONNRESET；HTTP 边界测试改为每请求独立连接，避免大 body 拒绝后的连接复用。受影响 4 文件 / 40 项复测通过；受控并发全量 39 文件 / 277 项通过。最终默认 check 和远端三平台结果记录在 PR，不把重试前失败隐藏为一次通过。

最终默认 `npm run check` 通过：39 个文件 / 277 项测试，类型检查、构建和文档检查全部通过。真实 head/CI/合并 SHA 及本包回滚定位见 PR。
