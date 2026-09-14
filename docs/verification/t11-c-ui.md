# T11-C CLI 与本地入口交付卡

工作包 → feat(T11-C): expose local UI lifecycle → 文件如下 → 真实 CLI/浏览器与 check/pack → 单独 squash 回滚，保留 A/B。

基线来自 B 工作树，B 合并后 rebase 到实际 main；实际 base/head/merge SHA 以 PR 为准。新增 cli-ui.ts（启动/信号/浏览器/demo）、server/bootstrap.ts（CSP 页面/内存 token）、tests/cli-ui.test.ts；修改 cli.ts（命令/参数）、server/app.ts（页面注册）、server/auth.ts（仅 GET / 公开且仍校验 Host/Origin）、scripts/pack-smoke.mjs；更新 README、13-local-server.md、T11 包计划/总计划和本卡。

CLI：ui --data-dir --no-open --demo；demo 不接受 data-dir，使用独立临时数据，零来源、一条合成任务。只有 stdout 打印一次带 fragment 的访问 URL，日志/HTML/API 不携带 token；页面立即移除 fragment，仅在闭包内存保存，刷新后提示使用当前终端链接恢复。DOM 使用 textContent，CSP nonce 禁止外部资源与嵌入。入口页只显示任务摘要，完整交互工作台留 T15。

证据：本地真实 CLI 子进程 3 用例验证启动、CSP、认证、SIGTERM 后端口关闭、demo 标记/零来源、坏参数和 IO 错误；原有 API 边界测试仍运行。Unix SIGTERM 确认应用退出 143；Windows child.kill 是 OS 终止，CI 仅证明退出/端口关闭，不冒充 Windows 终端 Ctrl-C 认证。手工 Playwright 检查 demo 页面、fragment 清空、两种 Web Storage 均空、刷新恢复提示；1280 桌面视图已查看，768 宽度已检查。截图仅含合成任务，不含链接 token。

回滚：关闭/认证/link 泄漏或旧 CLI 回归时，处理已接入的 UI 消费者后 revert 本包 squash。A/B API/SDK、schema 4、真实数据保留；撤销公开 ui 命令与 bootstrap，临时 demo 仅由当前进程生成/清理，不操作源日志。运行 CLI/server、完整 check 和 pack；回滚为方案审查，未实际执行。自审，无外部评审声明。
