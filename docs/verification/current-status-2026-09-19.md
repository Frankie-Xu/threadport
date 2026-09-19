# ThreadPort 当前开发状态

更新时间：2026-09-19（Asia/Singapore）

当前候选提交：`c9c3865`。

## 已完成

- 结构化内部 Agent 证据已经进入事件、接续预览、JSON 导出和界面；缺少结果显示为 `unknown/unverified`，不会从 prose 或终端文本推断成功。
- 事件 ID、kind、重复事件和工作区快照绑定已校验；错配结果会被拒绝或降级。
- API、导出和界面共用错误恢复字段：`code`、`message`、`retryable`、`recovery`。
- `npm run check:local` 会记录候选 SHA、源码摘要、运行时、每步状态、退出码、时间、输出摘要和跳过原因，并在失败时保留报告。
- 增加格式门禁、公开入口/CLI JSON 兼容回归、重启恢复和人工编辑保留回归、草稿与认证恢复浏览器回归。

## 本地验证

- `npm run check`：72 个测试文件、457 个测试通过。
- 浏览器回归：7 个原有流程通过；新增恢复流程已通过定向验证。
- 隔离安装包：219 个文件，UI、CLI、SQLite、刷新持久化和 3 次 Cursor 往返通过。
- [完整一键验证报告](./local-validation-final-2-2026-09-19.json)：源码、浏览器和隔离包步骤通过；Linux 容器因宿主无法访问工作区挂载而明确跳过，未伪造成通过。
- [恢复与公开契约覆盖](./recovery-coverage-2026-09-19.md)。

## 仍保持 HOLD

性能搜索 p95 仍高于 300ms 门槛；Windows Node 24 实机、Ubuntu x64 CI、Claude/Codex 真实接续、36 项原始验收附件和外部用户观察仍未在本机验证。相关记录继续保持 `HOLD` 或 `unavailable`，没有被本地回归替代。
