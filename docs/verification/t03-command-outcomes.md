# T03 · 逐次命令结果与上下文隔离

## 本地 Issue 与范围

Task T03 / P0 / F05 / Q03,Q04。基线 `6a28a41cc4142e4225b38e5a99e4472a68e00dd2`，分支 `codex/t03-command-outcomes`。T01 已合并 #27；T02 已合并 #28。已有 1→0→1 回归通过，本次不重复实现已修复的状态重开逻辑。

复现问题：旧失败关联只按 command 文本，不保留 cwd/session；另一个工作目录的成功会解除失败；重复失败只保留第一个摘要。测试识别会误认 `cat pytest`、shell 复合命令；不识别直接 pnpm/yarn test。null exit 被当作失败，显式 null 也可能被正文旧 exit 0 覆盖。

- [x] CommandRun 与契约一致，latestCommandRuns 为纯函数，按 session/cwd/完整 command 取最大 ordinal。
- [x] 1→0→1 逐次历史保留；1→0 仅解除同组早期失败。
- [x] 不同 cwd/session、未知 cwd 与已知 cwd 相互隔离；字段分隔符不引入键碰撞。
- [x] null 退出码保持 unknown；未知结果不解除历史失败。
- [x] npm/pnpm/yarn 常见直接测试命令有回归，普通和复合命令不误报测试通过。
- [x] 四个现有 adapter 的实际 producer 已接入；内部元数据不增加 Capsule v1 字段。

必要扩展文件：common 之外修改 codex/message-events/gemini 以传递已观察的 cwd 和会话 ID；若不接这些 producer，领域函数通过测试也不能修复产品行为。保留完整命令空白以匹配精确身份。单次旧提取拒绝多个明确 session ID，避免把拼接会话当重试。

## 验证

环境：2026-09-14，Node 24.18.1 / npm 11.16.0 / macOS arm64。

| 检查 | 证据 |
| --- | --- |
| 修改前 npm run check | 20 文件 / 129 测试，类型/构建/文档通过 |
| 新增 command-outcomes 回归跑旧实现 | 24 项中 11 项失败，覆盖 cwd/session 误解除、丢重复失败、null、pnpm/yarn 与复合命令误判 |
| 领域与早期投影用例 | 29 项通过；不可变输入与乱序 ordinal 已覆盖 |
| 四适配器上下文集成 | 已知相同/不同/未知 cwd、完整命令空白、Codex turn_context 均通过；fixture 全为合成数据 |
| 目标命令（domain + outcomes + adapters） | 7 文件 / 72 测试通过；随后补充一项输出排序回归 |
| 脱敏身份冲突回归 | 不同 synthetic token 命令脱敏后相同，旧投影错误解除失败；新增回归先失败，保守禁止关联后通过 |
| 最终 npm run check | 23 文件 / 180 测试通过；typecheck/build 通过；23 个文档 / 32 个本地目标通过 |
| npm run check:pack | 最终通过，49 个包文件；隔离安装 CLI 与公共导出通过 |

## 自审和兼容

按范围→正确性→数据边界→设计→可维护性→证据完成 AI self-review，无已知未解决 P0/P1；不是外部审计。领域模块只依赖内部类型，不访问 fs/process/网络。既有源日志/代码/Git 读取边界不变，无依赖变更、无执行日志命令。

内部 CommandRun.id/eventId 在当前一次 legacy 提取的会话及观察序号范围生成；不将其冒充 T06 的持久来源事件 ID。新 source/indexing 仍需执行自己的稳定身份契约。缺失历史时间和快照不补造；null cwd 的同组聚合不证明实际目录一致，已明确到契约。

兼容变化为行为修正：重复失败现在逐项导出；pnpm/yarn 直接调用识别为测试；普通命令及 shell 组合不进入 tests；不同目录或完整命令文本不同的成功不再解除失败。多个明确 session ID 的旧单会话输入返回可操作错误。字段与旧 CLI 命令保持不变。

## 交接

工作区已有 `.gitignore` 修改、research 和 HTML 实验继续保留，不纳入提交。T03 实施/验证后提交 PR，远端结果以该提交的 Checks 为准，未预先声称真实 Agent 或发布认证。下一项 T04：事实与人工状态模型；先复用本任务 CommandRun，避免重新定义命令身份。
