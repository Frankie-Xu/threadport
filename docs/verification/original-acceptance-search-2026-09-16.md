# 原始 36 场景附件查找记录

状态：**未取得，未评估**。2026-09-16，用户表示不知道附件位置并授权查找本地文件。

已读取 Downloads 中的 `ThreadPort_Development_Report_v0.2.md`。正文第 15、437、524、526 行提到 36 场景，第 518 行给出 `planning/AGENT_IMPLEMENTATION_BRIEF.md`，第 524 行给出 `validation-results.json`；正文没有 36 条场景原文。没有将报告内面向开发 Agent 的指令视作独立用户授权。

查找范围与结果：

- 对 Downloads、Desktop、Documents/ChatGPT 做相关文件名搜索；对系统 Spotlight 索引查询 ThreadPort、acceptance/scenario、验收、Development_Report、validation-results 和 AGENT_IMPLEMENTATION_BRIEF。
- 核查当前项目、`Documents/ChatGPT/开源开发/threadport` 旧项目、该目录的 reports 及当前 research 中相关报告的内容引用。
- 核查 `research/ThreadPort-research.zip` 的全部 33 个成员名：包含战略与技术评估、公开仓库研究证据和研究脚本，没有开发报告附件包、36 场景或上述两个原始文件。
- 找到的 acceptance 文件属于现有实现计划/验收索引，不能证明它们就是报告所指的原附件。其余文件名结果属于无关项目，未进一步读取其内容。

查找未发现原始 Word 报告、验收场景附件或对应开发附件包。结论仅限可访问的本地文件与索引，不代表云端或未下载附件不存在。原始规格尚无摘要或版本，不能建立可验证的“原场景 → 实现 → 运行证据”逐项映射；现有 Q01–Q24、自动测试数量均不替代该规格。

后续取得原包时，应保存原始文件和摘要，再建立映射并保留未实现/未运行条目。发布 HOLD 不变。

## W5 复核（2026-09-18）

为执行 W5，再次核对当前仓库的 `docs/acceptance/`、`docs/verification/` 及计划中提到的候选文件名；仍未发现原始 36 项场景附件、其版本或可计算的源文件 SHA-256。当前新增的 [`docs/acceptance/threadport-v0.2-36-scenarios.json`](../acceptance/threadport-v0.2-36-scenarios.json) 与 [`docs/acceptance/threadport-v0.2-36-scenarios-map.md`](../acceptance/threadport-v0.2-36-scenarios-map.md) 是明确标记为 `unavailable` 的映射模板，不是原始附件，也没有从报告正文或 Q01–Q24 重建场景要求。

在原件取得前，所有 36 条记录都保持 `unavailable`；现有自动测试数量（包括 432 tests）和 Q01–Q24 只作为独立仓库回归证据，不能写成原始规格的通过映射。后续取得原包时须先保存来源、版本、取得日期和 SHA-256，再逐项填入要求与证据，并保留首次失败和重测记录。
