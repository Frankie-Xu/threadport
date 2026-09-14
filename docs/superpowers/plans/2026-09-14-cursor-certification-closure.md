# Cursor Certification Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完成一个明确 Cursor 版本、模式和平台的手动导入验收，消除文本退出标记造成假成功的风险，并补齐集成与发布证据。

**Architecture:** 保持 Capsule v1 不变；原生证据、人工观察和推断分别记录。只确认可靠结构化结果，缺失结果保持 unknown；不把自动发现、索引或原生接续悄悄加进 Cursor 支持范围。

**Tech Stack:** TypeScript、Vitest、Node 24、SQLite CLI、Cursor 桌面版 Agents / This Mac。

## Global Constraints

- 检查日期：2026-09-14。修复分支 `fix/Frankie-Xu/cursor-transcript-import`，已推送提交 `dcdb0960071bb0f4b9b362138b8d882af1eb7273`。
- 本次重新 fetch 后 main 为 `0d00f6d`，分支相对 main 为缺少 3 个提交、独有 1 个提交；尚未整合 PR #31–#33。
- main 的 runtime 已为 Node `>=24.0.0`，新增 `better-sqlite3` 与 Claude/Codex 索引；不能沿用旧分支 Node 20 声明或将索引能力外推给 Cursor。
- `gh pr list --head fix/Frankie-Xu/cursor-transcript-import --state all` 与该分支的 `gh run list` 本次均为空。推送分支没有触发 CI：当前 workflow 的 push 仅匹配 main，另支持 pull_request。
- 最近一次完整本地检查是 223 tests / 26 files、59-file package smoke；不是本轮新跑的结果，也不是新 main 集成结果。
- 以上远端与测试数字是方案编写时的历史检查点。用户随后要求逐项执行；执行时 main 已更新到 `7c13034`（PR #31–#34），已整合进工作树。以[候选验收记录](../../verification/cursor-release-candidate.md)为最新状态；尚未完成的实机/PR 项不得视为通过。
- 执行时只操作新建的合成项目和明确授权的会话；不得扫描所有聊天、读取隐藏推理、删除生产文件或添加全局允许规则。原始证据不进入 Git。
- 与 T03/T04、F05、Q03/Q05/Q15 的手动提取质量相关；Cursor 原生启动/恢复不在本轮范围。
- 推荐下一轮在本窗口逐项执行；如用户选择子代理方案，需要明确授权。当前未加载 superpowers 执行技能，不依赖其存在才能完成工作。

## 1. 已做与未做的准确划分

| 项目 | 已有证据 | 尚缺什么 |
| --- | --- | --- |
| 编辑、失败→通过→失败、最新用户指令 | Cursor 3.20.10 / macOS 26.6.2 / This Mac 实测 | 在选定的同一目标版本重新跑全套 |
| 待审批、拒绝 shell、停止运行中命令 | Cursor 3.20.17 同平台/模式实测；设置已恢复 | 不能替代文件编辑权限拒绝；不能证明中断标记可信 |
| Markdown / sparse JSONL | 可降级导入，警告和 unknown 有回归 | 新目标版本三条导出路径的独立验收 |
| 原生工具配对与 cwd | 合成回归、局部真实工具重叠 | 同命令并发、跨 cwd、结果反序、缺失一路结果的真实组合 |
| 包安装 | help 和公开导出可加载 | 从安装后的 tarball 完成真实样例 extract→validate→handoff |
| SQLite 开发导出脚本 | 单会话白名单、只读、拒绝覆盖、未知会话回归 | WAL 并发、缺失 bubble、格式变化、超限/损坏输入的系统化失败验收 |
| 发布 | 修复分支已推送 | 新 main 集成、PR CI、维护者审核与合并；不是自动发布授权 |

两个版本的不同场景不能拼成某一个版本的完整认证。重放旧样例不是新版本实测；CI 的 OS 名称也不是该平台上的真实 Cursor 认证。

## 2. 优先级和顺序

1. **P1 风险收紧：文本退出标记。** 现有原生转换会将精确 wrapper 的末尾 `EXIT_CODE=0` 变成 `exit_code: 0`。只读合成检查确认此行为；真实 stop-command 记录又曾将 `notInterrupted` 写为 true。输出由测试自身打印同名标记、随后中断的碰撞场景未实测，不能宣称已经真实发生，但应先消除默认推断。
2. **集成门槛：新 main。** 在私有证据不入库的前提下整合 #31–#33、解决冲突并重跑 Node 24 gate。
3. **实机门槛：单版本完整场景。** 补齐目标版本基础操作、文件编辑拒绝和并发。
4. **交付门槛：安装产物、CI 与支持声明。** 未测模式继续写未支持，不用增加软件安装数量掩盖证据缺口。

## Task 1: 收紧非结构化退出标记

**Files:** `src/adapters/cursor-native.ts`、`tests/adapters/cursor-native.test.ts`、`docs/adr/0008-cursor-selected-evidence.md`、`docs/verification/cursor-native-evidence.md`、`docs/compatibility-evidence.md`。

**Interfaces:** `cursorNativeRecords(value: unknown): SessionRecord[]`；经 `createCursorAdapter().extract(input)` 形成 Capsule。以下测试使用现有文件中的 `shell`、`text`、`envelope`、`project` 合成辅助函数。

- [x] 加入以下回归，先运行 `npx vitest run tests/adapters/cursor-native.test.ts`。当前实现应失败于退出码未保持未知。

```ts
it('does not certify an exit from a text marker and unreliable completion flags', async () => {
  const tool = shell('marker-only', 10, 20, 0);
  tool.tool.result.output = 'synthetic child output\nEXIT_CODE=0\n';
  const capsule = await createCursorAdapter().extract({
    project: await project(),
    sessionText: JSON.stringify(envelope([text('u', 1, 'Review only.', 0), tool]))
  });
  expect(capsule.commands[0]?.exit_code).toBeUndefined();
  expect(capsule.completed).toEqual([]);
  expect(capsule.status).toBe('paused');
});
```

- [x] 将 `run_terminal_command_v2` 分支收敛为以下行为，删除 marker→inner exit 的转换；不把任意 output 交给会猜测退出码的通用结果解析器。实现补充显式 `exit_code: null` 来保留结果时间和文本，同时禁止共享解析器猜测结果。

```ts
if (name === 'run_terminal_command_v2') {
  name = 'shell';
  input = { command: params?.command ?? '', cwd: params?.cwd ?? null };
  if (end != null && result?.rejected) {
    output = { output: 'Cursor rejected this command request; it was not executed.' };
  } else if (end != null && result?.notInterrupted === false) {
    output = { output: 'Cursor command was interrupted; exit status is unknown.' };
  }
  // Native text markers and completed flags do not establish a numeric exit.
}
```

- [x] 同步静态警告内容为：`Experimental selected Cursor database evidence, not a vendor export contract. Tool completion and output text markers do not establish a process exit code. Unreported exits remain unknown. Current Git state is not a historical test snapshot.`
- [x] 原生 terminal 测试改为断言保留原命令和 cwd、退出码未知；结构化 JSONL 的显式 numeric exit fail/pass/fail 测试保留，不降低该路径要求。原生文件成功/失败测试仍独立验证。真实历史 Node 结果改标为独立观察，而非新构建可可靠推导的原生退出码。
- [x] 如后续实际版本提供可靠结构化数值退出字段，另写带版本来源的最小 fixture 与 ADR 修订后才能恢复相应映射；本任务不猜测字段名称或扩大默认兼容性。

## Task 2: 整合新 main 并建立候选构建

**Files:** 当前分支冲突文件、`package.json`、`package-lock.json`、`.github/workflows/ci.yml`、`README.md`、`docs/compatibility-evidence.md`。

- [x] 开始前 `git status --short`、`git fetch origin`、`git log -4 --oneline origin/main`，记录执行时的新 SHA。干净工作区或精确保留任务修改后，在现有功能分支合入 origin/main；不重置、不强推共享分支、不直接推 main。
- [x] 保留 main 的 Node 24、SQLite 原生依赖和迁移资源，同时保留 Cursor 的三条手动输入路径。检查 `src/sources/registry.ts`，不注册未经设计/验收的 Cursor 自动发现来源。
- [ ] 在 Node 24 执行 `npm ci`、`npm run check`、`npm run check:pack`、`npm audit`、`git diff --check`；记录实际测试数，不写死 223。若 SQLite 原生安装失败，记录平台与真实错误，不能改回旧 floor 来绕开失败。
- [ ] 将候选代码 SHA、运行时、OS/架构和输入格式写入新的本地验收记录，所有后续实测绑定此候选。

## Task 3: 同一 Cursor 版本补齐基础和文件拒绝实测

**Files:** 新建 `docs/verification/cursor-release-candidate.md`；结构差异仅在明确复现后影响 `tests/adapters/cursor-native.test.ts`、`scripts/export-cursor-session.mjs`、`src/adapters/cursor-native.ts`。

- [ ] 从 About 读取当次版本/build，记录 Agents / This Mac 与 OS；不要预填为 3.20.17。只建一个全新的合成测试项目，不继续使用故意遗留失败的旧项目作为干净基线。
- [ ] 在该版本重跑：单文件编辑、同名不同目录保护、精确替换失败、独立测试失败→通过→再失败、后续用户 stop/README 指令、待审批 shell、拒绝 shell、运行中 Stop。每步对照文件散列/Git、UI 与选定会话原生记录；结果缺字段时 Capsule 必须保持 unknown。
- [ ] 文件拒绝必须由真正的原生编辑工具请求触发真实审批，并在用户批准的测试配置下点拒绝。拒绝前后文件字节相同、没有成功编辑证据、不得把结果记作 completed。匹配失败、Undo、拒绝一个写文件 shell 均不算原生编辑拒绝。
- [ ] 先检查版本是否提供可安全使用的原生编辑审批。若只对工作区外文件提供此审批，必须另获用户对一个新建合成目录的明确授权；不得拿真实外部文件触发。若无法触发，明确记为该模式不支持/无法认证，不伪造拒绝记录。
- [ ] 如需再调整权限，重新核对原值，仅按具体批准范围收紧；恢复自动执行设置时获取执行时确认。结束后核对恢复值。
- [ ] 分别采集同版本 Copy Transcript、项目 JSONL、选定会话 SQLite 导出，私下留存原始输入及哈希；只提交独立重建的合成 fixture。Markdown/稀疏 JSONL 的验收是明确降级，不要求恢复原文件中没有的证据。

## Task 4: 并发与导出异常的可重复验收

**Files:** `tests/adapters/cursor-native.test.ts`、`scripts/export-cursor-session.mjs`、`docs/verification/cursor-release-candidate.md`。

- [ ] 在目标版本要求两个原生 shell 调用重叠：两个合成 cwd 使用完全相同命令，慢的一路失败、快的一路成功；再做同 cwd 重叠和一路被停止。必须有独立 call ID，观察开始/完成反序，不把一个 shell 里的两个后台进程当两次工具调用。
- [ ] 若 Agent 串行执行，记录“未触发并发”，不修改日志制造成功。工具层可靠退出码缺失时验收配对和 unknown，不靠同名命令推断配对/失败恢复；完整失败恢复保留在显式结果的合成回归中。
- [x] 对拒绝编辑的合成回归使用以下最小测试；如果通过，只算回归覆盖，不算实测完成。

```ts
it('never confirms a native edit rejected by the user', async () => {
  const tool = edit('denied-edit', 10);
  const denied = { ...tool, tool: { ...tool.tool,
    result: { rejected: true }, error: null } };
  const capsule = await createCursorAdapter().extract({
    project: await project(),
    sessionText: JSON.stringify(envelope([text('u', 1, 'Review.', 0), denied]))
  });
  expect(capsule.completed).toEqual([]);
  expect(capsule.files[0]?.summary).not.toBe('Confirmed in session.');
  expect(capsule.failures.some(f => !f.resolution)).toBe(true);
});
```

- [x] 导出器异常测试在临时合成 SQLite 中依次覆盖：header 指向缺失 bubble、畸形 JSON、缺 createdAt、重复 bubble/call ID、不支持的 tool、超出 16 MiB 输出预算。缺失/损坏/超限不得产出可误认成功的 Capsule；未知 tool 必须警告，不得静默确认为完成。
- [x] WAL 并发测试由一个写连接在事务中分两步写 composer header/bubble；同时运行导出器。它只能读到一个一致提交快照或明确失败；失败后仍可读取正确源库。不要只用主 DB 文件哈希证明 WAL 模式下所有源文件未变；不得要求正常运行的 Cursor 停止它自己的写入。
- [x] 写入失败、既有输出、可选 SQLite CLI 缺失分别检查：非零退出、已有文件不变、无成功路径输出。保护范围限定导出器，不因测试修改真实 Cursor 数据库。

## Task 5: 从安装产物到 PR 验收

**Files:** `scripts/pack-smoke.mjs`、`tests/cli.test.ts`、`docs/verification/cursor-release-candidate.md`、`docs/compatibility-evidence.md`。

- [x] 在候选代码构建 tarball 并记录 SHA-256；安装到新临时 consumer。沿用仓库包安装策略，不能以忽略原生依赖失败的方式声称集成后的包已通过。
- [x] 用安装后的 `node_modules/threadport/dist/src/cli.js` 对三种合成输入执行 extract→validate→handoff。断言 stderr 警告、stdout 路径、Capsule/Markdown 保守结果，以及源项目不被修改；不是只跑 --help 和 import。
- [x] 同一安装产物再读取明确授权的真实样例，输出到新的私有目录；记录产物 SHA、版本、路径类型、逐场景结果。开发者 SQLite 导出脚本仍不在 npm 包内，不能写成普通用户已具备自动导出能力。
- [ ] 用户明确授权创建 PR 后再发布 PR，运行并检查实际 CI；绿色合成平台矩阵不替代这些平台的 Cursor 实机测试。维护者审核/合并后才能将修复记作 main 已交付。
- [ ] 支持声明采用“版本 + build + OS/架构 + 模式 + 输入来源 + 场景结果”。某一必需场景无法验证时，维持实验性/部分验证声明，并明确哪些结果 unknown。

## 3. 本轮不应顺手建设的功能

- Cursor CLI、Cloud、其他桌面模式和 Windows/Linux 实机：独立扩展矩阵，先有目标用户/设备/许可再开工，不要求本机现在下载所有软件。
- Cursor 自动发现/索引：新 main 仅有 Claude/Codex 来源，需独立产品/权限方案；不是现有手动导入缺陷。
- 原生启动、原会话恢复、全量无损迁移：明确超出当前 Cursor 适配器边界。
- 没有原始工具结果的 Markdown/JSONL：保持明确降级，不通过模型总结或助手自述补造成功。

## 4. 完成定义与工作量

验收只覆盖选定的一套版本/平台/模式。Task 1–2 通过、同版本必需场景有证据、异常路径保守、安装产物往返成功、PR CI 与审核完成后，才可声明该范围交付。文件拒绝/并发不可触发时不能勾成通过，只能缩小并明确支持声明。

工程预估（非承诺）：代码收紧/集成/回归约 0.5–1 天；一套版本实测与安装验收约 0.5–1 天。前提是登录和 UI 稳定、能获得目标场景；不含设备准备、额外平台、维护者评审等待或新原生格式适配。

自审：已分离真实观察、合成检查、待验证风险和范围外功能；无真实会话内容/ID/个人路径进入此文档。已完成项目按实际证据勾选；剩余实机和 PR 门槛不因代码修复或历史重放而自动通过。
