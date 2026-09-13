# T01 · 基线、验收与交接

日期：2026-09-14。任务：T01 / P0；覆盖全局协作与 Q24 的基线准备，**不代表 Q24 发布包认证通过**。

## 本地 Issue 草稿

问题：贡献指南强制使用仓库作者身份和旧分支规则；PR/feature 模板没有任务、契约、验收、恢复与支持证据字段。旧手册已有历史标记，需进一步明确其作者、机器和测试信息不适用于当前实施。

范围：贡献指南、PR/feature 模板、旧入口衔接、可复核基线、本地文档链接检查。依赖：无。产品行为、Capsule、CLI 输出及运行时门槛不变。未向 GitHub 创建 Issue/PR 或发送消息；此文件提供可提交的本地草稿及交接。

- [x] 记录 HEAD、Node/npm/OS 与当前全部测试基线。
- [x] 贡献者使用真实身份及任务分支，模板包含任务/验收/兼容/失败证据。
- [x] 旧手册明确为历史，当前入口指向 v0.2。
- [x] 本地文档文件链接可解析；断链时检查非零退出。
- [x] Node 24 最终 `npm run check` 和 diff 自审完成。

## 输入与工作区保护

开始 HEAD：`31ae6771bbb135bcf690e713c02869136db4b3ca`，与计划一致。
开始分支：`codex/dev-environment`；实施分支：`codex/t01-contributor-baseline`，从现有 HEAD 创建。

开始时已有的改动：`.gitignore`、`README.md`、`docs/DEV-PLAYBOOK.md`；未跟踪的 `.nvmrc`、`docs/LOCAL-DEVELOPMENT.md`、`docs/README.md`、`docs/superpowers/`、`docs/v0.2/`、两个 pelican HTML 及 `research/`。这些内容全部保留。T01 对已有文档只做指定位置的增量修改，未重置、暂存或提交其他工作。

## 验证记录

环境：macOS 26.6.2（25G83），Darwin arm64。

| 检查 | 环境 | 结果 |
| --- | --- | --- |
| 修改前 `npm run check` | Node 26.5.0 / npm 11.17.0 | core 构建通过；10 文件 / 38 测试通过 |
| 链接检查失败路径 | Node 24.18.1 / npm 11.16.0 | 新增的基线链接目标尚未创建时，精确报告文件/行号/ENOENT，退出 1；随后创建本记录 |
| 修改后 `npm run check` | Node 24.18.1 / npm 11.16.0 | core 构建通过；10 文件 / 38 测试通过；文档链接通过 |
| `git diff --check` 与模板检查 | 本地 self-review | 通过；模板字段/作者规则检查通过；脚本语法检查通过 |

链接检查范围：仓库根 Markdown、`docs/`、`.github/`；检查 inline/image 和 reference definition 的本地文件目标，忽略 fenced code、远程 URL 与 heading anchors。研究材料和生成文件不纳入产品文档门槛。

## 决策与限制

T01 不增加格式/lint 依赖或批量格式化源代码：计划将这些列为必要时引入，本次已有 TypeScript strict/Vitest 基线，新增的具体开发门槛为文档链接检查。自动 format/lint 尚未实现，已在贡献指南及质量门标明；本次 `git diff --check` 仅检查空白问题。

当前包仍为 0.1.0 / Node ≥20，CI 定义为 Ubuntu Node 20、24。本机 Node 24 的源码回归不是 Ubuntu、Windows、发布 tarball 或真实 Agent 认证。远端分支保护和 Actions 实际运行未在此任务核查。T19 负责运行时迁移与安装包验证，T18 负责真实平台/Agent 矩阵。

新增脚本仅读取项目文档并检查目标是否存在，不读取会话、不发起网络、不修改源数据；无生产接口、存储迁移或执行器变更。

## 交接

任务自有修改：`CONTRIBUTING.md`、PR/feature 模板、`package.json` 的 scripts；新增 `scripts/check-doc-links.mjs` 与本记录；增量修改旧手册、LOCAL-DEVELOPMENT、v0.2 质量门和实施计划进度。CI 原有 `npm run check` 会自动运行新门槛，无需重复修改 workflow。

审查：按范围→正确性→边界→设计→可维护性→证据完成 AI self-review，未发现本任务未解决的 P0/P1。实施与本地验证完成，计划状态为 review，待维护者审阅/提交后标 done。

提交：未提交，等待维护者本地 review；建议 subject：`chore: align contributor guidance with the workspace release`。本次不是第三方审计，无外部发布。

下一最小任务：T02，先复现同 basename 路径折叠，再实现 portable 路径与证据身份；依计划阅读 contracts 中路径规则，覆盖 Q01/Q02。T02–T21 尚未实施。
