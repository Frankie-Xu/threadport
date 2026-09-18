# W3 搜索查询计划与阶段计时

本轮先固定现有查询计划和测量边界，再评估候选实现。生产查询保持 schema 7 和 literal `instr(lower(...))` 语义，没有提交未经完整容量基准证明的索引或迁移。

## 计划

1. `parseSearch` 校验输入、折叠 ASCII 大写、计算 cursor digest。
2. SQLite `documents` CTE 组装会话和无会话任务的公开投影，应用 project、agent、时间和 keyset 条件；每个词在 title/objective 上匹配，事件文本通过按 session 的 `EXISTS` 扫描匹配。
3. 对返回页中的每个 session，按 ordinal 倒序读取命中的事件投影，生成摘要和高亮；只读取 `events.search_text`，不读取 event body。
4. 在 JS 中执行摘要、脱敏和 cursor 编码。

基准 worker 只观测这三个存储阶段：CTE 查询 `.all()`、事件投影 `.get()` 和其余 storage/JS 组装。每次 `searchHistory` 调用分配单调递增 ID；父进程校验期望样本数、唯一 ID 数和重复 ID。API 模式期望 100 条，`--browser` 模式期望 API 100 条加浏览器 100 条。任何缺样本或重复样本都加入失败列表，不使用阶段计时推断缺失请求。

## 2026-09-18 本机测量

固定数据集仍为 200 MiB、500 sessions、50,000 events、100 混合查询；本机为 macOS arm64，运行时为 Node 26.5.0。Node 26 不满足发布证据要求的 Node 24 绑定，因此结果用于诊断，不改变性能门禁状态。

| 记录 | API p95 | UI p95 | 阶段计时 p95（query / projection / assembly / storage） | profile 校验 | 决定 |
| --- | ---: | ---: | ---: | --- | --- |
| [API 原始 JSON](w3-node26-api-2026-09-18.json) | 355.65 ms | — | 352.94 / 32.92 / 1.10 / 353.62 ms | 100/100，0 duplicate | HOLD |
| [浏览器原始 JSON](w3-node26-browser-2026-09-18.json) | 525.31 ms | 527.50 ms | 505.74 / 33.40 / 1.50 / 506.18 ms（200 条） | 200/200，0 duplicate | HOLD |

API 门槛为 300 ms，UI 门槛为 500 ms；两轮均超预算。浏览器轮次还观察到增量可见 3.70 s，仍低于 20 s 门槛但明显受本机调度影响。没有 Ubuntu 或 Node 24 的同候选复测，不能把本轮结果宣称为跨平台容量认证。

阶段结果显示主要瓶颈仍在 SQLite CTE/事件筛选，JS 组装不是主要成本。下一轮候选必须在相同数据集上同时验证 API、UI、索引、RSS、status、cold start、increment 和 cancel，并复跑 literal `%`、`_`、反斜杠、NUL、中文、ASCII folding、AND、筛选和 cursor 回归；否则保持 HOLD。
