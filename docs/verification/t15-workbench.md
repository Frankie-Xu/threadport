# T15 工作台验证

T15-A 完成配置、收件箱、只读详情、历史搜索与认证恢复；T15-B 的编辑和接续预览尚未完成。T14 的真实跨 Agent 门槛也仍未满足。

## 工作包 → 提交 → 文件 → 测试 → 回滚

| 工作包 | 提交 | 文件 | 测试 | 回滚 |
| --- | --- | --- | --- | --- |
| T15-A | PR 记录最终 head / CI / squash | web/src/features/{onboarding,inbox,history,task,settings}、app/api/components/styles、Vite；server bootstrap/auth/app/business-routes、storage/api-store；package/tsconfig/CI；cli-ui/routes/E2E；文档与合成截图 | 357 项单元/集成；生产 bundle 浏览器流程；隔离安装包；三平台 required check 见 PR | 独立 squash；先撤回 T15-B 消费者；无 schema 变化，保留人工任务与来源，返回旧 bootstrap |

## 本地证据

macOS arm64 / Node 24.18.1。初次浏览器准备受 Chromium CDN TLS 断连阻断，不能记为功能失败；后改用本机 Chrome 跑 production bundle，核心 E2E 通过。测试使用临时 Git 项目、合成 Claude JSONL 和临时数据库，未打开真实 Agent 会话。

端到端验证：首次绑定绝对目录、手选日志来源、索引完成、从未归类会话创建中文任务、恶意 HTML 作为文字、历史命中与高亮、刷新清理 fragment 后重新输入终端链接、URL 查询保留、localStorage/sessionStorage 均为空、Ctrl/Cmd+K 搜索焦点、1280/1440/768 无横向溢出。人工查看 1280/768 截图：筛选、卡片、分页可达，文本未裁切。截图刻意保留注入测试字符串，用于证明其显示为纯文本。

接口回归：启用来源的未关联会话独立分页；未绑定项目会话仍可选择；新关联令旧游标失效；日志路径不在 DTO 中；非法 limit/cursor 拒绝。构建资源固定白名单；匿名 API 拒绝、外部 Origin 资源访问拒绝、未知资源 404、CSP/no-store/nosniff 保留。

评审为自审，没有独立人工审批。回滚是计划，未在生产演练。不将合成浏览器验收当作 T18 实机认证。

![1280px 合成历史页面](assets/t15-history-1280.png)

![768px 合成历史页面](assets/t15-history-768.png)

最终本地：npm run check 通过（357 项/50 文件），浏览器 E2E 1 项通过，隔离安装包 169 文件通过。同步重复点击仅创建一项任务。React/Vite 构建日志设为 warn，避免污染 npm pack --json；安装后实际请求 JS/CSS 所在的打包资源。
