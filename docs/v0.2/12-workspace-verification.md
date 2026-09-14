# 当前工作区快照

T10-A 提供捕获和持久化 SDK。比较报告与 verify CLI 分别属于 T10-B/T10-C，本页不把它们标为已实现。

```js
import { openStore } from 'threadport/storage';
import { SnapshotService } from 'threadport/workspace';
const store = await openStore({ dataDir: '/explicit/private/app-data' });
try {
  // 首次显式登记；canonicalRoot 必须指向所选本地 worktree 的根。
  store.createProject('project', 'Project');
  store.createWorkspace('workspace', 'project', '/explicit/local/project');
  const snapshot = await new SnapshotService(store).capture('workspace');
  // incompleteReasons 非空时 digest 为 null，不能用于宣称范围完整匹配。
  const saved = store.getSnapshot(snapshot.id);
} finally {
  store.close();
}
```

`captureWorkspace({id,projectId,canonicalRoot}, {limits?,signal?})` 只捕获，不写数据库。SnapshotService 从 Store 读取绑定，捕获后在短事务中复核绑定未变再保存；绑定变化返回 REVISION_CONFLICT。源工作区只读，数据目录应位于源码/日志目录之外。不存在的已登记目录可保存 SOURCE_MISSING 快照；不存在的 workspace ID 返回 NOT_FOUND。

## 范围与预算

每份快照包含应用生成 id、workspaceId、当前捕获开始时间 capturedAt、HEAD、digest、bindingDigest、algorithm、scope、incompleteReasons。算法 `threadport.workspace.raw.v1`，scope 为 `head-tracked-diff-untracked`；与旧 Capsule dirty_diff_hash 不能混用。bindingDigest 对绑定的 project/workspace ID、canonical root、Git dir/common dir 与目录设备/inode 做摘要，供后续比较区分身份；不输出原始私有路径。

实现读取 HEAD commit、完整 index 清单（含 mode/object ID/stage）、tracked 工作树文件原始内容/可执行位、未忽略 untracked 路径/内容与删除状态。通过这些信息覆盖 HEAD、暂存区和工作树差异；不依赖 Git patch 展示参数。为防止文件过滤器执行，不调用 git diff/status，不做内容规范化。Git 原生清单配合文件元数据提供状态复查。因此 CRLF 等原始字节改变也改变摘要，不能把它当作 Git clean-filter 规范化摘要。

默认最多 10000 路径、合计 64 MiB 工作树内容（tracked + untracked）。limits.maxFiles/maxBytes 只能调低，不能绕过上限。Git 命令每次输出最多 1 MiB、最多 5 秒；单次捕获包括重试共享 30 秒期限。内容以 64 KiB 缓冲区读取，不保存源码、patch 或文件内容副本。忽略文件、Git 内部对象内容、目录权限/ACL、业务正确性不在比较范围；submodule、symlink 和非常规文件不能完整捕获，返回 READ_FAILED，不下钻其内容。

## 完整性和失败

捕获前后复查 HEAD、index、untracked 清单和目录身份；每个文件检查打开前/后与最终审计的 device/inode/mode/size/mtime/ctime。发现变化最多重试一次，第二次仍变化为 RACED。预先或读取中取消会拒绝 Promise，SnapshotService 不保存取消的结果；期限或容量超限为 LIMIT_EXCEEDED。

原因包括 WORKSPACE_UNBOUND、SOURCE_MISSING、READ_FAILED、LIMIT_EXCEEDED、RACED、NO_GIT、NO_COMMIT。不完整结果 digest 为 null，未完成的 head/bindingDigest 保守为 null；原因不附带原始文件错误或机器路径。这里只返回捕获结果，不产生 matched/drifted 验证结论。

Git 使用固定只读子命令，移除继承的 GIT_* 重定向，关闭 fsmonitor、可选锁、提示与 lazy fetch；不执行 hooks、diff/textconv/clean/process 过滤器。工作树路径检查禁止已检测到的符号链接及祖先越界，打开时使用平台可用的 O_NOFOLLOW，并复核身份。这是尽力一致性读取，不是文件系统原子快照或抵御任意恶意路径竞态的操作系统隔离；不能声称捕获后文件不会继续变化。已知未完整范围从不生成可用摘要。

## 持久化、兼容与回滚

`getWorkspace(id)` 返回绑定或 null；`saveSnapshot(snapshot, expectedWorkspace?)` 校验 JSON、工作区外键与可选绑定，已存在相同记录可重复保存，不同内容禁止覆盖同一 ID；`getSnapshot(id)` 返回校验后的快照或 null。

沿用已有 snapshots 表，数据库仍为 schema 4，无迁移。当前快照不会补写历史 CommandRun.snapshotId，不会把旧测试认证为当前有效。旧 readGitState、Capsule v1 和 CLI 行为保持原状。

本包的文件、实际测试及回滚关系见 [T10-A 验收](../verification/t10-a-snapshot.md)。消费者未合并时可单独 revert 本包，快照数据保留；消费者出现后先处理依赖，不降级数据库。比较及 CLI 的后续工作见 [T10 包计划](../superpowers/plans/2026-09-14-t10-work-packages.md)。
