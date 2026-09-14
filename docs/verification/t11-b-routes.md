# T11-B 业务路由交付卡

基线 2f46ea547b3aa19dcb69a96028cc803b15888028（A，PR #40）。工作包 → feat(T11-B): connect protected workflow routes → 本卡文件清单 → 真实 HTTP/SQLite 测试和完整 check/pack → 一个 squash 独立回滚。

文件：新增 src/server/business-routes.ts（路由组合）、dto.ts（允许字段/脱敏）、src/storage/api-store.ts（参数化查询/事务/分页/来源撤销）、tests/server/routes.test.ts；修改 server/app.ts（DomainError 和空 DELETE JSON）、storage/sqlite-store.ts（内部端口）、indexing/service.ts（cancelAndWait）、privacy.ts（通用 portable 文本）；更新本卡、13-local-server.md、T11 包计划/总计划及 pack smoke。

本地 Issue：A 仅 status，无法操作既有工作流。本包接通已存在用例，验证人工修订冲突、会话所有权、分页失效、显式绑定、来源范围、撤销保留人工数据及源文件不变。API 认证仍由 A 全局防护；写测试通过真实 TCP/SQLite，生产不用任意 CORS。

自审关注：批量任务结果必须保留完成时状态；取消已完成的旧 job 不得中断新扫描；分页不能跨查询/代数使用；源路径仅 settings DTO，目标 executable 不导出；无请求路径对应任意文件读取。SDK 内部新增 API 查询类而非暴露任意 SQL。手动正文保存原值，公开 DTO 脱敏/portable；UI 后续不得误把展示投影当作完整本地原文。

回滚触发：授权后访问越界、人工数据丢失、修订/会话归属错误或 DTO 泄漏。C/UI 尚未消费时，可单独 revert 本包 main squash，保留 A status/认证/关闭能力；已有消费者先处理依赖。schema 4 和全部人工数据保留；撤销来源属于用户明确操作，回滚代码不会自动恢复已清理的索引，需重新配置/扫描。回滚后运行 server/indexing/tasks/search 和完整 check/pack。未实际进行生产回滚；自审，无外部评审声明。

最终覆盖包括同一规范化目录/agent 的稳定来源 ID、撤销后重新添加 ID 不变；job 缓存以自身完成结果判断是否可复用，不以来源后续扫描状态替代旧 job。本地初轮 281 项完整测试通过；最终结果和 CI/SHA 写入 PR。安装包新增 business API 调用 smoke，预计包文件 123，以实际结果为准。
