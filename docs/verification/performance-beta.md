# T16 固定容量性能：当前合成基准通过

2026-09-21 最新运行时代码 `829a862` 已通过 macOS 与 Ubuntu 的全部固定容量合成预算：首次索引 19.00/19.11s，API p95 75.86/57.78ms，空闲 CPU 0.076/0.071%。[完整验收与原始证据](batched-indexing-2026-09-21.md)。以下内容保留历史失败；合成结果不等于真实 Agent、外部用户或稳定发布认证。


2026-09-15，本地 Apple M1 / 8 cores / 16 GiB / macOS 25.6 arm64 / Node 24.18.1。生成器实际写出 209,715,200 字节、500 会话、50,000 事件；500 个任务按会话关联。服务运行在独立进程，RSS 取该进程峰值，生成器不算入服务内存。100 次混合中文/英文/缺失/多词查询、100 次索引期间 status、5 次冷启动。

| 指标 | 基线 | 门槛 | 结果 |
| --- | ---: | ---: | --- |
| 完整索引 | 29,776 ms | 60,000 ms | 基线满足 |
| 搜索 API p95 | 375.12 ms | 300 ms | HOLD |
| 索引期间 status p95 | 8.88 ms | 200 ms | 基线满足 |
| 5 次冷启动 p95 | 294.36 ms | 3,000 ms | 基线满足 |
| 自动增量可见 | 105.89 ms | 20,000 ms | 基线满足，恰逢刷新周期，不代表最坏相位 |
| 服务峰值 RSS | 225.97 MiB | 400 MiB | 基线满足 |
| 3 秒空闲 CPU 中位数 | 0.14% 单核 | 2% | 短窗口样本，不扩大为长期保证 |
| 取消 | 5.64 ms | 2,000 ms | 实际状态 cancelled |

原始结果：[基线](performance/baseline.json)、[映射读取尝试](performance/mapped.json)、[原生匹配尝试](performance/like.json)。后两种尝试没有证明改善，均已撤回，生产查询保持原有 literal instr/lower 语义，无新索引/迁移。LIKE 的固定样本运行受并行本地构建影响；再暂停自己的构建后仍因机器其他后台负载出现索引 180 秒超时。观察到多项后台任务持续占用 CPU、可用内存较少；未停止或修改这些用户进程。不同负载样本不合并计算，不把环境干扰用来宣布达标。

复现：在没有并行构建/重负载任务的参考机运行 `npm run --silent bench > performance.json`。预算失败或阶段超时退出非零并报告 HOLD；成功结果含全部原始样本。基准失败仍关闭服务并清理其独立临时目录。还需固定 macOS/Ubuntu 环境复测和浏览器搜索可见延迟 ≤500ms，当前 API 基准不能替代 UI 延迟或 T18 实机认证。

容量回归：已有 100k events 超限回滚；新增恰好 1 GiB 的索引偏移可以提交，下一页超限时整批 events/cursor 回滚；在当前小批次提交后取消不再发起 read，恢复扫描无重复。新搜索保护覆盖 NUL 之后的内容、字面 %/_/反斜杠、Unicode，未削弱中文匹配。

工作包 → 提交 → 文件 → 测试 → 回滚：T16 基准/容量；最终 SHA 与 CI 见 PR；scripts/benchmark.mjs、capacity/search 回归、package 和本文件/原始 JSON；固定样本与单元回归；独立 squash，无 schema/存量数据变更。评审为自审，回滚仅计划。T16 工程工具可交付，但 beta/RC 性能门禁未完成。

## 2026-09-15 追加复测

同机 Node24 再次运行完整样本：[API 复测](performance/retest-api.json) 搜索 p95 910.60ms；[浏览器复测](performance/retest-browser.json) API p95 456.14ms、浏览器可见延迟 p95 593.70ms，均未达标。不同轮次独立保存，不合并样本挑选结果。两轮索引约35秒，内存、启动、取消等既有预算通过。主机仍有其他负载；测试期间有本测试的真实 Agent 活动，不作为安静参考机认证。

新增 `THREADPORT_TEST_CHROME=1 node scripts/benchmark.mjs --browser`（先 `npm run build`），可选模式在同一固定容量服务上执行100次混合查询，从按 Enter 前到收到响应、加载提示消失、结果容器可见并等待两帧计时；包含 Playwright 调度开销，是保守的可见延迟观测。失败仍返回非零；未指定 --browser 时不声称测过 UI。浏览器由 finally 关闭，服务/临时数据沿用原有清理。Ubuntu 参考平台仍缺失，性能 HOLD 不变。

远端复现：Actions → Performance evidence → Run workflow。Ubuntu/Node24 使用锁定 Chromium；超预算保持失败状态，仍上传原始 JSON 和来源提交，保留14天。共享 runner 的硬件以报告为准，不能等同固定参考机或真实 Agent 认证。

## 2026-09-16 整改测量与已撤回实验

同一 Apple M1 / Node24.18.1，固定 200MiB、500 会话、50,000 事件、100 API 和 100 UI 查询，未改变数据、查询、阈值。两轮都未并行运行本任务的构建/测试；系统其他负载保存在原始记录中。

| 版本 / 原始记录 | 索引 | API p95 | UI p95 | 峰值 RSS | 决定 |
| --- | ---: | ---: | ---: | ---: | --- |
| [9a9e408 基线](performance/r08-baseline-9a9e408.json) | 26.88s | 468.30ms | 492.50ms | 258.80MiB | API 超预算 |
| [09b51fc 表达式索引](performance/r08-folded-09b51fc.json) | 50.90s | 2387.61ms | 928.80ms | 223.28MiB | API/UI 超预算，撤回索引 |

基线 SQLite 筛选 p95 458.73ms，JS 组装 p95 1.23ms。微基准曾显示表达式索引可减少 lower 计算，但完整磁盘样本没有证明改善，故删除该索引和迁移，当前仍 schema 7；见 [实验决策](../adr/0016-literal-search-expression-index.md)。不将本轮负载差异作为宣称达标的理由，也不把小样本诊断冒充容量认证。基线 IPC 的两处 listener 重复收集 storage timing，每条出现两次；API/UI 原始计时未重复。后续已修复该测量问题。

其余指标逐项见 JSON：两轮 status、冷启动、增量、RSS、空闲和取消预算通过；所有超预算轮次保留，不合并重选样本。

另从 [先前 Ubuntu 工作流](https://github.com/Frankie-Xu/threadport/actions/runs/34988633290) 找回遗漏的 [7f57a79 原始结果](performance/ubuntu-7f57a79.json)。Linux x64 / EPYC 4 核共享 runner / Node24.20.0：API p95 394.68ms、UI p95 427.70ms，API 未通过；索引53.24s，RSS296.62MiB。该版本早于本轮整改，不能认证当前候选，也不是固定参考机认证。发布性能 HOLD 不变。

## 2026-09-18 W3 阶段计时复测

本轮先固定查询计划和阶段计时边界，见[查询计划与计时说明](performance/query-plan-2026-09-18.md)。基准 worker 为每个 `searchHistory` 调用分配唯一 ID，并验证 100 条 API 样本（浏览器模式为 200 条）没有缺失或重复；验证结果随原始 JSON 保存。生产查询、schema 7 和既有 literal 匹配语义未改变。

本机 macOS arm64 / Node 26.5.0 的 API p95 为 355.65ms；浏览器模式 API/UI p95 为 525.31/527.50ms。Node 26 不是发布要求的 Node 24，且没有 Ubuntu 同候选复测；API 与 UI 仍分别超过 300/500ms 门槛，因此 R08 继续 HOLD。主要耗时在 SQLite CTE/事件筛选，JS 组装 p95 约 1–1.5ms；本轮没有足够证据提交生产查询优化。

## 2026-09-19 本机 Node 24 容量复测

候选提交 `c08e61f8add9ce2e9e7b4712272cfe62728fc56d` 在 macOS arm64 / Node 24.18.1、200 MiB / 500 sessions / 50,000 events 固定数据集上完成 API 基准；原始结果见 [local-node24-2026-09-19.json](performance/local-node24-2026-09-19.json)。索引 24.69s、搜索 API p95 322.78ms、status p95 10.94ms、冷启动和资源指标均在既有预算内，取消 6.00ms；100/100 阶段样本唯一且无重复。搜索仍超过 300ms，决定继续 HOLD。该结果是本机 macOS 诊断证据，没有 Ubuntu 同候选复测，也没有 UI 模式测量，不能解除跨平台发布门禁。

## 2026-09-18 final candidate-bound rerun

候选提交 `6db8c716b8702383e864c74359c83e2abc522c61` 在同一 Apple M1 / macOS 25.6 arm64 / Node 26.5.0 固定容量数据集上重新执行了 `node scripts/benchmark.mjs --browser`；完整原始结果见 [候选绑定 JSON](performance/w3-node26-final-6db8c71.json)。索引 26.45s、API 搜索 p95 324.85ms、浏览器模式 API/UI p95 362.60ms、status p95 8.85ms、冷启动 p95 256.22ms、增量 8.46s、峰值 RSS 200.39MiB、取消 6.15ms；200 条阶段样本为 200 个唯一 ID、无重复。API 搜索仍超过 300ms，决定保持 HOLD。Node 26 与 Ubuntu 同候选证据仍不能替代 Node 24 发布门禁。

## 2026-09-20 搜索与空闲 CPU 优化

运行时代码 `2e4ef51` 的 macOS/Ubuntu Node 24 固定容量验收：API p95 43.46/59.04ms、UI p95 79.40/93.70ms、空闲 CPU 中位数 0.128/0.082%，均达标。macOS 全部门槛通过；Ubuntu 首次索引 78.22s 超过 60s，因此整体性能仍 HOLD。完整实现、全部失败实验和两平台原始记录见 [优化验收](search-idle-performance-2026-09-20.md)。原数据量、查询和门槛未改变；这些结果不能替代真实 Agent 与外部用户认证。
