# 整改实施状态与证据

本页对应 [整改报告](remediation-report-2026-09-16.md)，记录实施结果；原报告保留为问题基线。整体 stable 继续 HOLD，不以阶段代码完成代替全部整改完成。

## R01：固化证据增量

本地提交 `31cf29a` 固化上一轮证据适用性改动及报告，未包含已有 `.gitignore`、diagram、research、pelican 和 output 内容，未推送或创建 PR。

在该提交的干净独立检出中，Node **24.18.1** / macOS arm64：锁定依赖安装、`npm run check` **57 文件 / 395 测试通过**；`THREADPORT_TEST_CHROME=1 npm run test:package` 通过，包含安装后浏览器任务编辑、刷新后持久化以及只访问 loopback 的断言。不是在旧 HEAD 上测试未提交改动。

安装包 **192 文件**，SHA-256 `9754e017fe6658ad656ff3b042443e56b194c097d1f8981d84e9accedc85a411`。原始 manifest 见 [Node24 安装验证](packages/r01-node24.json)。这是合成安装验证；真实 Agent 和外部用户验收仍独立。

## 阶段一：R02–R04

实施计划见 [运行时整改计划](../superpowers/plans/2026-09-16-remediation-runtime.md)。最终提交、检查和剩余边界在验证后更新。

## 尚未关闭的整改项

- R05：assertion 修订、显式替代、冲突解决、编译器及界面，需要独立领域工作包。
- R06：真实执行的 argv/cwd/前后快照/环境生产协议，未用旧日志补造历史证据。
- R07：旧 Codex 首次命令失败仍保留；当前 argv 传输需真实 CLI 复测，不能假设 stdin 或文件注入受支持。
- R08：既有三个独立性能轮次均未证明达标；macOS/Ubuntu 固定容量 API/UI 验证仍需完成。
- R09：原始 36 场景附件、21 个未运行矩阵格和至少 5 名外部用户观察仍缺；不能生成虚构参与者或把合成测试写成真实认证。
- R10：本阶段同步入口、脚本与已有证据，保留发布 HOLD。

所有评审为开发代理自审；没有外部独立审查或发布授权。
