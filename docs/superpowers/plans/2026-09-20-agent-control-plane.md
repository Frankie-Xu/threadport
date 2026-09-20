# Agent Control Plane Implementation Plan

> **For agentic workers:** Implement this plan task by task. Each task must leave a testable increment. This is a proposed plan; it does not claim the capability already exists.

**Goal:** 在 ThreadPort 现有本地索引、任务、工作区验证和交接包之上，增加可重放的 Agent 控制平面，把隐式会话转移、运行中可见性、责任链和接管回执变成带来源证据的可检查事实。

**External product promise:** ThreadPort 发现一个用户原本看不见的 Agent 交接问题，用证据说明交接走到了哪一步，并在具备可靠控制能力时帮助用户安全接管。Control plane 是内部架构名；产品界面使用“交接可见性”“接管回执”“上下文清单”和“有证据的继续执行”。

**Architecture:** 日志、受支持 runtime 事件、ThreadPort 启动器和人工确认先进入规范化追加式事件账本。确定性 reducer 从账本重建会话谱系、运行状态、责任链、manifest 和 receipt；UI/CLI 读取投影，不修改原始事实。没有事件源、hook 或控制接口时返回 unknown/coverage-gap，不以标题相似、时间相近或 Agent 自报伪造关系。

**Tech Stack:** Node 24、TypeScript strict/ESM、Fastify 5、Zod 3、better-sqlite3 13、React 19/Vite 6、Vitest 4、Playwright 1.63；复用既有 SQLite migration、Store、redact、loopback auth 和 CLI 错误码。

**Spec:** 增量实现 docs/v0.2/01-product-spec.md、docs/v0.2/02-architecture.md、docs/v0.2/03-contracts.md 未覆盖的控制平面能力；保持 Capsule v1、旧 handoff v1、旧命令和现有 runner 兼容。

## Baseline and scope

截至 2026-09-20，公开主分支基线是 [7f57a7917130014870a478951e4b650f97f3dd41](https://github.com/Frankie-Xu/threadport/commit/7f57a7917130014870a478951e4b650f97f3dd41)，迁移为 001-initial 至 004-history-search。已有 src/domain/models.ts、Claude/Codex source adapter、增量 JSONL reader、workspace verify、src/handoff、src/storage/handoff-store.ts、src/targets、Fastify API 和 React workbench。交接材料中提到的更高迁移编号和未来文件不在此公开基线内，实施前重新运行 git status --short、git rev-parse HEAD 和 migration 列表；下一迁移用当时实际的下一个空号，不能照抄旧编号。

第一版范围是 Claude/Codex 锁定版本日志读取、ThreadPort 自己生成的 prepare/confirm/launch/interrupt 事件、人工责任确认/接管/目标回执。OpenTelemetry 只作为可关闭的实验适配器。第一版不承诺发现任意 Agent 的隐藏会话、读取隐藏思维链、同步文件、改第三方权限，或在没有控制接口时显示停止成功。LangGraph、A2A、OTEL、Cursor、Gemini 先做适配评估。

### Release boundary

| Release | 用户可见能力 | 明确不包含 | 发布门槛 |
| --- | --- | --- | --- |
| v0.3 Observe | Claude/Codex 只读来源、运行状态、谱系候选、attention、脱敏导出 | 停止进程、自动接管、云同步、OTEL 必选支持 | 新用户能在 30 秒内回答谁负责、最后证据和下一步 |
| v0.4 Receipt | manifest、摘要校验、分阶段接收/接受/开始回执、约束遗漏 | 未验证版本的通用停止和自动工作区修复 | 错误摘要、错误目标、过期 revision 和伪造 nonce 在 fixture 中零误接受 |
| v0.5 Takeover | 一个经过验证的 runner 的条件停止、固定快照、继任确认和继续执行 | 无控制接口 Agent 的“假停止”、自动 checkout/stash/reset | 并发接管只允许一个 active successor，stop-unavailable 明确可见 |
| 后续版本 | OTEL/A2A 导入、更多 Agent、团队权限和云能力 | 不因协议或 parser 存在就宣称本地控制能力 | 独立 RFC、兼容矩阵和安全评审 |

产品首个演示必须是一个纵向闭环：三个会话中一个 Agent 声称已经交接，ThreadPort 显示目标没有确认或某条约束未传递，用户能看到 manifest 并选择等待、重新交接或接管。不要先把产品做成通用 trace 浏览器。

### Non-goals and hard boundaries

1. 不采集或持久化 hidden reasoning、system prompt、认证 token、完整原始日志、任意文件路径或源代码完整快照。
2. 不把“交给”“已启动”“完成”等自然语言句子自动变成 runtime-confirmed 事实。
3. 不把相似标题、相近时间、共享 cwd 或相同 branch 名称当作 confirmed parent/child 关系。
4. 不因子任务创建自动转移总任务责任；责任只由显式 runtime 事件或用户确认改变。
5. 没有可靠控制接口时不显示已停止；stop request 只表示请求已发出。
6. 不把接收等同于理解，不把理解等同于遵守，不把进程退出或 exit 0 等同于任务完成。
7. 不改变旧 Capsule v1、旧 handoff v1、旧命令 stdout 或现有 API 语义。
8. 不增加云数据库、账号系统、遥测、向量数据库、通用插件 ABI、浏览器聊天迁移或自动工作区修复。
9. OpenTelemetry span、A2A 状态、LangGraph checkpoint 和第三方 trace 只能作为来源或参考，不能自动升级为本地控制事实。

## Product contract

详情页必须回答：谁负责；最后可验证动作和来源是什么；交接停在哪一阶段；如何接管。事实标签为：

| 标签 | 证据 | 规则 |
| --- | --- | --- |
| observed | 已登记 source/runtime/ThreadPort event | 可更新派生运行状态，不能单独宣布业务完成 |
| agent-reported | 目标自报/最终消息 | 仅待核验输入 |
| user-confirmed | UI/CLI 明确确认 | 可变更责任，保留操作者和时间 |
| inferred | 规则候选 | 不能自动变成 confirmed |
| unknown | 缺少或失效来源 | 必须显示缺口 |

~~~ts
type RunFact = 'running' | 'waiting' | 'interrupted' | 'ended' | 'unknown';
type ObservationHealth = 'current' | 'stale' | 'missing-receipt' | 'coverage-gap' | 'unverified';
~~~

Receipt stages 是 prepared -> authorized -> transported -> received -> accepted -> observed-start -> reported-complete -> verified-complete；每阶段另有 pending/confirmed/rejected/unknown/expired。每个 receipt 绑定 handoff、target session/run、manifest digest、expiry 和一次性 nonce；重复相同请求幂等，冲突请求保留 attention。

Lineage relation 为 fork、delegate、handoff、resume、compact、host-move、manual-takeover。compact 不新建 child；resume 连接同一 vendor session；子任务不自动转移总任务责任。证据等级为 runtime-explicit、trusted-integration、user-confirmed、inferred，只有显式 runtime 或用户确认能形成 confirmed relation。

Takeover 为 requested、stop-requested、stop-confirmed、stop-unavailable、snapshot-fixed、successor-confirmed、active、closed。发出 stop 请求只能到 stop-requested；无法控制只能到 stop-unavailable，并保留原责任方和 attention。

## Core contracts

新增 src/control-plane/contracts.ts 和 payload-schemas.ts：

~~~ts
interface ControlEvent {
  eventId: string;
  protocol: 'threadport.control-event.v1';
  occurredAt: string | null;
  recordedAt: string;
  source: { kind: 'source-log' | 'runtime' | 'threadport' | 'user' | 'agent-report';
    sourceId: string; parserVersion: string | null;
    coverage: 'full' | 'partial' | 'none' | 'unknown' };
  taskId: string | null;
  sessionId: string | null;
  runId: string | null;
  ordinal: number | null;
  type: string;
  payload: unknown;
  idempotencyKey: string | null;
  evidenceIds: string[];
}
~~~

type 使用 strict Zod schema 白名单，未知字段、隐藏推理、token、完整原始日志拒绝或脱敏。manifest 使用 threadport.context-manifest.v1，每项记录 included/summarized/filtered/omitted/unavailable、内容 digest、证据 ID 和原因，并记录约束来源、优先级、适用范围及 prepare/receipt 时的可读性。

适配器只负责发现/读取/规范化：

~~~ts
interface ControlEventSource {
  readonly agent: 'claude' | 'codex' | 'otel' | 'threadport';
  readonly parserVersion: string;
  readonly capabilities: ReadonlySet<string>;
  discover(roots: readonly string[], signal: AbortSignal): AsyncIterable<SourceCandidate>;
  read(candidate: SourceCandidate, cursor: ReadCursor | null, signal: AbortSignal):
    Promise<{ events: ControlEvent[]; cursor: ReadCursor; coverage: CoverageReport }>;
}
~~~

没有正式 parent/run 字段时只返回 coverage-gap，不从“交给”“已经启动”文本确认关系。Target runner 只有在真实验证支持时才提供 requestStop；否则只观察/导出。

## Storage and projection

新增 migration 使用实际下一个编号；公开基线下候选为 migrations/005-control-plane.sql。表为 control_events、control_event_evidence、session_lineage、responsibility_edges、context_manifests、handoff_receipts、run_observations、attention_items、projection_cursors。control_events 追加事实并保存 payload digest；lineage 保存 parent/child、relation、证据等级和状态；responsibility 保存 initiator/authorizer/dispatcher/executor/reviewer/next-owner；manifest 不可变；receipt 绑定 stage/target/digest/nonce；observation 保存 run state/health；attention 保存问题和处理者；cursor 保存 reducer 重放位置。

新增 src/storage/control-plane-store.ts：

~~~ts
interface ControlPlaneStore {
  appendEvents(events: readonly ControlEvent[]): { inserted: string[]; duplicate: string[] };
  readEvents(afterSequence?: number, limit?: number): ControlEvent[];
  saveManifest(manifest: ContextManifestV1): void;
  getManifest(handoffId: string): ContextManifestV1 | null;
  saveReceipt(input: ReceiptInput): ReceiptSummary;
  listReceipts(handoffId: string): ReceiptSummary[];
  saveResponsibility(record: ResponsibilityRecord): void;
  saveRunObservation(observation: RunObservation): void;
}
~~~

事件和投影写入短事务；重复同内容幂等，内容冲突返回 REVISION_CONFLICT；投影可清空重建；source 清除保留人工 task/revision/confirmed responsibility 并显示 coverage gap；对外 DTO 不序列化整行或绝对 source path。

新增 src/control-plane/reducer.ts：

~~~ts
interface ControlState {
  sessions: Record<string, { runState: RunFact; health: ObservationHealth;
    lastEvidenceId: string | null; lastOccurredAt: string | null }>;
  lineage: LineageRecord[];
  responsibilities: ResponsibilityRecord[];
  manifests: Record<string, ContextManifestV1>;
  receipts: Record<string, ReceiptSummary>;
  attention: AttentionItem[];
}
export function applyControlEvent(state: ControlState, event: ControlEvent): ControlState;
export function rebuildControlState(events: Iterable<ControlEvent>): ControlState;
~~~

排序固定使用 source ordinal、occurredAt、event ID、recordedAt；缺失时间保留 null。增量 apply 与从空状态 rebuild 必须相同，迟到/重复事件不能重复责任边或 receipt。

## API, CLI and UI

API 新增 GET /api/v1/tasks/:id/control、GET /api/v1/runs/:id、GET /api/v1/handoffs/:id/manifest、POST /api/v1/handoffs/:id/receipts、责任 propose/confirm、run takeover 和 takeover acknowledge。沿用 data/error envelope、loopback token、Origin、JSON body、1 MiB limit 和 strict schema。错误增加 RECEIPT_DIGEST_MISMATCH、RECEIPT_TARGET_MISMATCH、STOP_UNAVAILABLE、CONTROL_COVERAGE_GAP。

CLI 新增 threadport control status、control ingest、takeover request、takeover acknowledge、handoff receipt。只使用应用生成 ID；stdout 保持 JSON/声明结果纯净，进度写 stderr。退出码沿用现有 2/3/4/5/6/130。

UI 修改 web/src/features/inbox/inbox.tsx、task/detail.tsx、handoff/preview.tsx、web/src/api.ts、app.tsx、styles.css。首页优先列责任方、最后观察、未决 receipt、coverage gap 和接管动作；图谱为展开视图。unknown/stale/agent-reported/user-confirmed 使用可访问文案，刷新后从 API 恢复。

## Global Constraints

- 不持久化 hidden reasoning、system prompt、token、完整日志或代码快照。
- 责任转移必须有 evidence ID、范围、时间及操作者/来源；推断关系只能是候选。
- heartbeat 超时只产生 stale/coverage-gap，不能宣布死亡。
- 只读已配置 root、绑定 workspace 和应用生成 ID；禁止任意路径 endpoint。
- 旧格式、命令、API 形状不静默改变；时间分开保存 occurred/recorded/verified。
- domain reducer 不依赖 fs、SQLite、child_process、Fastify、React。
- 默认 local-first/offline；不加云数据库、账户、遥测或通用插件 ABI。

## Review Focus

The following five failure classes receive explicit tests in the owning tasks:

1. Agent reports completion without read or execution evidence; the UI stays agent-reported and never becomes verified-complete.
2. Stop request times out or the target has no control interface; the UI shows stop-requested or stop-unavailable and retains the original owner.
3. Manifest or workspace changes after preparation; the receipt is rejected and the user must prepare again.
4. Late, duplicate, out-of-order or replayed events; the projection is deterministic and never duplicates edges, receipts or attention.
5. No source coverage for a parent/child relation; the result stays inferred/unknown and never becomes confirmed.

## Implementation tasks

### Task 1: Contract and fixtures

Files: create src/control-plane/contracts.ts, payload-schemas.ts, test-fixtures.ts, tests/control-plane/contracts.test.ts and fixtures.test.ts; modify docs/v0.2/03-contracts.md and docs/compatibility.md.

- [ ] Test valid/invalid events, strict unknown-field rejection, null event time, size limits, target/digest/nonce validation.
- [ ] Create normal three-session, target-not-started, late duplicate, changed-file, abandoned-child, stop-unavailable and forged-receipt fixtures.
- [ ] Implement Zod schemas, canonical digest and redaction.
- [ ] Run npx vitest run tests/control-plane/contracts.test.ts tests/control-plane/fixtures.test.ts and npm run typecheck.

Acceptance: fixtures round-trip canonically; invalid receipt and hidden fields reject with stable errors.

### Task 2: Migration and storage

Files: create migrations/005-control-plane.sql when the preflight still shows 004-history-search.sql as the newest migration; otherwise use the next unused migration number recorded in the PR, plus src/storage/control-plane-store.ts and tests/control-plane/storage.test.ts; modify database.ts, migrations.ts, sqlite-store.ts and migration tests.

- [ ] Test fresh/upgrade migration, foreign keys, unique event/idempotency keys, rollback and higher-version refusal.
- [ ] Implement tables, indexes, parameterized SQL, schema validation and CAS.
- [ ] Expose SqliteStore.controlPlane(); preserve task/revision data when source index is cleared.
- [ ] Test duplicate identical batches and conflicting event payloads.

Acceptance: restart/replay preserves facts, conflicts are visible, no raw DB handle leaks to use cases.

### Task 3: Reducer, lineage, responsibility and attention

Files: create src/control-plane/reducer.ts, lineage.ts, responsibility.ts, attention.ts; tests under tests/control-plane/.

- [ ] Test normal handoff, compact without child, delegate without total transfer, rejected candidate, user-confirmed takeover, late/duplicate/乱序 events.
- [ ] Implement immutable pure reducer and fixed ordering.
- [ ] Implement evidence promotion, role-specific responsibility, stale/missing receipt/orphan/conflict attention.
- [ ] Assert incremental apply equals complete rebuild.

Acceptance: no inferred relation or agent report becomes confirmed; duplicates cannot duplicate edge/receipt/attention.

### Task 4: Source coverage and manifest/receipt loop

Files: create src/control-plane/ingest.ts, coverage.ts, manifest.ts, receipts.ts, service.ts; modify source contracts, Claude/Codex source files, indexing, handoff prepare/contracts/store; add source, manifest and receipt tests.

- [ ] Add versioned fixtures for supported logs, truncation, inode replacement, deletion, duplicate, missing parent/run.
- [ ] Extend source results with control events and CoverageReport while preserving legacy NormalizedEvent.
- [ ] Generate immutable manifest from existing handoff/workspace verification; record every omission and readability state.
- [ ] Validate receipt stage, expiry, target, digest and nonce; identical retries idempotent.
- [ ] Keep old handoff export unchanged; new manifest is threadport.context-manifest.v1.

Acceptance: changed task/workspace/target requires reprepare; agent-reported never advances verified-complete; unsupported fields show coverage-gap.

### Task 5: Takeover, API, UI and CLI

Files: create src/control-plane/takeover.ts; modify target runners, launch store, server routes/dto/schemas, CLI and listed workbench UI files; add integration/server/CLI/e2e tests.

- [ ] Fake runner tests for acknowledged stop, unavailable stop, timeout, exit-before-request, duplicate request and stale observation.
- [ ] Implement conditional single-owner takeover; preserve original responsibility until successor confirmation.
- [ ] Add API routes, strict DTO redaction, stable errors and existing auth/origin rules.
- [ ] Add CLI commands with generated IDs and no shell interpolation.
- [ ] E2e: three sessions -> candidate -> confirmation -> manifest -> receipt -> second-branch takeover -> successor acknowledgement -> unresolved coverage.
- [ ] Test browser refresh recovery and accessible status labels.

Acceptance: no request-dispatched state is shown as stopped; concurrent takeovers conflict; one detail view explains responsible party, evidence and next action.

### Task 6: Fault injection, evaluation and release

Files: create tests/control-plane/faults.test.ts, tests/fixtures/control-plane/, scripts/benchmark-control-plane.mjs and docs/verification/control-plane-v0.3.md; modify compatibility docs, README, CONTRIBUTING and third-party notices.

- [ ] Test target never starts, no receipt, digest mismatch, file drift, source interruption, orphan child, late/duplicate event, restart during write, concurrent takeover, forged receipt, prompt injection and unverified completion.
- [ ] Compare native UI, hand-written HANDOFF.md, existing ThreadPort handoff and control-plane build.
- [ ] Measure ground-truth precision/recall, fault-to-visible-attention, fault-to-correct-takeover, answer accuracy, first correct action, repeated work, constraint omissions, false stopped/completed, latency/token/storage/notification cost.
- [ ] Use 30 task/fault cases and 10 exploratory users only as an initial estimate; report uncertainty. Run ablations: lineage; lineage+manifest; lineage+manifest+receipt/control.
- [ ] Record exact runtime/parser versions, commits, seeds, known gaps, repository commit/tag, SPDX license and dependency license before reuse.

Acceptance: typecheck/build/unit/e2e/docs/package checks pass; verification tables regenerate from fixtures; compatibility matrix separates observe-only, receipt-capable and controllable.

## Milestones

| Milestone | Weeks | Depends on | Exit evidence |
| --- | --- | --- | --- |
| M0 contract | 1–2 | none | schemas, fixtures, compatibility inventory |
| M1 ledger/reducer | 3–4 | M0 | migration and replay equivalence |
| M2 source/receipt | 5–7 | M1 | versioned fixtures and digest tests |
| M3 takeover/workbench | 8–9 | M2 | e2e including stop-unavailable |
| M4 release/evaluation | 10–12 | M3 | fault matrix, compatibility and study protocol |

Critical path: contract -> migration -> reducer -> source coverage -> manifest/receipt -> takeover -> API/UI -> evaluation. OTEL remains optional behind M2; if omitted, document why and do not claim support.

## Research mapping

- [Parsing the Stream](https://arxiv.org/abs/2609.01466) (2026-09-01) supports append-only ledger, typed state and consumer views; its efficiency is conditional on schema coverage and must be independently reproduced.
- [Observability and Fault Injection for LLM-Based Multi-Agent Systems](https://arxiv.org/abs/2608.24271) (2026-08-25) supports trace-aligned fault fixtures, not production guarantees.
- [Quantifying Overclaiming Propensity](https://arxiv.org/abs/2609.20812) (2026-09-17) supports separating agent-reported from observed/verified; its percentages are benchmark-specific.
- [An Empirical Study of Harness Design](https://arxiv.org/abs/2609.20804) (2026-09-17) supports reporting model+harness+budget+context management.
- [AgentLens](https://arxiv.org/abs/2607.06624), [Code as Agent Harness](https://arxiv.org/abs/2605.18747), and older [AgentDojo](https://arxiv.org/abs/2406.13352) are evaluation/design references, not product evidence.

Official references: [OpenAI handoffs](https://openai.github.io/openai-agents-python/handoffs/), [OpenAI tracing](https://openai.github.io/openai-agents-python/tracing/), [Codex App Server](https://developers.openai.com/codex/app-server), [Codex remote connections](https://developers.openai.com/codex/remote-connections), [LangGraph persistence](https://langchain-ai.github.io/langgraph/concepts/persistence/), [LangGraph interrupts](https://langchain-ai.github.io/langgraph/concepts/interrupts/), [A2A task lifecycle](https://a2a-protocol.org/latest/specification/), and [OpenTelemetry GenAI conventions](https://opentelemetry.io/docs/specs/semconv/gen-ai/). These explain mechanisms or vocabulary; none proves local process control.

GitHub review list: [open-grove/handoff](https://github.com/open-grove/handoff), [nick-vi/agent-handoff](https://github.com/nick-vi/agent-handoff), [agent-lens-bench](https://github.com/agent-lens/agent-lens-bench), [MavitanLabs/agentlens](https://github.com/MavitanLabs/agentlens), [z7ping/agent-lens](https://github.com/z7ping/agent-lens), [RobertTLange/agentlens](https://github.com/RobertTLange/agentlens), [harness-lens](https://github.com/zhanhaoyu99/harness-lens), [rosehgal/handoff](https://github.com/rosehgal/handoff), [openai/openai-agents-python](https://github.com/openai/openai-agents-python), and [multi-agent-observability-opentelemetry](https://github.com/chrisipanaque/multi-agent-observability-opentelemetry). Before adoption record commit/tag, SPDX license, dependency license and maintenance status; existence or stars are not enough.

## Adoption and verification

First-use path: threadport ui --demo or local source selection -> import one real task -> see one unresolved handoff/stale run -> inspect manifest/evidence -> continue through a verified runner or export with coverage gaps. Publish a five-minute demo, public event schema and synthetic fault corpus, compatibility matrix, adapter guide, privacy/retention page and troubleshooting page.

Success signals are first successful handoff, first successful takeover, second-week reuse, recovery time and repeated-work reduction. Downloads and stars are not outcome metrics.

Self-review: all requirements map to Tasks 1–6; no unnamed implementation step remains; migration numbering is tied to the checked baseline; high-risk cases have fixtures; external adapters remain optional; this plan does not claim current implementation.

## Professional GitHub delivery plan

The six architecture tasks above are workstreams, not six oversized pull requests. Convert them into the following independently reviewable Issues and PRs:

1. Contract and evidence vocabulary.
2. Synthetic invisible-handoff and failure fixtures.
3. Append-only event migration and Store.
4. Deterministic reducer and replay equivalence.
5. Claude/Codex coverage reporting.
6. Immutable context manifest.
7. Receipt digest, target and nonce validation.
8. Observe-only control API.
9. Observe-only CLI.
10. Workbench attention panel and five-minute demo.
11. Fake-runner takeover state machine.
12. One verified target stop/continue path.
13. Fault-injection matrix and benchmark.
14. Compatibility, privacy and release documentation.

One pull request must have one linked Issue, one primary behavior, one rollback story and one focused test set. A PR must not combine a new adapter, a migration, a large UI redesign and a release change unless the acceptance test requires the combination.

Use GitHub Issues for concrete work and GitHub Projects for the roadmap. Create milestones v0.3-observe, v0.4-receipt, v0.5-takeover and post-v0.5-interop. Use labels area:contract, area:storage, area:reducer, area:source, area:receipt, area:takeover, area:ui, area:cli, area:docs; capability:observe-only, capability:receipt, capability:control; risk:privacy, risk:data-loss, risk:false-success, risk:compatibility.

Protect main with required review and status checks, conversation resolution and no direct unreviewed pushes. Each PR description must include behavior change, tests run, migration impact, privacy impact, backwards compatibility, rollback and evidence screenshots or fixture output where applicable. The repository should use a PR template and issue forms for bug, adapter compatibility, privacy concern and feature request.

Required checks for an affected PR:

~~~text
npm run typecheck
npx vitest run tests/control-plane
npm run check:docs
node scripts/check-redaction.mjs
~~~

Required checks before merge:

~~~text
npm run build
npm test
npm run test:e2e
npm run check:pack
npm run check:docs
~~~

Required release checks from a clean checkout:

~~~text
git clean -xfd
npm ci
npm run check
npm run test:e2e
npm run check:pack
node scripts/benchmark-control-plane.mjs --fixture-set release
~~~

If a check script is not yet present, the PR that introduces the check must add it and document its exact output. No release note may claim a check passed without fresh command output.

Use a weekly demo and triage cycle, a two-week integration window, and a release only after its gate is met:

| Week | Delivery focus | Exit evidence |
| --- | --- | --- |
| 1 | Contract and synthetic failure case | Schemas parse, fixture labels are stable, user-facing wording is approved |
| 2 | Observe-only ledger and projection | A demo exposes an invisible handoff and coverage gap |
| 3 | Manifest, receipt and API | Digest and target mismatch are rejected |
| 4 | Workbench and v0.3 Observe preview | New developer can complete demo without reading internals |
| 5–7 | Real Claude/Codex compatibility and receipt hardening | Exact versions, fields and unsupported capabilities documented |
| 8 | v0.4 Receipt preview | Receipt loop survives restart, duplicate and late events |
| 9–11 | One verified takeover runner | Stop and successor confirmation are independently tested |
| 12 | v0.5 Takeover preview and evaluation | Fault matrix, privacy review and rollback notes complete |

Dates are planning assumptions. A release is delayed when evidence, privacy or compatibility gates fail.

## Metrics and acceptance targets

These are hypotheses to measure, not guaranteed outcomes:

1. First value: a new developer identifies current owner, last evidence and next action within 30 seconds.
2. First import: a user sees one real task and an explicit source coverage status without configuring a model API key.
3. Receipt integrity: zero false acceptance in fixtures for wrong target, stale task revision, changed manifest digest or conflicting nonce.
4. Transparency correctness: no fixture renders stopped or verified-complete without its required evidence.
5. Recovery utility: compare time to correct takeover and repeated work with native UI and hand-written HANDOFF.md.
6. Adapter cost: a contributor can add a versioned fixture and CoverageReport without changing the reducer or UI.
7. Privacy: redaction tests find no secret, token, hidden reasoning or absolute user path in exported Markdown, JSON, DOM or API response.

Precision and recall use only scenarios with ground truth. No-source cases are reported as coverage gaps instead of being removed from the denominator.

## User-visible adoption path

The README and demo must follow this sequence:

1. Start threadport ui --demo without an account or model API key.
2. See one task with three sessions and one invisible handoff.
3. See that the target has not confirmed receipt and one constraint is omitted.
4. Inspect the manifest and evidence.
5. Choose wait, re-prepare, export or take over.
6. Import one real local source and see the same view with an explicit compatibility status.

Publish a five-minute demo, synthetic failure corpus, public control-event schema, compatibility matrix, adapter contribution guide, privacy/retention page and troubleshooting guide. A shareable receipt must be a redacted Markdown/JSON artifact that a developer can paste into a GitHub Issue or PR; ThreadPort must not automatically post to external services.

Success signals are first successful handoff, first successful takeover, second-week reuse, lower recovery time and lower repeated work. Downloads, stars and number of discovered sessions are not product success metrics.

## Sources for the product boundary

OpenAI Agents SDK already exposes handoff and trace concepts, and tracing can be disabled or filtered; therefore ThreadPort differentiates on cross-runtime evidence, responsibility and recovery rather than generic trace collection. See [OpenAI handoffs](https://openai.github.io/openai-agents-python/handoffs/) and [OpenAI tracing](https://openai.github.io/openai-agents-python/tracing/).

Anthropic's guidance distinguishes CLAUDE.md, skills, hooks, rules and subagents by loading time and authority. ThreadPort should record only supported lifecycle facts and should not claim to reconstruct hidden context. See [Anthropic Claude Code steering](https://claude.com/blog/steering-claude-code-skills-hooks-rules-subagents-and-more).

The research basis remains bounded: [Parsing the Stream](https://arxiv.org/abs/2609.01466) motivates an append-only ledger and typed views; [Observability and Fault Injection](https://arxiv.org/abs/2608.24271) motivates reproducible fault fixtures; [Quantifying Overclaiming](https://arxiv.org/abs/2609.20812) motivates separating reports from evidence; [Harness Design](https://arxiv.org/abs/2609.20804) motivates recording model, harness, budget and context management. None is evidence that ThreadPort will automatically improve every Agent workflow.

Before adopting any GitHub project or code path, record its commit/tag, SPDX license, dependency licenses, maintenance signal and attribution in THIRD_PARTY_NOTICES.md. Repository existence and star count are not adoption criteria.
