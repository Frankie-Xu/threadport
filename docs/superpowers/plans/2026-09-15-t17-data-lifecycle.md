# T17 · 本地数据与导出恢复

| 工作包 | 提交 | 文件 | 测试 | 回滚 |
| --- | --- | --- | --- | --- |
| T17-A 诊断和原子导出 | feat(T17-A): preview safe diagnostics and atomically export metadata | src/diagnostics/service.ts、src/platform/atomic-write.ts、src/tasks/export.ts、src/cli-data.ts、server/data-routes.ts、cli/app/status/version；settings/api；tests/integration/data-lifecycle.test.ts、tests/handoff/export.test.ts、E2E；契约/验证文档 | 白名单诊断不含路径/令牌/正文；预览摘要 CAS；已有文件/并发写/磁盘失败；Markdown provenance；doctor/index CLI | 独立 squash，无 schema 变化；保留人工数据和原始日志 |
| T17-B 清理和寿命 | feat(T17-B): manage index and retained handoff data | storage/maintenance、index暂停/恢复、server/data-routes、settings；生命周期回归 | 清索引保留修订/关联、重建稳定ID、清理取消零副作用、源目录摘要不变、活动扫描/接续拒绝、不重放已消费包、7/30天寿命 | 独立 squash；删除操作本身不具备代码回滚恢复能力，UI先明确影响；恢复需显式选择迁移备份 |

删除全部数据必须先列出准确影响，不删除用户源目录或未知文件，不自动把备份后人工编辑当可恢复。任何清理失败不能显示全部完成。正在使用的快照/接续不能被保留期清理。最终状态按实测门槛记录，真实用户验证另属 T20。

| T17-C 全部数据删除 | feat(T17-C): delete owned local data with an exclusive lifecycle guard | storage/database access registry、delete service、API、settings、CLI close signal、failure/concurrency tests | 拒绝其他活跃连接；明确短语；源文件与未知文件保留；删除迁移备份；成功停止服务；失败不声称完成 | 代码回滚不能恢复已删除数据；外部备份需用户主动恢复 |
