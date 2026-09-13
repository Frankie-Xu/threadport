# 独立维护与协作规范

## 1. 最小工作系统

一名维护者也使用 Issue → 小分支 → PR → CI → 自审 → squash merge → Release 的流程。一个主实现任务在进行，最多再保留一个等待评审的 PR。采用周计划，避免为一个人建立每日站会、复杂审批和多层 release train。

GitHub Project 只需 Backlog / Ready / In progress / Review / Done。Issue 记录 type、priority、phase、size 和关联 F/AC/T；优先级用 P0–P3，尺寸用 S（≤半天）、M（≤2天）、L（需拆分）。首版任务计划中的大任务是交付单元，实施时可拆成保持同一验收边界的几个小 PR。

## 2. Issue 模板

```markdown
## Problem
谁在什么情境下遇到什么阻碍？用具体行为描述。

## Scope
Task ID:
Feature / acceptance IDs:
Included behavior:
Explicit exclusions:
Dependencies:

## Contract and affected files
输入、输出、状态迁移、错误码；链接到当前规格。

## Acceptance
- [ ] 正常路径的可观察结果
- [ ] 关键失败与恢复路径
- [ ] 对应测试及人工验证证据
- [ ] 用户文档和兼容说明

## Delivery
Owner:
Target milestone:
PR:
Known limitations:
```

Issue 不贴私人 session。bug 报告需要版本、OS、脱敏诊断、复现步骤、预期/实际；支持问题首先让用户导出诊断摘要，再请求最小合成样例。

## 3. 分支、提交与 PR

默认分支名称 `codex/<task-id>-<short-description>`，例如 `codex/t02-portable-paths`。历史 CONTRIBUTING 中 `<type>/Frankie-Xu/...` 命名在 T01 更新为本规则，避免后来协作者只能冒充仓库作者。

提交使用真实贡献者身份，不强制把所有提交作者写成 Frankie-Xu。英文祈使句，可用 Conventional Commits：`fix: preserve relative file identity in portable capsules`。一次提交表达一个可解释变化；不要提交未通过基本测试的中间状态到 main。

PR 通常控制在 150–400 行手写逻辑的可审查范围；超过约 500 行说明为何不可拆，fixture/generated/lockfile 单独看。不要为满足行数机械拆到相互不能运行。重构与行为变化可拆时分开，修复先给失败回归再改实现。

PR 模板建议替换为：

```markdown
## Change
问题是什么，触发条件是什么，用户现在得到什么行为。
Closes #...
Task / acceptance IDs:

## Scope and compatibility
公开 API、CLI、存储或支持平台有何变化？
若无变化，写 none。

## Validation
- [ ] npm run check
- [ ] 受影响的集成 / E2E（列命令和结果）
- [ ] 对应 AC 已逐项检查
- [ ] 没有真实日志、密钥或私人路径被提交

## Review notes
关键设计选择、失败恢复、迁移/回退、已知限制。
UI 变更附截图；runner 变更附版本和真实路径证据。
```

## 4. 自审与协作

独立开发允许维护者自审合并，明确标记 self-review。先完成 CI，再离开实现细节，从原始用户场景重新阅读 diff，逐项执行质量文档的 review 顺序。P0/P1 问题发现后不能以“只有我一个人”豁免。

涉及执行器、迁移、写入原语的 PR，争取外部 review；无人可审时，用故障注入、隔离真实场景和逐项自审记录补强证据，但不能声称等同第三方审计。AI review 可辅助找错，由维护者对最终判断负责。

外部贡献优先开放：合成 parser fixtures、平台兼容验证、搜索行为、文档与可访问性、独立 source adapter。不要把 runner 权限路径和迁移恢复标为 good first issue。

## 5. 代码可读性与可协作性

- TypeScript strict；禁止以 `any`、双重 cast 掩盖未知输入，先 Zod/类型守卫再使用。
- 函数名称表达业务：`prepareHandoff`、`verifyWorkspace`，不使用 `handleData`、`processStuff`。
- 纯函数接受输入、返回值；时间、UUID、文件系统、进程调用通过窄接口/参数注入，避免不可控全局状态。
- catch 只在能恢复或转换明确领域错误的边界；不把所有错误返回空数组或成功。
- 注释解释为何存在约束、数据格式来源和兼容妥协；不逐句翻译代码。公共端口写输入范围、副作用和错误语义。
- UI 组件处理显示与用户意图，用例处理业务；同一个规则不能在 CLI/API/UI 各复制一份。
- source adapter 的 vendor-specific 字段留在该 adapter；普通 domain 不知道某个厂商的 JSON 路径。
- 依赖新增写明用途、为何标准库不够、运行时/构建时归属、许可证及安装影响。
- 改契约时同 PR 改 producer、consumer、fixture、文档；不依赖协作者猜测隐式约定。

## 6. 决策记录与范围控制

以下变化需要一页 ADR：公开格式改变、运行时/平台支持改变、存储引擎、执行权限、本地数据出网、新增 LLM、monorepo/插件架构。普通函数名和组件拆分不需要 ADR。

模板：背景 → 决定 → 被考虑的替代 → 代价 → 验证方式 → 何时重新评估。保存在 `docs/adr/NNNN-short-title.md`，PR 链接关联。本套架构文档中的 ADR-001 至 ADR-006 是初始设计基线；实施新增 ADR 从 0007 开始。

范围冲突首先检查本套 v0.2 规格；用户的新明确指令优先。不能为了绕过失败的验收把要求悄悄改弱。性能目标或平台裁剪需要在 Issue 中明确写理由并更新 release 声明。

## 7. 每周与每次会话的习惯

每周开始：选一个能演示的增量，选 1–3 个 M/S Issue，检查前一周用户卡点。每周结束：录一次 60 秒真实流程，更新已完成 AC 和剩余 P1，清理过时文档；不是每周都增加新模块。

每次工作结束交接：

```markdown
Task / branch / HEAD:
Completed behavior:
Changed files:
Checks run and results:
Uncommitted changes owned by this task:
Known failures / blocked reason:
Next smallest action:
Out-of-scope discoveries:
```

新协作者从本目录 README → 对应 Task → contracts → tests 开始，30 分钟内应能跑通基础检查并找到本次修改入口。产品 roadmap 与执行交接分开，避免把历史聊天写进永久架构说明。

## 8. 仓库设置实施清单

T01 更新贡献与 PR/feature 模板；保留已有 Apache-2.0、SECURITY、CODEOWNERS。T19 更新面向普通用户的英文 README、release 模板和支持矩阵。分支保护/Actions 权限按 GitHub 实际配置核查；文档不能证明保护已启用。

- main 通过 PR 合入，required `check` 不绕过，禁止 force push。
- 默认 squash merge，合并后删除工作分支。
- Actions 最小 permissions；发布权限只给发布 job，PR 不持有发布凭证。
- Dependabot patch/minor 分组，major 单独审查；不因为机器人创建就自动合并原生依赖升级。
- 不自动发布 GitHub 评论、营销帖或 npm 包；具体发布动作由维护者执行/明确授权。
