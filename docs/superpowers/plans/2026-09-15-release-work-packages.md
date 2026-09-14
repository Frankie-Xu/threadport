# T18–T21 · 认证、包装与发布决策

| 工作包 | 提交 | 文件 | 测试 | 回滚 |
| --- | --- | --- | --- | --- |
| T19-A 可验证安装产物 | build(T19-A): retain package evidence and document release gates | package.json、scripts/pack-smoke.mjs、README、docs/verification/package-rc.md | 独立目录真实 npm 安装、原生 SQLite、已安装 doctor、UI、本地存储/搜索/工作区及旧 Cursor 流程；产物 SHA-256/清单 | 独立 squash；无 schema 变化，不删除已导出 tarball |
| T18/T20/T21 gate 交接 | docs: record unresolved real-world certification gates | Agent 24 格矩阵、用户观察表、demo 脚本、贡献 Issue 草稿、release 决策 | 文档链接和实际证据核对，禁止把模板/合成演示当真人验证 | 文档 squash；不会发布 npm/tag 或对外发送邀请 |

认证依赖缺失时可以准备脚本与表格，但 T18、T20 不标完成，不能据此宣布 beta/stable。实际平台、Agent 登录、真实用户许可与反馈不可由本地单元测试代替。
