# 本地开发环境

源码仓库：[Frankie-Xu/threadport](https://github.com/Frankie-Xu/threadport)。

## 进入环境

安装 Git、npm 及 Node 24；如使用 nvm，可运行：

```bash
git clone https://github.com/Frankie-Xu/threadport.git
cd threadport
nvm install
nvm use
node --version
npm --version
```

`.nvmrc` 固定开发主版本为 Node 24。也可通过其他版本管理器或系统包管理器安装；本机专用激活脚本不属于仓库安装步骤。

## 安装、构建与测试

```bash
npm ci
npm run check
```

依赖使用 `package-lock.json` 锁定，包管理器为 npm。
`check` 依次执行 TypeScript 类型检查、编译、Vitest 测试和本地文档文件链接检查。
本地开发无需数据库、Docker 服务或 API key。

按需运行以下命令；两个 watch 命令各占一个终端：

```bash
npm run build -- --watch
npm test -- --watch
```

## 运行本地 CLI

构建后直接调用仓库产物：

```bash
node dist/src/cli.js --help
node dist/src/cli.js extract --from claude \
  --session tests/fixtures/claude/session-basic.jsonl \
  --project . --out .threadport/dev-smoke.json
node dist/src/cli.js validate .threadport/dev-smoke.json
node dist/src/cli.js render .threadport/dev-smoke.json
```

示例仅使用仓库内的合成会话。输出 JSON 和 Markdown 位于被忽略的
`.threadport/` 目录。首次运行后，重复提取到同一文件需显式加 `--force`。
修改 CLI 源码后需重新构建，或保持 TypeScript watch 运行。

## 初始环境验证（2026-09-14，代码基线 31ae677）

- `npm ci` 完成，锁文件未修改。
- `npm run check` 通过：TypeScript 构建成功，10 个测试文件、38 项测试全部通过。
- CLI 的 `extract → validate → render` 已通过，渲染结果与提取时生成的 Markdown 一致。
- 本次验证已生成 `.threadport/dev-smoke.json`；再次运行上面的提取示例时需加 `--force`。
- `npm audit` 报告两项 moderate 告警，涉及开发依赖 `vitest` 和
  `@vitest/mocker`（同一公告 `GHSA-82fw-gwwq-j7x9`）。npm 建议的修复会升级
  Vitest 主版本；本次保留仓库锁定版本，后续升级需按项目约定单独验证兼容性。

后续主干已升级依赖及安装包门槛；上述初始结果保留历史意义。最新执行环境与结果见 [T01 验证记录](verification/t01-baseline.md)。

## 开发约定

- 质量门和提交约定见 [贡献指南](../CONTRIBUTING.md)。
- 不提交真实会话、API key 或 `.env`。
- 保持 Capsule v1 schema 和当前产品边界；本次只配置开发环境。
