# T19 安装产物与 RC 记录

当前工作树仍为 0.1.0 开发包，未宣布 0.2.0 RC 或执行 npm publish/tag。新增 `npm run test:package` 与保留的 `npm run check:pack` 使用同一个安装验收脚本，不维护两套重复检查。

脚本实际 npm pack、安装到独立目录，验证发布的 public exports、原生 SQLite、存储/搜索/工作区、doctor JSON、CLI/UI 和旧 Cursor 三种输入。只允许打包 files 白名单，拒绝测试、research、output、环境文件混入。成功输出 tarball SHA-256；设置 `THREADPORT_PACKAGE_OUTPUT=<new-directory>` 可保留已验证 tarball 与文件清单 JSON，已有产物不覆盖。

运行：

```sh
npm ci
npm run check
npm run test:e2e
THREADPORT_PACKAGE_OUTPUT=output/package-review npm run test:package
```

安装与运行验收是合成数据，不等于 T18 真实 Agent/平台认证或 T20 用户验证。必须在最终发布 SHA 上重新产生证据，并且安装的 tarball 与发布 tarball 的 SHA-256 一致；本地测试产物不会自动成为 RC。

Node 24 为运行时门槛。升级前停止旧服务，备份应用数据目录；新 schema 的旧版本会拒绝读取。恢复只向全新目录复制备份，再明确选择 `--data-dir`；备份后的人工编辑不会自动恢复。用户源日志和 Git 仓库不由迁移修改。

新增严格消费者 TypeScript 编译最初复现缺失 Node/SQLite declarations；将公开声明依赖的 @types/node 和 @types/better-sqlite3 从 devDependencies 移入 dependencies，版本不变。修复后纯安装目录严格编译通过。CI 每个平台保留已验证 tarball 与 SHA-256/清单 14 天，不包含真实日志或凭据。
