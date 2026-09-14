# 人工任务与会话关联

T08 提供 `threadport/tasks` SDK；Web 表单和 HTTP 接口分别由 T15、T11 接入。

```js
import { openStore } from 'threadport/storage';
import { TaskService, previewTaskPatch } from 'threadport/tasks';
const store = await openStore({ dataDir: '/explicit/private/app-data' });
try {
  store.createProject('project', 'Project'); // 仅首次创建
  const tasks = new TaskService(store);
  const task = await tasks.create({ projectId: 'project', title: '修复支付回调' });
  const preview = previewTaskPatch({ objective: '修复重试逻辑', constraints: ['不要修改数据库'] });
  // UI 在提交前展示 preview.patch 和 redactedFields；用户确认预览后：
  const saved = await tasks.update(task.id, task.revision, preview.patch);
  const detail = await tasks.detail(saved.id);
} finally {
  store.close();
}
```

创建输入为 `{projectId,title,sessionId?}`；项目必须已经存在。没有会话时可创建空任务，目标/下一步为 unknown 空 Claim，生命周期 active。来源扫描只产生未归类会话，不会自动创建任务或合并同项目会话。`listUnassignedSessions(limit,offset)` 返回会话 ID 与绑定，分页上限 1000。

`update(id,expectedRevision,patch)` 支持 title、objective、constraints、nextAction、lifecycle、archived。标题非空白且 1–120、目标最多 8000、单条约束最多 2000 且最多 50 条、下一步最多 4000，按 JavaScript UTF-16 长度检查；超限拒绝并指出字段，不截断。手工 Claim 标记 user-confirmed，清空约束仍是人工决定，机器候选在 detail.derived 单独返回。`list(limit,offset,includeArchived=false)` 默认隐藏归档任务，显式 includeArchived=true 可查看并恢复。所有成功 mutation 都增加 revision；重复 attach 与未关联 detach 明确报错。

`previewTaskPatch` 校验后返回脱敏文本和变动字段。create/update 如果仍包含需要替换的秘密文本，返回 REDACTION_REQUIRED，不写入原文。调用方先展示预览，再提交其 patch；SDK 无交互界面，不能代替 UI 获得确认。创建标题也可通过 previewTaskPatch({title}) 预览。脱敏沿用既有规则，不保证识别所有秘密。

## 关联与工作区

`attachSession(taskId,sessionId,expectedRevision)` 和 `detachSession(...)` 与任务、修订、修订会话快照同事务提交。会话已归另一任务返回 REVISION_CONFLICT；需先移出、持久化为未归类，再加入。移出不会删除日志、索引事件或项目绑定。创建时 sessionId 使用相同事务约束；缺失会话不会留下空任务。

显式关联未绑定会话会将其项目绑定到所选任务项目；已有不同项目返回 PROJECT_MISMATCH。`bindSession(sessionId,projectId,workspaceId|null)` 显式变更绑定；已有任务关联时不能跨项目改绑。工作区必须属于同项目。同项目的多个 worktree 可关联同一任务。Store 的 createWorkspace 仅登记已由调用方验证的身份，不执行文件系统/Git 验证；真正的路径校验由 T10 提供。

## 状态、历史与恢复

`detail(id)` 在一个只读事务中读取人工任务、关联事件和完成基线，返回 task、sessionIds、derived、resolved。生命周期和归档只由人工更新；索引不会覆写人工字段。用户从 active/paused 改为 completed 时，在同一事务中保存当前关联事件 ID。之后新 ID 只增加 ACTIVITY_AFTER_COMPLETION；不依赖日志时间戳。修改标题、重复设置 completed 或归档不会清除提醒；重开再完成会刷新基线。来源替换生成的新证据也算新活动；相同 ID 的重扫不重复提醒。

schema 3 增加 completed_task_events 和 task_revisions.session_ids_json；不删除原表或人工数据。旧 completed 任务以升级时的已索引事件作为基线，不能推断升级前何时出现活动。旧 revision 的历史关联未曾记录，`revisionSessionIds` 返回 null；新 revision 返回精确数组，[] 表示当时没有关联。旧超长手工字段仍可读取，新保存必须满足预算。

`getRevisions` 返回人工字段历史；`revisionSessionIds(taskId,revision)` 返回关联历史。任务不存在为 NOT_FOUND；陈旧 revision 为 REVISION_CONFLICT，调用方刷新比较后重交，不能自动重试覆盖。HTTP 409 映射属于 T11，当前提供 DomainError。

升级前备份、事务失败回滚和新目录恢复见 [存储迁移](07-storage-migration.md)。测试证据见 [T08 验收](../verification/t08-task-management.md)。
