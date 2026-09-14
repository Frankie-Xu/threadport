# T13 · 独立目标端能力与参数实施计划

沿用总计划 T13，当前任务内实现。准备 LaunchSpec 与真正启动分开，T14 才继承终端执行。

| 工作包 | 提交 | 文件 | 测试 | 回滚 |
| --- | --- | --- | --- | --- |
| T13 | feat(T13): verify independent Claude and Codex launch specs | src/targets/contracts.ts、detect.ts、prepare.ts、registry.ts、claude.ts、codex.ts；src/targets.ts、src/cli.ts、src/server/business-routes.ts；tests/targets/runners.test.ts、tests/handoff/api-cli.test.ts、helpers.ts；docs/compatibility.md、docs/v0.2/13-local-server.md、本计划与总计划 | 真实指定版本 help/version、fake probe/argv、未知版本/缺失/不支持格式降级、空格目录、payload 不参与 shell、原生恢复同时携带人工上下文 | 单 PR squash；先撤回 T14；保留旧 detectTargets/export/CLI |

- [ ] 固定实际 CLI 版本/帮助证据，不把二进制存在等同于登录或实际接续成功。
- [ ] 分别实现两个 runner。new-session 和 native-resume 均须传完整已审核 prompt；只使用实测 help 允许的 argv 参数，不假设 prompt-file/stdin。
- [ ] 检查 UUID vendor session ID、规范化 cwd、包校验；未知版本和帮助不符合时 export-only。Windows 不通过 shell 启动 .cmd/.bat，argv 超长度时明确拒绝。
- [ ] 探测固定 --version/--help，超时/输出上限，错误只返回常量原因；API 不输出 executable 或私有路径。
- [ ] 局部/full/package 检查、自审、提交/推送/PR、三平台 CI 和合并。实机接续属于后续门槛，不用 fake 测试冒充认证。

实际证据与范围见[版本矩阵](../../compatibility.md)。help 摘录内置于 runner 测试，只验证使用的参数；不保存用户会话或完整配置。T12-B 已合并为 `c32bc311909907fc25e5a34061126e5582beed49`。

本地验证：Node 24.18.1/macOS arm64，完整检查 346 项 / 48 文件；安装包隔离验证 157 文件。随后增强空格 executable/cwd 测试，runner 5 项与 typecheck 通过。两个真实 CLI 的 detector 均按矩阵识别；未创建真实会话。PR 中记录远程 CI/head/实际 squash。

四条路径的 LaunchSpec 均用合成来源验证；补充 Codex 来源 fixture 后，handoff/runner 合计 22 项及 typecheck 通过。真实 CLI 登录前置检查：Codex 已登录，临时 Claude CLI 未登录；未读取/导出凭据，T14 真实跨 Agent gate 仍待用户登录。
