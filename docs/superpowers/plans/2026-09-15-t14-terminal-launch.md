# T14 · 终端确认和单次启动实施计划

当前任务内继续执行总计划。工作包 T14-A 完成代码/合成进程验证；T14-B 为至少一条真实跨 Agent 接续证据。Claude 当前未登录，不能把 T14-A 的 fake 测试当成 T14 完成。

| 工作包 | 提交 | 文件 | 测试 | 回滚 |
| --- | --- | --- | --- | --- |
| T14-A | feat(T14-A): continue reviewed tasks in the terminal | src/storage/launch-store.ts、handoff-store.ts、sqlite-store.ts；src/platform/process.ts；src/targets/launch.ts；src/cli-continue.ts、cli.ts；src/handoff/prepare.ts；src/targets/prepare.ts、src/domain/errors.ts、src/server/app.ts；tests/targets/launch.test.ts、tests/integration/continue.test.ts、scripts/pack-smoke.mjs；CLI/契约/验证文档 | 非 TTY/无 --yes、完整终端预览、确认前后失效、两进程事务竞争只执行一次、取消/退出/失败/中断记录 | 单 squash；先撤回 T15 调用方，保留 tasks/handoffs/attempt metadata，不改变 schema 4 |
| T14-B | docs(T14-B): record real cross-agent continuation | docs/verification/t14-real-continuation.md | 隔离 Git 项目和真实 Agent 来源，人工确认任务接续有效；不暴露私有日志/凭据 | 仅证据回滚；不得清掉真实人工数据 |

- [ ] 严格 UUID CLI 参数；stdin/stdout 非 TTY 在打开数据目录前拒绝。
- [ ] 终端完整展示 prompt、目标、JSON 转义目录、验证/省略/期限；明确键入 CONTINUE 才接受全部上下文和不确定性。CLI prepare 的 prepared 包也可在该终端步骤完成确认。
- [ ] 确认后再次核验工作区/修订/来源/完整摘要；runner 构造参数后再复验。事务将 confirmed 单次占用为 launching 并写 attempt。
- [ ] shell:false / inherited stdio，仅执行 runner 的结构化规格；不解析 next_action。记录退出码、SIGINT 取消、SIGTERM/父进程失联中断和启动失败。正常退出不等同 resume_success。
- [ ] owner PID 放在私有 approval 的运行元数据，不改变包摘要；PID 已不存在时将残留 launching 标为 interrupted，不自动重试或杀其他进程；PID 存在/无权探测时保守保留占用。
- [ ] 局部/full/package 检查与 PR/三平台 CI。真实跨 Agent 证据不足时保持 T14 in_progress，继续可独立完成的工作，不宣称 L2/L3。

T13 上游已合并为 `3ce8f2ee9ec64e9f06f64dafe6f3cf4bee0d7125`。退出语义遵循原契约：unsupported=3，冲突/过期=4，Agent 非零/中断/启动失败=5，用户取消=130。Agent 普通非零退出对外记录 TARGET_EXITED 和 targetExitCode，不冒充 CLI 错误码。
