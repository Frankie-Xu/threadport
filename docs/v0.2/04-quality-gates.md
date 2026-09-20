# 测试与审查标准

## 1. 每个功能的完成定义

完成一项功能必须交付：可观察行为、边界条件、失败路径、测试证据、用户文档、兼容说明。代码合并、界面有按钮、mock 能跑都不是独立的完成定义。

| 层级 | 必需证据 | 不能代替它的证据 |
| --- | --- | --- |
| 单元 | 纯函数关键分支、确定性、真实回归案例 | 镜像实现细节的断言 |
| 契约 | 输入/输出 schema、错误码、兼容 fixture | TypeScript 编译通过 |
| 集成 | 临时真实 Git/文件系统/SQLite + fake Agent | 全链路 mock |
| 浏览器 | 安装后 onboarding → 找任务 → 编辑 → 预览 → 生成命令 | 截图或组件快照 |
| 真实 Agent | 明确 CLI 版本、OS、四条路径和结果 | 进程 exit 0 |
| 用户 | 外部使用者独立完成，记录卡点 | 维护者演示 |

## 2. 必须覆盖的回归场景

| 用例 ID | 输入/触发 | 预期 | 对应功能 / 任务 |
| --- | --- | --- | --- |
| Q01 | `/repo/src/a/index.ts` 和 `/repo/src/b/index.ts` | 保留两条不同相对路径 | F05 / T02 |
| Q02 | Windows drive、UNC、Unicode、空格、仓库外路径 | 按源平台解析，外部路径不泄漏 | F05 / T02 |
| Q03 | 同会话 cwd 相同的命令 exit 1→0→1 | 最新 failed；三次历史保留 | F05 / T03 |
| Q04 | 不同 cwd/会话相同命令，一过一败 | 不能相互标为 resolved | F05 / T03 |
| Q05 | 用户 A→修正 B，assistant 说计划采用 X | B 是候选；X 不自动成为已采纳决定 | F05 / T04 |
| Q06 | 中文禁止修改数据库，人工再编辑约束 | 原文保留、人工优先、重扫不覆盖 | F04–05 / T04,T08 |
| Q07 | 重扫、增量追加、半行、截断、换文件 | 恰好一次导入、关联不丢 | F02 / T06,T07 |
| Q08 | 假 HOME 包含诱饵私密文件、越界 symlink | 只读明确允许范围 | F01–02 / T06 |
| Q09 | unknown event / 坏 JSON / 超大单行 | partial + 原因；其他文件可用 | F02 / T06,T07 |
| Q10 | 旧 revision 的第二次编辑 | 409，不覆盖第一次提交 | F04 / T08 |
| Q11 | 中文子串、大小写、组合过滤、分页 | 可定位、排序稳定、不泄漏密钥 | F03 / T09 |
| Q12 | portable `.` + 本地正确绑定 root | 捕获后 matched | F06 / T10 |
| Q13 | 改 tracked/untracked/HEAD，删除文件 | drifted；错误项目 unverifiable | F06 / T10 |
| Q14 | 读取中变化、无 commit、不可读大文件 | unverifiable，原因精确 | F06 / T10 |
| Q15 | 旧日志 test passed + 当前 workspace | 历史测试有效性 unknown | F05–06 / T04,T10 |
| Q16 | 预览后改任务/包/工作区，过 15 分钟 | 禁止沿用确认 | F07–08 / T12,T14 |
| Q17 | payload 含 shell 插值、引号、换行 | fake runner 原样接收，无额外命令运行 | F08 / T13,T14 |
| Q18 | 目标缺失、不兼容、非 TTY、取消、崩溃 | 明确降级/错误，不重复启动 | F08 / T13,T14 |
| Q19 | 恶意网页 origin、Host、无 token、目录穿越 | 请求被拒，数据不泄漏 | F01,F07 / T11 |
| Q20 | 日志 HTML/script/link injection | 文本展示，不执行脚本 | F03,F05 / T15 |
| Q21 | 迁移中故障、磁盘写失败、文件已存在 | 旧数据/输出保留，恢复可验证 | F09–10 / T05,T17 |
| Q22 | 清索引/撤来源/重建/删全部数据 | 人工数据按声明保留；源目录不变 | F01,F10 / T17 |
| Q23 | 包安装后四条真实接续路径 | 正确下一步、约束保留、目录正确 | F08 / T18 |
| Q24 | 临时目录安装发布 tarball，不用源码 | UI assets、SQLite、CLI、declarations 可用 | 全部 / T19 |

tests 中只提交合成 fixture。可以在维护者明确许可的隔离临时项目运行真实 Agent，发布其版本与脱敏的结果摘要；不把私人真实会话原文件提交进 Git。真实格式参考可用清洁临时任务采集后人工重构为合成 fixture，并注明来源版本/采集日期/重构方式。

## 3. 契约测试示例

以下用例描述关键行为，不要求测试私有函数。签名以 contracts 文档为准。

```ts
// tests/domain/command-state.test.ts
import { expect, it } from "vitest";
import { latestCommandRuns } from "../../src/domain/command-state.js";
import type { CommandRun } from "../../src/domain/models.js";

it("keeps the final failure after an intervening pass", () => {
  const runs: CommandRun[] = [1, 0, 1].map((exitCode, ordinal) => ({
    id: `run-${ordinal}`, sessionId: "session-1", ordinal,
    command: "npm test", cwd: "/repo", exitCode,
    startedAt: null, completedAt: null, eventId: `event-${ordinal}`,
    snapshotId: null
  }));
  expect(latestCommandRuns(runs).map(run => run.exitCode)).toEqual([1]);
  expect(runs).toHaveLength(3);
});
```

`latestCommandRuns(runs: readonly CommandRun[]): CommandRun[]` 按 sessionId/cwd/完整 command 取最大 ordinal 的记录，不修改输入。这是 T03 的产出接口，状态聚合随后复用它。

```ts
// tests/tasks/service.test.ts, inside a test with a temporary store/service
const original = await service.create({ projectId, title: "Payment callback" });
await service.update(original.id, original.revision, { title: "Retry callback" });
await expect(service.update(original.id, original.revision, {
  title: "Old tab overwrites title"
})).rejects.toMatchObject({ code: "REVISION_CONFLICT" });
```

```ts
// tests/handoff/confirm.test.ts, using injected clock and temporary workspace
const prepared = await prepareHandoff({
  taskId, sourceSessionId, target: "codex", mode: "new-session", workspaceId
});
await service.update(taskId, prepared.taskRevision, { nextAction: "Review only" });
await expect(confirmHandoff({
  id: prepared.id, promptDigest: prepared.promptDigest,
  acknowledgeUncertainty: false
})).rejects.toMatchObject({ code: "HANDOFF_CHANGED" });
```

示例省略的 fixture setup 由对应测试文件提供：临时目录、临时 Git 初始提交、内存注入时钟、临时 SQLite，统一在 afterEach 清理。不得用真实用户 HOME 填补 setup。

## 4. 性能与资源预算

下表是固定工程门槛。T16 已实现数据生成器与 benchmark；已有三轮搜索测量均未证明达标，见 [原始性能记录](../verification/performance-beta.md)。需继续保存机器信息、数据规模、5 次冷启动和 100 次查询结果。

参考机：macOS arm64 / Ubuntu x64，至少 4 核、8 GiB 内存、SSD，Node 24；报告实际 CPU/内存/OS，不把不同机器数字当可直接比较。

| 操作 | 固定输入 | 门槛 |
| --- | --- | --- |
| 服务冷启动到能显示已有任务 | 500 sessions / 50,000 events | p95 ≤ 3 秒，不阻塞全量重扫 |
| 首次完整索引 | 200 MiB 合成输入、500 sessions | ≤ 60 秒，有进度且可取消 |
| 增量可见 | 已运行服务追加 20 events | ≤ 20 秒，包括 15 秒刷新间隔 |
| 搜索 | 500 sessions / 50,000 events，100 次混合中英文查询 | API p95 ≤ 300 ms，UI ≤ 500 ms |
| 主线程/事件循环 | 索引同时 100 次 status 请求 | status p95 ≤ 200 ms |
| 资源 | 上述数据集与单客户端 | 服务 RSS 峰值 ≤ 400 MiB；空闲 CPU 中位数 < 2% 单核等价 |
| 取消 | 大批次索引中取消 | ≤ 2 秒停止发起新读取，已开启小批次安全结束 |

CI 不以共享 runner 的毫秒级浮动阻断普通 PR；容量超限、无界读取、死循环、超时是自动阻断项。性能预算在固定环境的 beta/RC gate 验证；退步 >20% 必须解释并修复或在变更范围评审中重定目标。

## 5. 审查级别与阻断条件

| 级别 | 例子 | 处理 |
| --- | --- | --- |
| P0 | 泄漏会话/密钥、任意 shell 执行、删除源文件、不可恢复数据损坏 | 停止发布，优先修复；已发布需安全补丁与告知 |
| P1 | 错误项目启动、假 matched、丢人工编辑、把失败标成功、核心流程不能完成 | 禁止合并进入 stable；修复后重跑受影响 E2E |
| P2 | 可恢复的次要状态显示问题、清楚标注的支持限制 | 可在 Issue 有复现、负责人、目标版本时接受 |
| P3 | 措辞、非关键样式、可选重构 | 维护者酌情安排，不无限阻塞交付 |

评审按顺序：

1. **范围：** 能指出对应 F/AC/T；是否引入未批准的新子系统。
2. **正确性：** 真实状态与显示是否一致，错误路径、重试、取消是否可恢复。
3. **边界：** 数据从哪里进入/出去、哪些路径写入、哪个模块能执行进程。
4. **设计：** 依赖方向、模块职责、人工状态与派生状态是否分离。
5. **可维护性：** 名字是否表达业务，注释解释原因，错误是否可定位，公共契约是否更新。
6. **证据：** 关键测试是否会在旧 bug 上失败，真实认证是否覆盖发布声明。

## 6. CI 计划与命令语义

同步 main 修复及 T01 后，当前有 `typecheck/build/test/check/check:docs/prepack/check:pack`；`check` 执行 typecheck、core build、Vitest 和本地文档文件链接检查。`check:pack` 已独立验证旧 CLI 包，不能替代未来 v0.2 的 UI/SQLite 发布认证。format/lint 尚未引入，当前沿用代码风格并运行 `git diff --check`，不把它当作语义 lint。下表为最终目标，剩余脚本随相关任务引入；尚未引入前不要假称运行通过。

| 脚本 | 定义 | 执行时点 |
| --- | --- | --- |
| `npm run check` | typecheck + core/web build + Vitest 单元/集成 + docs links；当前未配置独立 format/lint 脚本 | 每个 PR |
| `npm run test:e2e` | core/web build + E2E 类型编译 + Playwright 合成浏览器核心流程 | 涉及 UI/API/完整闭环的 PR，RC 必跑 |
| `npm run test:package` | pack → 隔离安装 → CLI/公开类型/原生 SQLite → 安装后真实浏览器编辑、刷新持久化与 loopback 断言 | 包配置、原生依赖变更；每个 RC |
| `npm run check:pack` | 同一安装流程的无浏览器检查 | 兼容 smoke；不能替代 RC 浏览器验证 |
| `npm run bench` | 固定合成容量数据集、输出 JSON 结果 | beta 和 RC；性能敏感变更 |

CI required check 继续保留名为 `check` 的汇总 job，依赖所有必须 job，任一失败/取消不允许汇总成功。Node24 Ubuntu 核心测试每 PR；macOS arm64 Ubuntu x64 的发布 tarball smoke 每 RC；Windows 旧 CLI 回归单独列明，未认证新 UI/runner 不扩大宣传。行动前核实 GitHub runner 架构，不能把 Intel macOS CI 当 arm64 认证。

浏览器 Playwright Chromium 自动化；本机可用 `THREADPORT_TEST_CHROME=1` 选择系统 Chrome。缺少浏览器是环境缺口，断言失败是产品/测试失败，两者分别记录，不跳过后宣称通过。Safari/WebKit 的 UI 基本流程 RC 补测，不声明所有浏览器版本。单元测试收集仅 `tests/**/*.test.ts`，排除 `tests/e2e/**`、dist、node_modules；Playwright 使用 `.spec.ts`。不要因构建输出让测试运行两遍。

覆盖率不作为唯一门槛。`npm run test:coverage` 使用 V8 对 `src/**/*.ts` 进行插桩，并执行仓库基线：行、语句、函数覆盖率至少 70%，分支覆盖率至少 60%。新纯领域模块目标分支覆盖 ≥85%，索引幂等、revision 冲突、确认失效、迁移恢复的命名场景必须存在；没有行为价值的快照、常量 getter、简单样式无需为凑百分比加测试。

## 7. RC 审查记录模板

```markdown
Release candidate: 0.2.0-rc.N
Commit / tarball SHA-256:
Actual Node / npm / OS / architecture:
Supported source/target versions:
Scope: F01–F10, excluded capabilities explicitly listed
Checks: command, timestamp, result, evidence path
Real routes: source → target, native/new session, result, known limitations
Migration: source DB version → target DB version, backup/restore result
User test: anonymized participant IDs, independent completion, blockers
Open P2 issues and reason to accept:
Decision: release / hold
Reviewer identity and whether self-review:
```

不能写“全测通过”而没有 SHA/命令；不能把 AI 自评包装成外部独立审查。
