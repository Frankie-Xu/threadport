# T09 · 中英文历史检索与分页

基线 7c13034e4c30708d6aeae4a5e6f26e63ce1db9ee，T08 PR #34 已合并。T09 / F03 / AC-F03-1–4 / Q11。

## 实施与验收计划

1. 新增 src/search/contracts.ts、service.ts：q/projectId/agent/from/to/cursor/limit 校验，中文连续子串、英文 ASCII 大小写无关、空白分词 AND，默认 50 / 最多 100。结果包含脱敏匹配位置、任务与会话关联以及项目/工作区区分信息。
2. 新增 src/storage/search-store.ts，由 SqliteStore 提供只读查询端口：只查询 event search_text、人工标题和目标，不读取 raw hidden 字段；全参数绑定；无会话任务单独返回。
3. schema 4 增加搜索 generation 与变更触发器；分页按活动 UTC 倒序、ID 升序，unknown 最后。游标绑定过滤条件与 generation，数据变化后明确返回 SEARCH_STALE，固定数据重放与往返不重复遗漏。
4. tests/search/service.test.ts 先验证入口缺失，再覆盖中文/英文/路径、AND、literal wildcard/SQL、空结果、坏日期、项目/Agent/日期组合、同名工作区、任务字段、脱敏/hidden、重复分页及变更失效。
5. 合成 500 会话 / 50000 事件数据运行 100 次查询，记录宿主环境与 SDK p95；CI 验证有限执行和 WAL 写入时读取，不以共享机器毫秒浮动冒充 API/UI 性能认证。
6. 运行目标测试、完整 check、隔离安装包与文档检查；自审后提交、推送 PR，三平台 CI 通过再合并。

## 验证记录

2026-09-14 / macOS arm64 / Apple M1 8 核 / 16 GiB / Node 24.18.1 / npm 11.16.0。首次目标测试因 search/service 模块不存在失败，实现后按边界逐步补齐回归。

- [x] 中文子串、英文 ASCII 大小写、相对路径、人工标题/目标与跨字段 AND；literal `%`、`_`、引号 SQL 文本不扩大结果。
- [x] 项目/Agent/UTC 日期组合、时区归一化、无效日期拒绝；存储中的非法日期保持 unknown，不自动修正成有效日期。
- [x] 同名项目以 ID 和工作目录区分；未关联任务仍可检索；未知时间最后排序。
- [x] 固定数据游标重放/跨连接重启、500 条结果分页无重复遗漏；条件改变拒绝游标；事件/人工变动返回 SEARCH_STALE。
- [x] 无变化重扫保留游标有效性；WAL 未提交更新不可见，写入事务期间查询正常返回；变更与 generation 一起回滚。
- [x] secret 与 hidden canary 无命中，响应不包含它们；容量 fixture 的 private body 从未作为搜索字段。
- [x] 摘录定位与较远 AND 词的独立片段；查询预算、最多 100/页限制；schema v1/v2/v3 升至 v4及原迁移失败/恢复回归。

`npm run check`：34 文件 / 249 项测试，typecheck、build、文档检查通过。`npm run check:pack`：95 包文件，隔离安装后 CLI、所有 SDK 入口与 search 查询通过。

`node scripts/benchmark-search.mjs`：500 sessions / 50000 events / 16509000 字节搜索文本，100 次混合查询，默认 limit=50。最终本地测量 p50=44.92 ms，p95=65.27 ms，max=139.19 ms；无额外预热，数据生成后执行查询。只测 SDK 查询，不包含 HTTP、DOM、UI 或后台完整索引并发；不能据此宣称 AC-F03-4 的完整 API/UI 门已完成。

## 自审与交接

AI self-review：范围、正确性、数据去向、SQL 参数化、迁移、失败恢复和验收证据已检查，无已知未解决 P0/P1，不等同外部审计。无新依赖/FTS 扩展或旧 Capsule/CLI 格式变化；所有测试使用临时目录与合成文本，无真实会话读取或上传。

使用有界字面量扫描与既有 session/ordinal 索引，避免引入中文分词依赖。每页一个只读事务；结果变化后显式要求重新查询，未提供跨事务历史快照。SDK 同步 SQLite 查询在容量范围内测量通过，后续 API/UI 和并发事件循环性能仍按质量门验证。

L2（搜索集成）。实际提交、远端三平台 CI 和合并状态以本任务 PR 为准；下一项 T10「工作区快照与显式验证」。[用法与边界](../v0.2/10-history-search.md)。工作区原有 .gitignore、research 与 HTML 实验文件未纳入本次改动。
