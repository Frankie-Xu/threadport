# v0.2 开发交接

开发快照：`0.2.0-dev.0`，Node 24。当前工作台工程能力已整合；stable 仍为 **HOLD**。没有 npm 发布、发布 tag、真实用户招募消息或虚构接续结果。

## 工作包 → 提交 → 文件 → 测试 → 回滚

下表列修改入口；各 PR 正文保留完整逐文件清单、评审 head、最终 squash 和检查记录。

| 工作包 | 已合并提交 / PR | 文件入口 | 验证 | 回滚依赖 |
| --- | --- | --- | --- | --- |
| T15-A 工作台基础 | `66185ecc3c7c2a3ab2b34d687ad2f866702f5952` / [#49](https://github.com/Frankie-Xu/threadport/pull/49) | web/src/app.tsx、server/bootstrap、浏览器用例 | 三平台 CI；合成工作台 | 先逆序回滚后续 UI/数据包 |
| T15-B 编辑和接续预览 | `e2c8926452d077805598c9ace376277343603752` / [#50](https://github.com/Frankie-Xu/threadport/pull/50) | task/editor、handoff/preview、API 详情投影 | 草稿冲突、生命周期、原样 prompt、过期/工作区变化 | 先回滚依赖它的 T17/T19 |
| T16 容量与基准 | `12b4d89515d340eb4e627639f9369a519ff7b680` / [#51](https://github.com/Frankie-Xu/threadport/pull/51) | scripts/benchmark.mjs、capacity/search 回归 | 固定 200MiB/500会话/50k事件；性能 HOLD 保留 | 独立工具/测试，无 schema 变化 |
| T17-A 诊断与原子导出 | `f7efe3417d69eb0d24ef82e47c39185ed3c6eb97` / [#52](https://github.com/Frankie-Xu/threadport/pull/52) | cli-data、diagnostics、atomic-write、data-routes、settings/export | 366 core / 三平台 CI；4 浏览器流程；181 文件安装 | 先回滚 T17-B/C、T19 |
| T17-B 缓存与保留期 | `bde52518cbc881ad4afa80e7ff133b7d0040866f` / [#53](https://github.com/Frankie-Xu/threadport/pull/53) | storage/maintenance、indexing/service、settings/maintenance | 370 core / 三平台 CI；重建关联、7/30天、引用快照保留 | 先回滚 T17-C；重建需来源仍可读 |
| T17-C 全部数据删除 | `0751de4446402c96751a156d3179cc1f5da87476` / [#54](https://github.com/Frankie-Xu/threadport/pull/54) | storage/access、delete-data、data-routes、CLI 关闭 | 377 core、6 浏览器流程；跨进程拒绝、磁盘失败、exit 0 | 先回滚 T19；代码不能恢复已删数据 |
| T19 包装与 T18/T20/T21 交接 | 最终 squash 见 [#55](https://github.com/Frankie-Xu/threadport/pull/55) | pack-smoke、package、CI、公开类型依赖、验收记录 | 377 core / 6 浏览器；188 文件包；已安装浏览器修改/刷新/离线访问 | 反向撤销本包；用户数据保留 |

回滚在新 `codex/` 分支对对应 squash 执行 `git revert`，运行该包列出的检查，经 PR/CI 合并。依赖按表逆序处理。实测 T17-C → T17-B → T17-C 对同一份 schema-4 数据保留人工目标、约束和两次修订；这不等于可以恢复删除操作。导出文件和用户另行保留的外部备份不随代码回滚删除。

## 可复验产物

`npm run test:package` 先打包再独立安装，严格编译公开 declarations，并从安装目录启动 UI/CLI 和真实浏览器。CI artifact 保留 tarball 与 JSON 清单（版本、来源提交、工作树状态、SHA-256、OS/Node、文件列表、浏览器验证），保留期 14 天。`check:pack` 是兼容的无浏览器安装检查；正式 RC 必须使用完整检查。源码与包验证都只使用合成数据。

## 尚未完成的产品门槛

- [性能](performance-beta.md)：搜索 API p95 375.12ms，高于 300ms；参考机及浏览器可见延迟复测未完成。
- [真实认证](agent-matrix-beta.md)：macOS Codex 三场景已运行（保留首次命令问题），Claude 与 Ubuntu 实机条件缺失，21 格尚未运行；T14/T18 未完成。
- [外部用户](user-study-v0.2.md)：没有 5 名已观察用户，不能计算激活/接续成功率；真实 demo 尚未录制。
- [发布决策](release-0.2.0.md)：Q23、L3/L4、最终 RC 与具体发布授权未满足，不能宣布 alpha/beta/stable。

[Q01–Q24 审查索引](rc-checklist-v0.2.md) 区分自动回归和真实证据。评审为开发代理自审，未声称获得独立外部人工认证。
