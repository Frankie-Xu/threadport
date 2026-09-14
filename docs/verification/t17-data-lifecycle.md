# T17 本地数据与导出

T17 按 A 诊断/导出、B 缓存/保留期、C 全部数据删除分包实现，具体合并记录见 [开发交接](development-handoff-v0.2.md)。

导出先在目标目录写独占临时文件，写完并 sync 后 hard-link 发布。目标已存在/并发竞争都拒绝覆盖；错误清理临时文件。Task Markdown 使用动态长度 code fence，保留人工 provenance、历史 unknown 与来源建议，最多 20 个命令分组并明确省略。服务器再次生成导出并比较用户预览摘要，改变时拒绝写出。

诊断仅包含版本、OS/arch、时间、计数/容量、固定 parser 版本和有限错误码，不序列化设置、来源元数据、环境或正文。存储路径只出现在受认证的 settings 接口。doctor --json 不夹说明文字；index 显式读取已配置来源，不扫描 HOME。

回滚：独立 squash，无迁移；用户已导出的文件不随代码回滚删除。本页按 A/B/C 分包记录实现与验证，最终工程状态以 CI/PR 为准；真实 Agent 与用户门槛另行记录。自审，未获得独立人工评审。

## 使用与接口

- Settings → Preview diagnostics：仅本地预览，复制由用户主动操作，不自动发送。
- Task → Export task；接续包 → Save export to directory：审阅完整文本，选择已存在的绝对目录，勾选确认后发布文件。Task 为 Markdown；接续包支持 JSON/Markdown。
- `threadport doctor --json --data-dir <directory>`：输出诊断 JSON；`threadport index --source <configured-source-id> --data-dir <directory>`：显式扫描一个已配置来源。部分读取返回非零，保留成功批次。
- 认证 API：`GET /api/v1/diagnostics`、`GET /api/v1/settings`、`POST /api/v1/exports/preview`、`POST /api/v1/exports`。写出必须提交预览的 SHA-256 `expectedDigest`，不接受客户端提供的任意文件名。
- 文件系统必须支持同目录 hard link；不支持时安全失败，不降级为可能覆盖的写法。临时文件以 0600 创建；Windows 权限遵从当前账户 ACL。
- 诊断错误最多 20 条安全错误码与时间，不含完整日志。该报告仅描述当前存储，不证明真实 Agent 或平台已经认证。

T17-A 本地验证：Node 24.18.1 / macOS arm64，363 tests / 52 files、4 个浏览器流程、181 文件独立安装包通过。[诊断截图](assets/t17-diagnostics.png) 使用合成任务，粉色带为截图隐私遮罩。首次 Windows CI 的旧 100k 事件回归在 5.576 秒超过 5 秒测试预算，改为该案例 30 秒并用 finally 关闭注入连接，容量/原子回滚断言保持不变；最终 CI 以 PR 为准。
## T17-B 缓存与保留期

清索引必须在确认对话框主动勾选影响后提交。`POST /api/v1/data/clear-index {confirmation:true}` 取消并等待本服务的索引批次；其他进程仍持有索引租约，或有 launching 接续时拒绝清理。事务删除 events/cursors，保留 Task、所有人工修订、完成基线、session ID 与关联，将来源暂停、会话标为 missing。重新启用来源并 Refresh source 可按稳定 ID 重建。原始日志零修改；取消对话框不发清理请求。

`POST /api/v1/data/prune {confirmation:true}` 与启动/每小时自动保留期检查共用短事务。7 天前的非活动接续移除全文、授权与私有路径；需要保留 30 天摘要的行成为不可读取/确认/重放的 retained 墓碑。30 天前已结束的 attempt 删除；launching 状态不会被定时清理。未被接续或索引命令引用、超过 7 天的快照可清理；历史事件仍引用的快照保留。人工任务和修订不按保留期删除。

无 schema 变化。回滚代码不能恢复已按保留期删除的文本；清索引可从仍可读的来源重建。全部数据删除与服务关闭见下方独立 T17-C 记录。

后续 Windows CI 在未改动的 Cursor/Git 与搜索集成用例再次触发 5 秒超时。统一限制原生测试并发为 2，Windows 测试挂起预算为 30 秒；实际性能仍由 T16 显式预算和原始样本判定，所有行为/取消/容量断言保留。
## T17-C 全部应用数据删除

`POST /api/v1/data/delete-all` 只接受精确短语 `DELETE LOCAL DATA`。设置页说明任务、人工修订、缓存、来源配置、接续与迁移备份都会删除，外部导出/源日志/项目与未知文件保留。用户必须先关闭其他 ThreadPort（包括旧版本）。本版本通过独立 SQLite 连接登记阻止其他活跃进程占用时删除；登记与删除共用写锁，新的本版本连接不能穿越删除窗口。活动索引/接续同样拒绝。

删除只处理已知数据库文件、WAL/SHM 和严格命名且只含 backup.sqlite 的迁移备份目录，绝不递归删除用户选择的数据目录。未知备份内容、符号链接、硬链接或文件权限失败均报错，不显示“全部完成”。预检查完成后先删除备份，主库最后删除；这不是跨文件原子事务，若中途失败可能已删除部分备份，当前库能保留时保留。主库已关闭时失败响应后仍停止服务，需要检查目录后重启。成功先返回结果，再关闭 HTTP/索引与 CLI；重新启动获得空工作台。

`.threadport-access.sqlite` 是不含任务正文/路径的进程协调库，删除后保留其空结构；未知用户文件保留。该操作不是安全擦除磁盘，代码回滚无法恢复已删数据。旧版本或直接使用 SQLite 的外部连接不参与本版本登记，因此删除前关闭它们是使用前提；检测到活动 SQLite 事务则拒绝。迁移 schema 仍为 4，恢复必须使用用户另行保存的外部备份。

T17-C 验证：新增跨进程访问拒绝、确认短语、未知备份预检、备份/主库删除权限失败，以及 CLI 删除后 exit 0。全量 373 项通过后另加 CLI 退出目标回归；6 个浏览器流程通过。首次空库 Settings 被 onboarding 遮挡，已修复为设置无需先创建工作区；[删除确认截图](assets/t17-delete.png) 只含合成 UI。最终合并后的总测试数量与 CI 见 PR。

最终集成总量为 377 项核心回归 / 56 文件、6 个浏览器流程。T17-C → T17-B → T17-C 在同一份 schema-4 数据上实测保留人工目标、约束和两次修订；未调用删除操作，不代表已删除数据可以恢复。
