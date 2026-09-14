# 中英文历史搜索

T09 提供 `threadport/search` SDK。它使用已持久化的脱敏索引，不扫描磁盘或调用 LLM。

```js
import { openStore } from 'threadport/storage';
import { SearchService } from 'threadport/search';
const store = await openStore({ dataDir: '/explicit/private/app-data' });
try {
  const search = new SearchService(store);
  const filters = { q: '支付 retry', projectId: 'project', agent: 'claude', limit: 50 };
  const first = await search.search(filters);
  if (first.nextCursor) {
    const second = await search.search({ ...filters, cursor: first.nextCursor });
  }
} finally {
  store.close();
}
```

## 查询与匹配

输入为 q、projectId、agent、from、to、cursor、limit；不认识的字段拒绝。默认空查询与空过滤返回全部历史，默认每页 50，最多 100。q 最长 1024 UTF-16 单元，按空白分词、去重后最多 8 个词，单词最多 128。中文连续子串匹配，英文 ASCII 大小写不敏感；多个词要求全部存在于同一会话的搜索文档中，可以分别出现在人工标题、目标或不同事件。没有隐含短语、正则、SQL 或语义语法。`%`、`_`、引号及反斜杠都是字面字符。

匹配范围只有 `events.search_text` 和关联任务的人工标题/目标。search_text 由来源白名单投影在脱敏后生成；搜索不读取 event body_json、raw hidden 字段、原始日志路径、私有游标或命令 cwd。人工标题与目标查询前再次脱敏，保护旧数据。约束、下一步和工作目录只作为任务/工作区信息使用，不加入全文匹配。返回纯文本和高亮范围，UI 应按文本渲染，不用 innerHTML。

每个会话最多一条结果；没有任何会话的人工任务作为 kind=task 单独返回。关联多个会话时，人工标题匹配可返回每个关联会话。归档任务仍可在历史搜索中找到。没有会话的任务不匹配 agent 或日期过滤。

## 结果与时间

每项包含 id、kind、sessionId、task `{id,title}`、project `{id,name}`、workspace `{id,displayPath}`、agent、lastActivityAt、matches。同名项目以 ID 区分，工作区提供经过脱敏、最多 512 字符的目录展示；不返回 sourcePath。工作区是本地私有展示信息，不是可移植导出字段。

matches 中的 field 区分 title/objective/event，eventId 定位事件；text 为最多 240 UTF-16 单元的摘录，offset 为摘录在原脱敏字段中的位置，highlights 为摘录内 start/end（右开区间）。每词选择该会话最新 ordinal 的一个命中事件；相距较远的词可有不同摘录。片段不是完整证据列表。空查询不返回摘录。

from/to 必须是含时区的有效 ISO 日期时间，归一化 UTC，边界包含；from > to 拒绝。排序使用会话最后可观察活动 UTC 时间倒序，再按稳定的带类型 ID 升序；无效/缺失时间为 null，排在有效时间后，日期筛选时不命中。不使用扫描或人工编辑时间给旧会话排序。裸任务的 lastActivityAt 为 null。

## 分页与索引并发

游标包含版本、过滤摘要、搜索数据 generation 和最后排序键；不包含 q 原文。后续页必须保留相同过滤和 limit。固定数据的游标可重复请求、数据库重启后使用；返回上一页由调用方保留前一页的输入游标实现。

schema 4 增加 search_state 和触发器，搜索可见的数据变更与 generation 在同一事务提交。若数据变动，旧游标返回 SEARCH_STALE，调用方显示刷新提示并从第一页重新查询。不会假装游标是跨事务的历史快照。无变化的事件/会话重扫不递增 generation；来源游标和扫描占用表的变化也不影响搜索。

每次请求在一个只读事务中完成 generation、候选和摘录查询。SQLite WAL 允许索引写入时搜索读取已提交版本；未提交数据不会出现在结果中。SDK 当前同步执行有界 SQLite 查询，后续 API/UI 性能门需分别验证。

## 验证与兼容

可运行 `npm run build` 后执行 `node scripts/benchmark-search.mjs`，生成 500 会话、50000 事件并报告 100 次默认页大小查询的 SDK p50/p95。基准使用临时目录，结束后清理，不读真实会话。共享 CI 验证容量、分页和有界执行，不用机器相关毫秒浮动阻断 PR。

schema 3 → 4 沿用 [存储备份和迁移](07-storage-migration.md)，不重写事件或人工数据。无新依赖、FTS 扩展或旧 Capsule/CLI 格式变化。[T09 验收](../verification/t09-history-search.md) 保存实际测量与限制；API/UI p95 和索引并发主线程预算仍由后续集成 gate 验证。
