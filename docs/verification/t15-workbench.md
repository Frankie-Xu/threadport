# T15 工作台验证

T15-A 完成配置、收件箱、只读详情、历史搜索与认证恢复；T15-B 已实现编辑和接续预览，最终 CI 状态见 PR。T14 的真实跨 Agent 门槛也仍未满足。

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

合并 #48 基线后，Windows 的旧 command-context 集成用例在 Git/快照子进程上耗时 5.315 秒，触发默认 5 秒测试预算；该用例断言身份隔离而非性能。仅为这一组真实 Git 集成测试设 30 秒上限，不跳过断言或调整产品资源限制。macOS 一次 node-gyp 头文件下载后回调中断发生在 npm ci，属于环境失败；保留日志并重跑 CI。

T15-A 已合并 PR #49，squash 66185ecc3c7c2a3ab2b34d687ad2f866702f5952，最新三平台 CI 通过。

## T15-B

先运行新 E2E，旧页面因缺少 Edit task 按钮失败。实现后验证两个真实浏览器标签的修订竞争：第二标签保存下一步后，第一标签保存返回 409 且草稿未丢；明确丢弃重载后保存只更新目标，不覆盖下一步。生命周期、归档/恢复、会话移除/重新关联、原文证据均经实际 API 验证。

目标 capability 的浏览器响应为合成 fixture；实际任务、快照、准备、确认和导出使用真实服务与临时 Git/SQLite。默认同 Agent native；完整 pre 文本等于持久化 prompt，下载 Markdown 字节完全相同。确认后 attempts 为空，证明网页不启动 Agent。切换不可用目标清除旧命令并禁用确认，只保留导出。未把这些结果称作真实 Agent 认证。

新增服务回归定位第 24 条证据，再继续分页；eventId+cursor 拒绝；未知证据 404；状态从 session metadata 正确读取，native 能力只公开布尔值；文件引用按源 cwd 转相对路径，未绑定 cwd 时不伪造文件路径。列表 attention 与实际详情推导一致。

浏览器新增真实文件变更后的确认冲突、16 分钟后 UI 过期禁用，以及凭据脱敏后第二次显式保存。最终本地 358 项核心回归、3 项浏览器 E2E、169 文件隔离安装包通过；新增 UUIDv7 原生能力投影与执行器同用 Zod UUID 判定。截图中遮盖合成临时目录。

![完整接续预览](assets/t15-handoff.png)

CI Chromium 的立即选择状态用例暴露不同于本机 Chrome 的行为：选择后服务仍 active。生命周期改为明确的表单提交，直接读取被选择的字段，并保持 revision CAS；浏览器测试显式保存状态再验证。固定 Chromium 本机下载仍被 storage.googleapis.com TLS 断连阻断，最终兼容结果以 CI 的锁定 Chromium 为准。
