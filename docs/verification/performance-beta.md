# T16 固定容量性能门禁：HOLD

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
