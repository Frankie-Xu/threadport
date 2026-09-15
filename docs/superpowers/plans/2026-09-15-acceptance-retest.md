# T16/T18 验收复测工作包

**目标：** 在不开展外部用户验证的情况下，补齐固定容量浏览器延迟测量与真实 Codex 接续证据。

**架构：** 保留既有固定 200MiB/500会话/50k事件样本与预算；可选浏览器测量连接同一个被测服务，不修改生产代码。真实 Agent 仅使用独立临时 Git 项目，通过实际 ThreadPort 预览和终端确认。

**技术：** Node 24、Playwright Chromium/本机 Chrome、真实 Codex CLI。

| 工作包 | 提交 | 文件 | 测试 | 回滚 |
| --- | --- | --- | --- | --- |
| VERIFY-01 补齐验收观测 | test: measure visible search latency and record real continuation | scripts/benchmark.mjs、.github/workflows/performance.yml；docs/verification/performance-beta.md、performance/retest*.json、agent-matrix-beta.md；本计划 | npm run check；node scripts/benchmark.mjs --browser；真实 Codex 隔离失败测试接续 | 独立 squash，无生产/schema 修改；删除观测代码不会恢复或修改用户数据 |

- [x] 复验现有 API 基准，保留失败原始样本，不降低预算。
- [x] 添加可选 --browser：真实提交搜索、等响应及结果渲染、两帧后计时；100 个混合查询，p95 ≤500ms。等待/自动化开销包含在观测中，保守估算。
- [x] 运行真实源会话、索引该会话、准备并确认接续、在 TTY 输入 CONTINUE；校验目标产物与人工约束。
- [x] 记录平台/登录限制，不能把不可运行格记通过；用户提供环境后再补齐。
- [ ] 文档链接、全量回归、PR/三平台 CI 后 squash 合并。

基线 aa76591990b0dc6f424510cb3a937443c740bfe8；实际提交/检查见 PR。评审为自审。外部用户验证明确排除，发布保持原有 gate。

远端性能：手动 workflow_dispatch 在 Ubuntu/Node24 运行同一固定容量 --browser 基准，预算失败使任务失败，always 上传原始 JSON 与来源提交；不上传账号/真实日志。不将共享 runner 当固定参考硬件，也不替代 Ubuntu 真实 Agent。
