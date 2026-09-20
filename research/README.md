# ThreadPort 研究交付

主报告：ThreadPort-战略与技术评估.html（单文件，可离线阅读）及同名 Markdown。

快照：2026-09-14，新加坡时间。审查源码：31ae6771bbb135bcf690e713c02869136db4b3ca。

- evidence/repository-snapshot.json：竞品元数据；Beads 的重定向后结果另见 gastownhall__beads.json。
- evidence/threadport-*.json：项目 PR、Issue、Release、CI 和贡献者公开 API 数据。
- evidence/validation.txt：构建、测试与 npm 包检查结果。
- evidence/probe-results.json：合成边界用例结果。
- probe.mjs：独立复现脚本，不读取个人会话。对已构建的固定版本运行：node probe.mjs /path/to/threadport。
- collect_github.py：重新查询公开 GitHub API；运行会刷新证据文件，保留旧快照再运行。
- render_report.py：使用 Python 标准库将报告 Markdown 生成离线 HTML。

所有战略门槛、价格和收入算式都是实验假设。GitHub stars 不是活跃用户或收入；报告未实测第三方 Agent 的完整接续流程。
