# ThreadPort 下一层开发手册

**读者：** 同一个 workspace（`D:\Cursor开发\ThreadPort`）里、下一个 Cursor 会话的开发 Agent  
**仓库：** 第一方产品 `Frankie-Xu/threadport`（不是给上游提 PR）  
**GitHub 用户：** `Frankie-Xu`  
**文档日期：** 2026-09-12  
**规划时 HEAD：** `0868ec5875923ab4341be8d165f32bd3d0204c83`（`main`，与 GitHub 一致）  
**基线门：** 本机 `npm test` 已绿：5 files / 9 tests

本文是**执行手册**，不是愿景文。只执行仓库已经写明的下一层。一次只做一个阶段、一条分支。做完再开下一阶段。

仓库自己规定的顺序来自两处，不得改序、不得加层：

1. `examples/capsule-v1.json` 的 `next_action`：**先实现第一个 Claude Code session adapter。**
2. `README.md`：当前是 **protocol-first**；**Agent session adapters** 和 **handoff CLI** 是下一层；核心保持 **local-only、deterministic、read-only**。

---

## 0. 下一个会话怎么开工

把下面整段贴进新会话即可。

```text
按 docs/DEV-PLAYBOOK.md 执行 ThreadPort 下一层开发。
工作区：D:\Cursor开发\ThreadPort
先读手册 §1 和 §2，再从阶段 0 做起。一次只做一个阶段。
不要改 Capsule v1 schema，不要做 MCP，不要自动执行 next_action。
完成定义全部满足后再进入下一阶段，并更新手册 §9 进度表。
```

执行规则：

1. 先读 **§1 操作系统** 和 **§2 已完成**，不要一上来改代码。
2. 从 **阶段 0** 开始。跳过阶段 0 会在红基线上堆功能。
3. 每个阶段都有：目标、范围/非范围、主要文件、测试、分支、完成定义。
4. 完成定义全部满足后：`npm run check`，提交（英文祈使句，写 why），把 §9 标成 `done` 或 `blocked`，再进入下一阶段。
5. 阶段 1 未完成前，不要开始阶段 2。阶段 1+2 未完成前，不要开始阶段 3。

---

## 1. 操作系统（强制）

### 1.1 安全边界（违反即不合格）

这些句子来自 README 和示例 Capsule，是产品约束，不是风格建议：

- Capsule 只记录**可观察工作状态**。不写入 hidden chain-of-thought、thinking block、redacted reasoning。
- 不上传 session 数据。不把真实用户会话提交进仓库。测试只用仓库内的合成 fixture。
- 不自动执行 `next_action`。本层不提供 `apply` / `run` / `exec` 命令。
- 改目标仓库（除本仓库开发本身）之前，必须先 `validateCapsule`，再等人确认。
- 所有写入 Capsule 的字符串先走 `redactSecrets`。`redaction.applied` / `redaction.count` 必须与实际脱敏次数一致。

### 1.2 协议冻结

Capsule v1 已发布为 protocol-first。本手册期间：

- 把 `schema/capsule-v1.schema.json`、`src/types.ts`、`src/capsule.ts` 的字段集视为冻结。
- Adapter 和 CLI **适配进现有字段**，用现有 `validateCapsule` / `serializeCapsule` / `renderCapsuleMarkdown` / `readGitState`。
- 现有字段装不下某类 session 信息：丢掉或放进 `evidence`/`constraints` 的字符串，不要扩 schema。
- 只有在「没有该字段就无法做出合法 Capsule」时才能提议改 schema。那时停下来问人，不要自行改 v1。

### 1.3 Git 与分支

```text
<type>/Frankie-Xu/<description>
```

本手册写死的分支：

| 阶段 | 分支 |
| --- | --- |
| 1 | `feat/Frankie-Xu/claude-session-adapter` |
| 2 | `feat/Frankie-Xu/handoff-cli` |
| 3 | 每只 adapter 一条，例如 `feat/Frankie-Xu/codex-session-adapter` |

- 从最新本地 `main` 开分支。不要把多个阶段揉进同一条分支。
- 提交信息用英文祈使句，写 why。作者身份用 Frankie-Xu。
- 本机 `github.com:443` 经常连不上；`api.github.com` / `codeload.github.com` 通常可用。阶段完成以**本地 `npm run check` + 提交**为准。`git fetch` / `git push` 失败记到 §9，不要为了推远程去改产品范围。

### 1.4 质量门（每个阶段）

```powershell
npm run check
```

即 `tsc -p tsconfig.json` 再 `vitest run`。现有 9 个测试必须继续绿。新代码用 Vitest，fixture 放 `tests/fixtures/`。

依赖：Node `>=20`（本机已是 v24）。不要为了本层去改成 monorepo。`pnpm-workspace.yaml` 只是残留 stub，不要按 workspace 拆包。

### 1.5 本层产品形状

`.gitignore` 已忽略 `.threadport/`。这是本地 Capsule 输出目录，CLI 默认写这里。

Adapter 的端口（阶段 1 必须落地，后续 adapter 只实现它）：

```ts
export interface SessionAdapter {
  readonly agent: AgentId;
  extract(input: SessionExtractInput): Promise<Capsule>;
}
```

`SessionExtractInput` 至少包含：session 文件路径（或已读文本）、目标项目 `root`。`extract` 内部调用 `readGitState(root)`，对所有文本字段 `redactSecrets`，最后 `validateCapsule`。

---

## 2. 已完成（禁止重做）

| 模块 | 路径 | 状态 |
| --- | --- | --- |
| Capsule v1 JSON Schema | `schema/capsule-v1.schema.json` | done |
| Zod 校验 / 序列化 | `src/capsule.ts` | done |
| 类型 | `src/types.ts` | done |
| Markdown 渲染 | `src/markdown.ts` | done |
| Git 状态 + dirty hash | `src/git.ts` | done |
| 密钥脱敏 | `src/redact.ts` | done |
| 示例 | `examples/capsule-v1.json`、`examples/capsule-v1.md` | done |
| 测试 | `tests/*.test.ts`（9） | done |
| 许可证 | Apache-2.0 | done |

`source_agent` 已枚举 `claude | codex | cursor | gemini | unknown`。枚举存在不等于 adapter 已实现。本层之前没有 `src/adapters/`、没有 `bin`、没有 CLI。

已知限制（本层不要顺手「修成产品」）：`readGitState` 用 `symbolic-ref --short HEAD`，detached HEAD 会抛错。只有当 Claude fixture 必须在 detached 状态才能提取时，才允许最小修复。

---

## 3. 阶段 0 — 开工检查

**目标：** 证明工作区就是规划时的那份仓库，测试是绿的。  
**预期：** 0.5 小时（0.3–0.8）

### 范围

- 确认 `git rev-parse HEAD` 仍是 `0868ec5875923ab4341be8d165f32bd3d0204c83`，或是本手册之后已合并进 `main` 的后续提交。若 HEAD 落后/分叉：先对齐，再开发。
- `npm install`（若无 `node_modules`）然后 `npm test`。9 tests 必须过。
- 通读 `README.md`、`src/types.ts`、`src/capsule.ts`、`src/git.ts`、`src/redact.ts`、`examples/capsule-v1.json`。

### 非范围

安装新依赖、改 schema、写 adapter。

### 完成定义

- [ ] `npm test` 9/9 通过
- [ ] 能用现有字段复述 Capsule 是什么、下一层是什么
- [ ] 工作树里没有与阶段 1 无关的半成品

---

## 4. 阶段 1 — Claude Code session adapter

**目标：** 从一份本地 Claude Code session 记录，抽出一颗合法 Capsule v1。  
**依据：** `examples/capsule-v1.json` → `next_action`  
**分支：** `feat/Frankie-Xu/claude-session-adapter`  
**预期：** 8 小时（乐观 6 / 悲观 12）  
**风险：** Claude Code 会话落盘格式未写进本仓库。时间主要耗在「读懂可观察痕迹 → 填进冻结字段」，不是搭目录。

### 范围

1. 落地 `SessionAdapter` 端口（`src/adapters/types.ts`）。
2. 实现 `src/adapters/claude.ts`：只读本地 session，映射到 Capsule。
3. 合成 fixture：`tests/fixtures/claude/session-basic.jsonl`（或实际扩展名）。必须能覆盖：user 目标、若干文件编辑、至少一条命令、至少一条测试命令、一条失败/重试更好。
4. `tests/adapters/claude.test.ts`：
   - 抽出的对象通过 `validateCapsule`
   - `source_agent === "claude"`
   - `source_session_id` 来自 session 身份，而不是写死示例 id
   - fixture 里的密钥被 redact，原文不得出现在 Capsule 里
   - assistant thinking / hidden reasoning 不得进入任何字段
   - 同一 fixture 连跑两次，除 `created_at`（若用 `now`）外字段稳定；`created_at` 应用 fixture 时间或可注入时钟
5. 从 `src/index.ts` 导出 adapter 端口和 `createClaudeAdapter`（名称可更短，但必须是明确的公开函数）。

### 映射规则（可观察 traces only）

| Capsule 字段 | 从 Claude session 取什么 |
| --- | --- |
| `objective` | 第一条（或最后一条明确的）user 任务陈述 |
| `acceptance_criteria` | user 写出的验收句；没有则给一条由 objective 改写的可检查标准，并在 `constraints` 注明它是 derived |
| `completed` | 已成功的可观察步骤（写过的文件、exit 0 的命令） |
| `decisions` | 用户可见的明确选择（例如 user 拍板、或 assistant 对用户说出口的选择）。不从 thinking 推断 |
| `files` | Edit / Write / 等价工具的路径与动作 |
| `commands` | Bash / 等价 shell 工具的命令与 exit code |
| `tests` | 看起来像测试运行的命令（`npm test`、`vitest`、`pytest` 等）及结果 |
| `failures` | 非零退出或工具错误的摘要；不要贴整段日志 |
| `next_action` | 最后一条 user 未完成指令，或最后一次失败后的可见建议；都没有则写 `Review the capsule and confirm the next edit.` |
| `evidence` | session 文件路径（`kind: "session"`）+ 关键文件/命令 locator |
| `git` | `readGitState(project.root)`，不是 session 里的口头 git 状态 |
| `project` | 调用方传入的 `root` / `name` |
| `status` | 有未解决 failure → `blocked` 或 `active`；user 已声明完成 → `completed`；默认 `active` |

Session 文件位置由调用方传入。Adapter 可以**提示**常见目录（Windows 上多在 `%USERPROFILE%\.claude\projects\<encoded-cwd>\*.jsonl`），但测试不得依赖本机是否安装 Claude Code。

### 非范围

- Codex / Cursor / Gemini adapter
- CLI、MCP、上传、自动执行
- 改 JSON Schema
- 解析任意聊天网页 HTML

### 完成定义

- [ ] `npm run check` 通过，原 9 个测试仍绿
- [ ] 至少 1 个合成 Claude fixture 能抽出合法 Capsule
- [ ] 脱敏与「无 hidden reasoning」有专门断言
- [ ] 公开 API 能 `extract` 出 Capsule，不必经过 CLI
- [ ] README 用三五行说明 adapter 怎么调用；不把会话格式猜写成官方规范

---

## 5. 阶段 2 — Handoff CLI

**目标：** 人能在本地把 session 抽成 Capsule，并校验、渲染。核心仍是 read-only。  
**依据：** README「handoff CLI are the next layer」  
**分支：** `feat/Frankie-Xu/handoff-cli`  
**预期：** 4 小时（乐观 3 / 悲观 6）  
**前置：** 阶段 1 完成定义全部勾上。

### 范围

1. `package.json` 增加 `bin`（建议名 `threadport`），入口例如 `src/cli.ts`。
2. 三个子命令，只做这些：

| 命令 | 行为 |
| --- | --- |
| `threadport extract --from claude --session <path> --project <root> [--out <file>]` | 调 Claude adapter，默认写 `.threadport/<id>.json`，并同目录写 `.md` |
| `threadport validate <capsule.json>` | `parseCapsule`；非法非零退出 |
| `threadport render <capsule.json>` | stdout 打出 Markdown |

3. CLI 在写出前必须 `validateCapsule`。默认不覆盖已有文件，除非 `--force`。
4. `tests/cli.test.ts`：用阶段 1 fixture 跑 extract → validate → render；断言没有执行 fixture 里的命令。
5. README 补本地用法。`npm run check` 仍绿。

### 非范围

- `apply` / `exec` / `resume` / 自动改目标仓库
- 网络同步、账号、API key
- `--from codex|cursor|gemini`（阶段 3）
- 交互式 TUI

### 完成定义

- [ ] 三个子命令对阶段 1 fixture 可重复跑通
- [ ] 默认输出落在 `.threadport/`，且该目录仍被 gitignore
- [ ] 非法 Capsule → 非零退出
- [ ] 进程不 spawn fixture 里的业务命令（git 只允许 `readGitState` 已有的只读查询）

---

## 6. 阶段 3 — 其余 session adapter（第二批）

**前置：** 阶段 1 和 2 都是 `done`。建议**新开一个会话**再做本阶段，避免在「已经能看见后面还有三只 adapter」时赶阶段 1。  
**依据：** `source_agent` 枚举；README 点名 Claude Code、Codex、Cursor、Gemini。  
**预期：** 每只 2.5 小时（乐观 2 / 悲观 4）。三只合计约 7.5 小时（6–12）。

顺序固定：

1. `feat/Frankie-Xu/codex-session-adapter`
2. `feat/Frankie-Xu/cursor-session-adapter`
3. `feat/Frankie-Xu/gemini-session-adapter`

每只都复用 `SessionAdapter`，加自己的 fixture 和 `--from <id>`。完成定义与阶段 1 相同（换 agent 名与 fixture）。一只未完成，不要开下一只。

---

## 7. 本手册不做

仓库 topic 里有 `mcp`，代码和 README 的「下一层」都没写 MCP。下面这些不要做，除非人另开文档改范围：

- MCP server
- Capsule schema v1.1 / v2
- 自动执行 next_action
- 云同步、账号、遥测
- 把真实 Claude/Cursor 会话提交进 git
- 重写已绿的协议层「顺便优化」
- 把 `pnpm-workspace.yaml` 做成真 monorepo
- CI / Release（需要时另开 chore 阶段，不算下一层）

---

## 8. 完成时间预期

估时对象：同一个 workspace 里、一个熟悉本手册的 Cursor 开发会话，人在旁边拍板。单位是**净开发小时**，不是日历挂起时间。

| 阶段 | 乐观 | 预期 | 悲观 | 日历（按每天 5–6 净小时） |
| --- | ---: | ---: | ---: | --- |
| 0 开工检查 | 0.3 | 0.5 | 0.8 | 当天开头 |
| 1 Claude adapter | 6 | 8 | 12 | 1.0–2.0 天 |
| 2 Handoff CLI | 3 | 4 | 6 | 0.5–1.0 天 |
| **第一批合计（0+1+2）** | **9.3** | **12.5** | **18.8** | **2–3.5 天** |
| 3 其余 3 只 adapter | 6 | 7.5 | 12 | 1.5–2.5 天 |
| **手册内全部** | **15.3** | **20** | **30.8** | **3.5–6 天** |

**第一批交付物（建议作为「下一层完成」对外口径）：** Claude adapter + handoff CLI + 绿的 `npm run check`。预期 **12.5 净小时 / 约 2 个工作日**。

加长因素（碰到就把阶段 1 往悲观看）：

- Claude session 实际格式与 fixture 假设差很远，要先做一小段格式探查（仍用合成样本，不上真实会话）。
- 本机 `github.com:443` 不通，误把「必须推远程」当成完成定义。
- 想改 schema 或加 MCP。

缩短因素：阶段 1 把端口和 fixture 一次做对，阶段 2 只是薄封装。

---

## 9. 进度表

执行会话每结束一个阶段就改这里。

| 阶段 | 状态 | 实际耗时 | 结束提交 | 备注 |
| --- | --- | --- | --- | --- |
| 0 开工检查 | done | ~0.3h | （本轮按用户要求未提交） | HEAD 仍为 `0868ec5875923ab4341be8d165f32bd3d0204c83`；`npm test` 9/9、`npm run check` 绿；无阶段 1 半成品。工作树另有既有未跟踪 `package-lock.json`，未纳入本阶段。 |
| 1 Claude adapter | done | ~1.0h | local `d12f5d9` / origin `52891a77c994c46c398208a8c5d88142f60aa3eb` | `SessionAdapter` + `createClaudeAdapter`。github.com:443 不通，已用 api.github.com 把同等内容推到 `feat/Frankie-Xu/claude-session-adapter`（未 force、未直推 main）。未纳入既有 `package-lock.json`。 |
| 2 Handoff CLI | pending |  |  | 与 adapter 同属下一层 |
| 3a Codex adapter | pending |  |  | 第二批 |
| 3b Cursor adapter | pending |  |  | 第二批 |
| 3c Gemini adapter | pending |  |  | 第二批 |

状态只准用：`pending` | `in_progress` | `done` | `blocked`。
