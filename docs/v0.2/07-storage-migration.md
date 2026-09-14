# Node 24 与 SQLite 存储迁移

T05 开发分支要求 Node >=24.0.0；使用 `.nvmrc` 的 Node 24。已发布的 v0.1 不被追溯修改，本任务不发布新版本。better-sqlite3 13.0.3 与类型包 9.6.0 精确锁定；CI 在三种系统的 Node 24 上执行干净安装、回归和 tarball 安装，实际原生加载后创建 SQLite。SQL migrations 随包分发。

## 存储入口

新增 SDK 子路径 `threadport/storage`。旧 Capsule 文件导出不创建数据库。后续 CLI/API 在 composition root 调用同一 openStore；本任务没有提前增加 inbox 命令。

```js
import { openStore } from 'threadport/storage';
const store = await openStore({ dataDir: '/explicit/private/app-data' });
try {
  store.createProject('local-project', 'Local project');
  const tasks = store.listTasks(100, 0);
} finally {
  store.close();
}
```

默认目录：macOS ~/Library/Application Support/ThreadPort；Linux 使用绝对 XDG_DATA_HOME，否则 ~/.local/share/threadport；Windows LOCALAPPDATA/ThreadPort。显式 dataDir 为应用数据目录，不应指向源日志或项目代码。POSIX 目录/库文件为 0700/0600，拒绝符号链接数据库及非当前用户所有的目录。Windows 检查目录 owner 是当前用户且 Everyone/Authenticated Users/Users 没有宽泛写权限；使用继承 ACL，不把 chmod 当作 ACL。

Store 提供项目创建/删除、session 墓碑保留、任务读取/分页/revision 历史以及 saveTask。saveTask(task, expectedRevision, sessionIds?) 要求 revision 递增 1；expectedRevision=0 创建；关联省略时保留，[] 明确清空。任务/历史/关联在同一短事务中写入。其他任务已占用 session 时返回 REVISION_CONFLICT；不隐式抢占。手工字段在应用层脱敏并经用户确认后再交 Store，Store 验证 JSON 结构；T08 实现这层用例。

schema v1 的表与索引见 [契约](03-contracts.md)。sessions 允许 source_id 为空以保留墓碑；saveSession 只保留身份，不是 T06/T07 索引实现。后续来源写入应使用 upsert，不可 REPLACE 删除再插入。数据库启用 WAL、外键和 5000ms busy timeout；锁争用返回可重试 STORAGE_BUSY。查询分页上限 1000。

## 迁移失败与恢复

打开旧库前生成 backups/v版本-随机目录/backup.sqlite，使用 SQLite backup API 包含 WAL 中已提交的数据。迁移 DDL 与 user_version 在同一事务内提交；备份失败不开始迁移，事务失败回滚并保留备份。不自动删库。高于程序认识版本的数据库拒绝打开。

恢复前停止所有使用该数据目录的服务/CLI。恢复会丢失备份之后的编辑，先保留原数据目录。选择全新目录，调用：

```js
import { restoreBackup } from 'threadport/storage';
await restoreBackup('/old-data/backups/v1-example/backup.sqlite', '/new-recovery-data');
```

restoreBackup 检查备份完整性，只创建不存在的 threadport.sqlite；已有文件拒绝覆盖。确认新目录数据后，通过 openStore 的 dataDir 显式切换。不要在服务运行中替换原库，不要仅复制运行库主文件而忽略 WAL。旧包不认识新 user_version 时应使用兼容包，或恢复到新的旧版本目录。恢复函数不自动停止服务或切换配置。
