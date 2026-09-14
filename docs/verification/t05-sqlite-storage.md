# T05 · 本地存储与安全迁移

## 本地 Issue / 范围

T05 / P1 / F10 / Q21，依赖 T04 PR #30（8a1a22569cfc9f4b8454ba66fd6b962cc47feb80）已合并。分支 codex/t05-sqlite-storage。原库没有 SQLite Store 或迁移实现，新增测试最初因两个模块缺失失败；既有基线为 194 项测试。

- [x] schema user_version=1，全部契约表、外键和查询索引。
- [x] WAL、外键开启、busy_timeout=5000；真实第二连接占写锁，约 5 秒后返回可重试 STORAGE_BUSY，释放后可写入。
- [x] Task Zod 校验；任务、revision 历史和 session 关联原子写入，冲突回滚，清空约束和重启读取保留人工状态。
- [x] 项目被引用时不能删除；session 墓碑 upsert 不破坏关联；其他任务不能抢占关联。
- [x] SQLite backup API 一致备份，包含 WAL 已提交的中文人工数据；迁移故障回滚 DDL/数据/user_version。
- [x] 备份目录不可写时不执行迁移；高版本拒绝打开；成功迁移单调且重复执行不重复建表。
- [x] 完整性检查后恢复到新目录；已有目标不覆盖。源库与备份保留。
- [x] 私有应用目录、POSIX 0700/0600、数据库 symlink 拒绝；Windows owner/当前用户有效写权限/宽泛写 ACL 检查进入 CI。
- [x] Node >=24.0.0、better-sqlite3 13.0.3 精确锁定；.nvmrc 原本就是 24，无需无意义修改。

## 验证

2026-09-14 / macOS arm64 / Node 24.18.1 / npm 11.16.0。

npm run check：27 文件 / 202 测试通过，类型和构建通过。最终文档链接检查单独执行。新增 8 个行为用例使用临时真实 SQLite；没有读取真实用户 HOME/日志。

npm run check:pack：62 个文件，tarball 独立安装、旧 CLI 与 exports 加载通过，并通过新增 threadport/storage 导出实际 openStore / createProject / close。SQL 文件随包安装，执行时从包内加载。锁定依赖安装报告 0 vulnerabilities。macOS 本地安装有证据；Ubuntu x64 与 Windows 的结果以本 PR CI 为准，未预先声明成功。

## 自审与边界

AI self-review 按范围→正确性→数据边界→设计→可维护性→证据顺序检查，无已知 P0/P1；不是第三方审计。所有 SQL 值参数化，分页最大 1000；动态版本号来自连续迁移序列校验。备份通过独立随机子目录避免覆盖。没有 ORM/云存储，也不写源日志/代码。

对外可用接口为 threadport/storage；现有 Capsule CLI 保持文件导出，不自动建库。T08 的 TaskService 与 T11 CLI/API 组装后续接入，不把此 Store 当作完整收件箱。saveSession 是保留身份墓碑的操作，T06/T07 再加入来源元数据及事件索引。隐私脱敏及人工保存确认属于应用层，Store 做结构和事务校验。

恢复必须先停止服务并选择新目录，不自动替换运行库；备份之后的修改可能丢失，详见 [迁移说明](../v0.2/07-storage-migration.md)。备份目录保留待人工清理。原生安装与存储故障注入达到 L2，不代表 L3 真实 Agent 接续或发布认证。

## 交接

下一项 T06：Claude 来源发现与有界读取。原有 .gitignore、research 和两个 HTML 实验文件不纳入本任务提交。远端结果在 PR 中更新。

首轮 CI：Ubuntu 全部通过；macOS 锁等待的墙钟断言观察到 7.1 秒（SQLite timeout 仍为 5000ms）。测试补充直接检查 PRAGMA=5000，墙钟仅作 15 秒挂起守卫，避免将共享 runner 调度时间当作 SQLite 等待配置。Windows 首轮只定位到权限检查失败，第二轮安全错误码确认为脚本错误；ACL 检查允许受信任的 Administrators/SYSTEM owner，同时检查当前身份有效写权限并继续拒绝宽泛写授权，改用 UTF-16 EncodedCommand 避免跨进程参数解析，并只返回安全分类码。

第三轮 Windows 诊断确认 CommandNotFoundException；权限查询改用 Windows PowerShell 自带 .NET Directory.GetAccessControl，去除 Get-Acl/ForEach-Object 模块自动加载依赖。检查规则不变，继续要求真实平台通过。
