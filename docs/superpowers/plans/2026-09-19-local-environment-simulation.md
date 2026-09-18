# ThreadPort 本地环境模拟与验证整改计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不伪造 Windows、真实 Agent 或外部用户证据的前提下，使用 Node 24 本机和 Linux 容器尽可能完成源码、浏览器、安装包、容量和证据契约验证，并留下可复核的环境边界记录。

**Architecture:** 本机 macOS Node 24 负责完整开发回归、浏览器流程和隔离安装包；Docker Node 24 bookworm 负责干净 Linux 用户态回归；Windows 行为通过现有契约测试、可控的进程探测桩和 junction/symlink 测试做本地仿真，最终仍由 Windows CI 认证。所有结果绑定候选提交、运行时、平台和测试命令，`unknown`、`unavailable`、`HOLD` 保持原义。

**Tech Stack:** Node 24.18.1、TypeScript、Vitest、Playwright、Docker `node:24-bookworm`、Fastify、SQLite/better-sqlite3、现有 benchmark 和文档检查脚本。

## Global Constraints

- 不改变 schema 7，不触碰用户现有 `.gitignore`、`output/`、`research/`、`pelican-*.html` 和 `docs/diagrams/`。
- 不把 Docker Linux 结果写成 Ubuntu CI 认证，不把 Node 26 性能结果写成 Node 24 发布证据。
- 不从 CLI 安装、`--help` 或 exit 0 推断真实 Agent 接续成功。
- 不把 Q01–Q24、自动测试数量或本地模拟结果反向映射成缺失的 36 项原始规格。
- 不提交真实会话原文、令牌、私有日志或本机绝对路径。

---

### Task 1: 固化本机与容器环境探测

**Files:**
- Create: `scripts/local-environment-check.mjs`
- Create: `docs/verification/local-environment-2026-09-19.json`
- Modify: `package.json`

- [ ] **Step 1: 写只读探测脚本**

脚本只读取 Node/npm/OS/架构、Docker 是否可用、Codex/Claude 是否在 PATH，不读取认证信息，不启动真实 Agent，不写用户目录。

- [ ] **Step 2: 运行探测并保存匿名结果**

```bash
node scripts/local-environment-check.mjs --json > docs/verification/local-environment-2026-09-19.json
```

结果包含 `candidateSha`、运行时版本、平台、可用模拟器、可执行验证命令和不可替代项；不包含绝对路径和 token。

- [ ] **Step 3: 检查 JSON 和文档链接**

```bash
node -e "const x=require('./docs/verification/local-environment-2026-09-19.json'); if(x.candidateSha.length!==40) process.exit(1)"
npm run check:docs
```

### Task 2: Node 24 本机开发回归

**Files:**
- Evidence: `docs/verification/local-environment-2026-09-19.json`

- [ ] **Step 1: 固定 Node 24 环境**

```bash
env PATH="/opt/homebrew/opt/node@24/bin:$PATH" npm run check
```

预期：typecheck、build、Vitest 和文档链接检查通过；失败时保存完整命令和失败阶段。

- [ ] **Step 2: 运行浏览器流程**

```bash
env PATH="/opt/homebrew/opt/node@24/bin:$PATH" THREADPORT_TEST_CHROME=1 npm run test:e2e
```

预期：7 个合成浏览器流程通过。该结果只证明本机安装后的产品流程。

- [ ] **Step 3: 运行隔离安装包验证**

```bash
env PATH="/opt/homebrew/opt/node@24/bin:$PATH" THREADPORT_TEST_CHROME=1 \
  THREADPORT_PACKAGE_OUTPUT=output/package-local-node24 npm run test:package
```

预期：安装包文件、公开 exports、UI、CLI、SQLite、刷新持久化和本地 loopback 流程通过，并记录 tarball SHA-256。

### Task 3: Linux Node 24 容器模拟

**Files:**
- Evidence: `docs/verification/local-environment-2026-09-19.json`

- [ ] **Step 1: 使用干净源码归档启动容器**

```bash
git archive HEAD | docker run --rm -i -w /work node:24-bookworm \
  bash -lc 'tar -x && npm ci && npm run check'
```

- [ ] **Step 2: 保存容器元数据**

记录镜像 digest、容器架构、Node/npm 版本和 69/437 测试结果。该结果标记为 `linux-container`，不标记为 `ubuntu-ci`。

- [ ] **Step 3: 运行 Linux 容器安装 smoke（可选）**

在同一镜像中运行 `npm run check:pack`；若原生 better-sqlite3 或浏览器依赖缺失，记录环境缺口，不修改依赖绕过。

### Task 4: Windows 行为本地仿真与外部认证边界

**Files:**
- Existing: `src/platform/process-identity.ts`
- Existing: `src/workspace/reader.ts`
- Existing: `tests/targets/process-observation.test.ts`
- Existing: `tests/workspace/snapshot.test.ts`
- Existing: `tests/workspace/scope-policy.test.ts`

- [ ] **Step 1: 运行平台无关的进程身份与 workspace 回归**

```bash
env PATH="/opt/homebrew/opt/node@24/bin:$PATH" npx vitest run \
  tests/integration/continue.test.ts \
  tests/targets/process-observation.test.ts \
  tests/workspace/snapshot.test.ts \
  tests/workspace/scope-policy.test.ts
```

- [ ] **Step 2: 验证 Windows 探测失败仍为 unknown**

使用现有 child-process mock 覆盖 PowerShell 不可用、权限失败和进程消失三种情况；断言不会自动释放 workspace，也不会把 unknown 改成 success。

- [ ] **Step 3: 保留真正不可替代项**

Windows junction 的真实 `lstat`/`realpath` 行为、Windows Node 24 调度时序和 CI 进程权限仍标记为 `requires-windows-ci`。

### Task 5: 性能与证据收口

**Files:**
- Existing: `scripts/benchmark.mjs`
- Existing: `scripts/benchmark-profile.mjs`
- Existing: `docs/verification/performance-beta.md`
- Existing: `docs/verification/performance/query-plan-2026-09-18.md`

- [ ] **Step 1: 在安静 Node 24 本机运行容量基准**

```bash
env PATH="/opt/homebrew/opt/node@24/bin:$PATH" npm run bench
```

- [ ] **Step 2: 浏览器模式另行测量**

```bash
env PATH="/opt/homebrew/opt/node@24/bin:$PATH" THREADPORT_TEST_CHROME=1 \
  node scripts/benchmark.mjs --browser
```

- [ ] **Step 3: 按真实结果更新状态**

只有 macOS 与 Ubuntu 同候选均满足 API p95 ≤300ms、UI p95 ≤500ms，才能解除性能 HOLD；否则保留原始 JSON、阶段计时和下一轮瓶颈。

### Task 6: 最终检查与交接

- [ ] `git diff --check`
- [ ] Node 24 `npm run check`
- [ ] Node 24 `THREADPORT_TEST_CHROME=1 npm run test:e2e`
- [ ] Node 24 `THREADPORT_TEST_CHROME=1 THREADPORT_PACKAGE_OUTPUT=output/package-local-node24 npm run test:package`
- [ ] Linux container `npm run check`
- [ ] Windows CI / 真实 Agent / 36 项原始附件 / 外部用户仍分别记录为未完成或已验证，不合并为本地通过

## 自检结果

- 本计划覆盖源码、浏览器、安装包、Linux 用户态、Windows 契约仿真、容量测量和证据收口。
- 计划不扩大产品支持声明，不修改 schema，不把外部依赖伪装成本地结果。

---

### Task 7: 可重复的一键本地验证执行器

**Files:**
- Create: `scripts/local-validation-runner.mjs`
- Create: `scripts/local-validation-runner.d.mts`
- Create: `tests/scripts/local-validation-runner.test.ts`
- Modify: `package.json`
- Evidence: `docs/verification/local-validation-YYYY-MM-DD.json`

- [x] **Step 1: 以 argv 方式定义验证矩阵**

`npm run check:local` 依次执行源码回归、浏览器流程、隔离安装包和 Node 24 Docker 检查。所有子进程均通过 `spawn(..., { shell: false })` 启动；命令参数作为数组保存，避免把路径、测试文本或环境变量拼进 shell。

- [x] **Step 2: 自动探测并安全跳过外部工具**

没有 Chrome 时将浏览器与安装包步骤记为 `skipped`，没有 Docker 时将 Linux 容器步骤记为 `skipped`。跳过不等同通过，报告保留明确的 `skipReason`，而且不会阻断其他本地步骤。

- [x] **Step 3: 失败也保留完整机器可读报告**

每步记录命令 argv、状态、退出码、开始/结束时间、stdout/stderr SHA-256 摘要和错误/跳过原因；报告绑定 `candidateSha`、工作树状态摘要和运行时版本。任一步失败时执行器继续收集后续步骤、写出报告并以非零退出码结束。

- [x] **Step 4: 可注入测试与证据**

`tests/scripts/local-validation-runner.test.ts` 使用注入的执行器和工具探测覆盖 pass、fail、skip 三种结果，断言失败报告仍写出、后续步骤仍记录、跳过原因明确且没有 shell 执行。真实运行结果写入 `docs/verification/local-validation-YYYY-MM-DD.json`；报告仅含摘要和 digest，不写入日志正文、令牌或本机绝对路径。
