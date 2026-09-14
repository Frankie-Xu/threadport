# 增量索引与恢复

T07 新增 threadport/indexing 的 IndexService，并在 threadport/sources 注册 Claude 与 Codex。旧 extract API 仍用于手工 Capsule 导出，不隐式扫描 HOME 或启动后台服务。

```js
import { openStore } from 'threadport/storage';
import { IndexService } from 'threadport/indexing';
const store = await openStore({ dataDir: '/explicit/private/app-data' });
store.saveSource({
  id: 'codex-local', agent: 'codex', roots: ['/explicit/allowed/session-root'],
  enabled: true, parserVersion: 'codex-jsonl-v1'
});
const index = new IndexService(store, { onProgress: progress => console.log(progress) });
try {
  await index.refreshAll();
} finally {
  await index.stop();
  store.close();
}
```

saveSource/getSource/listSources 保存配置；同一 source ID 的 agent 不可更换，需创建新 ID。更改正在扫描的来源配置会返回 STORAGE_BUSY，先 cancel 并等待该 job 完成。同源并发 refresh 返回同一 Promise；跨服务/进程由数据库占用记录防止重复写入。refresh(sourceId) 只刷新一个来源，refreshAll() 分页读取已启用来源。cancel(sourceId) 停止该任务；stop() 停止调度、取消并等待所有任务，然后才能关闭 Store。

长期运行的本地服务可调用 start()，每 15 秒检查来源；定时器不维持独立守护进程。可同时手动 refresh。IndexProgress 包含 sourceId/state/files/events/failures/warnings：events 是此次已提交事件数；failures 统计失败读取/作业，诊断 warning 单独列出。状态为 queued/running/completed/partial/cancelled/failed/busy，不等于人工 Task.lifecycle。

## 数据与事务

迁移 002 将 user_version 从 1 升至 2，沿用 T05 的 SQLite 一致备份与回滚。source_cursors 增加 cursor_json，完整保留 blockOffset、pendingCalls、fingerprints、metadata（含 Codex cwd）。旧游标没有完整 JSON 时重建该会话索引。sources.root 在本地存储中使用根路径数组 JSON；查询通过 Store，不直接解析该列。

每批最多 100 个事件；累计约 100ms 的解析时间或读到当前末尾时提交。读取/解析在事务外；会话 metadata、事件 upsert 和游标在同一短事务写入。提交比较已存 cursor 与 expectedCursor，不一致报 INDEX_STALE。源码替换/截断时，第一批新索引与旧索引删除原子提交；尚未读完标记 partial。批次失败或取消不会提交半个游标，重启从最后已提交位置继续。

人工 Task、revision、task_sessions 和已绑定 project/workspace 不被索引更新。源删除后保留 Session 墓碑、历史事件和人工关联；发现过程失败/受限不会把全部未见会话批量标为 missing，而是逐个受允许根约束地探测已知路径。

全库最多 100000 个规范化事件、游标已消费输入最多 1 GiB；越界事务回滚并返回 INDEX_LIMIT。单文件/行/发现预算仍由来源层执行。全局容量包含历史墓碑，空间清理由 T17 实现；当前超限需要收窄来源并等待明确清理操作，不能自动删人工数据。

## 扫描占用与恢复

index_leases 记录 source_id、随机 owner、两个唯一 slot 和到期时间。同一进程排队最多两份来源作业；数据库最多两个有效 slot，限制多个服务实例的并发。每份作业顺序读文件，读并发最多两份。每 10 秒续期，租期 30 秒；异常退出后下一次刷新可回收过期占用。每次批次提交再次核对 owner/到期时间，旧作业不能覆盖新作业进度。该机制不是操作系统文件锁，也不宣称暂停进程的未决文件读取会被强制终止。

升级失败按 [存储迁移](07-storage-migration.md) 保留备份并停服务恢复到新目录。旧 schema-v1 程序应拒绝直接打开 v2 数据库；需要兼容版本或升级前备份。本文不宣称真实 Agent 版本认证、完整 UI 或 200 MiB 容量基准已经通过。
